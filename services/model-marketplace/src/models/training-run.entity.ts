import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { ModelVersion } from './model-version.entity';

export enum TrainingStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface Hyperparameters {
  learningRate: number;
  batchSize: number;
  epochs: number;
  warmupSteps: number;
  optimizer: string;
  scheduler: string;
  loraRank?: number;
  loraAlpha?: number;
  loraDropout?: number;
  targetModules?: string[];
  gradientAccumulationSteps?: number;
  maxGradientNorm?: number;
  weightDecay?: number;
  seed?: number;
}

export interface TrainingConfig {
  framework: string;
  frameworkVersion: string;
  precision: string;
  distributedStrategy?: string;
  checkpointStrategy: string;
  evaluationStrategy: string;
}

export interface InfrastructureInfo {
  platform: string;
  region?: string;
  instanceType: string;
  gpuType?: string;
  gpuCount: number;
  ramGB: number;
  diskGB: number;
}

export interface MetricPoint {
  step: number;
  epoch: number;
  value: number;
  timestamp: Date;
}

export interface ValidationPoint {
  epoch: number;
  loss: number;
  perplexity: number;
  accuracy?: number;
  timestamp: Date;
}

export interface TrainingMetrics {
  finalLoss: number;
  finalPerplexity: number;
  bestCheckpointEpoch: number;
  totalSteps: number;
  samplesPerSecond: number;
  tokensPerSecond: number;
  lossHistory: MetricPoint[];
  perplexityHistory: MetricPoint[];
  learningRateHistory: MetricPoint[];
}

export interface ValidationMetrics {
  validationLoss: number;
  validationPerplexity: number;
  validationAccuracy?: number;
  validationHistory: ValidationPoint[];
  earlyStoppedAt?: number;
  patience?: number;
}

@Entity('training_runs')
@Index(['modelVersionId'])
@Index(['status'])
export class TrainingRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  modelVersionId: string;

  // Configuration
  @Column({ type: 'jsonb' })
  hyperparameters: Hyperparameters;

  @Column({ type: 'jsonb' })
  trainingConfig: TrainingConfig;

  // Infrastructure
  @Column({ type: 'jsonb' })
  infrastructure: InfrastructureInfo;

  // Results
  @Column({ type: 'jsonb', nullable: true })
  trainingMetrics?: TrainingMetrics;

  @Column({ type: 'jsonb', nullable: true })
  validationMetrics?: ValidationMetrics;

  // Resources
  @Column({ type: 'integer', nullable: true })
  duration?: number; // Seconds

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost?: number; // USD

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  carbonFootprint?: number; // kg CO2

  // Logs
  @Column({ type: 'varchar', length: 500, nullable: true })
  tensorboardUrl?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  wandbUrl?: string;

  @Column({ type: 'varchar', length: 500 })
  logsPath: string;

  // Status
  @Column({
    type: 'enum',
    enum: TrainingStatus,
    default: TrainingStatus.PENDING,
  })
  status: TrainingStatus;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  // Relationship
  @OneToOne(() => ModelVersion, (version) => version.trainingRun)
  modelVersion: ModelVersion;

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  get isComplete(): boolean {
    return this.status === TrainingStatus.COMPLETED;
  }

  get isRunning(): boolean {
    return this.status === TrainingStatus.RUNNING;
  }

  get hasFailed(): boolean {
    return this.status === TrainingStatus.FAILED;
  }

  get actualDuration(): number | null {
    if (!this.startedAt || !this.completedAt) {
      return null;
    }
    return Math.floor(
      (this.completedAt.getTime() - this.startedAt.getTime()) / 1000
    );
  }
}
