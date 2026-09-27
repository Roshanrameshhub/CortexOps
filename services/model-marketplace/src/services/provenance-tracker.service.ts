import { Repository, DataSource } from 'typeorm';
import {
  DataProvenance,
  DataSourceType,
  DataSource as DataSourceInfo,
  PreprocessingStep,
  AuditLogEntry,
} from '../models/data-provenance.entity';
import { createHash } from 'crypto';

export interface CreateProvenanceDTO {
  datasetId: string;
  datasetName: string;
  datasetVersion: string;
  tenantId: string;
  sources: DataSourceInfo[];
  collectionDate: Date;
  totalSamples: number;
  totalTokens: number;
  storagePath: string;
  storageSize: number;
}

export interface PIIScanOptions {
  detectEmail?: boolean;
  detectPhone?: boolean;
  detectSSN?: boolean;
  detectCreditCard?: boolean;
  detectAddress?: boolean;
}

export class ProvenanceTrackerService {
  private provenanceRepository: Repository<DataProvenance>;

  constructor(private dataSource: DataSource) {
    this.provenanceRepository = dataSource.getRepository(DataProvenance);
  }

  /**
   * Create provenance record for a dataset
   */
  async createProvenance(dto: CreateProvenanceDTO): Promise<DataProvenance> {
    const checksum = this.calculateChecksum(dto.datasetId, dto.datasetVersion);

    const provenance = this.provenanceRepository.create({
      datasetId: dto.datasetId,
      datasetName: dto.datasetName,
      datasetVersion: dto.datasetVersion,
      tenantId: dto.tenantId,
      sources: dto.sources,
      collectionDate: dto.collectionDate,
      preprocessingSteps: [],
      qualityMetrics: {
        duplicateRate: 0,
        averageLength: 0,
        vocabularySize: 0,
        languageDistribution: {},
        qualityScore: 0,
        toxicityScore: 0,
        biasScores: {},
      },
      licensing: {
        license: 'UNKNOWN',
        commercialUse: false,
        derivativeWorks: false,
        redistribution: false,
      },
      compliance: {
        piiDetected: false,
        piiRemoved: false,
        gdprCompliant: false,
        ccpaCompliant: false,
        hipaaCompliant: false,
        certifications: [],
        auditLog: [],
      },
      totalSamples: dto.totalSamples,
      totalTokens: dto.totalTokens,
      checksum,
      storagePath: dto.storagePath,
      storageSize: dto.storageSize,
    });

    return await this.provenanceRepository.save(provenance);
  }

  /**
   * Get provenance by dataset ID
   */
  async getProvenance(datasetId: string): Promise<DataProvenance | null> {
    return await this.provenanceRepository.findOne({
      where: { datasetId },
    });
  }

  /**
   * Add preprocessing step
   */
  async addPreprocessingStep(
    datasetId: string,
    step: PreprocessingStep
  ): Promise<DataProvenance> {
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      throw new Error(`Provenance not found for dataset ${datasetId}`);
    }

    provenance.addPreprocessingStep(step);

    return await this.provenanceRepository.save(provenance);
  }

  /**
   * Scan for PII in dataset
   */
  async scanForPII(
    datasetId: string,
    options: PIIScanOptions = {}
  ): Promise<{
    piiDetected: boolean;
    piiTypes: string[];
    locationsFound: number;
  }> {
    // In production, this would integrate with PII detection libraries
    // like Presidio, spaCy, or cloud services
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      throw new Error(`Provenance not found for dataset ${datasetId}`);
    }

    // Simulated PII detection
    const detectedTypes: string[] = [];
    const locations: any[] = [];

    // Update compliance info
    provenance.compliance.piiDetected = detectedTypes.length > 0;
    provenance.compliance.piiLocations = locations;

    await this.provenanceRepository.save(provenance);

    return {
      piiDetected: detectedTypes.length > 0,
      piiTypes: detectedTypes,
      locationsFound: locations.length,
    };
  }

  /**
   * Mark PII as removed
   */
  async markPIIRemoved(datasetId: string): Promise<DataProvenance> {
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      throw new Error(`Provenance not found for dataset ${datasetId}`);
    }

    provenance.compliance.piiRemoved = true;

    // Add audit log entry
    provenance.addAuditLogEntry({
      timestamp: new Date(),
      action: 'PII_REMOVED',
      actor: 'system',
      details: 'PII has been removed from dataset',
    });

    return await this.provenanceRepository.save(provenance);
  }

  /**
   * Update licensing information
   */
  async updateLicensing(
    datasetId: string,
    licensing: any
  ): Promise<DataProvenance> {
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      throw new Error(`Provenance not found for dataset ${datasetId}`);
    }

    provenance.licensing = licensing;

    provenance.addAuditLogEntry({
      timestamp: new Date(),
      action: 'LICENSE_UPDATED',
      actor: 'system',
      details: `License updated to ${licensing.license}`,
    });

    return await this.provenanceRepository.save(provenance);
  }

  /**
   * Mark as compliance certified
   */
  async certifyCompliance(
    datasetId: string,
    certifications: string[]
  ): Promise<DataProvenance> {
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      throw new Error(`Provenance not found for dataset ${datasetId}`);
    }

    provenance.compliance.certifications = certifications;

    // Update compliance flags based on certifications
    provenance.compliance.gdprCompliant = certifications.includes('GDPR');
    provenance.compliance.ccpaCompliant = certifications.includes('CCPA');
    provenance.compliance.hipaaCompliant = certifications.includes('HIPAA');

    provenance.lastValidatedAt = new Date();

    provenance.addAuditLogEntry({
      timestamp: new Date(),
      action: 'COMPLIANCE_CERTIFIED',
      actor: 'compliance-team',
      details: `Certifications: ${certifications.join(', ')}`,
    });

    return await this.provenanceRepository.save(provenance);
  }

  /**
   * Update quality metrics
   */
  async updateQualityMetrics(
    datasetId: string,
    metrics: any
  ): Promise<DataProvenance> {
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      throw new Error(`Provenance not found for dataset ${datasetId}`);
    }

    provenance.qualityMetrics = {
      ...provenance.qualityMetrics,
      ...metrics,
    };

    return await this.provenanceRepository.save(provenance);
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(datasetId: string): Promise<AuditLogEntry[]> {
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      return [];
    }

    return provenance.compliance.auditLog;
  }

  /**
   * Validate compliance
   */
  async validateCompliance(
    datasetId: string,
    standards: string[]
  ): Promise<{
    compliant: boolean;
    violations: string[];
    warnings: string[];
  }> {
    const provenance = await this.getProvenance(datasetId);
    if (!provenance) {
      throw new Error(`Provenance not found for dataset ${datasetId}`);
    }

    const violations: string[] = [];
    const warnings: string[] = [];

    // Check GDPR compliance
    if (standards.includes('GDPR')) {
      if (provenance.compliance.piiDetected && !provenance.compliance.piiRemoved) {
        violations.push('GDPR: PII detected but not removed');
      }
      if (!provenance.licensing.license) {
        warnings.push('GDPR: No license information provided');
      }
    }

    // Check CCPA compliance
    if (standards.includes('CCPA')) {
      if (provenance.compliance.piiDetected && !provenance.compliance.piiRemoved) {
        violations.push('CCPA: PII detected but not removed');
      }
    }

    // Check HIPAA compliance
    if (standards.includes('HIPAA')) {
      if (provenance.compliance.piiDetected) {
        violations.push('HIPAA: No PII allowed in healthcare data');
      }
      if (!provenance.compliance.certifications.includes('HIPAA')) {
        violations.push('HIPAA: Dataset not HIPAA certified');
      }
    }

    // Check licensing
    if (!provenance.hasLicense()) {
      warnings.push('No license information provided');
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Get datasets by source type
   */
  async getDatasetsBySourceType(
    sourceType: DataSourceType
  ): Promise<DataProvenance[]> {
    const allProvenance = await this.provenanceRepository.find();

    return allProvenance.filter((p) =>
      p.getSourcesByType(sourceType).length > 0
    );
  }

  /**
   * Private helper methods
   */

  private calculateChecksum(datasetId: string, version: string): string {
    return createHash('sha256')
      .update(`${datasetId}:${version}`)
      .digest('hex');
  }
}
