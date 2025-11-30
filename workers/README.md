# Cloudflare Workers

This directory contains the Cloudflare Workers implementation for Heira backend.

## Structure

- `api/` - API worker handling `/api/escrow/verify` route
- `keeper/` - Cron-based keeper worker for monitoring and executing escrows
- `shared/` - Shared code used by both Workers and Express fallback

## Setup

### 1. Install Dependencies

```bash
cd workers/api
npm install

cd ../keeper
npm install
```

### 2. Create D1 Database

```bash
# Create the database
wrangler d1 create heira-db

# Note the database_id from the output and update wrangler.toml files

# Create the schema
wrangler d1 execute heira-db --file=../shared/d1-schema.sql
```

### 3. Configure Secrets

Set secrets via Cloudflare dashboard or wrangler CLI:

```bash
# API Worker secrets
cd workers/api
wrangler secret put BLOCKSCOUT_API_KEY  # Optional
wrangler secret put ALLOWED_ORIGINS
wrangler secret put ORIGIN_HOSTNAME

# Keeper Worker secrets
cd ../keeper
wrangler secret put PRIVATE_KEY
wrangler secret put MAILPACE_API_TOKEN
wrangler secret put FACTORY_ADDRESS_ETHEREUM
wrangler secret put FACTORY_ADDRESS_BASE
wrangler secret put FACTORY_ADDRESS_CITREA
wrangler secret put MAINNET_RPC_URL
wrangler secret put SEPOLIA_RPC_URL
wrangler secret put BASE_RPC_URL
wrangler secret put BASE_SEPOLIA_RPC_URL
wrangler secret put CITREA_RPC_URL
```

### 4. Bundle Standard JSON Input

The Standard JSON Input from Hardhat build artifacts needs to be bundled or stored as a secret. Options:

1. **Store as secret** (recommended for production):
   ```bash
   wrangler secret put STANDARD_JSON_INPUT < contracts/artifacts/build-info/bae91e66b8308592901f4fef090532bb.json
   ```

2. **Bundle at build time** (requires custom build script)

### 5. Deploy

```bash
# Deploy API worker
cd workers/api
wrangler deploy

# Deploy Keeper worker
cd ../keeper
wrangler deploy
```

## Local Development

```bash
# Run API worker locally
cd workers/api
wrangler dev

# Run Keeper worker locally (test cron trigger)
cd ../keeper
wrangler dev
```

## Fallback Deployment

If Cloudflare Workers are unavailable, deploy the Express fallback:

```bash
./scripts/deploy-fallback.sh
```

See `backend/README.md` for Express fallback deployment details.
