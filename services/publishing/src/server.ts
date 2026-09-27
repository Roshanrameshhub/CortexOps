/**
 * Application Entry Point
 * Initializes and starts the server
 */

import { config, isDevelopment } from './config';
import { logger } from './common/logger';
import { initializeDatabase, closeDatabase } from './common/database';
import { initializeRedis, closeRedis } from './common/redis';
import { createApp } from './app';

/**
 * Start the application
 */
async function start(): Promise<void> {
  try {
    logger.info('Starting application', {
      service: config.server.name,
      version: config.server.version,
      environment: config.server.env,
    });

    // Initialize database connection
    logger.info('Initializing database connection...');
    await initializeDatabase();

    // Initialize Redis connection
    logger.info('Initializing Redis connection...');
    await initializeRedis();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.server.port, () => {
      logger.info('Server started successfully', {
        port: config.server.port,
        apiVersion: config.server.apiVersion,
        environment: config.server.env,
      });

      if (isDevelopment()) {
        logger.info(`API Documentation available at http://localhost:${config.server.port}/api/${config.server.apiVersion}/docs`);
        logger.info(`Health check available at http://localhost:${config.server.port}/api/${config.server.apiVersion}/health`);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await closeDatabase();
          await closeRedis();

          logger.info('All connections closed. Exiting process.');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled promise rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
      });
      shutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

// Start the application
start();
