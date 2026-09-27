/**
 * Service Repository
 * Database access layer for service-related operations
 */

import { query, queryOne, queryMany } from '../common/database';
import {
  Service,
  ServiceStatus,
  ServiceCategory,
  ServiceSearchParams,
  Capability,
  Endpoint,
  Pricing,
  SLA,
  Compliance,
} from '../models/service.model';
import { DatabaseError, NotFoundError, ConflictError } from '../common/errors';
import { logger } from '../common/logger';

/**
 * Create a new service
 */
export async function create(
  providerId: string,
  input: {
    registryId: string;
    name: string;
    version: string;
    description: string;
    category: ServiceCategory;
    tags: string[];
    capabilities: Capability[];
    endpoint: Endpoint;
    pricing: Pricing;
    sla: SLA;
    compliance: Compliance;
  }
): Promise<Service> {
  // Check for duplicate name+version
  const existing = await findByNameAndVersion(input.name, input.version);
  if (existing) {
    throw new ConflictError(`Service ${input.name} version ${input.version} already exists`);
  }

  const sql = `
    INSERT INTO services (
      registry_id, name, version, description, provider_id,
      category, tags, capabilities, endpoint, pricing, sla, compliance,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;

  const result = await queryOne<any>(sql, [
    input.registryId,
    input.name,
    input.version,
    input.description,
    providerId,
    input.category,
    input.tags,
    JSON.stringify(input.capabilities),
    JSON.stringify(input.endpoint),
    JSON.stringify(input.pricing),
    JSON.stringify(input.sla),
    JSON.stringify(input.compliance),
    ServiceStatus.PENDING_APPROVAL,
  ]);

  if (!result) {
    throw new DatabaseError('Failed to create service');
  }

  logger.info('Service created', { serviceId: result.id, name: input.name, version: input.version });

  return mapServiceRow(result);
}

/**
 * Find service by ID
 */
export async function findById(id: string): Promise<Service | null> {
  const sql = `
    SELECT s.*,
           u.id as provider_id,
           u.first_name || ' ' || u.last_name as provider_name,
           false as provider_verified
    FROM services s
    JOIN users u ON s.provider_id = u.id
    WHERE s.id = $1
  `;

  const result = await queryOne<any>(sql, [id]);
  return result ? mapServiceRow(result) : null;
}

/**
 * Find service by name and version
 */
export async function findByNameAndVersion(name: string, version: string): Promise<Service | null> {
  const sql = `
    SELECT s.*,
           u.id as provider_id,
           u.first_name || ' ' || u.last_name as provider_name,
           false as provider_verified
    FROM services s
    JOIN users u ON s.provider_id = u.id
    WHERE s.name = $1 AND s.version = $2
  `;

  const result = await queryOne<any>(sql, [name, version]);
  return result ? mapServiceRow(result) : null;
}

/**
 * Find all versions of a service
 */
export async function findVersions(name: string): Promise<Service[]> {
  const sql = `
    SELECT s.*,
           u.id as provider_id,
           u.first_name || ' ' || u.last_name as provider_name,
           false as provider_verified
    FROM services s
    JOIN users u ON s.provider_id = u.id
    WHERE s.name = $1
    ORDER BY s.created_at DESC
  `;

  const result = await queryMany<any>(sql, [name]);
  return result.map(mapServiceRow);
}

/**
 * Update service
 */
export async function update(
  serviceId: string,
  input: {
    description?: string;
    tags?: string[];
    capabilities?: Capability[];
    endpoint?: Endpoint;
    pricing?: Pricing;
    sla?: SLA;
    compliance?: Compliance;
    status?: ServiceStatus;
    suspensionReason?: string;
  }
): Promise<Service> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (input.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(input.description);
  }

  if (input.tags !== undefined) {
    updates.push(`tags = $${paramCount++}`);
    values.push(input.tags);
  }

  if (input.capabilities !== undefined) {
    updates.push(`capabilities = $${paramCount++}`);
    values.push(JSON.stringify(input.capabilities));
  }

  if (input.endpoint !== undefined) {
    updates.push(`endpoint = $${paramCount++}`);
    values.push(JSON.stringify(input.endpoint));
  }

  if (input.pricing !== undefined) {
    updates.push(`pricing = $${paramCount++}`);
    values.push(JSON.stringify(input.pricing));
  }

  if (input.sla !== undefined) {
    updates.push(`sla = $${paramCount++}`);
    values.push(JSON.stringify(input.sla));
  }

  if (input.compliance !== undefined) {
    updates.push(`compliance = $${paramCount++}`);
    values.push(JSON.stringify(input.compliance));
  }

  if (input.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(input.status);

    // Set published_at when transitioning to active
    if (input.status === ServiceStatus.ACTIVE) {
      updates.push(`published_at = NOW()`);
    }

    // Set deprecated_at when transitioning to deprecated
    if (input.status === ServiceStatus.DEPRECATED) {
      updates.push(`deprecated_at = NOW()`);
    }
  }

  if (input.suspensionReason !== undefined) {
    updates.push(`suspension_reason = $${paramCount++}`);
    values.push(input.suspensionReason);
  }

  if (updates.length === 0) {
    throw new DatabaseError('No fields to update');
  }

  values.push(serviceId);

  const sql = `
    UPDATE services
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await queryOne<any>(sql, values);

  if (!result) {
    throw new NotFoundError('Service', serviceId);
  }

  logger.info('Service updated', { serviceId, updates: Object.keys(input) });

  // Fetch full service with provider info
  return (await findById(serviceId))!;
}

/**
 * Delete service (soft delete by setting status to retired)
 */
export async function deleteService(serviceId: string): Promise<void> {
  const sql = `
    UPDATE services
    SET status = $1, updated_at = NOW()
    WHERE id = $2
  `;

  await query(sql, [ServiceStatus.RETIRED, serviceId]);

  logger.info('Service deleted (soft)', { serviceId });
}

/**
 * Search services with filters
 */
export async function search(params: ServiceSearchParams): Promise<{
  services: Service[];
  total: number;
}> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Build WHERE clause
  if (params.query) {
    conditions.push(`(
      s.name ILIKE $${paramCount} OR
      s.description ILIKE $${paramCount} OR
      $${paramCount} = ANY(s.tags)
    )`);
    values.push(`%${params.query}%`);
    paramCount++;
  }

  if (params.category) {
    conditions.push(`s.category = $${paramCount++}`);
    values.push(params.category);
  }

  if (params.tags && params.tags.length > 0) {
    conditions.push(`s.tags && $${paramCount++}`);
    values.push(params.tags);
  }

  if (params.status) {
    conditions.push(`s.status = $${paramCount++}`);
    values.push(params.status);
  } else {
    // Default to only active services
    conditions.push(`s.status = $${paramCount++}`);
    values.push(ServiceStatus.ACTIVE);
  }

  if (params.providerId) {
    conditions.push(`s.provider_id = $${paramCount++}`);
    values.push(params.providerId);
  }

  if (params.complianceLevel) {
    conditions.push(`s.compliance->>'level' = $${paramCount++}`);
    values.push(params.complianceLevel);
  }

  if (params.minAvailability !== undefined) {
    conditions.push(`(s.sla->>'availability')::numeric >= $${paramCount++}`);
    values.push(params.minAvailability);
  }

  if (params.maxLatency !== undefined) {
    conditions.push(`(s.sla->>'maxLatency')::integer <= $${paramCount++}`);
    values.push(params.maxLatency);
  }

  if (params.pricingModel) {
    conditions.push(`s.pricing->>'model' = $${paramCount++}`);
    values.push(params.pricingModel);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countSql = `
    SELECT COUNT(*)
    FROM services s
    ${whereClause}
  `;

  const countResult = await queryOne<{ count: string }>(countSql, values);
  const total = parseInt(countResult?.count || '0', 10);

  // Build ORDER BY clause
  const sortBy = params.sortBy || 'createdAt';
  const sortOrder = params.sortOrder || 'desc';
  const orderByMap: Record<string, string> = {
    createdAt: 's.created_at',
    publishedAt: 's.published_at',
    name: 's.name',
    popularity: 's.created_at', // TODO: Implement actual popularity metric
  };

  const orderBy = `${orderByMap[sortBy] || 's.created_at'} ${sortOrder.toUpperCase()}`;

  // Build query with pagination
  const limit = params.limit || 20;
  const offset = params.offset || 0;

  const sql = `
    SELECT s.*,
           u.id as provider_id,
           u.first_name || ' ' || u.last_name as provider_name,
           false as provider_verified
    FROM services s
    JOIN users u ON s.provider_id = u.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramCount++} OFFSET $${paramCount++}
  `;

  values.push(limit, offset);

  const result = await queryMany<any>(sql, values);
  const services = result.map(mapServiceRow);

  logger.debug('Service search executed', {
    total,
    returned: services.length,
    params,
  });

  return { services, total };
}

/**
 * Get services by provider
 */
export async function findByProviderId(providerId: string): Promise<Service[]> {
  const sql = `
    SELECT s.*,
           u.id as provider_id,
           u.first_name || ' ' || u.last_name as provider_name,
           false as provider_verified
    FROM services s
    JOIN users u ON s.provider_id = u.id
    WHERE s.provider_id = $1
    ORDER BY s.created_at DESC
  `;

  const result = await queryMany<any>(sql, [providerId]);
  return result.map(mapServiceRow);
}

/**
 * Get service statistics
 */
export async function getStatistics(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  const totalSql = 'SELECT COUNT(*) as count FROM services';
  const totalResult = await queryOne<{ count: string }>(totalSql);
  const total = parseInt(totalResult?.count || '0', 10);

  const statusSql = `
    SELECT status, COUNT(*) as count
    FROM services
    GROUP BY status
  `;
  const statusResults = await queryMany<{ status: string; count: string }>(statusSql);
  const byStatus = statusResults.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10);
    return acc;
  }, {} as Record<string, number>);

  const categorySql = `
    SELECT category, COUNT(*) as count
    FROM services
    GROUP BY category
  `;
  const categoryResults = await queryMany<{ category: string; count: string }>(categorySql);
  const byCategory = categoryResults.reduce((acc, row) => {
    acc[row.category] = parseInt(row.count, 10);
    return acc;
  }, {} as Record<string, number>);

  return { total, byStatus, byCategory };
}

/**
 * Map database row to Service entity
 */
function mapServiceRow(row: any): Service {
  return {
    id: row.id,
    registryId: row.registry_id,
    name: row.name,
    version: row.version,
    description: row.description,
    provider: {
      id: row.provider_id,
      name: row.provider_name,
      verified: row.provider_verified,
    },
    category: row.category as ServiceCategory,
    tags: row.tags || [],
    capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities,
    endpoint: typeof row.endpoint === 'string' ? JSON.parse(row.endpoint) : row.endpoint,
    pricing: typeof row.pricing === 'string' ? JSON.parse(row.pricing) : row.pricing,
    sla: typeof row.sla === 'string' ? JSON.parse(row.sla) : row.sla,
    compliance: typeof row.compliance === 'string' ? JSON.parse(row.compliance) : row.compliance,
    status: row.status as ServiceStatus,
    metadata: {
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      deprecatedAt: row.deprecated_at,
      suspensionReason: row.suspension_reason,
    },
  };
}
