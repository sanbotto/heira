################################################################################
# Contract Deployment Automation
# Deploys contracts when source files change
################################################################################

# Get list of contract source files for trigger
locals {
  contract_files = fileset("${path.module}/../contracts/contracts", "**/*.sol")
  contract_files_hash = join(",", [for f in local.contract_files : filemd5("${path.module}/../contracts/contracts/${f}")])
}

# Deploy to Sepolia
resource "null_resource" "deploy_sepolia" {
  triggers = {
    contract_files = local.contract_files_hash
    network = "sepolia"
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network sepolia | tee /tmp/heira-deploy-sepolia.log
    EOT
  }
}

# Deploy to Base Sepolia
resource "null_resource" "deploy_base_sepolia" {
  triggers = {
    contract_files = local.contract_files_hash
    network = "baseSepolia"
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network baseSepolia | tee /tmp/heira-deploy-base-sepolia.log
    EOT
  }
}

# Deploy to Citrea Testnet
resource "null_resource" "deploy_citrea" {
  triggers = {
    contract_files = local.contract_files_hash
    network = "citreaTestnet"
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network citreaTestnet | tee /tmp/heira-deploy-citrea.log
    EOT
  }
}

/*
# Deploy to Mainnet
resource "null_resource" "deploy_mainnet" {
  triggers = {
    contract_files = local.contract_files_hash
    network = "mainnet"
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network mainnet | tee /tmp/heira-deploy-mainnet.log
    EOT
  }
}

# Deploy to Base
resource "null_resource" "deploy_base" {
  triggers = {
    contract_files = local.contract_files_hash
    network = "base"
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network base | tee /tmp/heira-deploy-base.log
    EOT
  }
}
*/

# Update factory addresses in SSM after deployment
# Note: This requires parsing the deployment logs to extract factory addresses
# For now, addresses should be manually updated in SSM or via a script
# TODO: Add external data source or local-exec to parse logs and update SSM
