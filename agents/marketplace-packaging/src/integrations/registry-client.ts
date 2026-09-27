/**
 * Registry Service Client
 *
 * Client for fetching asset metadata from LLM-Registry.
 * This agent MAY read from registry but MUST NOT modify it.
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import type { AssetReference } from '@llm-marketplace/agentics-contracts';
import type { ResolvedAsset, Result, AgentError } from '../types';

/**
 * Registry API response
 */
interface RegistryResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Asset from registry
 */
interface RegistryAsset {
  id: string;
  name: string;
  type: string;
  version: string;
  checksum: string;
  size: number;
  content_uri: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Registry Service Client
 */
export class RegistryClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.registry.baseUrl;
    this.timeout = config.registry.timeout;
  }

  /**
   * Resolve an asset reference to a concrete asset
   */
  async resolveAsset(ref: AssetReference): Promise<Result<ResolvedAsset>> {
    try {
      const version = ref.version === 'latest'
        ? await this.getLatestVersion(ref.registry_id)
        : ref.version;

      if (!version) {
        return {
          success: false,
          error: {
            code: 'VERSION_NOT_FOUND',
            message: `Could not resolve version for asset: ${ref.registry_id}`,
          },
        };
      }

      const response = await this.makeRequest<RegistryAsset>(
        `/api/v1/assets/${encodeURIComponent(ref.registry_id)}/versions/${encodeURIComponent(version)}`
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: {
            code: response.error?.code || 'ASSET_NOT_FOUND',
            message: response.error?.message || `Asset not found: ${ref.registry_id}@${version}`,
          },
        };
      }

      const asset = response.data;

      return {
        success: true,
        data: {
          registry_id: ref.registry_id,
          name: asset.name,
          type: asset.type,
          requested_version: ref.version,
          resolved_version: asset.version,
          checksum: asset.checksum,
          size: asset.size,
          content_uri: asset.content_uri,
          metadata: asset.metadata,
        },
      };
    } catch (error) {
      logger.error('Failed to resolve asset', {
        registry_id: ref.registry_id,
        version: ref.version,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: {
          code: 'REGISTRY_ERROR',
          message: error instanceof Error ? error.message : String(error),
          cause: error instanceof Error ? error : undefined,
        },
      };
    }
  }

  /**
   * Resolve multiple assets in parallel
   */
  async resolveAssets(refs: AssetReference[]): Promise<Result<ResolvedAsset[], AgentError>> {
    const results = await Promise.all(refs.map(ref => this.resolveAsset(ref)));

    const errors: AgentError[] = [];
    const resolved: ResolvedAsset[] = [];

    for (const result of results) {
      if (result.success) {
        resolved.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: {
          code: 'ASSET_RESOLUTION_FAILED',
          message: `Failed to resolve ${errors.length} asset(s)`,
          details: { errors },
        },
      };
    }

    return {
      success: true,
      data: resolved,
    };
  }

  /**
   * Get latest version for an asset
   */
  private async getLatestVersion(registryId: string): Promise<string | null> {
    try {
      const response = await this.makeRequest<{ version: string }>(
        `/api/v1/assets/${encodeURIComponent(registryId)}/latest`
      );

      if (!response.success || !response.data) {
        return null;
      }

      return response.data.version;
    } catch {
      return null;
    }
  }

  /**
   * Health check for registry service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest<{ status: string }>('/health');
      return response.success && response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Make HTTP request to registry service
   */
  private async makeRequest<T>(path: string): Promise<RegistryResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || response.statusText,
          },
        };
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `Request timed out after ${this.timeout}ms`,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}

// Singleton instance
let clientInstance: RegistryClient | null = null;

/**
 * Get Registry client instance
 */
export function getRegistryClient(): RegistryClient {
  if (!clientInstance) {
    clientInstance = new RegistryClient();
  }
  return clientInstance;
}

/**
 * Reset client instance (for testing)
 */
export function resetRegistryClient(): void {
  clientInstance = null;
}
