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
resource "aws_ssm_parameter" "factory_address_ethereum" {
  name        = "/${local.env}/${local.service_name}/factory-address-ethereum"
  description = "FACTORY_ADDRESS_ETHEREUM"
  type        = "String"
  value       = "0x0000000000000000000000000000000000000000"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "factory_address_base" {
  name        = "/${local.env}/${local.service_name}/factory-address-base"
  description = "FACTORY_ADDRESS_BASE"
  type        = "String"
  value       = "0x0000000000000000000000000000000000000000"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "factory_address_citrea" {
  name        = "/${local.env}/${local.service_name}/factory-address-citrea"
  description = "FACTORY_ADDRESS_CITREA"
  type        = "String"
  value       = "0x0000000000000000000000000000000000000000"

  lifecycle {
    ignore_changes = [value]
  }
}

# RPC URLs
resource "aws_ssm_parameter" "mainnet_rpc_url" {
  name        = "/${local.env}/${local.service_name}/mainnet-rpc-url"
  description = "MAINNET_RPC_URL"
  type        = "String"
  value       = "https://eth.llamarpc.com"
}

resource "aws_ssm_parameter" "sepolia_rpc_url" {
  name        = "/${local.env}/${local.service_name}/sepolia-rpc-url"
  description = "SEPOLIA_RPC_URL"
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

resource "aws_ssm_parameter" "citrea_rpc_url" {
  name        = "/${local.env}/${local.service_name}/citrea-rpc-url"
  description = "CITREA_RPC_URL"
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
