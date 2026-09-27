import { Repository, DataSource } from 'typeorm';
import {
  EvaluationResult,
  EvaluationType,
  EvaluationStatus,
  EvaluationMetrics,
} from '../models/evaluation-result.entity';
import { ModelVersion } from '../models/model-version.entity';

export interface TriggerEvaluationDTO {
  modelVersionId: string;
  benchmarks: string[];
  customDatasets?: string[];
}

export interface EvaluationJob {
  id: string;
  modelVersionId: string;
  status: EvaluationStatus;
  benchmarks: string[];
  createdAt: Date;
}

export class EvaluationService {
  private evaluationRepository: Repository<EvaluationResult>;
  private versionRepository: Repository<ModelVersion>;

  constructor(private dataSource: DataSource) {
    this.evaluationRepository = dataSource.getRepository(EvaluationResult);
    this.versionRepository = dataSource.getRepository(ModelVersion);
  }

  /**
   * Trigger evaluation for a model version
   */
  async triggerEvaluation(dto: TriggerEvaluationDTO): Promise<EvaluationJob> {
    const version = await this.versionRepository.findOne({
      where: { id: dto.modelVersionId },
    });

    if (!version) {
      throw new Error(`Model version ${dto.modelVersionId} not found`);
    }

    // Create evaluation records for each benchmark
    const evaluations: EvaluationResult[] = [];

    for (const benchmark of dto.benchmarks) {
      const evaluation = this.evaluationRepository.create({
        modelVersionId: dto.modelVersionId,
        evaluationType: EvaluationType.BENCHMARK,
        benchmarkName: benchmark,
        benchmarkVersion: '1.0.0',
        overallScore: 0,
        taskScores: [],
        predictions: '',
        metrics: {},
        status: EvaluationStatus.PENDING,
      });

      evaluations.push(evaluation);
    }

    await this.evaluationRepository.save(evaluations);

    // In production, this would trigger async jobs in a queue
    // For now, simulate job creation
    const job: EvaluationJob = {
      id: evaluations[0].id,
      modelVersionId: dto.modelVersionId,
      status: EvaluationStatus.PENDING,
      benchmarks: dto.benchmarks,
      createdAt: new Date(),
    };

    // Trigger async evaluation (would use Bull/BullMQ in production)
    this.runEvaluationsAsync(evaluations);

    return job;
  }

  /**
   * Get evaluation results for a model version
   */
  async getEvaluationResults(
    modelVersionId: string
  ): Promise<EvaluationResult[]> {
    return await this.evaluationRepository.find({
      where: { modelVersionId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get specific evaluation result
   */
  async getEvaluation(evaluationId: string): Promise<EvaluationResult | null> {
    return await this.evaluationRepository.findOne({
      where: { id: evaluationId },
    });
  }

  /**
   * Calculate aggregate quality score from evaluations
   */
  async calculateQualityScore(modelVersionId: string): Promise<number> {
    const evaluations = await this.getEvaluationResults(modelVersionId);

    if (evaluations.length === 0) {
      return 0;
    }

    const completedEvals = evaluations.filter((e) => e.isComplete());

    if (completedEvals.length === 0) {
      return 0;
    }

    const weights = {
      accuracy: 0.3,
      safety: 0.25,
      performance: 0.2,
      robustness: 0.15,
      efficiency: 0.1,
    };

    let totalScore = 0;
    let totalWeight = 0;

    completedEvals.forEach((eval) => {
      const metrics = eval.metrics;

      // Accuracy score
      const accuracyScore =
        ((metrics.mmluScore || 0) * 0.4 +
          (metrics.hellaswagScore || 0) * 0.3 +
          (metrics.truthfulqaScore || 0) * 0.3) *
        weights.accuracy;

      // Safety score (inverted for toxicity)
      const safetyScore =
        (100 - ((metrics.toxicityScore || 0) * 0.6 + (metrics.biasScore || 0) * 0.4)) *
        weights.safety;

      // Performance score
      const performanceScore =
        this.normalizeLatency(metrics.latencyP95 || 0) * weights.performance;

      // Add to total
      totalScore += accuracyScore + safetyScore + performanceScore;
      totalWeight +=
        weights.accuracy + weights.safety + weights.performance;
    });

    return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
  }

  /**
   * Get leaderboard for a benchmark
   */
  async getLeaderboard(
    benchmarkName: string,
    limit: number = 50
  ): Promise<Array<{ modelVersionId: string; score: number }>> {
    const evaluations = await this.evaluationRepository.find({
      where: {
        benchmarkName,
        status: EvaluationStatus.COMPLETED,
      },
      order: { overallScore: 'DESC' },
      take: limit,
    });

    return evaluations.map((eval) => ({
      modelVersionId: eval.modelVersionId,
      score: Number(eval.overallScore),
    }));
  }

  /**
   * Compare two model versions
   */
  async compareModels(
    versionId1: string,
    versionId2: string
  ): Promise<any> {
    const [evals1, evals2] = await Promise.all([
      this.getEvaluationResults(versionId1),
      this.getEvaluationResults(versionId2),
    ]);

    const comparison: any = {
      versionA: versionId1,
      versionB: versionId2,
      metricDeltas: {},
    };

    // Compare common benchmarks
    evals1.forEach((eval1) => {
      const eval2 = evals2.find(
        (e) => e.benchmarkName === eval1.benchmarkName
      );

      if (eval2) {
        comparison.metricDeltas[eval1.benchmarkName] = {
          scoreDelta: Number(eval2.overallScore) - Number(eval1.overallScore),
          scoreA: Number(eval1.overallScore),
          scoreB: Number(eval2.overallScore),
        };
      }
    });

    return comparison;
  }

  /**
   * Private methods
   */

  private async runEvaluationsAsync(
    evaluations: EvaluationResult[]
  ): Promise<void> {
    // Simulate async evaluation
    // In production, this would submit jobs to a queue
    setTimeout(async () => {
      for (const evaluation of evaluations) {
        evaluation.status = EvaluationStatus.RUNNING;
        await this.evaluationRepository.save(evaluation);

        // Simulate evaluation execution
        const results = await this.runBenchmark(evaluation.benchmarkName);

        evaluation.status = EvaluationStatus.COMPLETED;
        evaluation.overallScore = results.overallScore;
        evaluation.taskScores = results.taskScores;
        evaluation.metrics = results.metrics;
        evaluation.evaluatedAt = new Date();

        await this.evaluationRepository.save(evaluation);
      }
    }, 1000);
  }

  private async runBenchmark(benchmarkName: string): Promise<{
    overallScore: number;
    taskScores: any[];
    metrics: EvaluationMetrics;
  }> {
    // Simulate benchmark execution
    // In production, this would load the model and run actual evaluations
    const baseScore = 60 + Math.random() * 30;

    return {
      overallScore: baseScore,
      taskScores: [
        { taskName: 'task1', score: baseScore + 5, sampleCount: 100 },
        { taskName: 'task2', score: baseScore - 3, sampleCount: 100 },
      ],
      metrics: {
        mmluScore: benchmarkName === 'mmlu' ? baseScore : undefined,
        hellaswagScore: benchmarkName === 'hellaswag' ? baseScore : undefined,
        truthfulqaScore:
          benchmarkName === 'truthfulqa' ? baseScore : undefined,
        toxicityScore: 10 + Math.random() * 5,
        biasScore: 15 + Math.random() * 10,
      },
    };
  }

  private normalizeLatency(latency: number): number {
    // Lower latency is better, normalize to 0-100 scale
    if (latency === 0) return 100;
    const maxLatency = 5000; // 5 seconds considered poor
    return Math.max(0, 100 - (latency / maxLatency) * 100);
  }
}
