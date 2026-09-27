import type { ApolloServerPlugin } from '@apollo/server';
import type { Context } from '../context';

/**
 * Plugin to implement response caching with Redis
 */
export const cachingPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart({ request, contextValue }) {
    const startTime = Date.now();
    let cacheKey: string | null = null;

    // Only cache queries, not mutations
    if (request.operationName && request.query?.includes('query')) {
      // Generate cache key from operation and variables
      cacheKey = `query:${request.operationName}:${JSON.stringify(request.variables || {})}`;

      try {
        // Try to get cached response
        const cached = await contextValue.cache.get(cacheKey);

        if (cached) {
          console.log(`Cache HIT: ${cacheKey} (${Date.now() - startTime}ms)`);

          // Return cached response
          return {
            async willSendResponse({ response }) {
              response.body = JSON.parse(cached);
              response.http = response.http || {};
              response.http.headers = response.http.headers || new Map();
              response.http.headers.set('X-Cache', 'HIT');
            },
          };
        }

        console.log(`Cache MISS: ${cacheKey}`);
      } catch (error) {
        console.error('Cache read error:', error);
      }
    }

    return {
      async willSendResponse({ response, contextValue }) {
        const duration = Date.now() - startTime;

        // Set cache header
        if (response.http) {
          response.http.headers = response.http.headers || new Map();
          response.http.headers.set('X-Cache', 'MISS');
          response.http.headers.set('X-Response-Time', `${duration}ms`);
        }

        // Cache successful query responses
        if (
          cacheKey &&
          response.body.kind === 'single' &&
          !response.body.singleResult.errors
        ) {
          try {
            // Determine cache TTL from cache hints
            const cacheHints = (contextValue as any).cacheHints || [];
            const maxAge = cacheHints.length > 0
              ? Math.min(...cacheHints.map((h: any) => h.maxAge))
              : 60; // Default 60 seconds

            // Only cache public responses
            const isPublic = cacheHints.every((h: any) => h.scope === 'PUBLIC');

            if (isPublic && maxAge > 0) {
              await contextValue.cache.setex(
                cacheKey,
                maxAge,
                JSON.stringify(response.body.singleResult)
              );

              console.log(`Cached: ${cacheKey} (TTL: ${maxAge}s)`);
            }
          } catch (error) {
            console.error('Cache write error:', error);
          }
        }
      },
    };
  },
};
