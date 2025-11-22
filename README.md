# Heira
_Pronounced like the word "era" (ˈerə)_

Automated and permissionless Web3 inheritance management.

## Overview

Heira is a Web3 dApp for handling inheritances through escrow smart contracts. Users can create escrow contracts that automatically transfer their tokens to designated beneficiaries after a period of inactivity.

## Features

### Priority 1 (Implemented)
- ✅ Smart contract escrow system with factory pattern
- ✅ ENS name and avatar support
- ✅ Wallet connection (MetaMask, WalletConnect, Ledger)
- ✅ Multichain token balance display (Ethereum, Base)
- ✅ Chainlink price feeds integration
- ✅ Coinbase CDP Trade API integration
- ✅ Escrow creation UI
- ✅ Dashboard with countdown timers

### Priority 2 (Planned)
- Filecoin hosting
- World ID authentication
- Go keeper service

### Priority 3 (Planned)
- Coinbase Embedded Wallets
- BTC support
- AuditAgent verification
- Fluence deployment

## Project Structure

```
heira/
├── contracts/          # HardHat smart contracts
│   ├── InheritanceEscrow.sol
│   ├── InheritanceEscrowFactory.sol
│   └── test/
├── frontend/          # SvelteKit application
│   └── src/
│       ├── lib/       # Utilities (wallet, ENS, tokens, prices)
│       ├── components/
│       └── routes/
├── keeper/            # Go service for contract execution (Priority 2)
└── scripts/           # Deployment scripts
```

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

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with API keys and factory addresses
npm run dev
```

## Testing & Deployment

See [TESTING.md](./TESTING.md) for detailed instructions on:
- Running tests
- Deploying contracts
- Testing the full flow
- Troubleshooting

## Environment Variables

See `contracts/.env.example` and `frontend/.env.example` for required environment variables.

## Development

### Running Tests

```bash
# Smart contracts
cd contracts
npx hardhat test

# Frontend type checking
cd frontend
npm run check
```

### Deployment

1. Deploy factory contract to testnet/mainnet
2. Update `frontend/.env` with factory address
3. Build frontend: `cd frontend && npm run build`
4. Deploy to Filecoin (Priority 2)

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

You may use, modify, and distribute this software under the terms of the AGPL-3.0. See the LICENSE file for details.

**TL;DR:** The AGPL-3.0 ensures that all changes and derivative works must also be licensed under AGPL-3.0, and that **attribution is preserved**. If you run a modified version as a network service, you must make the source code available to users. This code is provided **as-is**, without warranties.
