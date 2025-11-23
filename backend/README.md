# Heira Backend

Backend API and keeper service for Heira inheritance escrow management.

## Overview

The backend package provides:
- **API endpoints** for frontend integration (e.g., contract verification)
- **Keeper service** for monitoring escrow contracts and triggering executions when inactivity periods expire

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Required environment variables:
- `PRIVATE_KEY` - Wallet private key for signing transactions
- `FACTORY_ADDRESS_ETHEREUM` - Factory contract address for Ethereum (used for both mainnet and sepolia)
- `FACTORY_ADDRESS_BASE` - Factory contract address for Base (used for both Base mainnet and Base Sepolia)
- `FACTORY_ADDRESS_CITREA` - Factory contract address for Citrea Testnet
- RPC URLs: `MAINNET_RPC_URL`, `SEPOLIA_RPC_URL`, `BASE_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `CITREA_RPC_URL`
- `ETHERSCAN_API_KEY` - For contract verification

### 3. Build

```bash
npm run build
```

## Running

### Development Mode

**API Server:**
```bash
npm run dev
```

**Keeper Service (standalone):**
```bash
npm run dev:keeper
```

### Production Mode

**API Server:**
```bash
npm start
```

**Keeper Service (standalone):**
```bash
npm run start:keeper
```

**Both together:**
Set `ENABLE_KEEPER=true` in `.env` and run `npm start`

## API Endpoints

### POST `/api/verify-escrow`

Verify an escrow contract on Etherscan/Basescan.

**Request Body:**
```json
{
  "escrowAddress": "0x...",
  "mainWallet": "0x...",
  "inactivityPeriod": 7776000,
  "owner": "0x...",
  "network": "sepolia"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contract verified successfully",
  "explorerUrl": "https://sepolia.etherscan.io/address/0x...",
  "alreadyVerified": false
}
```

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET `/api/keeper/status`

Get keeper service status.

**Response:**
```json
{
  "enabled": true,
  "isRunning": true,
  "checkIntervalMs": 300000,
  "networks": ["sepolia", "baseSepolia"]
}
```

## Keeper Service

The keeper service monitors escrow contracts and automatically triggers execution when:
- The inactivity period has elapsed
- The contract status is Active
- Beneficiaries are configured
- The `canExecute()` function returns `true`

### Configuration

Configure factory addresses and RPC URLs in `.env`:

```bash
FACTORY_ADDRESS_ETHEREUM=0x...
FACTORY_ADDRESS_BASE=0x...
FACTORY_ADDRESS_CITREA=0x...

MAINNET_RPC_URL=https://eth.llamarpc.com
SEPOLIA_RPC_URL=https://rpc.sepolia.org
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
CITREA_RPC_URL=https://rpc.testnet.citrea.xyz
```

The keeper will automatically monitor all networks where both a factory address and corresponding RPC URL are configured.

### How It Works

1. Connects to factory contracts on configured networks
2. Retrieves all escrow addresses from each factory
3. Checks each escrow's `canExecute()` status
4. Calls `run()` on escrows that are ready for execution
5. Repeats at configured intervals (default: 5 minutes)

### Running Keeper Separately

The keeper can run as a standalone service:

```bash
npm run start:keeper
```

Or alongside the API server by setting `ENABLE_KEEPER=true` in `.env`.

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # API server entry point
│   ├── routes/
│   │   └── verify-escrow.ts  # Contract verification endpoint
│   └── services/
│       ├── keeper.ts         # Keeper service implementation
│       └── keeper-cli.ts     # Keeper CLI entry point
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── .env.example
```

## Development

### Type Checking

```bash
npm run build
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## Deployment

The backend can be deployed to any Node.js hosting service:
- Railway
- Render
- Fly.io
- AWS Lambda (with adapter)
- Google Cloud Run
- etc.

Make sure to:
1. Set all required environment variables
2. Build the project: `npm run build`
3. Start the server: `npm start`
4. Optionally run keeper: `npm run start:keeper` or enable in main server

## Security Notes

- Never commit `.env` file with private keys
- Use environment variables in production
- Consider using a dedicated wallet for keeper operations
- Monitor keeper transactions and set up alerts
- Use rate limiting for API endpoints in production
