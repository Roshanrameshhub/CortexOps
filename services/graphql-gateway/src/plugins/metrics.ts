import type { ApolloServerPlugin } from '@apollo/server';
import type { Context } from '../context';

/**
 * Plugin to collect metrics about GraphQL operations
 */
export const metricsPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart({ request, contextValue }) {
    const startTime = Date.now();

    return {
      async willSendResponse({ response, contextValue }): Promise<void> {
        const duration = Date.now() - startTime;
        const operation = request.operationName || 'anonymous';
        const status = response.body.kind === 'single' && response.body.singleResult.errors
          ? 'error'
          : 'success';

        // Log metrics
        console.log(JSON.stringify({
          type: 'graphql_request',
          operation,
          status,
          duration,
          requestId: contextValue.requestId,
          userId: contextValue.user?.id,
          timestamp: new Date().toISOString(),
        }));

        // Store metrics in Redis for aggregation
        try {
          const metricsKey = `metrics:${new Date().toISOString().split('T')[0]}`;

          await contextValue.cache.hincrby(metricsKey, 'total_requests', 1);
          await contextValue.cache.hincrby(metricsKey, `${status}_requests`, 1);
          await contextValue.cache.hincrby(metricsKey, 'total_duration', duration);

          if (status === 'success') {
            await contextValue.cache.hincrby(metricsKey, 'successful_requests', 1);
          } else {
            await contextValue.cache.hincrby(metricsKey, 'failed_requests', 1);
          }

          // Set expiry for metrics (30 days)
          await contextValue.cache.expire(metricsKey, 30 * 24 * 60 * 60);
        } catch (error) {
          console.error('Metrics storage error:', error);
        }
      },

      async executionDidStart() {
        return {
          willResolveField({ info }) {
            const fieldStartTime = Date.now();

            return () => {
              const fieldDuration = Date.now() - fieldStartTime;

              if (fieldDuration > 100) {
                // Log slow fields
                console.warn(JSON.stringify({
                  type: 'slow_field',
                  field: `${info.parentType.name}.${info.fieldName}`,
                  duration: fieldDuration,
                  requestId: contextValue.requestId,
                }));
              }
            };
          },
        };
      },
    };
  },
};
