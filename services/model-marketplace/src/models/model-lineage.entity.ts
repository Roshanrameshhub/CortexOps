import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LineageNodeType {
  BASE_MODEL = 'base_model',
  DATASET = 'dataset',
  TRAINING_RUN = 'training_run',
  MODEL_VERSION = 'model_version',
  EVALUATION = 'evaluation',
  DEPLOYMENT = 'deployment',
  PREPROCESSING = 'preprocessing',
}

export enum LineageRelationType {
  DERIVED_FROM = 'derived_from',
  TRAINED_ON = 'trained_on',
  EVALUATED_BY = 'evaluated_by',
  DEPLOYED_AS = 'deployed_as',
  PREPROCESSED_BY = 'preprocessed_by',
  MERGED_FROM = 'merged_from',
}

export interface LineageNode {
  id: string;
  type: LineageNodeType;
  name: string;
  version?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  createdBy: string;
}

export interface LineageEdge {
  from: string;
  to: string;
  relationType: LineageRelationType;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  rootNode: string;
}

@Entity('model_lineage')
@Index(['entityId', 'entityType'])
@Index(['tenantId'])
export class ModelLineage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Entity reference
  @Column({ type: 'uuid' })
  entityId: string; // Model version ID, dataset ID, etc.

  @Column({
    type: 'enum',
    enum: LineageNodeType,
  })
  entityType: LineageNodeType;

  @Column({ type: 'uuid' })
  tenantId: string;

  // Lineage graph
  @Column({ type: 'jsonb' })
  lineageGraph: LineageGraph;

  // Quick access to immediate relationships
  @Column({ type: 'simple-array', default: [] })
  parentIds: string[];

  @Column({ type: 'simple-array', default: [] })
  childIds: string[];

  // Depth in lineage tree
  @Column({ type: 'integer', default: 0 })
  depth: number;

  // Metadata
  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  addNode(node: LineageNode): void {
    if (!this.lineageGraph.nodes) {
      this.lineageGraph.nodes = [];
    }
    this.lineageGraph.nodes.push(node);
    this.updatedAt = new Date();
  }

  addEdge(edge: LineageEdge): void {
    if (!this.lineageGraph.edges) {
      this.lineageGraph.edges = [];
    }
    this.lineageGraph.edges.push(edge);

    // Update parent/child relationships
    if (!this.parentIds.includes(edge.from)) {
      this.parentIds.push(edge.from);
    }
    if (!this.childIds.includes(edge.to)) {
      this.childIds.push(edge.to);
    }

    this.updatedAt = new Date();
  }

  getNode(nodeId: string): LineageNode | undefined {
    return this.lineageGraph.nodes.find((node) => node.id === nodeId);
  }

  getNodesByType(type: LineageNodeType): LineageNode[] {
    return this.lineageGraph.nodes.filter((node) => node.type === type);
  }

  getParentNodes(nodeId: string): LineageNode[] {
    const parentEdges = this.lineageGraph.edges.filter(
      (edge) => edge.to === nodeId
    );
    const parentNodeIds = parentEdges.map((edge) => edge.from);
    return this.lineageGraph.nodes.filter((node) =>
      parentNodeIds.includes(node.id)
    );
  }

  getChildNodes(nodeId: string): LineageNode[] {
    const childEdges = this.lineageGraph.edges.filter(
      (edge) => edge.from === nodeId
    );
    const childNodeIds = childEdges.map((edge) => edge.to);
    return this.lineageGraph.nodes.filter((node) =>
      childNodeIds.includes(node.id)
    );
  }

  getAllAncestors(nodeId: string): LineageNode[] {
    const ancestors: LineageNode[] = [];
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const parents = this.getParentNodes(id);
      parents.forEach((parent) => {
        ancestors.push(parent);
        traverse(parent.id);
      });
    };

    traverse(nodeId);
    return ancestors;
  }

  getAllDescendants(nodeId: string): LineageNode[] {
    const descendants: LineageNode[] = [];
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const children = this.getChildNodes(id);
      children.forEach((child) => {
        descendants.push(child);
        traverse(child.id);
      });
    };

    traverse(nodeId);
    return descendants;
  }

  getLineagePath(fromId: string, toId: string): LineageNode[] {
    // BFS to find shortest path
    const queue: Array<{ id: string; path: LineageNode[] }> = [];
    const visited = new Set<string>();

    const startNode = this.getNode(fromId);
    if (!startNode) return [];

    queue.push({ id: fromId, path: [startNode] });
    visited.add(fromId);

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      if (id === toId) {
        return path;
      }

      const children = this.getChildNodes(id);
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          queue.push({ id: child.id, path: [...path, child] });
        }
      }
    }

    return []; // No path found
  }
}
