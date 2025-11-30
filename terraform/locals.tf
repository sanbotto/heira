locals {
  domain_name     = "heira.app"
  env             = "prod"
  origin_hostname = local.domain_name
  region          = "eu-central-1"
  service_name    = "heira"
  version         = "0.1.0"

  # Deployment settings
  build_command      = "npm run build"
  build_output_path  = "build"
  compatibility_date = "2024-11-27"
  deployment_branch  = "main"
  gh_org             = "heira-life"
  repo_name          = "heira"

  # Secrets
  cloudflare_account_id = var.CLOUDFLARE_ACCOUNT_ID
  cloudflare_zone_id    = data.cloudflare_zone.heira.id

  # List of allowed origins for the CORS setup (use `(.+)` as a wildcard)
  allowed_origins = <<EOF
http://localhost:3000,
http://localhost:3001,
http://localhost:5173,
https://(.+).heira.app,
https://heira.app
EOF

  tags = {
    Environment = local.env
    ManagedBy   = "terraform"
    Workspace   = "${local.service_name}-${local.env}"
  }
}
