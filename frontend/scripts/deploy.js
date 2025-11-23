#!/usr/bin/env node

/**
 * Unified Deployment Script for Heira Frontend
 *
 * Both backends store content on Filecoin, but differ in accessibility:
 * - filecoin: Direct upload to Filecoin via Synapse SDK
 *   • Stores on Filecoin (persistent storage)
 *   • Returns Piece CIDs (Filecoin-specific)
 *   • Content NOT automatically accessible via IPFS gateways/ENS
 *   • Requires manual IPFS pinning for ENS access
 *
 * - storacha: Upload via Storacha Network service
 *   • Stores on Filecoin (persistent storage)
 *   • Automatically pins to IPFS (gateway/ENS access)
 *   • Returns IPFS CIDs (works with ENS immediately)
 *   • One upload, both networks accessible
 *
 * Prerequisites:
 * 1. Build the frontend: cd frontend && npm run build
 * 2. Set required environment variables (see usage)
 *
 * Usage:
 *   node scripts/deploy.js [--backend filecoin|storacha] [--network calibration|mainnet]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/hashes/sha2';
import { encode } from '@ensdomains/content-hash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Collect files from build directory
 */
function collectFiles(dir, basePath = '', options = {}) {
  const { skipPadding = false } = options;
  const files = [];

  function traverse(currentPath, relativePath = '') {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const fileRelativePath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') && entry.name !== '.well-known') {
            continue;
          }
          if (entry.name === 'node_modules') {
            continue;
          }
          traverse(fullPath, fileRelativePath);
        } else {
          // Skip files that shouldn't be uploaded
          if (entry.name.endsWith('.map')) continue;
          if (entry.name === 'version.json') continue;
          if (fileRelativePath === 'robots.txt') continue;

          let content = fs.readFileSync(fullPath);

          // Pad files for Filecoin (if needed)
          if (!skipPadding && content.length < 127) {
            const originalSize = content.length;
            const paddingNeeded = 127 - content.length;

            let paddingText;
            if (fileRelativePath.endsWith('.js') || fileRelativePath.endsWith('.mjs')) {
              paddingText = '\n' + '//'.repeat(Math.ceil(paddingNeeded / 2));
            } else if (fileRelativePath.endsWith('.css')) {
              paddingText = '\n' + '/*'.repeat(Math.ceil(paddingNeeded / 2));
            } else if (fileRelativePath.endsWith('.html')) {
              paddingText = '\n' + '<!--'.repeat(Math.ceil(paddingNeeded / 4));
            } else {
              paddingText = ' '.repeat(paddingNeeded);
            }

            const padding = Buffer.from(paddingText, 'utf8').subarray(0, paddingNeeded);
            if (padding.length < paddingNeeded) {
              const remaining = paddingNeeded - padding.length;
              content = Buffer.concat([content, padding, Buffer.alloc(remaining, 0x20)]);
            } else {
              content = Buffer.concat([content, padding]);
            }

            console.log(
              `   📏 Padded ${fileRelativePath} from ${originalSize} to ${content.length} bytes`
            );
          }

          const contentHash = createHash('sha256').update(content).digest('hex');
          files.push({
            path: fileRelativePath,
            content,
            contentHash,
          });
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${currentPath}: ${error.message}`);
    }
  }

  traverse(dir, basePath);
  return files;
}

/**
 * Compute IPFS CID from content
 */
async function computeIPFSCID(content) {
  try {
    const hash = await raw.sha256.digest(content);
    const cid = CID.create(1, 0x55, hash); // 0x55 is raw codec
    return cid.toString();
  } catch (error) {
    console.warn(`   ⚠️  Could not compute IPFS CID: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Backend Implementations
// ============================================================================

/**
 * Deploy to Filecoin using Synapse SDK
 */
async function deployToFilecoin(files, network) {
  const { Synapse, RPC_URLS, TOKENS, TIME_CONSTANTS } = await import('@filoz/synapse-sdk');
  const { ethers } = await import('ethers');

  const RPC_URL = network === 'mainnet' ? RPC_URLS.mainnet.http : RPC_URLS.calibration.http;
  const DEPOSIT_AMOUNT = ethers.parseUnits('2.5', 18);

  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY must be set in frontend/.env');
  }

  console.log('🔧 Initializing Synapse SDK...');
  const synapse = await Synapse.create({
    privateKey: process.env.PRIVATE_KEY,
    rpcURL: RPC_URL,
  });
  console.log('✅ SDK initialized\n');

  // Check wallet balance
  console.log('💰 Checking wallet balance...');
  const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
  const formattedBalance = ethers.formatUnits(walletBalance, 18);
  console.log(`Current USDFC balance: ${formattedBalance} USDFC\n`);

  // Setup payments
  console.log('💳 Setting up payments...');
  try {
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
      DEPOSIT_AMOUNT,
      synapse.getWarmStorageAddress(),
      ethers.MaxUint256,
      ethers.MaxUint256,
      TIME_CONSTANTS.EPOCHS_PER_MONTH
    );
    await tx.wait();
    console.log('✅ Payment setup complete\n');
  } catch (error) {
    const errorMsg = error.message?.toLowerCase() || '';
    if (errorMsg.includes('already approved') || errorMsg.includes('allowance')) {
      console.log('✅ Payment already set up\n');
    } else {
      console.warn(`⚠️  Payment setup warning: ${error.message}`);
      console.log('   Continuing...\n');
    }
  }

  // Upload files
  console.log(`☁️  Uploading ${files.length} files to Filecoin...`);
  const uploadResults = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = Math.round(((i + 1) / files.length) * 100);
    console.log(`\n[${i + 1}/${files.length}] (${progress}%) Uploading ${file.path}...`);

    try {
      const uploadStartTime = Date.now();
      const { pieceCid, size } = await synapse.storage.upload(file.content);
      const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(1);

      const ipfsCid = await computeIPFSCID(file.content);

      uploadResults.push({
        path: file.path,
        pieceCid: typeof pieceCid === 'string' ? pieceCid : pieceCid?.['/'],
        ipfsCid,
        size,
        contentHash: file.contentHash,
      });

      console.log(`   ✅ Piece CID: ${typeof pieceCid === 'string' ? pieceCid : pieceCid?.['/']}`);
      if (ipfsCid) {
        console.log(`   ✅ IPFS CID: ${ipfsCid}`);
      }
      console.log(`   ⏱️  Upload time: ${uploadDuration}s`);

      // Small delay between uploads
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      throw error;
    }
  }

  const indexFile = uploadResults.find(f => f.path === 'index.html') || uploadResults[0];
  return {
    backend: 'filecoin',
    network,
    uploadResults,
    indexFileCID: indexFile?.ipfsCid || indexFile?.pieceCid,
    indexFilePieceCID: indexFile?.pieceCid,
  };
}

/**
 * Deploy to Storacha Network using CLI
 */
async function deployToStoracha(files) {
  const spaceDID = process.env.STORACHA_SPACE || 'did:key:z6MkfEgibWDdvs4EQQ1SX9RyhaDD5ZG9PbxAWpJknombANdj';
  
  if (!spaceDID) {
    throw new Error(
      'STORACHA_SPACE must be set in frontend/.env\nSet your space DID (e.g., did:key:...)'
    );
  }

  console.log(`☁️  Uploading ${files.length} files to Storacha Network...`);
  console.log(`   Using space: ${spaceDID}`);

  // Use the build directory directly (Storacha CLI handles directories well)
  // No need to recreate - just upload the build directory as-is
  const buildDir = path.join(__dirname, '..', 'build');
  
  if (!fs.existsSync(buildDir)) {
    throw new Error('Build directory not found. Run "npm run build" first.');
  }
  
  console.log(`   Uploading build directory: ${buildDir}`);
  console.log('   Uploading via Storacha CLI...');
  
  try {
    
    // Find storacha command (try common locations)
    let storachaCmd = 'storacha';
    try {
      // Try to find the command
      execSync('which storacha', { encoding: 'utf-8', stdio: 'pipe' });
    } catch (e) {
      // Try common npm global install locations
      const possiblePaths = [
        '/usr/local/bin/storacha',
        path.join(process.env.HOME || '', '.npm-global/bin/storacha'),
        path.join(process.env.HOME || '', '.local/bin/storacha'),
      ];
      
      let found = false;
      for (const cmdPath of possiblePaths) {
        if (fs.existsSync(cmdPath)) {
          storachaCmd = cmdPath;
          found = true;
          break;
        }
      }
      
      if (!found) {
        throw new Error(
          `Storacha CLI not found in PATH. Install it with:\n` +
          `  npm install -g @storacha/cli\n` +
          `Then authenticate with:\n` +
          `  storacha login your-email@example.com`
        );
      }
    }
    
    // Set the current space first
    console.log('   Setting current space...');
    try {
      execSync(
        `"${storachaCmd}" space use ${spaceDID}`,
        { 
          encoding: 'utf-8', 
          cwd: path.join(__dirname, '..'), 
          stdio: 'pipe',
          env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' }
        }
      );
    } catch (spaceError) {
      throw new Error(`Failed to set Storacha space: ${spaceError.message}`);
    }
    
    // Use Storacha CLI to upload the build directory
    let output = '';
    try {
      output = execSync(
        `"${storachaCmd}" up "${buildDir}"`,
        { 
          encoding: 'utf-8', 
          cwd: path.join(__dirname, '..'), 
          stdio: 'pipe',
          env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' }
        }
      );
    } catch (execError) {
      // execSync throws on non-zero exit, but we might still have output in stdout
      output = execError.stdout?.toString() || execError.output?.join('') || '';
      const stderr = execError.stderr?.toString() || '';
      
      // Some CLIs output to stderr even on success, so check both
      const fullOutput = output + stderr;
      const cidMatch = fullOutput.match(/baf[a-z0-9]+/);
      
      if (cidMatch) {
        // Found CID, use it even if command "failed"
        output = fullOutput;
      } else {
        // No CID found, this is a real error
        throw execError;
      }
    }
    
    // Parse CID from output
    const cidMatch = output.match(/baf[a-z0-9]+/);
    const cid = cidMatch ? cidMatch[0] : null;
    
    if (!cid) {
      throw new Error(
        `Could not parse CID from Storacha CLI output.\n` +
        `Output: ${output}\n` +
        `Make sure the upload succeeded.`
      );
    }
    
    return {
      backend: 'storacha',
      directoryCID: cid,
      indexFileCID: `${cid}/index.html`,
    };
  } catch (error) {
    
    // Check if it's a command not found error
    if (error.message.includes('command not found') || 
        error.message.includes('ENOENT') ||
        (error.code === 'ENOENT' && error.syscall === 'spawn')) {
      throw new Error(
        `Storacha CLI not found. Install it with:\n` +
        `  npm install -g @storacha/cli\n` +
        `Then authenticate with:\n` +
        `  storacha login your-email@example.com`
      );
    }
    
    throw new Error(`Storacha upload failed: ${error.message}\n${error.stderr || ''}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const backend = args.includes('--backend')
    ? args[args.indexOf('--backend') + 1] || 'storacha'
    : 'storacha';
  const network = args.includes('--network')
    ? args[args.indexOf('--network') + 1] || 'calibration'
    : 'calibration';

  console.log('🚀 Starting deployment...\n');
  console.log(`Backend: ${backend}`);
  if (backend === 'filecoin') {
    console.log(`Network: ${network}`);
  }
  console.log('');

  // Check build directory
  const buildDir = path.join(__dirname, '..', 'build');
  const possibleBuildDirs = [
    buildDir,
    path.join(__dirname, '..', '.svelte-kit/output/client'),
    path.join(__dirname, '..', '.svelte-kit/output'),
  ];

  let actualBuildDir = null;
  for (const dir of possibleBuildDirs) {
    if (fs.existsSync(dir)) {
      actualBuildDir = dir;
      break;
    }
  }

  if (!actualBuildDir) {
    console.log('📦 Building frontend...');
    try {
      execSync('npm run build', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
      });
      for (const dir of possibleBuildDirs) {
        if (fs.existsSync(dir)) {
          actualBuildDir = dir;
          break;
        }
      }
      if (!actualBuildDir) {
        throw new Error('Build completed but output directory not found');
      }
    } catch (error) {
      throw new Error(`Failed to build frontend: ${error.message}`);
    }
  } else {
    console.log(`✅ Build directory found: ${actualBuildDir}\n`);
  }

  // Collect files
  console.log('📁 Collecting files...');
  const files = collectFiles(actualBuildDir, '', {
    skipPadding: backend === 'storacha', // Only pad for Filecoin
  });

  if (files.length === 0) {
    throw new Error('No files found to upload');
  }

  console.log(`   Found ${files.length} files\n`);

  // Deploy
  let result;
  try {
    if (backend === 'filecoin') {
      result = await deployToFilecoin(files, network);
    } else if (backend === 'storacha') {
      result = await deployToStoracha(files);
    } else {
      throw new Error(`Unknown backend: ${backend}. Supported: filecoin, storacha`);
    }
  } catch (error) {
    console.error(`\n❌ Deployment failed: ${error.message}`);
    process.exit(1);
  }

  // Output results
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Deployment successful!');
  console.log('='.repeat(60));
  console.log(`\nBackend: ${result.backend}`);
  if (result.network) {
    console.log(`Network: ${result.network}`);
  }
  console.log(`\n📦 Content Identifiers:`);

  if (result.directoryCID) {
    console.log(`   Directory CID: ${result.directoryCID}`);
    if (result.carCID) {
      console.log(`   CAR CID: ${result.carCID}`);
    }
  } else {
    console.log(`   Index file CID: ${result.indexFileCID}`);
    if (result.indexFilePieceCID) {
      console.log(`   Piece CID (Filecoin): ${result.indexFilePieceCID}`);
    }
  }

  console.log(`\n🌐 Access your app:`);
  if (result.directoryCID) {
    console.log(`   IPFS Gateway: https://ipfs.io/ipfs/${result.directoryCID}/`);
    console.log(`   Index file: https://ipfs.io/ipfs/${result.directoryCID}/index.html`);
  } else {
    console.log(`   IPFS Gateway: https://ipfs.io/ipfs/${result.indexFileCID}`);
  }

  console.log(`\n📝 Update your ENS contenthash to:`);
  const ensCID = result.directoryCID || result.indexFileCID;
  const ensPath = result.directoryCID ? `${ensCID}/` : ensCID;
  console.log(`   ipfs://${ensPath}`);

  // Encode for ENS if possible
  try {
    const encoded = encode('ipfs', ensCID);
    console.log(`\n📋 ENS encoded contenthash:`);
    console.log(`   ${encoded}`);
  } catch (error) {
    // Ignore encoding errors
  }

  console.log('\n💡 Storage Details:');
  if (result.backend === 'filecoin') {
    console.log('   • Content stored on Filecoin (persistent, decentralized)');
    console.log('   • IPFS CIDs computed locally (for reference)');
    console.log('   ⚠️  Content NOT automatically accessible via IPFS gateways');
    console.log('   ⚠️  Requires manual IPFS pinning for ENS access');
  } else {
    console.log('   • Content stored on Filecoin (persistent, decentralized)');
    console.log('   • Automatically pinned to IPFS (ENS/gateway access)');
    console.log('   ✅ Ready for ENS immediately');
  }
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
