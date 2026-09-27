import { Request, Response, NextFunction } from 'express';
import { ModelRegistryService } from '../services/model-registry.service';
import { LineageTrackerService } from '../services/lineage-tracker.service';
import { EvaluationService } from '../services/evaluation.service';
import { ModelStatus } from '../models/fine-tuned-model.entity';

export class ModelController {
  constructor(
    private modelRegistry: ModelRegistryService,
    private lineageTracker: LineageTrackerService,
    private evaluationService: EvaluationService
  ) {}

  /**
   * Create new model
   * POST /api/v1/models
   */
  async createModel(req: Request, res: Response, next: NextFunction) {
    try {
      const model = await this.modelRegistry.createModel({
        ...req.body,
        tenantId: req.user.tenantId,
      });

      res.status(201).json({
        success: true,
        data: model,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload model version
   * POST /api/v1/models/:modelId/versions
   */
  async createVersion(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelId } = req.params;
      const files = req.files as any;

      const version = await this.modelRegistry.createVersion(modelId, {
        version: req.body.version,
        modelFile: files.modelFile[0].buffer,
        configFile: files.configFile[0].buffer,
        tokenizerFile: files.tokenizerFile[0].buffer,
        adapterFile: files.adapterFile?.[0]?.buffer,
        changelog: req.body.changelog,
        breaking: req.body.breaking === 'true',
        trainingRunId: req.body.trainingRunId,
        lineage: JSON.parse(req.body.lineage || '{}'),
      });

      // Track lineage
      if (req.body.baseModelId) {
        await this.lineageTracker.trackModelDerivation(
          version.id,
          req.body.baseModelId,
          req.body.baseModelName,
          req.user.tenantId
        );
      }

      // Trigger evaluation
      if (req.body.autoEvaluate === 'true') {
        await this.evaluationService.triggerEvaluation({
          modelVersionId: version.id,
          benchmarks: req.body.benchmarks?.split(',') || ['mmlu', 'hellaswag'],
        });
      }

      res.status(201).json({
        success: true,
        data: version,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get model by ID
   * GET /api/v1/models/:modelId
   */
  async getModel(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelId } = req.params;
      const { include } = req.query;

      const includeOptions = {
        includeVersions: include?.includes('versions'),
        includeEvaluations: include?.includes('evaluations'),
        includeLineage: include?.includes('lineage'),
      };

      const model = await this.modelRegistry.getModel(modelId, includeOptions);

      if (!model) {
        return res.status(404).json({
          success: false,
          error: 'Model not found',
        });
      }

      // Get lineage if requested
      let lineage = null;
      if (includeOptions.includeLineage) {
        lineage = await this.lineageTracker.getLineageGraph(modelId);
      }

      res.json({
        success: true,
        data: {
          model,
          lineage,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search models
   * GET /api/v1/models
   */
  async searchModels(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        query: req.query.q as string,
        category: req.query.category as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        minQualityScore: req.query.minQuality
          ? Number(req.query.minQuality)
          : undefined,
        languages: req.query.languages
          ? (req.query.languages as string).split(',')
          : undefined,
        status: req.query.status as ModelStatus,
        tenantId: req.query.tenantId as string,
      };

      const pagination = {
        limit: req.query.limit ? Number(req.query.limit) : 20,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };

      const result = await this.modelRegistry.searchModels(filters, pagination);

      res.json({
        success: true,
        data: result.models,
        meta: {
          total: result.total,
          limit: pagination.limit,
          offset: pagination.offset,
          facets: result.facets,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get model versions
   * GET /api/v1/models/:modelId/versions
   */
  async getVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelId } = req.params;
      const versions = await this.modelRegistry.getVersions(modelId);

      res.json({
        success: true,
        data: versions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specific version
   * GET /api/v1/models/:modelId/versions/:version
   */
  async getVersion(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelId, version } = req.params;
      const modelVersion = await this.modelRegistry.getVersion(modelId, version);

      if (!modelVersion) {
        return res.status(404).json({
          success: false,
          error: 'Version not found',
        });
      }

      res.json({
        success: true,
        data: modelVersion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Compare versions
   * GET /api/v1/models/:modelId/versions/:v1/compare/:v2
   */
  async compareVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelId, v1, v2 } = req.params;

      const comparison = await this.modelRegistry.compareVersions(
        modelId,
        v1,
        v2
      );

      res.json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update model status
   * PATCH /api/v1/models/:modelId/status
   */
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelId } = req.params;
      const { status } = req.body;

      const model = await this.modelRegistry.updateModelStatus(modelId, status);

      res.json({
        success: true,
        data: model,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete model
   * DELETE /api/v1/models/:modelId
   */
  async deleteModel(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelId } = req.params;
      await this.modelRegistry.deleteModel(modelId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
