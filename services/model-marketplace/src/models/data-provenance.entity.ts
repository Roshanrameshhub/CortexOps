import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DataSourceType {
  WEB_SCRAPE = 'web_scrape',
  API = 'api',
  MANUAL = 'manual',
  SYNTHETIC = 'synthetic',
  LICENSED = 'licensed',
  PUBLIC_DATASET = 'public_dataset',
}

export interface DataSource {
  type: DataSourceType;
  url?: string;
  description: string;
  sampleCount: number;
  collectedAt: Date;
  collector: string;
  metadata?: Record<string, any>;
}

export interface PreprocessingStep {
  step: string;
  description: string;
  parameters: Record<string, any>;
  timestamp: Date;
  affectedSamples: number;
  executedBy: string;
}

export interface DataQualityMetrics {
  duplicateRate: number;
  averageLength: number;
  vocabularySize: number;
  languageDistribution: Record<string, number>;
  qualityScore: number;
  toxicityScore: number;
  biasScores: Record<string, number>;
}

export interface LicensingInfo {
  license: string;
  attribution?: string;
  commercialUse: boolean;
  derivativeWorks: boolean;
  redistribution: boolean;
  restrictions?: string[];
  licenseUrl?: string;
}

export interface PIILocation {
  field: string;
  position: number;
  type: string;
  redacted: boolean;
}

export interface AuditLogEntry {
  timestamp: Date;
  action: string;
  actor: string;
  details: string;
  ipAddress?: string;
}

export interface DataComplianceInfo {
  piiDetected: boolean;
  piiRemoved: boolean;
  piiLocations?: PIILocation[];
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
  hipaaCompliant: boolean;
  certifications: string[];
  auditLog: AuditLogEntry[];
  lastAuditDate?: Date;
}

@Entity('data_provenance')
@Index(['datasetId'])
@Index(['tenantId'])
export class DataProvenance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  datasetId: string;

  @Column({ type: 'varchar', length: 255 })
  datasetName: string;

  @Column({ type: 'varchar', length: 50 })
  datasetVersion: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  // Data sources
  @Column({ type: 'jsonb' })
  sources: DataSource[];

  @Column({ type: 'timestamp' })
  collectionDate: Date;

  // Preprocessing
  @Column({ type: 'jsonb', default: [] })
  preprocessingSteps: PreprocessingStep[];

  // Quality metrics
  @Column({ type: 'jsonb' })
  qualityMetrics: DataQualityMetrics;

  // Licensing
  @Column({ type: 'jsonb' })
  licensing: LicensingInfo;

  // Compliance
  @Column({ type: 'jsonb' })
  compliance: DataComplianceInfo;

  // Statistics
  @Column({ type: 'integer' })
  totalSamples: number;

  @Column({ type: 'bigint' })
  totalTokens: number;

  @Column({ type: 'varchar', length: 64 })
  checksum: string;

  // Storage
  @Column({ type: 'varchar', length: 500 })
  storagePath: string;

  @Column({ type: 'bigint' })
  storageSize: number; // Bytes

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastValidatedAt?: Date;

  // Helper methods
  get isCompliant(): boolean {
    return (
      this.compliance.gdprCompliant &&
      this.compliance.ccpaCompliant &&
      !this.compliance.piiDetected
    );
  }

  get hasLicense(): boolean {
    return !!this.licensing.license;
  }

  get canBeUsedCommercially(): boolean {
    return this.licensing.commercialUse;
  }

  addPreprocessingStep(step: PreprocessingStep): void {
    this.preprocessingSteps.push(step);
    this.updatedAt = new Date();
  }

  addAuditLogEntry(entry: AuditLogEntry): void {
    this.compliance.auditLog.push(entry);
    this.updatedAt = new Date();
  }

  getTotalSourceCount(): number {
    return this.sources.reduce((sum, source) => sum + source.sampleCount, 0);
  }

  getSourcesByType(type: DataSourceType): DataSource[] {
    return this.sources.filter((source) => source.type === type);
  }
}
