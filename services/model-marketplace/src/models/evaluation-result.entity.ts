import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { ModelVersion } from './model-version.entity';

export enum EvaluationType {
  BENCHMARK = 'benchmark',
  CUSTOM = 'custom',
  SAFETY = 'safety',
  PERFORMANCE = 'performance',
  DRIFT = 'drift',
}

export enum EvaluationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface TaskScore {
  taskName: string;
  score: number;
  sampleCount: number;
  confidence?: number;
}

export interface FairnessMetrics {
  demographicParity: number;
  equalizedOdds: number;
  equalOpportunity: number;
  calibration: number;
  groupFairness: Record<string, number>;
}

export interface EvaluationMetrics {
  // Language understanding
  mmluScore?: number;
  hellaswagScore?: number;
  truthfulqaScore?: number;

  // Code
  humanEvalScore?: number;
  mbppScore?: number;

  // Safety
  toxicityScore?: number;
  biasScore?: number;
  fairnessMetrics?: FairnessMetrics;

  // Performance
  latencyP50?: number;
  latencyP95?: number;
  latencyP99?: number;
  throughput?: number;

  // Quality
  rouge1?: number;
  rouge2?: number;
  rougeL?: number;
  bleuScore?: number;
  bertScore?: number;

  // Task-specific
  f1Score?: number;
  precision?: number;
  recall?: number;
  accuracy?: number;
}

export interface ComparisonResult {
  baselineModelId: string;
  baselineVersion: string;
  scoreDelta: number;
  taskDeltas: Record<string, number>;
  significanceLevel: number;
  recommendation: 'better' | 'worse' | 'similar';
}

@Entity('evaluation_results')
@Index(['modelVersionId'])
@Index(['evaluationType', 'benchmarkName'])
@Index(['status'])
export class EvaluationResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  modelVersionId: string;

  // Evaluation metadata
  @Column({
    type: 'enum',
    enum: EvaluationType,
  })
  evaluationType: EvaluationType;

  @Column({ type: 'varchar', length: 100 })
  benchmarkName: string;

  @Column({ type: 'varchar', length: 50 })
  benchmarkVersion: string;

  // Scores
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  overallScore: number;

  @Column({ type: 'jsonb' })
  taskScores: TaskScore[];

  // Detailed results
  @Column({ type: 'varchar', length: 500 })
  predictions: string; // S3 path

  @Column({ type: 'jsonb' })
  metrics: EvaluationMetrics;

  // Comparison
  @Column({ type: 'jsonb', nullable: true })
  baselineComparison?: ComparisonResult;

  // Infrastructure
  @Column({ type: 'integer', nullable: true })
  evaluationDuration?: number; // Seconds

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  evaluationCost?: number; // USD

  // Status
  @Column({
    type: 'enum',
    enum: EvaluationStatus,
    default: EvaluationStatus.PENDING,
  })
  status: EvaluationStatus;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  // Relationship
  @ManyToOne(() => ModelVersion, (version) => version.evaluationResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'modelVersionId' })
  modelVersion: ModelVersion;

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  evaluatedAt?: Date;

  // Helper methods
  get isComplete(): boolean {
    return this.status === EvaluationStatus.COMPLETED;
  }

  get isPending(): boolean {
    return this.status === EvaluationStatus.PENDING;
  }

  get hasFailed(): boolean {
    return this.status === EvaluationStatus.FAILED;
  }

  getBestTask(): TaskScore | null {
    if (!this.taskScores || this.taskScores.length === 0) {
      return null;
    }
    return this.taskScores.reduce((best, current) =>
      current.score > best.score ? current : best
    );
  }

  getWorstTask(): TaskScore | null {
    if (!this.taskScores || this.taskScores.length === 0) {
      return null;
    }
    return this.taskScores.reduce((worst, current) =>
      current.score < worst.score ? current : worst
    );
  }
}
