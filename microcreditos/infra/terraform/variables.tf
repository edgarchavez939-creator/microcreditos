# Security groups (referenciados en main.tf)
resource "aws_security_group" "db" {
  name_prefix = "mc-db-"
  vpc_id      = module.vpc.vpc_id
  ingress { from_port = 5432, to_port = 5432, protocol = "tcp", security_groups = [aws_security_group.ecs.id] }
  egress  { from_port = 0, to_port = 0, protocol = "-1", cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_security_group" "redis" {
  name_prefix = "mc-redis-"
  vpc_id      = module.vpc.vpc_id
  ingress { from_port = 6379, to_port = 6379, protocol = "tcp", security_groups = [aws_security_group.ecs.id] }
  egress  { from_port = 0, to_port = 0, protocol = "-1", cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_security_group" "ecs" {
  name_prefix = "mc-ecs-"
  vpc_id      = module.vpc.vpc_id
  egress { from_port = 0, to_port = 0, protocol = "-1", cidr_blocks = ["0.0.0.0/0"] }
}
