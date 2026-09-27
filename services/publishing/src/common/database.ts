/**
 * Database Connection Pool Module
 * Provides PostgreSQL connection pooling with automatic reconnection and health checks
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from './logger';
import { DatabaseError } from './errors';

/**
 * PostgreSQL connection pool instance
 */
let pool: Pool | null = null;

/**
 * Database connection statistics
 */
interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

/**
 * Initialize database connection pool
 */
export async function initializeDatabase(): Promise<void> {
  if (pool) {
    logger.warn('Database pool already initialized');
    return;
  }

  pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    min: config.database.pool.min,
    max: config.database.pool.max,
    idleTimeoutMillis: config.database.pool.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.pool.connectionTimeoutMillis,
  });

  // Handle pool errors
  pool.on('error', (err: Error) => {
    logger.error('Unexpected database pool error', { error: err.message, stack: err.stack });
  });

  // Handle pool connection
  pool.on('connect', () => {
    logger.debug('New database connection established');
  });

  // Handle pool removal
  pool.on('remove', () => {
    logger.debug('Database connection removed from pool');
  });

  // Test connection
  try {
    await pool.query('SELECT NOW()');
    logger.info('Database connection pool initialized successfully', {
      host: config.database.host,
      database: config.database.name,
      poolSize: config.database.pool.max,
    });
  } catch (error) {
    logger.error('Failed to initialize database connection', { error });
    throw new DatabaseError('Database connection failed', error as Error);
  }
}

/**
 * Get database connection pool
 * @throws {DatabaseError} If pool is not initialized
 */
export function getPool(): Pool {
  if (!pool) {
    throw new DatabaseError('Database pool not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

/**
 * Execute a query with automatic error handling
 * @param text SQL query text
 * @param params Query parameters
 * @returns Query result
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const dbPool = getPool();

  try {
    const result = await dbPool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug('Query executed', {
      query: text,
      duration,
      rows: result.rowCount,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query execution failed', {
      query: text,
      duration,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new DatabaseError('Query execution failed', error as Error);
  }
}

/**
 * Execute a transaction with automatic rollback on error
 * @param callback Transaction callback function
 * @returns Transaction result
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const dbPool = getPool();
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');

    const result = await callback(client);

    await client.query('COMMIT');
    logger.debug('Transaction committed');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.warn('Transaction rolled back', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new DatabaseError('Transaction failed', error as Error);
  } finally {
    client.release();
  }
}

/**
 * Get pool statistics
 */
export function getPoolStats(): PoolStats {
  const dbPool = getPool();
  return {
    total: dbPool.totalCount,
    idle: dbPool.idleCount,
    waiting: dbPool.waitingCount,
  };
}

/**
 * Check database health
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as health');
    return result.rows[0]?.health === 1;
  } catch (error) {
    logger.error('Database health check failed', { error });
    return false;
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Helper function to safely get a single row
 */
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Helper function to execute a query and return all rows
 */
export async function queryMany<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Helper function to execute a query and return row count
 */
export async function execute(text: string, params?: any[]): Promise<number> {
  const result = await query(text, params);
  return result.rowCount || 0;
}
