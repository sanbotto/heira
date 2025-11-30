resource "cloudflare_d1_database" "heira" {
  account_id = local.cloudflare_account_id
  name       = "heira-${local.env}"
}

# Execute schema after database is created
resource "terraform_data" "d1_schema" {
  depends_on = [cloudflare_d1_database.heira]

  triggers_replace = [
    filemd5("${path.module}/../workers/shared/d1-schema.sql"),
    cloudflare_d1_database.heira.id
  ]

  provisioner "local-exec" {
    command = <<-EOT
      wrangler d1 execute ${cloudflare_d1_database.heira.name} --file=${path.module}/../workers/shared/d1-schema.sql --remote
    EOT
  }
}
