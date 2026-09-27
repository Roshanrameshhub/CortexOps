import { Request, Response, NextFunction } from 'express';
import { EvaluationService } from '../services/evaluation.service';
import { ModelRegistryService } from '../services/model-registry.service';

export class EvaluationController {
  constructor(
    private evaluationService: EvaluationService,
    private modelRegistry: ModelRegistryService
  ) {}

  /**
   * Trigger evaluation
   * POST /api/v1/evaluations
   */
  async triggerEvaluation(req: Request, res: Response, next: NextFunction) {
    try {
      const { modelVersionId, benchmarks, customDatasets } = req.body;

      const job = await this.evaluationService.triggerEvaluation({
        modelVersionId,
        benchmarks,
        customDatasets,
      });

      res.status(202).json({
        success: true,
        message: 'Evaluation job submitted',
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get evaluation results
   * GET /api/v1/evaluations/:evaluationId
   */
  async getEvaluation(req: Request, res: Response, next: NextFunction) {
    try {
      const { evaluationId } = req.params;

      const evaluation = await this.evaluationService.getEvaluation(
        evaluationId
      );

      if (!evaluation) {
        return res.status(404).json({
          success: false,
          error: 'Evaluation not found',
        });
      }

      res.json({
        success: true,
        data: evaluation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all evaluations for a model version
   * GET /api/v1/models/:modelId/versions/:version/evaluations
   */
  async getVersionEvaluations(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { modelId, version } = req.params;

      const modelVersion = await this.modelRegistry.getVersion(
        modelId,
        version
      );

      if (!modelVersion) {
        return res.status(404).json({
          success: false,
          error: 'Model version not found',
        });
      }

      const evaluations = await this.evaluationService.getEvaluationResults(
        modelVersion.id
      );

      res.json({
        success: true,
        data: evaluations,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get leaderboard
   * GET /api/v1/leaderboard
   */
  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { benchmark } = req.query;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const leaderboard = await this.evaluationService.getLeaderboard(
        benchmark as string,
        limit
      );

      res.json({
        success: true,
        data: {
          benchmark,
          entries: leaderboard,
          lastUpdated: new Date(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Compare models
   * GET /api/v1/compare
   */
  async compareModels(req: Request, res: Response, next: NextFunction) {
    try {
      const { versionA, versionB } = req.query;

      const comparison = await this.evaluationService.compareModels(
        versionA as string,
        versionB as string
      );

      res.json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      next(error);
    }
  }
}
