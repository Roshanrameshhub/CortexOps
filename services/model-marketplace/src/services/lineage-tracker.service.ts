import { Repository, DataSource } from 'typeorm';
import {
  ModelLineage,
  LineageNodeType,
  LineageRelationType,
  LineageNode,
  LineageEdge,
  LineageGraph,
} from '../models/model-lineage.entity';
import { v4 as uuidv4 } from 'uuid';

export interface CreateLineageDTO {
  entityId: string;
  entityType: LineageNodeType;
  tenantId: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface AddLineageNodeDTO {
  type: LineageNodeType;
  name: string;
  version?: string;
  metadata?: Record<string, any>;
  createdBy: string;
}

export interface AddLineageEdgeDTO {
  fromNodeId: string;
  toNodeId: string;
  relationType: LineageRelationType;
  metadata?: Record<string, any>;
}

export class LineageTrackerService {
  private lineageRepository: Repository<ModelLineage>;

  constructor(private dataSource: DataSource) {
    this.lineageRepository = dataSource.getRepository(ModelLineage);
  }

  /**
   * Create lineage record for an entity
   */
  async createLineage(dto: CreateLineageDTO): Promise<ModelLineage> {
    const lineage = this.lineageRepository.create({
      entityId: dto.entityId,
      entityType: dto.entityType,
      tenantId: dto.tenantId,
      description: dto.description,
      metadata: dto.metadata || {},
      lineageGraph: {
        nodes: [],
        edges: [],
        rootNode: dto.entityId,
      },
      parentIds: [],
      childIds: [],
      depth: 0,
    });

    // Add initial node for the entity itself
    const initialNode: LineageNode = {
      id: dto.entityId,
      type: dto.entityType,
      name: `${dto.entityType}-${dto.entityId}`,
      metadata: dto.metadata || {},
      createdAt: new Date(),
      createdBy: 'system',
    };

    lineage.addNode(initialNode);

    return await this.lineageRepository.save(lineage);
  }

  /**
   * Get lineage for an entity
   */
  async getLineage(entityId: string): Promise<ModelLineage | null> {
    return await this.lineageRepository.findOne({
      where: { entityId },
    });
  }

  /**
   * Add a node to lineage graph
   */
  async addNode(
    entityId: string,
    nodeDto: AddLineageNodeDTO
  ): Promise<ModelLineage> {
    const lineage = await this.getLineage(entityId);
    if (!lineage) {
      throw new Error(`Lineage not found for entity ${entityId}`);
    }

    const node: LineageNode = {
      id: uuidv4(),
      type: nodeDto.type,
      name: nodeDto.name,
      version: nodeDto.version,
      metadata: nodeDto.metadata || {},
      createdAt: new Date(),
      createdBy: nodeDto.createdBy,
    };

    lineage.addNode(node);

    return await this.lineageRepository.save(lineage);
  }

  /**
   * Add an edge (relationship) to lineage graph
   */
  async addEdge(
    entityId: string,
    edgeDto: AddLineageEdgeDTO
  ): Promise<ModelLineage> {
    const lineage = await this.getLineage(entityId);
    if (!lineage) {
      throw new Error(`Lineage not found for entity ${entityId}`);
    }

    // Verify nodes exist
    const fromNode = lineage.getNode(edgeDto.fromNodeId);
    const toNode = lineage.getNode(edgeDto.toNodeId);

    if (!fromNode || !toNode) {
      throw new Error('One or both nodes not found in lineage graph');
    }

    const edge: LineageEdge = {
      from: edgeDto.fromNodeId,
      to: edgeDto.toNodeId,
      relationType: edgeDto.relationType,
      metadata: edgeDto.metadata,
      createdAt: new Date(),
    };

    lineage.addEdge(edge);

    // Update depth if this creates a longer path
    await this.updateDepth(lineage);

    return await this.lineageRepository.save(lineage);
  }

  /**
   * Track model derivation (fine-tuned from base model)
   */
  async trackModelDerivation(
    modelVersionId: string,
    baseModelId: string,
    baseModelName: string,
    tenantId: string
  ): Promise<void> {
    let lineage = await this.getLineage(modelVersionId);

    if (!lineage) {
      lineage = await this.createLineage({
        entityId: modelVersionId,
        entityType: LineageNodeType.MODEL_VERSION,
        tenantId,
      });
    }

    // Add base model node
    const baseModelNode: LineageNode = {
      id: baseModelId,
      type: LineageNodeType.BASE_MODEL,
      name: baseModelName,
      metadata: {},
      createdAt: new Date(),
      createdBy: 'system',
    };

    lineage.addNode(baseModelNode);

    // Add derivation edge
    const edge: LineageEdge = {
      from: baseModelId,
      to: modelVersionId,
      relationType: LineageRelationType.DERIVED_FROM,
      createdAt: new Date(),
    };

    lineage.addEdge(edge);

    await this.lineageRepository.save(lineage);
  }

  /**
   * Track training data usage
   */
  async trackTrainingData(
    modelVersionId: string,
    datasetId: string,
    datasetName: string,
    datasetVersion: string,
    tenantId: string
  ): Promise<void> {
    let lineage = await this.getLineage(modelVersionId);

    if (!lineage) {
      lineage = await this.createLineage({
        entityId: modelVersionId,
        entityType: LineageNodeType.MODEL_VERSION,
        tenantId,
      });
    }

    // Add dataset node
    const datasetNode: LineageNode = {
      id: datasetId,
      type: LineageNodeType.DATASET,
      name: datasetName,
      version: datasetVersion,
      metadata: {},
      createdAt: new Date(),
      createdBy: 'system',
    };

    lineage.addNode(datasetNode);

    // Add training relationship
    const edge: LineageEdge = {
      from: datasetId,
      to: modelVersionId,
      relationType: LineageRelationType.TRAINED_ON,
      createdAt: new Date(),
    };

    lineage.addEdge(edge);

    await this.lineageRepository.save(lineage);
  }

  /**
   * Track training run
   */
  async trackTrainingRun(
    modelVersionId: string,
    trainingRunId: string,
    tenantId: string
  ): Promise<void> {
    let lineage = await this.getLineage(modelVersionId);

    if (!lineage) {
      lineage = await this.createLineage({
        entityId: modelVersionId,
        entityType: LineageNodeType.MODEL_VERSION,
        tenantId,
      });
    }

    // Add training run node
    const trainingRunNode: LineageNode = {
      id: trainingRunId,
      type: LineageNodeType.TRAINING_RUN,
      name: `Training Run ${trainingRunId}`,
      metadata: {},
      createdAt: new Date(),
      createdBy: 'system',
    };

    lineage.addNode(trainingRunNode);

    // Add edge
    const edge: LineageEdge = {
      from: trainingRunId,
      to: modelVersionId,
      relationType: LineageRelationType.DERIVED_FROM,
      createdAt: new Date(),
    };

    lineage.addEdge(edge);

    await this.lineageRepository.save(lineage);
  }

  /**
   * Get complete lineage graph with specified depth
   */
  async getLineageGraph(
    entityId: string,
    maxDepth: number = 5
  ): Promise<LineageGraph | null> {
    const lineage = await this.getLineage(entityId);
    if (!lineage) {
      return null;
    }

    // Filter nodes and edges based on depth
    const filteredGraph = this.filterGraphByDepth(
      lineage.lineageGraph,
      entityId,
      maxDepth
    );

    return filteredGraph;
  }

  /**
   * Get all ancestors of a node
   */
  async getAncestors(entityId: string): Promise<LineageNode[]> {
    const lineage = await this.getLineage(entityId);
    if (!lineage) {
      return [];
    }

    return lineage.getAllAncestors(entityId);
  }

  /**
   * Get all descendants of a node
   */
  async getDescendants(entityId: string): Promise<LineageNode[]> {
    const lineage = await this.getLineage(entityId);
    if (!lineage) {
      return [];
    }

    return lineage.getAllDescendants(entityId);
  }

  /**
   * Find path between two entities
   */
  async findPath(
    fromEntityId: string,
    toEntityId: string
  ): Promise<LineageNode[]> {
    // Get lineages for both entities
    const fromLineage = await this.getLineage(fromEntityId);
    const toLineage = await this.getLineage(toEntityId);

    if (!fromLineage || !toLineage) {
      return [];
    }

    // Try to find path in from lineage
    let path = fromLineage.getLineagePath(fromEntityId, toEntityId);

    if (path.length > 0) {
      return path;
    }

    // Try reverse path in to lineage
    path = toLineage.getLineagePath(toEntityId, fromEntityId);

    if (path.length > 0) {
      return path.reverse();
    }

    return [];
  }

  /**
   * Get all models derived from a base model
   */
  async getModelsByBaseModel(baseModelId: string): Promise<string[]> {
    const lineages = await this.lineageRepository.find({
      where: {
        entityType: LineageNodeType.MODEL_VERSION,
      },
    });

    const derivedModels: string[] = [];

    for (const lineage of lineages) {
      const baseModelNodes = lineage
        .getNodesByType(LineageNodeType.BASE_MODEL)
        .filter((node) => node.id === baseModelId);

      if (baseModelNodes.length > 0) {
        derivedModels.push(lineage.entityId);
      }
    }

    return derivedModels;
  }

  /**
   * Get all models trained on a dataset
   */
  async getModelsByDataset(datasetId: string): Promise<string[]> {
    const lineages = await this.lineageRepository.find({
      where: {
        entityType: LineageNodeType.MODEL_VERSION,
      },
    });

    const trainedModels: string[] = [];

    for (const lineage of lineages) {
      const datasetNodes = lineage
        .getNodesByType(LineageNodeType.DATASET)
        .filter((node) => node.id === datasetId);

      if (datasetNodes.length > 0) {
        trainedModels.push(lineage.entityId);
      }
    }

    return trainedModels;
  }

  /**
   * Validate lineage graph integrity
   */
  async validateLineage(entityId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const lineage = await this.getLineage(entityId);
    if (!lineage) {
      return { valid: false, errors: ['Lineage not found'] };
    }

    const errors: string[] = [];

    // Check for orphaned nodes
    const nodeIds = lineage.lineageGraph.nodes.map((n) => n.id);
    const edgeNodeIds = new Set<string>();

    lineage.lineageGraph.edges.forEach((edge) => {
      edgeNodeIds.add(edge.from);
      edgeNodeIds.add(edge.to);
    });

    lineage.lineageGraph.nodes.forEach((node) => {
      if (node.id !== entityId && !edgeNodeIds.has(node.id)) {
        errors.push(`Orphaned node found: ${node.id}`);
      }
    });

    // Check for invalid edge references
    lineage.lineageGraph.edges.forEach((edge) => {
      if (!nodeIds.includes(edge.from)) {
        errors.push(`Edge references non-existent from node: ${edge.from}`);
      }
      if (!nodeIds.includes(edge.to)) {
        errors.push(`Edge references non-existent to node: ${edge.to}`);
      }
    });

    // Check for cycles (lineage should be a DAG)
    if (this.hasCycle(lineage.lineageGraph)) {
      errors.push('Lineage graph contains cycles');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Private helper methods
   */

  private async updateDepth(lineage: ModelLineage): Promise<void> {
    const depth = this.calculateDepth(lineage.lineageGraph, lineage.entityId);
    lineage.depth = depth;
  }

  private calculateDepth(graph: LineageGraph, rootId: string): number {
    let maxDepth = 0;

    const traverse = (nodeId: string, currentDepth: number) => {
      maxDepth = Math.max(maxDepth, currentDepth);

      const childEdges = graph.edges.filter((edge) => edge.from === nodeId);
      childEdges.forEach((edge) => {
        traverse(edge.to, currentDepth + 1);
      });
    };

    traverse(rootId, 0);
    return maxDepth;
  }

  private filterGraphByDepth(
    graph: LineageGraph,
    rootId: string,
    maxDepth: number
  ): LineageGraph {
    const includedNodeIds = new Set<string>();
    const includedEdges: LineageEdge[] = [];

    const traverse = (nodeId: string, currentDepth: number) => {
      if (currentDepth > maxDepth) return;

      includedNodeIds.add(nodeId);

      const edges = graph.edges.filter(
        (edge) => edge.from === nodeId || edge.to === nodeId
      );

      edges.forEach((edge) => {
        if (currentDepth < maxDepth) {
          includedEdges.push(edge);

          if (edge.from === nodeId) {
            traverse(edge.to, currentDepth + 1);
          } else {
            traverse(edge.from, currentDepth + 1);
          }
        }
      });
    };

    traverse(rootId, 0);

    const filteredNodes = graph.nodes.filter((node) =>
      includedNodeIds.has(node.id)
    );

    return {
      nodes: filteredNodes,
      edges: includedEdges,
      rootNode: graph.rootNode,
    };
  }

  private hasCycle(graph: LineageGraph): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) {
        return true; // Cycle detected
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recStack.add(nodeId);

      const childEdges = graph.edges.filter((edge) => edge.from === nodeId);

      for (const edge of childEdges) {
        if (dfs(edge.to)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (dfs(node.id)) {
        return true;
      }
    }

    return false;
  }
}
