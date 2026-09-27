import type { Context } from '../context';
import { requireAuth, requireRole } from '../context';

/**
 * Query resolvers
 */
const Query = {
  // ============================================================
  // Publishing Service
  // ============================================================

  service: async (_: any, { id }: { id: string }, context: Context) => {
    // Use DataLoader for efficient batching
    return context.loaders.serviceLoader.load(id);
  },

  services: async (
    _: any,
    { filter, pagination }: { filter?: any; pagination?: any },
    context: Context
  ) => {
    const result = await context.dataSources.publishingAPI.listServices({
      filter,
      limit: pagination?.limit,
      cursor: pagination?.cursor,
    });

    return result;
  },

  validateService: async (
    _: any,
    { input }: { input: any },
    context: Context
  ) => {
    return context.dataSources.publishingAPI.validateService(input);
  },

  // ============================================================
  // Discovery Service
  // ============================================================

  searchServices: async (
    _: any,
    {
      query,
      filter,
      pagination,
    }: { query: string; filter?: any; pagination?: any },
    context: Context
  ) => {
    return context.dataSources.discoveryAPI.searchServices({
      query,
      filter,
      limit: pagination?.limit,
      cursor: pagination?.cursor,
    });
  },

  recommendations: async (
    _: any,
    { userId, limit = 10 }: { userId?: string; limit?: number },
    context: Context
  ) => {
    requireAuth(context);

    const effectiveUserId = userId || context.user?.id;
    const result = await context.dataSources.discoveryAPI.getRecommendations({
      userId: effectiveUserId,
      limit,
    });

    return result.services || result;
  },

  categories: async (_: any, __: any, context: Context) => {
    return context.dataSources.discoveryAPI.getCategories();
  },

  tags: async (_: any, { limit = 50 }: { limit?: number }, context: Context) => {
    return context.dataSources.discoveryAPI.getTags(limit);
  },

  servicesByCategory: async (
    _: any,
    { category, pagination }: { category: string; pagination?: any },
    context: Context
  ) => {
    return context.dataSources.discoveryAPI.getServicesByCategory({
      category,
      limit: pagination?.limit,
      cursor: pagination?.cursor,
    });
  },

  // ============================================================
  // Consumption Service
  // ============================================================

  usage: async (
    _: any,
    { serviceId, timeRange }: { serviceId: string; timeRange: any },
    context: Context
  ) => {
    requireAuth(context);

    return context.dataSources.consumptionAPI.getUsageMetrics({
      serviceId,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
    });
  },

  quota: async (_: any, { serviceId }: { serviceId: string }, context: Context) => {
    requireAuth(context);

    // Use DataLoader for efficient batching
    return context.loaders.quotaLoader.load(serviceId);
  },

  sla: async (
    _: any,
    { serviceId, period }: { serviceId: string; period?: any },
    context: Context
  ) => {
    requireAuth(context);

    return context.dataSources.consumptionAPI.getSLAMetrics({
      serviceId,
      startTime: period?.startTime,
      endTime: period?.endTime,
    });
  },

  billing: async (
    _: any,
    { serviceId, period }: { serviceId: string; period?: any },
    context: Context
  ) => {
    requireAuth(context);

    return context.dataSources.consumptionAPI.getBillingInfo({
      serviceId,
      startTime: period?.startTime,
      endTime: period?.endTime,
    });
  },

  // ============================================================
  // Admin Service
  // ============================================================

  analytics: async (
    _: any,
    { period }: { period: any },
    context: Context
  ) => {
    requireRole(context, 'ADMIN');

    return context.dataSources.adminAPI.getAnalytics({
      startTime: period.startTime,
      endTime: period.endTime,
    });
  },

  auditLogs: async (
    _: any,
    { filter, pagination }: { filter?: any; pagination?: any },
    context: Context
  ) => {
    requireRole(context, 'ADMIN');

    return context.dataSources.adminAPI.getAuditLogs({
      filter,
      limit: pagination?.limit,
      cursor: pagination?.cursor,
    });
  },

  platformStats: async (_: any, __: any, context: Context) => {
    requireRole(context, 'ADMIN');

    return context.dataSources.adminAPI.getPlatformStats();
  },

  // ============================================================
  // Health & Meta
  // ============================================================

  health: async (_: any, __: any, context: Context) => {
    const health = await context.dataSources.adminAPI.getSystemHealth();

    return {
      status: health.status || 'healthy',
      version: process.env.VERSION || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date(),
      services: health.services || [],
    };
  },

  version: async (_: any, __: any, _context: Context) => {
    return {
      version: process.env.VERSION || '1.0.0',
      buildDate: new Date(process.env.BUILD_DATE || Date.now()),
      environment: process.env.NODE_ENV || 'development',
      commit: process.env.GIT_COMMIT || 'unknown',
    };
  },
};

/**
 * Mutation resolvers
 */
const Mutation = {
  // ============================================================
  // Publishing Service
  // ============================================================

  createService: async (_: any, { input }: { input: any }, context: Context) => {
    requireAuth(context);

    try {
      const service = await context.dataSources.publishingAPI.createService(input);
      return service;
    } catch (error) {
      return handleMutationError(error);
    }
  },

  updateService: async (
    _: any,
    { id, input }: { id: string; input: any },
    context: Context
  ) => {
    requireAuth(context);

    try {
      const service = await context.dataSources.publishingAPI.updateService(id, input);
      return service;
    } catch (error) {
      return handleMutationError(error);
    }
  },

  deleteService: async (_: any, { id }: { id: string }, context: Context) => {
    requireAuth(context);

    try {
      await context.dataSources.publishingAPI.deleteService(id);
      return {
        success: true,
        id,
      };
    } catch (error) {
      return {
        success: false,
        id: null,
      };
    }
  },

  // ============================================================
  // Consumption Service
  // ============================================================

  trackUsage: async (
    _: any,
    { serviceId, input }: { serviceId: string; input: any },
    context: Context
  ) => {
    requireAuth(context);

    return context.dataSources.consumptionAPI.trackUsage(serviceId, input);
  },

  // ============================================================
  // Admin Service
  // ============================================================

  approveService: async (
    _: any,
    { id, notes }: { id: string; notes?: string },
    context: Context
  ) => {
    requireRole(context, 'ADMIN');

    const result = await context.dataSources.adminAPI.approveService(id, notes);

    return {
      success: true,
      service: result.service,
      message: result.message || 'Service approved successfully',
      timestamp: new Date(),
    };
  },

  rejectService: async (
    _: any,
    { id, reason }: { id: string; reason: string },
    context: Context
  ) => {
    requireRole(context, 'ADMIN');

    const result = await context.dataSources.adminAPI.rejectService(id, reason);

    return {
      success: true,
      service: result.service,
      reason,
      timestamp: new Date(),
    };
  },

  manageUser: async (
    _: any,
    { userId, action, data }: { userId: string; action: string; data?: any },
    context: Context
  ) => {
    requireRole(context, 'ADMIN');

    const result = await context.dataSources.adminAPI.manageUser({
      userId,
      action,
      data,
    });

    return {
      success: true,
      userId,
      action,
      message: result.message || `User ${action} completed`,
      timestamp: new Date(),
      data: result.data,
    };
  },
};

/**
 * Subscription resolvers
 * Note: Subscriptions are implemented using GraphQL WS
 * The actual subscription logic is handled by the WebSocket server
 */
const Subscription = {
  serviceUpdated: {
    subscribe: async (_: any, { id }: { id: string }, context: Context) => {
      requireAuth(context);

      // Subscribe to Redis pub/sub channel
      const channel = `service:${id}:updated`;

      return {
        [Symbol.asyncIterator]: async function* () {
          const subscriber = context.pubsub.duplicate();
          await subscriber.subscribe(channel);

          try {
            // Listen to message events and yield results
            const messages: any[] = [];
            subscriber.on('message', (ch: string, message: string) => {
              if (ch === channel) {
                const service = JSON.parse(message);
                messages.push({ serviceUpdated: service });
              }
            });

            // Yield messages as they arrive
            while (true) {
              if (messages.length > 0) {
                yield messages.shift();
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } finally {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          }
        },
      };
    },
  },

  serviceStatusChanged: {
    subscribe: async (_: any, { id }: { id: string }, context: Context) => {
      requireAuth(context);
      const channel = `service:${id}:status`;

      return {
        [Symbol.asyncIterator]: async function* () {
          const subscriber = context.pubsub.duplicate();
          await subscriber.subscribe(channel);

          try {
            const messages: any[] = [];
            subscriber.on('message', (ch: string, message: string) => {
              if (ch === channel) {
                const update = JSON.parse(message);
                messages.push({ serviceStatusChanged: update });
              }
            });

            while (true) {
              if (messages.length > 0) {
                yield messages.shift();
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } finally {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          }
        },
      };
    },
  },

  usageUpdated: {
    subscribe: async (_: any, { serviceId }: { serviceId: string }, context: Context) => {
      requireAuth(context);
      const channel = `service:${serviceId}:usage`;

      return {
        [Symbol.asyncIterator]: async function* () {
          const subscriber = context.pubsub.duplicate();
          await subscriber.subscribe(channel);

          try {
            const messages: any[] = [];
            subscriber.on('message', (ch: string, message: string) => {
              if (ch === channel) {
                const metrics = JSON.parse(message);
                messages.push({ usageUpdated: metrics });
              }
            });

            while (true) {
              if (messages.length > 0) {
                yield messages.shift();
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } finally {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          }
        },
      };
    },
  },

  quotaUpdated: {
    subscribe: async (_: any, { serviceId }: { serviceId: string}, context: Context) => {
      requireAuth(context);
      const channel = `service:${serviceId}:quota`;

      return {
        [Symbol.asyncIterator]: async function* () {
          const subscriber = context.pubsub.duplicate();
          await subscriber.subscribe(channel);

          try {
            const messages: any[] = [];
            subscriber.on('message', (ch: string, message: string) => {
              if (ch === channel) {
                const quota = JSON.parse(message);
                messages.push({ quotaUpdated: quota });
              }
            });

            while (true) {
              if (messages.length > 0) {
                yield messages.shift();
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } finally {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          }
        },
      };
    },
  },

  notifications: {
    subscribe: async (_: any, __: any, context: Context) => {
      requireAuth(context);
      const userId = context.user!.id;
      const channel = `user:${userId}:notifications`;

      return {
        [Symbol.asyncIterator]: async function* () {
          const subscriber = context.pubsub.duplicate();
          await subscriber.subscribe(channel);

          try {
            const messages: any[] = [];
            subscriber.on('message', (ch: string, message: string) => {
              if (ch === channel) {
                const notification = JSON.parse(message);
                messages.push({ notifications: notification });
              }
            });

            while (true) {
              if (messages.length > 0) {
                yield messages.shift();
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } finally {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          }
        },
      };
    },
  },
};

/**
 * Field resolvers for Service type
 */
const Service = {
  provider: async (parent: any, _: any, context: Context) => {
    if (parent.provider) {
      // If provider is already loaded, return it
      if (typeof parent.provider === 'object') {
        return parent.provider;
      }
      // If provider is just an ID, load it via DataLoader
      return context.loaders.providerLoader.load(parent.provider);
    }
    return null;
  },
};

/**
 * Field resolvers for Category type
 */
const Category = {
  subcategories: async (parent: any, _args: any, context: Context) => {
    if (!parent.id) return [];

    // Fetch all categories and filter for subcategories
    const categories = await context.dataSources.discoveryAPI.getCategories();
    return categories.filter((cat: any) => cat.parentId === parent.id);
  },
};

/**
 * Union type resolvers
 */
const ServiceResult = {
  __resolveType(obj: any) {
    if (obj.id && obj.name) return 'Service';
    if (obj.fields) return 'ValidationError';
    if (obj.resourceId) return 'NotFoundError';
    if (obj.requiredPermission) return 'AuthorizationError';
    return null;
  },
};

/**
 * Helper function to handle mutation errors
 */
function handleMutationError(error: any) {
  if (error.statusCode === 404) {
    return {
      __typename: 'NotFoundError',
      message: error.message,
      code: 'NOT_FOUND',
      timestamp: new Date(),
      resourceType: 'Service',
    };
  }

  if (error.statusCode === 403) {
    return {
      __typename: 'AuthorizationError',
      message: error.message,
      code: 'AUTHORIZATION_ERROR',
      timestamp: new Date(),
    };
  }

  if (error.statusCode === 400 && error.data?.fields) {
    return {
      __typename: 'ValidationError',
      message: error.message,
      code: 'VALIDATION_ERROR',
      timestamp: new Date(),
      fields: error.data.fields,
    };
  }

  throw error;
}

/**
 * Export all resolvers
 */
export const resolvers = {
  Query,
  Mutation,
  Subscription,
  Service,
  Category,
  ServiceResult,
};
