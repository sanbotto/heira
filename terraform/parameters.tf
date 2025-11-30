################################################################################
# Secrets - AWS SSM Parameters
################################################################################

# Private key for signing transactions
resource "aws_ssm_parameter" "private_key" {
  name        = "/${local.env}/${local.service_name}/private-key"
  description = "PRIVATE_KEY - Wallet private key for signing transactions"
  type        = "SecureString"
  value       = "placeholder"

  lifecycle {
    ignore_changes = [value]
  }
}

# MailPace API token
resource "aws_ssm_parameter" "mailpace_api_token" {
  name        = "/${local.env}/${local.service_name}/mailpace-api-token"
  description = "MAILPACE_API_TOKEN"
  type        = "SecureString"
  value       = "placeholder"

  lifecycle {
    ignore_changes = [value]
  }
}

# Blockscout API key (optional)
resource "aws_ssm_parameter" "blockscout_api_key" {
  name        = "/${local.env}/${local.service_name}/blockscout-api-key"
  description = "BLOCKSCOUT_API_KEY (optional)"
  type        = "SecureString"
  value       = "placeholder"

  lifecycle {
    ignore_changes = [value]
  }
}

# Factory addresses (auto-updated by contract deployment)
resource "aws_ssm_parameter" "factory_address_eth_sepolia" {
  name        = "/${local.env}/${local.service_name}/factory-address-eth-sepolia"
  description = "FACTORY_ADDRESS_ETH_SEPOLIA"
  type        = "String"
  value       = data.external.factory_address_eth_sepolia.result.address != "" ? data.external.factory_address_eth_sepolia.result.address : "0x0000000000000000000000000000000000000000"
}

resource "aws_ssm_parameter" "factory_address_base_sepolia" {
  name        = "/${local.env}/${local.service_name}/factory-address-base-sepolia"
  description = "FACTORY_ADDRESS_BASE_SEPOLIA"
  type        = "String"
  value       = data.external.factory_address_base_sepolia.result.address != "" ? data.external.factory_address_base_sepolia.result.address : "0x0000000000000000000000000000000000000000"
}

resource "aws_ssm_parameter" "factory_address_citrea_testnet" {
  name        = "/${local.env}/${local.service_name}/factory-address-citrea-testnet"
  description = "FACTORY_ADDRESS_CITREA_TESTNET"
  type        = "String"
  value       = data.external.factory_address_citrea_testnet.result.address != "" ? data.external.factory_address_citrea_testnet.result.address : "0x0000000000000000000000000000000000000000"
}

# RPC URLs
resource "aws_ssm_parameter" "eth_mainnet_rpc_url" {
  name        = "/${local.env}/${local.service_name}/eth-mainnet-rpc-url"
  description = "ETH_MAINNET_RPC_URL"
  type        = "String"
  value       = "https://eth.llamarpc.com"
}

resource "aws_ssm_parameter" "eth_sepolia_rpc_url" {
  name        = "/${local.env}/${local.service_name}/eth-sepolia-rpc-url"
  description = "ETH_SEPOLIA_RPC_URL"
  type        = "String"
  value       = "https://rpc.sepolia.org"
}

resource "aws_ssm_parameter" "base_rpc_url" {
  name        = "/${local.env}/${local.service_name}/base-rpc-url"
  description = "BASE_RPC_URL"
  type        = "String"
  value       = "https://mainnet.base.org"
}

resource "aws_ssm_parameter" "base_sepolia_rpc_url" {
  name        = "/${local.env}/${local.service_name}/base-sepolia-rpc-url"
  description = "BASE_SEPOLIA_RPC_URL"
  type        = "String"
  value       = "https://sepolia.base.org"
}

resource "aws_ssm_parameter" "citrea_testnet_rpc_url" {
  name        = "/${local.env}/${local.service_name}/citrea-testnet-rpc-url"
  description = "CITREA_TESTNET_RPC_URL"
  type        = "String"
  value       = "https://rpc.testnet.citrea.xyz"
}

# Standard JSON Input (from Hardhat artifacts)
resource "aws_ssm_parameter" "standard_json_input" {
  name        = "/${local.env}/${local.service_name}/standard-json-input"
  description = "STANDARD_JSON_INPUT - Hardhat build artifacts JSON"
  type        = "SecureString"
  value       = "{}"

  lifecycle {
    ignore_changes = [value]
  }
}
