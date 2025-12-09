# Heira
_Pronounced like the word "era" (ˈerə)_

Automated and permissionless Web3 inheritance management.

## Overview

Heira is a Web3 dApp for handling inheritances through escrow smart contracts. Users can create escrow contracts that automatically transfer their tokens to designated beneficiaries after a period of inactivity.

## Quick Start

See [QUICKSTART.md](./QUICKSTART.md) for a 5-minute setup guide.

## Setup

### Smart Contracts

```bash
cd contracts
npm install
cp .env.example .env
# Edit .env with your private key and RPC URLs
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network sepolia
```

### Full-Stack App

```bash
cd app
npm install
cp .env.example .env
# Edit .env with API keys and factory addresses
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with D1 database configuration
npm run dev
```

## Environment Variables

See `contracts/.env.example` and `app/.env.example` for required environment variables. The app handles all API functionality. There's a keeper worker that has its own configuration in `workers/keeper/wrangler.toml`.

## Development

### Running Tests

```bash
# Smart contracts
cd contracts
npx hardhat test

# Frontend type checking
cd app
npm run check
```

### Deployment

1. Deploy factory contract to testnet/mainnet
2. Create D1 database in Cloudflare dashboard
3. Run migrations: `cd app && wrangler d1 execute heira-escrows-db --file=./migrations/0001_initial.sql`
4. Update `app/.env` with factory addresses and API keys
5. Configure environment variables in Cloudflare Pages
6. Build app: `cd app && npm run build`
7. Deploy to Cloudflare Pages (connect GitHub repo or use Wrangler)
8. Deploy keeper worker: `cd workers/keeper && npm run deploy`

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

You may use, modify, and distribute this software under the terms of the AGPL-3.0. See the LICENSE file for details.

**TL;DR:** The AGPL-3.0 ensures that all changes and derivative works must also be licensed under AGPL-3.0, and that **attribution is preserved**. If you run a modified version as a network service, you must make the source code available to users. This code is provided **as-is**, without warranties.
