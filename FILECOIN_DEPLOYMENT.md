# Filecoin Deployment Guide

This guide explains how to deploy the Heira frontend application to Filecoin using the Synapse SDK.

## Prerequisites

1. **Wallet Setup**
   - Your `PRIVATE_KEY` must be set in `frontend/.env` (same key used for smart contract deployment)
   - Your wallet needs FIL tokens for gas fees
   - Your wallet needs USDFC tokens for storage payments

2. **Test Tokens (Calibration Testnet)**
   - Get tFIL tokens: https://faucet.calibnet.chainsafe-fil.io/funds.html
   - Get USDFC tokens: https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc

3. **Dependencies**
   - Install frontend dependencies: `cd frontend && npm install`

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

This will install `@filoz/synapse-sdk` and `ethers` required for Filecoin deployment.

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in the required values:

```bash
cd frontend
cp .env.example .env
```

Required environment variables:
- `PRIVATE_KEY` - Your wallet private key for Filecoin deployment
- `VITE_BACKEND_API_URL` - Backend API URL (e.g., `http://localhost:3001`)

### 3. Build Frontend

```bash
cd frontend
npm run build
```

The deployment script will automatically build if needed, but it's recommended to build first to catch any errors.

### 4. Deploy to Filecoin

**Calibration Testnet (default):**
```bash
cd frontend
npm run deploy:filecoin
```

**Mainnet:**
```bash
cd frontend
npm run deploy:filecoin:mainnet
```

## How It Works

The deployment script:

1. ✅ Checks for `PRIVATE_KEY` in `frontend/.env`
2. ✅ Builds the frontend if not already built (generates static files)
3. ✅ Initializes the Filecoin Synapse SDK
4. ✅ Checks wallet balance (warns if insufficient)
5. ✅ Sets up payments (deposits 2.5 USDFC and approves Warm Storage service)
6. ✅ Uploads all frontend build files to Filecoin
7. ✅ Creates a deployment manifest with all file CIDs
8. ✅ Outputs the CIDs and access URLs

## Output

After successful deployment, you'll see:

```
Deployment successful!
Network: calibration
Manifest CID: bafybe...
Index file CID: bafybe...
Total files uploaded: 42

🌐 Access your app:
   You can access files using the CIDs above or through Filecoin gateways.
   Example: https://ipfs.io/ipfs/bafybe...
```

## File Access

Your deployed files can be accessed via:

- **IPFS Gateways**: `https://ipfs.io/ipfs/{CID}`
- **Filecoin Gateways**: Various Filecoin gateways support CID access
- **Direct CID**: Use the CIDs in your application or dApp

## Static Site Configuration

The frontend is configured for static site generation (SSG) using `@sveltejs/adapter-static`. This means:

- All pages are prerendered at build time
- The app works as a static site (no server required)
- Dynamic routes use client-side routing
- API routes proxy to the backend service

## Backend API

The frontend includes API routes that proxy to the backend service. Make sure to:

1. Set `VITE_BACKEND_API_URL` in `frontend/.env`
2. Deploy the backend separately (see `backend/README.md`)
3. The frontend will call the backend API for server-side operations

## Troubleshooting

### Insufficient Balance

If you see a balance warning:
- Get test tokens from the faucets (for calibration)
- Or use `--force` flag to proceed anyway (not recommended)

### Build Errors

If the frontend build fails:
- Check that all frontend dependencies are installed: `cd frontend && npm install`
- Ensure environment variables are set in `frontend/.env`
- Try building manually: `cd frontend && npm run build`

### SDK Initialization Errors

- Verify `PRIVATE_KEY` is set correctly in `frontend/.env`
- Ensure the private key starts with `0x`
- Check that your wallet has FIL tokens for gas

### Upload Errors

- Check your USDFC balance
- Ensure payment setup completed successfully
- Verify network connectivity

### Backend API Errors

- Ensure `VITE_BACKEND_API_URL` is set correctly
- Verify the backend service is running
- Check CORS settings on the backend

## Environment Variables

The deployment uses `PRIVATE_KEY` from `frontend/.env` that you use for smart contract deployment. Additional variables:

- `PRIVATE_KEY` - Wallet private key for Filecoin deployment
- `VITE_BACKEND_API_URL` - Backend API endpoint URL

## Network Configuration

- **Calibration (Testnet)**: Default, use for testing
- **Mainnet**: Production deployment, requires real FIL and USDFC tokens

## Cost Estimation

- **Gas fees**: Small amount of FIL (varies by network)
- **Storage**: ~2.5 USDFC covers approximately 1 TiB for 30 days
- **Actual costs**: Depend on your frontend size and storage duration

## Security Notes

**Important**: 
- Never commit your `PRIVATE_KEY` to git
- Use a dedicated deployment wallet if possible
- Only fund the wallet with necessary tokens
- Keep your private key secure

## Next Steps

After deployment:
1. Save the manifest CID for future reference
2. Update your DNS/IPFS records if using custom domains
3. Monitor storage costs and top up USDFC as needed
4. Set up automated deployments if desired
5. Ensure backend API is deployed and accessible

## Additional Resources

- [Filecoin Onchain Cloud Documentation](https://docs.filecoin.cloud/)
- [Synapse SDK Documentation](https://docs.filecoin.cloud/developer-guides/)
- [Filecoin Calibration Faucet](https://faucet.calibnet.chainsafe-fil.io/funds.html)
- [Backend Documentation](./backend/README.md)
