# Cloudflare Workers Migration Summary

## Overview

The backend has been successfully migrated to Cloudflare Workers with a fallback Express.js server option. The implementation includes:

1. **API Worker** (`workers/api/`) - Handles `/api/escrow/verify` route using Blockscout API
2. **Keeper Worker** (`workers/keeper/`) - Daily cron-based worker (runs at midnight UTC) for monitoring and executing escrows
3. **Shared Code** (`workers/shared/`) - Core business logic shared between Workers and Express fallback
4. **Express Fallback** (`backend/`) - Refactored to use shared logic for redundancy

## Key Features

### Blockscout Integration
- All contract verification uses Blockscout API instead of Etherscan
- Supports all networks via their respective Blockscout instances
- No API key required (optional for rate limits)

### Storage
- **Workers**: Use Cloudflare D1 database
- **Express Fallback**: Use file system storage (can be configured to use D1 via HTTP API)

### Shared Architecture
- Core business logic extracted to `workers/shared/`
- Both Workers and Express use the same verification and keeper logic
- Storage abstraction layer allows switching between D1 and file system

## Project Structure

```
workers/
├── api/                    # API Worker
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
├── keeper/                 # Keeper Worker
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
└── shared/                 # Shared code
    ├── constants.ts        # Network constants, explorer URLs
    ├── types.ts           # TypeScript types
    ├── utils.ts           # Utility functions
    ├── storage/           # Storage adapters
    │   ├── d1-adapter.ts
    │   └── file-adapter.ts
    ├── verification/      # Verification logic
    │   └── blockscout.ts
    ├── keeper/            # Keeper logic
    │   ├── keeper.ts
    │   └── email.ts
    └── d1-schema.sql      # D1 database schema
```

## Next Steps

### 1. Create D1 Database

```bash
wrangler d1 create heira-db
# Note the database_id and update wrangler.toml files
wrangler d1 execute heira-db --file=workers/shared/d1-schema.sql
```

### 2. Configure Secrets

Set secrets via Cloudflare dashboard or wrangler CLI for both workers.

### 3. Bundle Standard JSON Input

The Standard JSON Input from Hardhat build artifacts needs to be available. Options:
- Store as secret: `wrangler secret put STANDARD_JSON_INPUT < contracts/artifacts/build-info/...json`
- Bundle at build time (requires custom build script)

### 4. Deploy Workers

```bash
cd workers/api && wrangler deploy
cd ../keeper && wrangler deploy
```

## Fallback Deployment

If Cloudflare Workers are unavailable, deploy the Express fallback:

```bash
./scripts/deploy-fallback.sh
```

The Express server will:
- Use file-based storage by default
- Can be configured to use D1 via `USE_D1_STORAGE=true` (requires D1 HTTP API client implementation)
- Use the same shared verification and keeper logic

## Notes

- The keeper runs daily at midnight UTC (`0 0 * * *`)
- All networks use Blockscout for verification
- Standard JSON Input must be bundled or stored as a secret
- Express fallback maintains compatibility with existing deployments

## Testing

- Local development: `wrangler dev` in each worker directory
- Express fallback: `npm run dev` in `backend/` directory
