import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { FineTunedModel } from './fine-tuned-model.entity';
import { TrainingRun } from './training-run.entity';
import { EvaluationResult } from './evaluation-result.entity';

export enum VersionStatus {
  BUILDING = 'building',
  EVALUATING = 'evaluating',
  READY = 'ready',
  FAILED = 'failed',
  DEPRECATED = 'deprecated',
}

export interface ModelArtifacts {
  modelPath: string;
  modelFormat: string;
  modelSize: number;
  modelChecksum: string;
  configPath: string;
  tokenizerPath: string;
  adapterPath?: string;
  adapterConfig?: Record<string, any>;
  quantized: boolean;
  quantizationMethod?: string;
  compressed: boolean;
  compressionRatio?: number;
}

export interface BaseModelReference {
  modelId?: string;
  externalId?: string;
  name: string;
  provider: string;
  version?: string;
  checkpoint?: string;
}

export interface DatasetReference {
  datasetId: string;
  name: string;
  version: string;
  size: number;
  split: string;
  checksum: string;
  provenanceId: string;
}

export interface MergedModelReference {
  modelId: string;
  version: string;
  weight: number;
}

export interface LineageNode {
  id: string;
  type: string;
  name: string;
  version?: string;
  metadata: Record<string, any>;
  parents: string[];
  children: string[];
  createdAt: Date;
  createdBy: string;
}

export interface ModelLineage {
  baseModels: BaseModelReference[];
  trainingDatasets: DatasetReference[];
  derivedFrom?: string;
  mergedModels?: MergedModelReference[];
  lineageGraph: LineageNode[];
}

export interface PerformanceMetrics {
  inferenceLatencyP50?: number;
  inferenceLatencyP95?: number;
  inferenceLatencyP99?: number;
  throughput?: number;
  memoryUsage?: number;
  modelSizeMB: number;
}

@Entity('model_versions')
@Index(['modelId', 'version'], { unique: true })
@Index(['status'])
export class ModelVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  modelId: string;

  @Column({ type: 'varchar', length: 50 })
  version: string;

  // Artifacts
  @Column({ type: 'jsonb' })
  artifacts: ModelArtifacts;

  // Lineage
  @Column({ type: 'jsonb' })
  lineage: ModelLineage;

  // Training run reference
  @Column({ type: 'uuid', nullable: true })
  trainingRunId?: string;

  // Performance metrics
  @Column({ type: 'jsonb', default: {} })
  performance: PerformanceMetrics;

  // Changes
  @Column({ type: 'text' })
  changelog: string;

  @Column({ type: 'boolean', default: false })
  breaking: boolean;

  // Status
  @Column({
    type: 'enum',
    enum: VersionStatus,
    default: VersionStatus.BUILDING,
  })
  status: VersionStatus;

  // Relationships
  @ManyToOne(() => FineTunedModel, (model) => model.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'modelId' })
  model: FineTunedModel;

  @OneToOne(() => TrainingRun, { nullable: true, cascade: true })
  @JoinColumn({ name: 'trainingRunId' })
  trainingRun?: TrainingRun;

  @OneToMany(() => EvaluationResult, (evaluation) => evaluation.modelVersion)
  evaluationResults: EvaluationResult[];

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  evaluatedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  // Helper methods
  get isReady(): boolean {
    return this.status === VersionStatus.READY;
  }

  get semverParts(): { major: number; minor: number; patch: number } {
    const [major, minor, patch] = this.version.split('.').map(Number);
    return { major, minor, patch };
  }

  compareTo(other: ModelVersion): number {
    const thisVer = this.semverParts;
    const otherVer = other.semverParts;

    if (thisVer.major !== otherVer.major) {
      return thisVer.major - otherVer.major;
    }
    if (thisVer.minor !== otherVer.minor) {
      return thisVer.minor - otherVer.minor;
    }
    return thisVer.patch - otherVer.patch;
  }
}
