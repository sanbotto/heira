provider "aws" {
  region = local.region

  assume_role {
    role_arn = var.tf_cloud_role
  }

  default_tags {
    tags = local.tags
  }
}

provider "cloudflare" {}
