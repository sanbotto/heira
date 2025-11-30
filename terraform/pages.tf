resource "cloudflare_pages_project" "app" {
  account_id        = local.cloudflare_account_id
  name              = "${local.service_name}-${local.env}"
  production_branch = local.deployment_branch

  source {
    type = "github"
    config {
      owner                      = local.gh_org
      repo_name                  = local.repo_name
      production_branch          = local.deployment_branch
      preview_deployment_setting = "none"
    }
  }

  build_config {
    build_caching   = true
    build_command   = local.build_command
    destination_dir = local.build_output_path
    root_dir        = "frontend"
  }

  deployment_configs {
    production {
      compatibility_date    = local.compatibility_date
      environment_variables = {
        VITE_BACKEND_API_URL = "https://api.${local.domain_name}"
        VITE_FACTORY_ADDRESS_ETHEREUM = aws_ssm_parameter.factory_address_ethereum.value
        VITE_FACTORY_ADDRESS_BASE     = aws_ssm_parameter.factory_address_base.value
        VITE_FACTORY_ADDRESS_CITREA   = aws_ssm_parameter.factory_address_citrea.value
      }
    }
  }
}

resource "cloudflare_pages_domain" "app" {
  account_id   = local.cloudflare_account_id
  project_name = cloudflare_pages_project.app.name
  domain       = local.domain_name
}
