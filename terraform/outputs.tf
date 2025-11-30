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

output "factory_address_eth_sepolia" {
  description = "Ethereum Sepolia factory address"
  value       = aws_ssm_parameter.factory_address_eth_sepolia.value
}

output "factory_address_base_sepolia" {
  description = "Base Sepolia factory address"
  value       = aws_ssm_parameter.factory_address_base_sepolia.value
}

output "factory_address_citrea_testnet" {
  description = "Citrea Testnet factory address"
  value       = aws_ssm_parameter.factory_address_citrea_testnet.value
}
