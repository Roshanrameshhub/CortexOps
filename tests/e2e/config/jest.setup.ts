import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Set global test timeout
jest.setTimeout(60000);

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting E2E test suite...');
  console.log(`📋 Test environment: ${process.env.NODE_ENV || 'test'}`);
  console.log(`🔗 Publishing Service: ${process.env.PUBLISHING_SERVICE_URL}`);
  console.log(`🔗 Discovery Service: ${process.env.DISCOVERY_SERVICE_URL}`);
  console.log(`🔗 Consumption Service: ${process.env.CONSUMPTION_SERVICE_URL}`);
  console.log(`🔗 Admin Service: ${process.env.ADMIN_SERVICE_URL}`);
});

// Global test teardown
afterAll(async () => {
  console.log('✅ E2E test suite completed');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
