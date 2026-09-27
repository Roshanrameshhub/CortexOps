import { Repository, DataSource, Like, In, MoreThan } from 'typeorm';
import { FineTunedModel, ModelStatus, Visibility } from '../models/fine-tuned-model.entity';
import { ModelVersion, VersionStatus } from '../models/model-version.entity';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import * as semver from 'semver';

export interface CreateModelDTO {
  name: string;
  description: string;
  tenantId: string;
  baseModelName: string;
  baseModelProvider: string;
  architecture: string;
  category: string;
  tags: string[];
  language: string[];
  license: string;
  pricing: any;
}

export interface CreateVersionDTO {
  version: string;
  modelFile: Buffer;
  configFile: Buffer;
  tokenizerFile: Buffer;
  adapterFile?: Buffer;
  changelog: string;
  breaking: boolean;
  trainingRunId?: string;
  lineage: any;
}

export interface ModelSearchFilters {
  query?: string;
  category?: string;
  tags?: string[];
  minQualityScore?: number;
  languages?: string[];
  status?: ModelStatus;
  visibility?: Visibility;
  tenantId?: string;
}

export interface ModelSearchResult {
  models: FineTunedModel[];
  total: number;
  facets: {
    categories: Record<string, number>;
    tags: Record<string, number>;
    languages: Record<string, number>;
  };
}

export class ModelRegistryService {
  private modelRepository: Repository<FineTunedModel>;
  private versionRepository: Repository<ModelVersion>;
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    private dataSource: DataSource,
    s3Config: { region: string; endpoint?: string },
    bucketName: string
  ) {
    this.modelRepository = dataSource.getRepository(FineTunedModel);
    this.versionRepository = dataSource.getRepository(ModelVersion);
    this.s3Client = new S3Client(s3Config);
    this.bucketName = bucketName;
  }

  /**
   * Create a new fine-tuned model
   */
  async createModel(dto: CreateModelDTO): Promise<FineTunedModel> {
    // Generate unique slug
    const slug = this.generateSlug(dto.name);

    const model = this.modelRepository.create({
      ...dto,
      slug,
      currentVersion: '0.0.0',
      status: ModelStatus.DRAFT,
      visibility: Visibility.PRIVATE,
      qualityScore: 0,
      benchmarkScores: {},
      downloads: 0,
      deployments: 0,
      rating: 0,
      reviewCount: 0,
      complianceFlags: {
        piiRemoved: false,
        gdprCompliant: false,
        ccpaCompliant: false,
        hipaaCompliant: false,
        toxicityChecked: false,
        biasChecked: false,
      },
      certifications: [],
    });

    return await this.modelRepository.save(model);
  }

  /**
   * Upload a new model version
   */
  async createVersion(
    modelId: string,
    dto: CreateVersionDTO
  ): Promise<ModelVersion> {
    const model = await this.modelRepository.findOne({
      where: { id: modelId },
      relations: ['versions'],
    });

    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Validate version format
    if (!semver.valid(dto.version)) {
      throw new Error(`Invalid version format: ${dto.version}`);
    }

    // Check if version already exists
    const existingVersion = await this.versionRepository.findOne({
      where: { modelId, version: dto.version },
    });

    if (existingVersion) {
      throw new Error(`Version ${dto.version} already exists`);
    }

    // Upload artifacts to S3
    const artifacts = await this.uploadArtifacts(modelId, dto.version, {
      modelFile: dto.modelFile,
      configFile: dto.configFile,
      tokenizerFile: dto.tokenizerFile,
      adapterFile: dto.adapterFile,
    });

    // Create version
    const version = this.versionRepository.create({
      modelId,
      version: dto.version,
      artifacts,
      lineage: dto.lineage,
      trainingRunId: dto.trainingRunId,
      changelog: dto.changelog,
      breaking: dto.breaking,
      status: VersionStatus.BUILDING,
      performance: {
        modelSizeMB: artifacts.modelSize / (1024 * 1024),
      },
    });

    const savedVersion = await this.versionRepository.save(version);

    // Update model's current version if this is newer
    if (semver.gt(dto.version, model.currentVersion)) {
      model.currentVersion = dto.version;
      await this.modelRepository.save(model);
    }

    return savedVersion;
  }

  /**
   * Get model by ID with relations
   */
  async getModel(
    modelId: string,
    options?: {
      includeVersions?: boolean;
      includeEvaluations?: boolean;
      includeLineage?: boolean;
    }
  ): Promise<FineTunedModel | null> {
    const relations: string[] = [];

    if (options?.includeVersions) {
      relations.push('versions');
    }
    if (options?.includeEvaluations) {
      relations.push('versions.evaluationResults');
    }
    if (options?.includeVersions) {
      relations.push('versions.trainingRun');
    }

    return await this.modelRepository.findOne({
      where: { id: modelId },
      relations,
    });
  }

  /**
   * Get specific model version
   */
  async getVersion(
    modelId: string,
    version: string
  ): Promise<ModelVersion | null> {
    return await this.versionRepository.findOne({
      where: { modelId, version },
      relations: ['trainingRun', 'evaluationResults'],
    });
  }

  /**
   * Search models with filters
   */
  async searchModels(
    filters: ModelSearchFilters,
    pagination: { limit: number; offset: number }
  ): Promise<ModelSearchResult> {
    const queryBuilder = this.modelRepository
      .createQueryBuilder('model')
      .leftJoinAndSelect('model.versions', 'version');

    // Apply filters
    if (filters.query) {
      queryBuilder.andWhere(
        '(model.name ILIKE :query OR model.description ILIKE :query OR :query = ANY(model.tags))',
        { query: `%${filters.query}%` }
      );
    }

    if (filters.category) {
      queryBuilder.andWhere('model.category = :category', {
        category: filters.category,
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      queryBuilder.andWhere('model.tags && :tags', { tags: filters.tags });
    }

    if (filters.minQualityScore !== undefined) {
      queryBuilder.andWhere('model.qualityScore >= :minQualityScore', {
        minQualityScore: filters.minQualityScore,
      });
    }

    if (filters.languages && filters.languages.length > 0) {
      queryBuilder.andWhere('model.language && :languages', {
        languages: filters.languages,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('model.status = :status', {
        status: filters.status,
      });
    }

    if (filters.visibility) {
      queryBuilder.andWhere('model.visibility = :visibility', {
        visibility: filters.visibility,
      });
    }

    if (filters.tenantId) {
      queryBuilder.andWhere('model.tenantId = :tenantId', {
        tenantId: filters.tenantId,
      });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const models = await queryBuilder
      .skip(pagination.offset)
      .take(pagination.limit)
      .orderBy('model.qualityScore', 'DESC')
      .addOrderBy('model.downloads', 'DESC')
      .getMany();

    // Calculate facets
    const facets = await this.calculateFacets(filters);

    return {
      models,
      total,
      facets,
    };
  }

  /**
   * Update model status
   */
  async updateModelStatus(
    modelId: string,
    status: ModelStatus
  ): Promise<FineTunedModel> {
    const model = await this.modelRepository.findOne({
      where: { id: modelId },
    });

    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    model.status = status;

    if (status === ModelStatus.PUBLISHED && !model.publishedAt) {
      model.publishedAt = new Date();
    }

    return await this.modelRepository.save(model);
  }

  /**
   * Update version status
   */
  async updateVersionStatus(
    versionId: string,
    status: VersionStatus
  ): Promise<ModelVersion> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId },
    });

    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    version.status = status;

    if (status === VersionStatus.READY && !version.publishedAt) {
      version.publishedAt = new Date();
    }

    return await this.versionRepository.save(version);
  }

  /**
   * Update model quality score from evaluation results
   */
  async updateQualityScore(
    modelId: string,
    qualityScore: number,
    benchmarkScores: any
  ): Promise<void> {
    await this.modelRepository.update(modelId, {
      qualityScore,
      benchmarkScores,
    });
  }

  /**
   * Increment download count
   */
  async incrementDownloads(modelId: string): Promise<void> {
    await this.modelRepository.increment({ id: modelId }, 'downloads', 1);
  }

  /**
   * Increment deployment count
   */
  async incrementDeployments(modelId: string): Promise<void> {
    await this.modelRepository.increment({ id: modelId }, 'deployments', 1);
  }

  /**
   * Get model versions
   */
  async getVersions(modelId: string): Promise<ModelVersion[]> {
    return await this.versionRepository.find({
      where: { modelId },
      order: { createdAt: 'DESC' },
      relations: ['trainingRun', 'evaluationResults'],
    });
  }

  /**
   * Get latest version
   */
  async getLatestVersion(modelId: string): Promise<ModelVersion | null> {
    const versions = await this.getVersions(modelId);
    if (versions.length === 0) {
      return null;
    }

    // Sort by semantic version
    versions.sort((a, b) => {
      return semver.compare(b.version, a.version);
    });

    return versions[0];
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    modelId: string,
    version1: string,
    version2: string
  ): Promise<any> {
    const [v1, v2] = await Promise.all([
      this.getVersion(modelId, version1),
      this.getVersion(modelId, version2),
    ]);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    return {
      versionA: version1,
      versionB: version2,
      sizeChange:
        ((v2.artifacts.modelSize - v1.artifacts.modelSize) /
          v1.artifacts.modelSize) *
        100,
      performanceDeltas: this.calculatePerformanceDeltas(
        v1.performance,
        v2.performance
      ),
      evaluationDeltas: await this.calculateEvaluationDeltas(v1.id, v2.id),
    };
  }

  /**
   * Delete model (soft delete)
   */
  async deleteModel(modelId: string): Promise<void> {
    await this.modelRepository.update(modelId, {
      status: ModelStatus.ARCHIVED,
    });
  }

  /**
   * Private helper methods
   */

  private generateSlug(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Add random suffix to ensure uniqueness
    const suffix = Math.random().toString(36).substring(7);
    return `${slug}-${suffix}`;
  }

  private async uploadArtifacts(
    modelId: string,
    version: string,
    files: {
      modelFile: Buffer;
      configFile: Buffer;
      tokenizerFile: Buffer;
      adapterFile?: Buffer;
    }
  ): Promise<any> {
    const basePath = `models/${modelId}/${version}`;

    const modelChecksum = createHash('sha256')
      .update(files.modelFile)
      .digest('hex');

    // Upload model file
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: `${basePath}/model.bin`,
        Body: files.modelFile,
      })
    );

    // Upload config
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: `${basePath}/config.json`,
        Body: files.configFile,
      })
    );

    // Upload tokenizer
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: `${basePath}/tokenizer.json`,
        Body: files.tokenizerFile,
      })
    );

    // Upload adapter if present
    let adapterPath: string | undefined;
    if (files.adapterFile) {
      adapterPath = `${basePath}/adapter.bin`;
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: adapterPath,
          Body: files.adapterFile,
        })
      );
    }

    return {
      modelPath: `${basePath}/model.bin`,
      modelFormat: 'pytorch',
      modelSize: files.modelFile.length,
      modelChecksum,
      configPath: `${basePath}/config.json`,
      tokenizerPath: `${basePath}/tokenizer.json`,
      adapterPath,
      quantized: false,
      compressed: false,
    };
  }

  private async calculateFacets(
    filters: ModelSearchFilters
  ): Promise<any> {
    const queryBuilder = this.modelRepository.createQueryBuilder('model');

    // Apply existing filters (except the facet field itself)
    if (filters.query) {
      queryBuilder.andWhere(
        '(model.name ILIKE :query OR model.description ILIKE :query)',
        { query: `%${filters.query}%` }
      );
    }

    const models = await queryBuilder.getMany();

    // Calculate category counts
    const categories: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const languages: Record<string, number> = {};

    models.forEach((model) => {
      categories[model.category] = (categories[model.category] || 0) + 1;

      model.tags.forEach((tag) => {
        tags[tag] = (tags[tag] || 0) + 1;
      });

      model.language.forEach((lang) => {
        languages[lang] = (languages[lang] || 0) + 1;
      });
    });

    return {
      categories,
      tags,
      languages,
    };
  }

  private calculatePerformanceDeltas(
    perf1: any,
    perf2: any
  ): any {
    return {
      latencyP50Delta: perf2.inferenceLatencyP50 - perf1.inferenceLatencyP50,
      latencyP95Delta: perf2.inferenceLatencyP95 - perf1.inferenceLatencyP95,
      throughputDelta: perf2.throughput - perf1.throughput,
      memorySizeDelta: perf2.modelSizeMB - perf1.modelSizeMB,
    };
  }

  private async calculateEvaluationDeltas(
    versionId1: string,
    versionId2: string
  ): Promise<any> {
    // Implementation would compare evaluation results
    // Simplified for now
    return {
      overallScoreDelta: 0,
      taskDeltas: {},
    };
  }
}
