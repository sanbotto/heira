# Contract Verification Guide

This guide explains how to verify your deployed contracts on Etherscan/Basescan so the source code is visible and auditable.

## Prerequisites

1. **Get an API key:**
   - For Ethereum networks (mainnet, Sepolia): Get from [Etherscan](https://etherscan.io/apis)
   - For Base networks (Base, Base Sepolia): You can use the same Etherscan API key or get one from [Basescan](https://basescan.org/apis)

2. **Add to `.env` file:**
   ```bash
   ETHERSCAN_API_KEY=your_api_key_here
   ETHERSCAN_API_KEY=your_api_key_here  # Optional, can use ETHERSCAN_API_KEY
   ```

## Automatic Verification During Deployment

### Factory Contract

The deployment script automatically verifies the factory contract if an API key is configured:

```bash
npm run deploy:sepolia
# or
npm run deploy:base-sepolia
```

The script will:
1. Deploy the factory contract
2. Wait for 5 block confirmations
3. Automatically verify on Etherscan/Basescan
4. Provide a link to view the verified contract

### Escrow Contracts

Escrow contracts are created dynamically by users through the factory. To automatically verify escrows:

1. **After creating an escrow** - Use the transaction hash verification script (see Option 1 above)
2. **Batch verification** - Use the auto-verify script to verify all escrows from a factory
3. **Integration** - You can integrate the verification script into your frontend workflow

## Manual Verification

### Verifying the Factory Contract

If automatic verification fails or you need to verify an already-deployed factory contract:

```bash
# Set the contract address
export CONTRACT_ADDRESS=0x...

# Verify on the network
npx hardhat run scripts/verify.js --network sepolia
# or
npx hardhat run scripts/verify.js --network baseSepolia
```

Or use the npm script:
```bash
CONTRACT_ADDRESS=0x... npm run verify:contract -- --network sepolia
```

### Verifying Escrow Contracts

Escrow contracts require constructor arguments, so they need special handling. There are several ways to verify escrows:

#### Option 1: Verify Immediately After Creation (Recommended)

If you just created an escrow and have the transaction hash:

```bash
TX_HASH=0x... FACTORY_ADDRESS=0x... npx hardhat run scripts/verify-escrow-after-create.js --network sepolia
```

Or use the npm script:
```bash
TX_HASH=0x... FACTORY_ADDRESS=0x... npm run verify:escrow:tx -- --network sepolia
```

This script automatically extracts the constructor arguments from the transaction event and verifies the escrow.

#### Option 2: Verify with Constructor Arguments

If you know the constructor arguments:

```bash
CONTRACT_ADDRESS=0x... \
MAIN_WALLET=0x... \
INACTIVITY_PERIOD=7776000 \
OWNER=0x... \
npx hardhat run scripts/verify-escrow.js --network sepolia
```

Or use the npm script:
```bash
CONTRACT_ADDRESS=0x... MAIN_WALLET=0x... INACTIVITY_PERIOD=7776000 OWNER=0x... npm run verify:escrow -- --network sepolia
```

#### Option 3: Auto-Verify All Escrows from Factory

To automatically verify all escrows created by a factory:

```bash
FACTORY_ADDRESS=0x... npx hardhat run scripts/auto-verify-escrows.js --network sepolia
```

Or use the npm script:
```bash
FACTORY_ADDRESS=0x... npm run verify:escrows:auto -- --network sepolia
```

This script:
- Scans for all `EscrowCreated` events from the factory
- Extracts constructor arguments from each event
- Automatically verifies each escrow contract
- Skips already-verified contracts (unless `VERIFY_ALL=true` is set)

**Options:**
- `FROM_BLOCK=<number>` - Start scanning from a specific block (default: latest - 1000)
- `TO_BLOCK=<number>` - End scanning at a specific block (default: latest)
- `VERIFY_ALL=true` - Verify all escrows, even if already verified

## Using Hardhat Verify Command Directly

You can also use Hardhat's built-in verify command:

```bash
# For contracts with no constructor arguments (like HeiraInheritanceEscrowFactory)
npx hardhat verify --network sepolia 0xContractAddress

# For contracts with constructor arguments
npx hardhat verify --network sepolia 0xContractAddress "arg1" "arg2"
```

## Troubleshooting

### "Contract already verified"
This means the contract is already verified. You can view it on the explorer.

### "Verification failed"
Common causes:
1. **Not enough block confirmations**: Wait a few minutes and try again
2. **Wrong network**: Make sure you're verifying on the correct network
3. **Wrong API key**: Verify your API key is correct for the network
4. **Compiler version mismatch**: Make sure the contract was compiled with the same Solidity version

### "Unable to verify"
- Check that the contract address is correct
- Ensure the contract was deployed from the same codebase
- Verify the compiler settings match (optimizer enabled, runs: 200)

## Supported Networks

- **Ethereum Mainnet**: `mainnet`
- **Sepolia Testnet**: `sepolia`
- **Base Mainnet**: `base`
- **Base Sepolia**: `baseSepolia`

## Viewing Verified Contracts

Once verified, you can view the contract source code on:
- **Ethereum**: https://etherscan.io/address/YOUR_CONTRACT_ADDRESS
- **Sepolia**: https://sepolia.etherscan.io/address/YOUR_CONTRACT_ADDRESS
- **Base**: https://basescan.org/address/YOUR_CONTRACT_ADDRESS
- **Base Sepolia**: https://sepolia.basescan.org/address/YOUR_CONTRACT_ADDRESS

## Additional Resources

- [Hardhat Verification Docs](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify)
- [Etherscan API Documentation](https://docs.etherscan.io/)
- [Basescan API Documentation](https://docs.basescan.org/)
