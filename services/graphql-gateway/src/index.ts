import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import http from 'http';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// Import resolvers
import { resolvers } from './resolvers';
import { customScalars } from './resolvers/scalars';

// Import directives
import { directiveTransformers } from './directives';

// Import context
import { createContext, type Context } from './context';

// Import plugins
import { complexityPlugin } from './plugins/complexity';
import { depthLimitPlugin } from './plugins/depthLimit';
import { cachingPlugin } from './plugins/caching';
import { metricsPlugin } from './plugins/metrics';

/**
 * Load GraphQL schema files
 */
function loadSchema(): string {
  const schemaDir = path.join(__dirname, 'schema');

  function loadSchemaFile(filepath: string): string {
    const content = fs.readFileSync(filepath, 'utf-8');

    // Process #import directives
    const importRegex = /#import\s+(.+)/g;
    return content.replace(importRegex, (_, importPath) => {
      const importFile = path.join(schemaDir, importPath.trim());
      return loadSchemaFile(importFile);
    });
  }

  return loadSchemaFile(path.join(schemaDir, 'schema.graphql'));
}

/**
 * Create Redis clients for caching and pub/sub
 */
function createRedisClients() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const cache = new Redis(redisUrl, {
    keyPrefix: 'gql:cache:',
    lazyConnect: true,
  });

  const pubsub = new Redis(redisUrl, {
    lazyConnect: true,
  });

  return { cache, pubsub };
}

/**
 * Main server initialization
 */
async function startServer() {
  try {
    // Load environment variables
    const PORT = parseInt(process.env.PORT || '4000', 10);
    const NODE_ENV = process.env.NODE_ENV || 'development';

    console.log('Starting GraphQL Gateway...');
    console.log(`Environment: ${NODE_ENV}`);

    // Initialize Redis
    const { cache, pubsub } = createRedisClients();
    await cache.connect();
    await pubsub.connect();
    console.log('✓ Redis connected');

    // Load schema
    const typeDefs = loadSchema();
    console.log('✓ Schema loaded');

    // Merge resolvers
    const mergedResolvers = {
      ...customScalars,
      ...resolvers,
    };

    // Create executable schema
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: mergedResolvers,
    });

    // Apply directive transformers
    schema = directiveTransformers.reduce(
      (currentSchema, transformer) => transformer(currentSchema),
      schema
    );
    console.log('✓ Schema compiled');

    // Create HTTP server
    const httpServer = http.createServer();

    // Create WebSocket server for subscriptions
    const wsServer = new WebSocketServer({
      server: httpServer,
      path: '/graphql',
    });

    // Setup GraphQL WS
    const serverCleanup = useServer(
      {
        schema,
        context: async (ctx) => {
          // Extract token from connection params
          const token = ctx.connectionParams?.authorization as string;
          return createContext({ req: { headers: { authorization: token } } as any, cache, pubsub });
        },
      },
      wsServer
    );

    console.log('✓ WebSocket server configured');

    // Create Apollo Server
    const server = new ApolloServer<Context>({
      schema,
      plugins: [
        // Drain HTTP server on shutdown
        ApolloServerPluginDrainHttpServer({ httpServer }),

        // Drain WebSocket server on shutdown
        {
          async serverWillStart() {
            return {
              async drainServer() {
                await serverCleanup.dispose();
              },
            };
          },
        },

        // Landing page in development
        NODE_ENV === 'development'
          ? ApolloServerPluginLandingPageLocalDefault({ embed: true })
          : ApolloServerPluginLandingPageLocalDefault({ embed: false }),

        // Custom plugins
        complexityPlugin,
        depthLimitPlugin,
        cachingPlugin,
        metricsPlugin,
      ],
      introspection: NODE_ENV !== 'production',
      includeStacktraceInErrorResponses: NODE_ENV !== 'production',
    });

    // Start Apollo Server
    await server.start();
    console.log('✓ Apollo Server started');

    // Note: HTTP request handling is managed by standalone Apollo Server
    // WebSocket handling is managed by GraphQL WS

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log('');
      console.log('🚀 GraphQL Gateway is running!');
      console.log('');
      console.log(`📍 Query endpoint:        http://localhost:${PORT}/graphql`);
      console.log(`📍 Subscription endpoint: ws://localhost:${PORT}/graphql`);
      console.log('');
      console.log(`Environment: ${NODE_ENV}`);
      console.log(`Introspection: ${NODE_ENV !== 'production' ? 'enabled' : 'disabled'}`);
      console.log('');
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down gracefully...');

      await server.stop();
      httpServer.close();
      await cache.quit();
      await pubsub.quit();

      console.log('✓ Server stopped');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export { startServer };
