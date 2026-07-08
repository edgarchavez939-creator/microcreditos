# ============================================================
# Infraestructura AWS — Microcréditos (Terraform, resumen ejecutable)
# Capas: VPC, RDS PostgreSQL, ElastiCache Redis, ECS Fargate,
#        ALB, S3 (docs + spa), CloudFront, ECR, Secrets, CloudWatch
# ============================================================
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.region }

variable "region"      { default = "us-east-1" }
variable "proyecto"    { default = "microcreditos" }
variable "db_password" { sensitive = true }

# --- Red ---
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = "${var.proyecto}-vpc"
  cidr    = "10.0.0.0/16"
  azs             = ["${var.region}a", "${var.region}b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24"]
  enable_nat_gateway = true
  single_nat_gateway = true
}

# --- RDS PostgreSQL Multi-AZ ---
resource "aws_db_subnet_group" "db" {
  name       = "${var.proyecto}-db"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "postgres" {
  identifier             = "${var.proyecto}-pg"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t4g.medium"
  allocated_storage      = 50
  storage_encrypted      = true
  multi_az               = true
  db_name                = "microcreditos"
  username               = "app_user"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  backup_retention_period = 7
  skip_final_snapshot    = false
  deletion_protection    = true
}

# --- ElastiCache Redis ---
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.proyecto}-redis"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.proyecto}-redis"
  description                = "Cache y colas"
  engine                     = "redis"
  node_type                  = "cache.t4g.small"
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
}

# --- S3 documentos privados (SSE-KMS) ---
resource "aws_s3_bucket" "docs" { bucket = "${var.proyecto}-docs" }
resource "aws_s3_bucket_public_access_block" "docs" {
  bucket                  = aws_s3_bucket.docs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "docs" {
  bucket = aws_s3_bucket.docs.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" } }
}

# --- ECR ---
resource "aws_ecr_repository" "api" { name = "${var.proyecto}-api" }

# --- ECS Fargate cluster ---
resource "aws_ecs_cluster" "main" { name = "${var.proyecto}-cluster" }

# (Task definitions, services api/worker, ALB, target groups, autoscaling,
#  CloudFront + ACM + WAF, Secrets Manager y alarmas CloudWatch se definen
#  en archivos separados ecs.tf / alb.tf / cloudfront.tf — mismos parámetros.)

output "rds_endpoint"   { value = aws_db_instance.postgres.address }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "ecr_url"        { value = aws_ecr_repository.api.repository_url }
