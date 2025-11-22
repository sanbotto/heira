#!/usr/bin/env node

/**
 * Filecoin Deployment Script for Heira Frontend
 *
 * This script deploys the built frontend application to Filecoin using the Synapse SDK.
 * It uses the PRIVATE_KEY environment variable from frontend/.env
 *
 * Prerequisites:
 * 1. Build the frontend: cd frontend && npm run build
 * 2. Have FIL tokens in your wallet for gas fees
 * 3. Have USDFC tokens in your wallet for storage payments
 * 4. Set PRIVATE_KEY in frontend/.env
 *
 * Usage:
 *   node scripts/deploy-filecoin.js [--network calibration|mainnet]
 */

require('dotenv').config({ path: './frontend/.env' });
const { Synapse, RPC_URLS, TOKENS, TIME_CONSTANTS } = require('@filoz/synapse-sdk');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const NETWORK = process.argv.includes('--network')
  ? process.argv[process.argv.indexOf('--network') + 1] || 'calibration'
  : 'calibration';

const RPC_URL = NETWORK === 'mainnet' ? RPC_URLS.mainnet.http : RPC_URLS.calibration.http;

const DEPOSIT_AMOUNT = ethers.parseUnits('2.5', 18); // 2.5 USDFC (covers ~1TiB for 30 days)

async function main() {
  console.log('🚀 Starting Filecoin deployment...\n');
  console.log(`Network: ${NETWORK}`);
  console.log(`RPC URL: ${RPC_URL}\n`);

  // Check for private key
  if (!process.env.PRIVATE_KEY) {
    throw new Error(
      '❌ PRIVATE_KEY not found in frontend/.env\n' +
        'Please add your wallet private key to frontend/.env'
    );
  }

  // Check if frontend is built
  const frontendDir = path.join(__dirname, '..');
  const possibleBuildDirs = [
    path.join(frontendDir, 'build'),
    path.join(frontendDir, '.svelte-kit/output/client'),
    path.join(frontendDir, '.svelte-kit/output'),
  ];

  let buildDir = null;
  for (const dir of possibleBuildDirs) {
    if (fs.existsSync(dir)) {
      buildDir = dir;
      break;
    }
  }

  if (!buildDir) {
    console.log('📦 Building frontend...');
    try {
      execSync('npm run build', {
        cwd: frontendDir,
        stdio: 'inherit',
      });
      console.log('✅ Frontend built successfully\n');

      // Check again after build
      for (const dir of possibleBuildDirs) {
        if (fs.existsSync(dir)) {
          buildDir = dir;
          break;
        }
      }

      if (!buildDir) {
        throw new Error('Build completed but output directory not found');
      }
    } catch (error) {
      throw new Error(
        `❌ Failed to build frontend: ${error.message}\nPlease run 'cd frontend && npm run build' first.`
      );
    }
  } else {
    console.log(`✅ Frontend build directory found: ${buildDir}\n`);
  }

  // Initialize Synapse SDK
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
  console.log(`Current USDFC balance: ${formattedBalance} USDFC`);

  if (walletBalance < DEPOSIT_AMOUNT) {
    console.warn(
      `⚠️  Warning: Balance (${formattedBalance} USDFC) is less than recommended deposit (2.5 USDFC)`
    );
    console.log('   You may need to get test tokens from the faucet:');
    if (NETWORK === 'calibration') {
      console.log('   - tFIL: https://faucet.calibnet.chainsafe-fil.io/funds.html');
      console.log('   - USDFC: https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc');
    }
    const proceed = process.argv.includes('--force');
    if (!proceed) {
      throw new Error('❌ Insufficient balance. Use --force to proceed anyway.');
    }
  }
  console.log();

  // Setup payments: Deposit USDFC and approve Warm Storage service
  console.log('💳 Setting up payments...');
  console.log('   Depositing USDFC and approving Warm Storage service...');

  try {
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
      DEPOSIT_AMOUNT,
      synapse.getWarmStorageAddress(),
      ethers.MaxUint256, // Rate allowance: max
      ethers.MaxUint256, // Lockup allowance: max
      TIME_CONSTANTS.EPOCHS_PER_MONTH // Max lockup period: 30 days
    );

    await tx.wait();
    console.log('✅ Payment setup complete\n');
  } catch (error) {
    // If already approved, continue
    if (error.message?.includes('already approved') || error.message?.includes('allowance')) {
      console.log('✅ Payment already set up\n');
    } else {
      throw error;
    }
  }

  // Prepare files for upload
  console.log('📁 Preparing files for upload...');
  const filesToUpload = [];

  function collectFiles(dir, basePath = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);

        // Skip node_modules and other unnecessary directories
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') && entry.name !== '.well-known') {
            continue;
          }
          if (entry.name === 'node_modules') {
            continue;
          }
          collectFiles(fullPath, relativePath);
        } else {
          // Skip source maps and other dev files if desired
          if (entry.name.endsWith('.map')) {
            continue;
          }
          const content = fs.readFileSync(fullPath);
          filesToUpload.push({
            path: relativePath,
            content: content,
          });
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${dir}: ${error.message}`);
    }
  }

  collectFiles(buildDir);

  if (filesToUpload.length === 0) {
    throw new Error(
      'No files found to upload. Check that the frontend build completed successfully.'
    );
  }

  console.log(`   Found ${filesToUpload.length} files to upload\n`);

  // Upload files
  console.log('☁️  Uploading to Filecoin...');
  const uploadResults = [];

  for (const file of filesToUpload) {
    try {
      const { pieceCid, size } = await synapse.storage.upload(file.content);
      uploadResults.push({
        path: file.path,
        pieceCid,
        size,
      });
      console.log(`   ✅ ${file.path} (${size} bytes) -> ${pieceCid}`);
    } catch (error) {
      console.error(`   ❌ Failed to upload ${file.path}:`, error.message);
      throw error;
    }
  }

  // Create a manifest/index file
  console.log('\n📝 Creating deployment manifest...');
  const manifest = {
    network: NETWORK,
    deployedAt: new Date().toISOString(),
    files: uploadResults,
    indexFile:
      uploadResults.find(f => f.path === 'index.html')?.pieceCid || uploadResults[0]?.pieceCid,
  };

  const manifestContent = JSON.stringify(manifest, null, 2);
  const { pieceCid: manifestCid } = await synapse.storage.upload(Buffer.from(manifestContent));

  console.log(`✅ Manifest uploaded: ${manifestCid}\n`);

  // Output results
  console.log('='.repeat(60));
  console.log('🎉 Deployment successful!');
  console.log('='.repeat(60));
  console.log(`\nNetwork: ${NETWORK}`);
  console.log(`Manifest CID: ${manifestCid}`);
  console.log(`Index file CID: ${manifest.indexFile}`);
  console.log(`Total files uploaded: ${uploadResults.length}`);
  console.log(`\n📋 File CIDs:`);
  uploadResults.forEach(({ path, pieceCid }) => {
    console.log(`   ${path}: ${pieceCid}`);
  });

  console.log(`\n🌐 Access your app:`);
  console.log(`   You can access files using the CIDs above or through Filecoin gateways.`);
  console.log(`   Example: https://ipfs.io/ipfs/${manifest.indexFile}`);

  console.log(`\n💾 Save this manifest CID for future reference:`);
  console.log(`   ${manifestCid}`);
  console.log('='.repeat(60));
}

main()
  .then(() => {
    console.log('\n✅ Deployment workflow completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Deployment failed:');
    console.error(error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    process.exit(1);
  });
