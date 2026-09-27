import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from 'typeorm';
import { ModelVersion } from './model-version.entity';

export enum ModelType {
  FINE_TUNED = 'fine_tuned',
  ADAPTER = 'adapter',
  FULL_MODEL = 'full_model',
  MERGED = 'merged',
}

export enum ModelStatus {
  DRAFT = 'draft',
  EVALUATING = 'evaluating',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived',
  BANNED = 'banned',
}

export enum Visibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  ORGANIZATION = 'organization',
  MARKETPLACE = 'marketplace',
}

export enum PricingType {
  FREE = 'free',
  USAGE_BASED = 'usage_based',
  SUBSCRIPTION = 'subscription',
  ONE_TIME = 'one_time',
  CUSTOM = 'custom',
}

export interface BenchmarkScores {
  mmlu?: number;
  hellaswag?: number;
  truthfulqa?: number;
  humaneval?: number;
  toxicity?: number;
  overall?: number;
}

export interface PricingModel {
  type: PricingType;
  freeTier?: {
    requestsPerMonth: number;
    tokensPerMonth: number;
    expiresAfter?: number;
  };
  inputTokenPrice?: number;
  outputTokenPrice?: number;
  subscriptionPlans?: Array<{
    name: string;
    monthlyPrice: number;
    annualPrice?: number;
    includedRequests: number;
    includedTokens: number;
    features: string[];
  }>;
  oneTimePrice?: number;
  customPricing?: boolean;
  contactForPricing?: boolean;
}

export interface ComplianceFlags {
  piiRemoved: boolean;
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
  hipaaCompliant: boolean;
  toxicityChecked: boolean;
  biasChecked: boolean;
}

@Entity('fine_tuned_models')
@Index(['tenantId', 'status'])
@Index(['category', 'status'])
@Index(['qualityScore'])
@Index(['slug'], { unique: true })
export class FineTunedModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  // Base model information
  @Column({ type: 'uuid', nullable: true })
  baseModelId?: string;

  @Column({ type: 'varchar', length: 255 })
  baseModelName: string;

  @Column({ type: 'varchar', length: 100 })
  baseModelProvider: string;

  // Model type
  @Column({
    type: 'enum',
    enum: ModelType,
    default: ModelType.FINE_TUNED,
  })
  modelType: ModelType;

  @Column({ type: 'varchar', length: 100 })
  architecture: string;

  // Current version
  @Column({ type: 'varchar', length: 50 })
  currentVersion: string;

  // Categorization
  @Column({ type: 'varchar', length: 100 })
  @Index()
  category: string;

  @Column({ type: 'simple-array' })
  tags: string[];

  @Column({ type: 'simple-array' })
  language: string[];

  // Quality metrics
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  qualityScore: number;

  @Column({ type: 'jsonb', default: {} })
  benchmarkScores: BenchmarkScores;

  // Usage & popularity
  @Column({ type: 'integer', default: 0 })
  downloads: number;

  @Column({ type: 'integer', default: 0 })
  deployments: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'integer', default: 0 })
  reviewCount: number;

  // Business
  @Column({ type: 'jsonb' })
  pricing: PricingModel;

  @Column({ type: 'varchar', length: 100 })
  license: string;

  // Governance
  @Column({
    type: 'enum',
    enum: ModelStatus,
    default: ModelStatus.DRAFT,
  })
  @Index()
  status: ModelStatus;

  @Column({
    type: 'enum',
    enum: Visibility,
    default: Visibility.PRIVATE,
  })
  visibility: Visibility;

  // Compliance
  @Column({ type: 'jsonb', default: {} })
  complianceFlags: ComplianceFlags;

  @Column({ type: 'simple-array', default: [] })
  certifications: string[];

  // Relationships
  @OneToMany(() => ModelVersion, (version) => version.model, {
    cascade: true,
  })
  versions: ModelVersion[];

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  // Virtual fields
  get isPublished(): boolean {
    return this.status === ModelStatus.PUBLISHED;
  }

  get isPublic(): boolean {
    return this.visibility === Visibility.PUBLIC ||
           this.visibility === Visibility.MARKETPLACE;
  }

  get latestVersion(): string {
    return this.currentVersion;
  }
}
