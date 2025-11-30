data "cloudflare_zone" "heira" {
  name = local.domain_name
}
