################################################################################
# API Worker
################################################################################

resource "cloudflare_workers_script" "api" {
  account_id         = local.cloudflare_account_id
  name               = "${local.service_name}-api-${local.env}"
  module             = true
  compatibility_date = local.compatibility_date
  logpush            = true

  # Import ethers for blockscout.js, then concatenate all files
  content = format("%s\n%s\n%s\n%s\n%s\n%s\n%s",
    "import { AbiCoder, getAddress } from 'https://cdn.jsdelivr.net/npm/ethers@6/+esm';",
    file("${path.module}/workers/utils.js"),
    file("${path.module}/workers/constants.js"),
    file("${path.module}/workers/storage-d1.js"),
    file("${path.module}/workers/blockscout.js"),
    file("${path.module}/workers/api.js"),
    ""
  )

  d1_database_binding {
    name        = "DB"
    database_id = cloudflare_d1_database.heira.id
  }

  plain_text_binding {
    name = "ALLOWED_ORIGINS"
    text = local.allowed_origins
  }

  plain_text_binding {
    name = "ORIGIN_HOSTNAME"
    text = local.origin_hostname
  }

  secret_text_binding {
    name = "BLOCKSCOUT_API_KEY"
    text = aws_ssm_parameter.blockscout_api_key.value
  }

  secret_text_binding {
    name = "STANDARD_JSON_INPUT"
    text = aws_ssm_parameter.standard_json_input.value
  }
}

resource "cloudflare_workers_route" "api" {
  zone_id     = local.cloudflare_zone_id
  pattern     = "api.${local.domain_name}/api/*"
  script_name = cloudflare_workers_script.api.name
}

################################################################################
# Keeper Worker
################################################################################

resource "cloudflare_workers_script" "keeper" {
  account_id         = local.cloudflare_account_id
  name               = "${local.service_name}-keeper-${local.env}"
  module             = true
  compatibility_date = local.compatibility_date
  logpush            = true

  # Import ethers for keeper.js, then concatenate all files
  content = format("%s\n%s\n%s\n%s\n%s\n%s\n%s\n%s",
    "import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6/+esm';",
    file("${path.module}/workers/utils.js"),
    file("${path.module}/workers/constants.js"),
    file("${path.module}/workers/storage-d1.js"),
    file("${path.module}/workers/email.js"),
    file("${path.module}/workers/keeper.js"),
    file("${path.module}/workers/keeper-worker.js"),
    ""
  )

  d1_database_binding {
    name        = "DB"
    database_id = cloudflare_d1_database.heira.id
  }

  secret_text_binding {
    name = "PRIVATE_KEY"
    text = aws_ssm_parameter.private_key.value
  }

  secret_text_binding {
    name = "MAILPACE_API_TOKEN"
    text = aws_ssm_parameter.mailpace_api_token.value
  }

  plain_text_binding {
    name = "FACTORY_ADDRESS_ETHEREUM"
    text = aws_ssm_parameter.factory_address_ethereum.value
  }

  plain_text_binding {
    name = "FACTORY_ADDRESS_BASE"
    text = aws_ssm_parameter.factory_address_base.value
  }

  plain_text_binding {
    name = "FACTORY_ADDRESS_CITREA"
    text = aws_ssm_parameter.factory_address_citrea.value
  }

  plain_text_binding {
    name = "MAINNET_RPC_URL"
    text = aws_ssm_parameter.mainnet_rpc_url.value
  }

  plain_text_binding {
    name = "SEPOLIA_RPC_URL"
    text = aws_ssm_parameter.sepolia_rpc_url.value
  }

  plain_text_binding {
    name = "BASE_RPC_URL"
    text = aws_ssm_parameter.base_rpc_url.value
  }

  plain_text_binding {
    name = "BASE_SEPOLIA_RPC_URL"
    text = aws_ssm_parameter.base_sepolia_rpc_url.value
  }

  plain_text_binding {
    name = "CITREA_RPC_URL"
    text = aws_ssm_parameter.citrea_rpc_url.value
  }

  plain_text_binding {
    name = "MAILPACE_FROM_EMAIL"
    text = "noreply@heira.app"
  }
}

resource "cloudflare_workers_cron_trigger" "keeper" {
  account_id  = local.cloudflare_account_id
  script_name = cloudflare_workers_script.keeper.name

  schedules = [
    "0 0 * * *" # daily at midnight UTC
  ]
}
