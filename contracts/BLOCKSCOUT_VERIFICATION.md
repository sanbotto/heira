# Blockscout Verification Guide for Citrea Testnet

## Overview

Blockscout verification on Citrea Testnet can sometimes fail with Hardhat's automatic verification. This guide provides alternative methods to verify your contracts.

## Contract Address

Factory Contract: `0x941a0d37CDd7506C2D109B70E4b7E65B15e6b8bc`

## Method 1: Manual Verification via Blockscout UI (Recommended)

1. **Navigate to the contract on Blockscout:**
   ```
   https://explorer.testnet.citrea.xyz/address/0x941a0d37CDd7506C2D109B70E4b7E65B15e6b8bc
   ```

2. **Click "Verify and Publish"** button

3. **Select "Via Standard JSON Input"** (recommended)

4. **Fill in the contract details:**
   - **Contract Name:** `InheritanceEscrowFactory`
   - **Compiler Version:** `v0.8.24+commit.e14b2715`
   - **Optimization:** `Yes` (200 runs)
   - **EVM Version:** `default`
   - **License:** `MIT`

5. **Upload the Standard JSON Input:**
   - The file is located at: `contracts/artifacts/build-info/[hash].json`
   - Or compile fresh and get the JSON from `artifacts/build-info/`

6. **Enter Constructor Arguments:** None (empty)

7. **Click "Verify and Publish"**

## Method 2: Using Sourcify (Alternative)

Sourcify is enabled in the Hardhat config and can verify contracts on Blockscout:

```bash
# Sourcify verification is automatic if enabled
# Check verification status:
curl https://sourcify.dev/server/check-by-addresses?addresses=0x941a0d37CDd7506C2D109B70E4b7E65B15e6b8bc&chainIds=5115
```

## Method 3: Direct API Call to Blockscout

You can verify directly using Blockscout's API:

```bash
# Get the Standard JSON Input from artifacts
STANDARD_JSON=$(cat contracts/artifacts/build-info/[latest-hash].json)

# Submit verification
curl -X POST "https://explorer.testnet.citrea.xyz/api" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "module=contract&action=verifysourcecode" \
  -d "addressHash=0x941a0d37CDd7506C2D109B70E4b7E65B15e6b8bc" \
  -d "contractname=InheritanceEscrowFactory" \
  -d "compilerversion=v0.8.24+commit.e14b2715" \
  -d "optimizationUsed=1" \
  -d "runs=200" \
  -d "evmversion=default" \
  -d "licenseType=3" \
  -d "sourceCode=$STANDARD_JSON"
```

## Common Issues

### Issue: "Fail - Unable to verify"

**Possible causes:**
1. **Compiler settings mismatch** - Ensure optimizer is enabled with 200 runs
2. **Contract not fully indexed** - Wait 2-5 minutes after deployment
3. **Bytecode mismatch** - Ensure you're using the exact same compiler settings

**Solutions:**
- Try manual verification via UI (Method 1)
- Double-check compiler version matches exactly
- Ensure optimizer settings match deployment settings

### Issue: API Key Warning

The warning about deprecated API keys is informational. Blockscout works without an API key, but having one improves rate limits.

## Verification Status

Check verification status:
```
https://explorer.testnet.citrea.xyz/address/0x941a0d37CDd7506C2D109B70E4b7E65B15e6b8bc#code
```

Once verified, you'll see:
- ✅ Green checkmark
- Source code visible
- Contract functions and events listed

## Additional Resources

- [Blockscout Verification Docs](https://docs.blockscout.com/devs/verification/blockscout-smart-contract-verification-api)
- [Hardhat Verification Plugin](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify)
