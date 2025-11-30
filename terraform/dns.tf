resource "cloudflare_record" "api" {
  zone_id = local.cloudflare_zone_id
  name    = "api"
  content = "192.0.2.1" # Dummy IP since we use a worker to route traffic
  type    = "A"
  ttl     = 1
  proxied = true
  comment = "Managed from Terraform Cloud, Workspace: ${local.service_name}-${local.env}"
}

resource "cloudflare_record" "root" {
  zone_id = local.cloudflare_zone_id
  name    = "@"
  content = "192.0.2.1" # Dummy IP since we use Pages/Workers to route traffic
  type    = "A"
  ttl     = 1
  proxied = true
  comment = "Managed from Terraform Cloud, Workspace: ${local.service_name}-${local.env}"
}
