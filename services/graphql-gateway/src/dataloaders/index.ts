import DataLoader from 'dataloader';
import type { PublishingAPI } from '../datasources/PublishingAPI';
import type { DiscoveryAPI } from '../datasources/DiscoveryAPI';
import type { ConsumptionAPI } from '../datasources/ConsumptionAPI';
import type { AdminAPI } from '../datasources/AdminAPI';

/**
 * Data sources type
 */
interface DataSources {
  publishingAPI: PublishingAPI;
  discoveryAPI: DiscoveryAPI;
  consumptionAPI: ConsumptionAPI;
  adminAPI: AdminAPI;
}

/**
 * Create all DataLoader instances for batching and caching
 */
export function createDataLoaders(dataSources: DataSources) {
  return {
    // Service loader - batch load services by IDs
    serviceLoader: new DataLoader<string, any>(
      async (ids: readonly string[]) => {
        const uniqueIds = [...new Set(ids)];
        const services = await dataSources.publishingAPI.batchGetServices(uniqueIds);

        // Create a map for quick lookup
        const serviceMap = new Map(
          services.map((service: any) => [service.id, service])
        );

        // Return services in the same order as requested IDs
        return ids.map((id: string) => serviceMap.get(id) || null);
      },
      {
        cacheKeyFn: (key: string) => key,
        maxBatchSize: 100,
      }
    ),

    // Provider loader - batch load providers by IDs
    providerLoader: new DataLoader<string, any>(
      async (ids: readonly string[]) => {
        const uniqueIds = [...new Set(ids)];

        // Fetch providers individually (can be optimized with batch endpoint)
        const providers = await Promise.all(
          uniqueIds.map((id: string) =>
            dataSources.publishingAPI.getProvider(id).catch(() => null)
          )
        );

        // Create a map for quick lookup
        const providerMap = new Map(
          providers
            .filter((p: any) => p !== null)
            .map((provider: any) => [provider.id, provider])
        );

        // Return providers in the same order as requested IDs
        return ids.map((id: string) => providerMap.get(id) || null);
      },
      {
        cacheKeyFn: (key: string) => key,
        maxBatchSize: 50,
      }
    ),

    // Quota loader - batch load quotas by service IDs
    quotaLoader: new DataLoader<string, any>(
      async (serviceIds: readonly string[]) => {
        const uniqueIds = [...new Set(serviceIds)];
        const quotas = await dataSources.consumptionAPI.batchGetQuota(uniqueIds);

        // Create a map for quick lookup
        const quotaMap = new Map(
          quotas.map((quota: any) => [quota.serviceId, quota])
        );

        // Return quotas in the same order as requested service IDs
        return serviceIds.map((id: string) => quotaMap.get(id) || null);
      },
      {
        cacheKeyFn: (key: string) => key,
        maxBatchSize: 100,
      }
    ),

    // Category loader - batch load categories by IDs
    categoryLoader: new DataLoader<string, any>(
      async (ids: readonly string[]) => {
        const uniqueIds = [...new Set(ids)];

        // Fetch categories individually (can be optimized with batch endpoint)
        const categories = await Promise.all(
          uniqueIds.map((id: string) =>
            dataSources.discoveryAPI.getCategory(id).catch(() => null)
          )
        );

        // Create a map for quick lookup
        const categoryMap = new Map(
          categories
            .filter((c: any) => c !== null)
            .map((category: any) => [category.id, category])
        );

        // Return categories in the same order as requested IDs
        return ids.map((id: string) => categoryMap.get(id) || null);
      },
      {
        cacheKeyFn: (key: string) => key,
        maxBatchSize: 50,
      }
    ),

    // User loader - batch load users by IDs
    userLoader: new DataLoader<string, any>(
      async (ids: readonly string[]) => {
        const uniqueIds = [...new Set(ids)];

        // Fetch users individually (can be optimized with batch endpoint)
        const users = await Promise.all(
          uniqueIds.map((id: string) =>
            dataSources.adminAPI.getUser(id).catch(() => null)
          )
        );

        // Create a map for quick lookup
        const userMap = new Map(
          users.filter((u: any) => u !== null).map((user: any) => [user.id, user])
        );

        // Return users in the same order as requested IDs
        return ids.map((id: string) => userMap.get(id) || null);
      },
      {
        cacheKeyFn: (key: string) => key,
        maxBatchSize: 100,
      }
    ),
  };
}

/**
 * DataLoader types
 */
export type DataLoaders = ReturnType<typeof createDataLoaders>;
