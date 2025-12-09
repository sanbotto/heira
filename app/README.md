# Heira App

SvelteKit application for the Heira Web3 inheritance escrow platform.

## Overview

This is a full-stack SvelteKit application that provides:
- Frontend UI for creating and managing escrow contracts.
- API endpoints for escrow registration, verification, and price data.
- D1 database integration for escrow metadata storage.
- Cloudflare Pages deployment with serverless functions.

## API Routes

### Escrow APIs

- `POST /api/escrow/register` - Register a new escrow contract
- `POST /api/escrow/unregister` - Unregister an escrow contract
- `POST /api/escrow/verify` - Verify an escrow contract on Blockscout
- `GET /api/escrow/[address]` - Get escrow details by address

### Price API

- `GET /api/prices` - Get token prices from 1inch API

## D1 Database Setup

The app uses Cloudflare D1 (SQLite) for storing escrow metadata.

### Local Development

1. Copy `wrangler.toml.example` to `wrangler.toml`
2. Configure D1 database binding in `wrangler.toml`
3. Create local database: `wrangler d1 create heira-escrows-db`
4. Run migrations: `wrangler d1 execute heira-escrows-db --file=./migrations/0001_initial.sql --local`

### Production

1. Create D1 database in Cloudflare dashboard
2. Run migrations: `wrangler d1 execute heira-escrows-db --file=./migrations/0001_initial.sql`
3. Configure database binding in Cloudflare Pages settings

### Database Schema

The `escrows` table stores:
- `escrow_address` - Contract address
- `network` - Network name (sepolia, baseSepolia, citreaTestnet)
- `email` - Optional email for inactivity warnings
- `inactivity_period` - Inactivity period in days
- `created_at` - Creation timestamp
- `last_email_sent` - Last warning email timestamp

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm
- Cloudflare account (for D1 database)

### Setup

```bash
npm install
cp .env.example .env
cp wrangler.toml.example wrangler.toml
# Edit .env with your API keys and factory addresses
# Edit wrangler.toml with D1 database configuration
```

### Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Type Checking

```bash
npm run check
```

### Building

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Environment Variables

- `BLOCKSCOUT_API_KEY` - Blockscout API key for contract verification
- `VITE_FACTORY_ADDRESS_BASE_SEPOLIA` - Factory contract address on Base
- `VITE_FACTORY_ADDRESS_CITREA_TESTNET` - Factory contract address on Citrea Testnet
- `VITE_FACTORY_ADDRESS_ETHEREUM_SEPOLIA` - Factory contract address on Ethereum/Sepolia
- `VITE_WALLETCONNECT_PROJECT_ID` - WalletConnect project ID
- `ONEINCH_API_KEY` - 1inch API key (server-side)
- `BASE_SEPOLIA_RPC_URL` - Base Sepolia RPC URL (server-side)
- `CITREA_TESTNET_RPC_URL` - Citrea Testnet RPC URL (server-side)
- `ETHEREUM_SEPOLIA_RPC_URL` - Sepolia RPC URL (server-side)

## Deployment

### Cloudflare Pages

1. Build the app: `npm run build`
2. Connect your GitHub repository to Cloudflare Pages
3. Configure build settings:
   - Build command: `npm run build`
   - Build output directory: `.svelte-kit`
   - Node version: 18 or higher
4. Set environment variables in Cloudflare Pages dashboard
5. Configure D1 database binding in Pages settings

### Using Wrangler

```bash
npm run build
wrangler pages deploy .svelte-kit
```

### Database Migration

After deploying, run migrations on production database:

```bash
wrangler d1 execute heira-escrows-db --file=./migrations/0001_initial.sql
```

## Supported Networks

- Sepolia (Ethereum testnet)
- Base Sepolia
- Citrea Testnet

## Technologies

- SvelteKit - Full-stack framework
- Vite - Build tool
- TypeScript - Type safety
- Tailwind CSS - Styling
- RainbowKit - Wallet connection UI
- Wagmi - Ethereum interaction
- Viem - Ethereum utilities
- Cloudflare D1 - Database
- Cloudflare Pages - Hosting
