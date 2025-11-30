# Heira Terraform Infrastructure

Fully automated deployment infrastructure for Heira using Terraform. Everything is deployed with a single `terraform apply` command.

## Overview

This Terraform configuration manages:
- **Cloudflare Workers** - API and Keeper workers (plain JavaScript, no build step)
- **Cloudflare D1** - Database for escrow storage
- **Cloudflare Pages** - Frontend deployment
- **DNS Records** - Domain configuration
- **AWS SSM Parameters** - Secrets management
- **Contract Deployment** - Automated deployment when contract files change

## Prerequisites

1. Terraform Cloud account with workspace configured
2. AWS account with SSM Parameter Store access
3. Cloudflare account with API token
4. Wrangler CLI installed (for D1 schema execution)

## Setup

1. **Configure GitHub Secret:**
   - Create a secret named `TERRAFORM_TFVARS` in your GitHub repository
   - Copy the contents of `terraform.tfvars.example` and fill in your values
   - Store the entire file content as the secret value
   - The GitHub Actions workflow will create `terraform.tfvars` from this secret

2. **For local development, create terraform.tfvars:**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

3. **Set up AWS SSM Parameters:**
   - Update secret values in AWS SSM Parameter Store
   - Factory addresses will be auto-updated on contract deployment

3. **Initialize Terraform:**
   ```bash
   cd terraform
   terraform init
   ```

4. **Deploy locally:**
   ```bash
   terraform plan -var-file=terraform.tfvars
   terraform apply -var-file=terraform.tfvars
   ```

   Or push to GitHub - the workflow will automatically deploy.

## What Gets Deployed

### Workers
- **API Worker** (`heira-api-prod`) - Handles `/api/escrow/verify` route
- **Keeper Worker** (`heira-keeper-prod`) - Daily cron job for monitoring escrows

### Infrastructure
- D1 database with schema automatically applied
- Cloudflare Pages project connected to GitHub
- DNS records for `api.heira.app` and root domain

### Secrets
All secrets stored in AWS SSM Parameters:
- `PRIVATE_KEY`
- `MAILPACE_API_TOKEN`
- `BLOCKSCOUT_API_KEY`
- Factory addresses (auto-updated)
- RPC URLs
- `STANDARD_JSON_INPUT`

## Contract Deployment

Contracts are automatically deployed when source files change:
- Monitors `contracts/contracts/**/*.sol`
- Deploys to: sepolia, baseSepolia, citreaTestnet, mainnet, base
- Factory addresses captured and stored in SSM

**Note:** Factory addresses need to be manually extracted from deployment logs and updated in SSM, or use a script to automate this.

## Worker Architecture

Workers are plain JavaScript files concatenated via Terraform:
- No build step required
- Files concatenated in dependency order
- External dependencies (ethers) imported via CDN

File structure:
```
terraform/workers/
├── utils.js          # Shared utilities
├── constants.js      # Network constants
├── storage-d1.js     # D1 storage adapter
├── blockscout.js     # Contract verification
├── email.js          # Email notifications
├── keeper.js         # Keeper logic
├── api.js            # API worker entry point
└── keeper-worker.js  # Keeper worker entry point
```

## GitHub Actions

Two workflows are configured:
1. **Infrastructure** - Runs `terraform apply` on infrastructure changes
2. **Filecoin Deployment** - Deploys frontend to Filecoin on frontend changes

## Updating Secrets

1. Update values in AWS SSM Parameter Store (console or CLI)
2. Run `terraform apply` to sync changes to workers

## Troubleshooting

### D1 Schema Not Applied
If schema execution fails, run manually:
```bash
wrangler d1 execute heira-prod --file=../workers/shared/d1-schema.sql --remote
```

### Worker Deployment Fails
Check that all JavaScript files are valid and dependencies are available. The ethers CDN import should work automatically.

### Contract Deployment
Check deployment logs in `/tmp/heira-deploy-*.log` for factory addresses.
