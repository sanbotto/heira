################################################################################
# Contract Deployment Automation
# Deploys contracts when source files change
################################################################################

# Get list of contract source files for trigger
locals {
  contract_files = fileset("${path.module}/../contracts/contracts", "**/*.sol")
  contract_files_hash = join(",", [for f in local.contract_files : filemd5("${path.module}/../contracts/contracts/${f}")])
}

# Deploy to Ethereum Sepolia
resource "terraform_data" "deploy_eth_sepolia" {
  triggers_replace = [
    local.contract_files_hash
  ]

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network eth-sepolia | tee /tmp/heira-deploy-eth-sepolia.log
    EOT
  }
}

# Deploy to Base Sepolia
resource "terraform_data" "deploy_base_sepolia" {
  triggers_replace = [
    local.contract_files_hash
  ]

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network baseSepolia | tee /tmp/heira-deploy-base-sepolia.log
    EOT
  }
}

# Deploy to Citrea Testnet
resource "terraform_data" "deploy_citrea_testnet" {
  triggers_replace = [
    local.contract_files_hash
  ]

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network citreaTestnet | tee /tmp/heira-deploy-citrea-testnet.log
    EOT
  }
}

/*
# Deploy to Ethereum Mainnet
resource "terraform_data" "deploy_eth_mainnet" {
  triggers_replace = [
    local.contract_files_hash
  ]

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../contracts && \
      npx hardhat compile && \
      npx hardhat run scripts/deploy.js --network eth-mainnet | tee /tmp/heira-deploy-eth-mainnet.log
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

# Parse deployment logs to extract factory addresses
# Ethereum Sepolia
data "external" "factory_address_eth_sepolia" {
  depends_on = [terraform_data.deploy_eth_sepolia]

  program = ["bash", "-c", <<-EOT
    if [ -f /tmp/heira-deploy-eth-sepolia.log ]; then
      FACTORY_ADDRESS=$(grep "HeiraInheritanceEscrowFactory deployed to:" /tmp/heira-deploy-eth-sepolia.log | awk '{print $NF}' | tr -d '\n')
      if [ ! -z "$FACTORY_ADDRESS" ]; then
        echo "{\"address\":\"$FACTORY_ADDRESS\"}"
      else
        echo "{\"address\":\"\"}"
      fi
    else
      echo "{\"address\":\"\"}"
    fi
  EOT
  ]
}

# Base Sepolia
data "external" "factory_address_base_sepolia" {
  depends_on = [terraform_data.deploy_base_sepolia]

  program = ["bash", "-c", <<-EOT
    if [ -f /tmp/heira-deploy-base-sepolia.log ]; then
      FACTORY_ADDRESS=$(grep "HeiraInheritanceEscrowFactory deployed to:" /tmp/heira-deploy-base-sepolia.log | awk '{print $NF}' | tr -d '\n')
      if [ ! -z "$FACTORY_ADDRESS" ]; then
        echo "{\"address\":\"$FACTORY_ADDRESS\"}"
      else
        echo "{\"address\":\"\"}"
      fi
    else
      echo "{\"address\":\"\"}"
    fi
  EOT
  ]
}

# Citrea Testnet
data "external" "factory_address_citrea_testnet" {
  depends_on = [terraform_data.deploy_citrea_testnet]

  program = ["bash", "-c", <<-EOT
    if [ -f /tmp/heira-deploy-citrea-testnet.log ]; then
      FACTORY_ADDRESS=$(grep "HeiraInheritanceEscrowFactory deployed to:" /tmp/heira-deploy-citrea-testnet.log | awk '{print $NF}' | tr -d '\n')
      if [ ! -z "$FACTORY_ADDRESS" ]; then
        echo "{\"address\":\"$FACTORY_ADDRESS\"}"
      else
        echo "{\"address\":\"\"}"
      fi
    else
      echo "{\"address\":\"\"}"
    fi
  EOT
  ]
}
