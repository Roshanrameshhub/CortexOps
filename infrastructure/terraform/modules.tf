# Infrastructure Modules

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  name_prefix = local.name_prefix
  vpc_cidr    = local.vpc_cidr
  azs         = local.azs

  enable_nat_gateway   = var.enable_nat_gateway
  single_nat_gateway   = var.single_nat_gateway
  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    "kubernetes.io/cluster/${local.name_prefix}-eks" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/cluster/${local.name_prefix}-eks" = "shared"
  }

  tags = local.common_tags
}

# EKS Cluster Module
module "eks" {
  source = "./modules/eks"

  cluster_name    = "${local.name_prefix}-eks"
  cluster_version = var.cluster_version

  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  node_groups = var.node_groups

  enable_cluster_autoscaler      = var.enable_cluster_autoscaler
  enable_secrets_encryption      = var.enable_secrets_encryption
  cluster_endpoint_public_access = true
  cluster_endpoint_private_access = true

  allowed_cidr_blocks = var.allowed_cidr_blocks

  tags = local.common_tags

  depends_on = [module.vpc]
}

# RDS PostgreSQL Module
module "rds" {
  source = "./modules/rds"

  identifier     = "${local.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = var.rds_engine_version
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_encrypted     = var.enable_encryption

  db_name  = "llm_marketplace"
  username = "marketplace_admin"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.database_subnet_ids

  multi_az               = var.rds_multi_az
  backup_retention_period = var.rds_backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  performance_insights_enabled    = true
  performance_insights_retention_period = 7

  deletion_protection = var.environment == "production" ? true : false
  skip_final_snapshot = var.environment != "production"

  create_db_parameter_group = true
  parameter_group_family    = "postgres15"

  parameters = [
    {
      name  = "shared_preload_libraries"
      value = "pg_stat_statements,pg_hint_plan"
    },
    {
      name  = "log_statement"
      value = "all"
    },
    {
      name  = "log_min_duration_statement"
      value = "1000"
    },
    {
      name  = "max_connections"
      value = "500"
    }
  ]

  tags = local.common_tags

  depends_on = [module.vpc]
}

# ElastiCache Redis Module
module "redis" {
  source = "./modules/redis"

  cluster_id           = "${local.name_prefix}-redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  parameter_group_name = "default.redis7"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids

  at_rest_encryption_enabled = var.enable_encryption
  transit_encryption_enabled = var.enable_encryption
  auth_token_enabled         = var.enable_encryption

  automatic_failover_enabled = true
  multi_az_enabled          = var.environment == "production"

  snapshot_retention_limit = var.backup_retention_days
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "mon:05:00-mon:07:00"

  tags = local.common_tags

  depends_on = [module.vpc]
}

# MSK Kafka Module
module "kafka" {
  source = "./modules/kafka"

  cluster_name    = "${local.name_prefix}-kafka"
  kafka_version   = var.kafka_version
  instance_type   = var.kafka_instance_type
  broker_count    = var.kafka_broker_count
  ebs_volume_size = var.kafka_ebs_volume_size

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids

  encryption_in_transit_client_broker = "TLS"
  encryption_at_rest_kms_key_arn     = var.enable_encryption ? aws_kms_key.kafka[0].arn : null

  enhanced_monitoring = "PER_TOPIC_PER_PARTITION"

  configuration_name        = "${local.name_prefix}-kafka-config"
  configuration_description = "LLM Marketplace Kafka Configuration"

  configuration_server_properties = {
    "auto.create.topics.enable"  = "true"
    "default.replication.factor" = "3"
    "min.insync.replicas"       = "2"
    "num.io.threads"            = "8"
    "num.network.threads"       = "5"
    "num.partitions"            = "12"
    "num.replica.fetchers"      = "2"
    "socket.request.max.bytes"  = "104857600"
    "unclean.leader.election.enable" = "false"
  }

  tags = local.common_tags

  depends_on = [module.vpc]
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"

  cluster_name = module.eks.cluster_name
  vpc_id       = module.vpc.vpc_id

  enable_prometheus = var.enable_prometheus
  enable_grafana    = var.enable_grafana
  enable_jaeger     = var.enable_jaeger
  enable_loki       = var.enable_loki

  prometheus_retention_days = 30
  loki_retention_days      = 30

  tags = local.common_tags

  depends_on = [module.eks]
}

# KMS Keys for Encryption
resource "aws_kms_key" "rds" {
  count = var.enable_encryption ? 1 : 0

  description             = "KMS key for RDS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-rds-kms"
    }
  )
}

resource "aws_kms_alias" "rds" {
  count = var.enable_encryption ? 1 : 0

  name          = "alias/${local.name_prefix}-rds"
  target_key_id = aws_kms_key.rds[0].key_id
}

resource "aws_kms_key" "redis" {
  count = var.enable_encryption ? 1 : 0

  description             = "KMS key for Redis encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-redis-kms"
    }
  )
}

resource "aws_kms_alias" "redis" {
  count = var.enable_encryption ? 1 : 0

  name          = "alias/${local.name_prefix}-redis"
  target_key_id = aws_kms_key.redis[0].key_id
}

resource "aws_kms_key" "kafka" {
  count = var.enable_encryption ? 1 : 0

  description             = "KMS key for Kafka encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-kafka-kms"
    }
  )
}

resource "aws_kms_alias" "kafka" {
  count = var.enable_encryption ? 1 : 0

  name          = "alias/${local.name_prefix}-kafka"
  target_key_id = aws_kms_key.kafka[0].key_id
}

resource "aws_kms_key" "secrets" {
  count = var.enable_secrets_encryption ? 1 : 0

  description             = "KMS key for Kubernetes secrets encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-secrets-kms"
    }
  )
}

resource "aws_kms_alias" "secrets" {
  count = var.enable_secrets_encryption ? 1 : 0

  name          = "alias/${local.name_prefix}-secrets"
  target_key_id = aws_kms_key.secrets[0].key_id
}
