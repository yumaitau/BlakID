terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "ap-southeast-2"
}

variable "environment" {
  type    = string
  default = "prod"
}

resource "aws_ecs_cluster" "blakid" {
  name = "blakid-${var.environment}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = {
    Product   = "BlakID"
    Sovereignty = "AU"
  }
}

output "region" {
  value = var.region
}

output "cluster" {
  value = aws_ecs_cluster.blakid.name
}
