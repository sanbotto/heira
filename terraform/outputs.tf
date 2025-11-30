output "d1_database_id" {
  description = "D1 database ID"
  value       = cloudflare_d1_database.heira.id
}

output "api_worker_name" {
  description = "API Worker name"
  value       = cloudflare_workers_script.api.name
}

output "keeper_worker_name" {
  description = "Keeper Worker name"
  value       = cloudflare_workers_script.keeper.name
}

output "pages_url" {
  description = "Cloudflare Pages URL"
  value       = cloudflare_pages_project.app.subdomain
}

output "factory_address_ethereum" {
  description = "Ethereum factory address"
  value       = aws_ssm_parameter.factory_address_ethereum.value
}

output "factory_address_base" {
  description = "Base factory address"
  value       = aws_ssm_parameter.factory_address_base.value
}

output "factory_address_citrea" {
  description = "Citrea factory address"
  value       = aws_ssm_parameter.factory_address_citrea.value
}
