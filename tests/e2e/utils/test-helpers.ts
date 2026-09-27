import { v4 as uuidv4 } from 'uuid';

export interface TestUser {
  id?: string;
  email: string;
  password: string;
  role: string;
  name: string;
}

export interface TestService {
  id?: string;
  name: string;
  version: string;
  description: string;
  category: string;
  endpoint: {
    url: string;
    protocol: string;
    authentication: string;
  };
  pricing: {
    model: string;
    rates: Array<{
      tier: string;
      rate: number;
      unit: string;
    }>;
  };
  sla: {
    availability: number;
    maxLatency: number;
    supportLevel: string;
  };
  compliance: {
    level: string;
    certifications: string[];
    dataResidency: string[];
  };
}

export class TestDataGenerator {
  static generateTestUser(role: string = 'consumer'): TestUser {
    const id = uuidv4();
    return {
      email: `test-${role}-${id.slice(0, 8)}@test.local`,
      password: `Test${role}123!`,
      role,
      name: `Test ${role} ${id.slice(0, 8)}`,
    };
  }

  static generateTestService(overrides?: Partial<TestService>): TestService {
    const id = uuidv4().slice(0, 8);
    return {
      name: `Test Service ${id}`,
      version: '1.0.0',
      description: `Test service for E2E testing - ${id}`,
      category: 'text-generation',
      endpoint: {
        url: `https://api.test-service-${id}.example.com/v1`,
        protocol: 'rest',
        authentication: 'api-key',
      },
      pricing: {
        model: 'per-token',
        rates: [
          {
            tier: 'standard',
            rate: 0.02,
            unit: '1k tokens',
          },
        ],
      },
      sla: {
        availability: 99.9,
        maxLatency: 500,
        supportLevel: 'basic',
      },
      compliance: {
        level: 'public',
        certifications: [],
        dataResidency: ['US'],
      },
      ...overrides,
    };
  }

  static generateConfidentialService(): TestService {
    return this.generateTestService({
      compliance: {
        level: 'confidential',
        certifications: ['SOC2', 'ISO27001'],
        dataResidency: ['US', 'EU'],
      },
      sla: {
        availability: 99.95,
        maxLatency: 200,
        supportLevel: 'enterprise',
      },
    });
  }

  static generateInvalidService(): TestService {
    return this.generateTestService({
      endpoint: {
        url: 'http://insecure.example.com', // HTTP instead of HTTPS
        protocol: 'rest',
        authentication: '',
      },
      compliance: {
        level: 'public',
        certifications: [],
        dataResidency: [], // Missing data residency
      },
    });
  }
}

export class WaitHelper {
  static async waitForCondition(
    condition: () => Promise<boolean>,
    timeout: number = 30000,
    interval: number = 1000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.sleep(interval);
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static async waitForService(
    healthCheck: () => Promise<boolean>,
    serviceName: string,
    timeout: number = 60000
  ): Promise<void> {
    console.log(`⏳ Waiting for ${serviceName} to be ready...`);

    await this.waitForCondition(healthCheck, timeout, 2000);

    console.log(`✅ ${serviceName} is ready`);
  }

  static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async retry<T>(
    fn: () => Promise<T>,
    attempts: number = 3,
    delay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) {
          throw error;
        }
        console.log(`Retry attempt ${i + 1}/${attempts} after error:`, error);
        await this.sleep(delay * (i + 1)); // Exponential backoff
      }
    }
    throw new Error('Max retries exceeded');
  }
}

export class AssertionHelper {
  static assertValidUUID(value: string, message?: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(value).toMatch(uuidRegex);
    if (message) {
      console.log(`✓ ${message}: ${value}`);
    }
  }

  static assertValidTimestamp(value: string, message?: string): void {
    const date = new Date(value);
    expect(date.toString()).not.toBe('Invalid Date');
    if (message) {
      console.log(`✓ ${message}: ${value}`);
    }
  }

  static assertResponseTime(startTime: number, maxMs: number, operation: string): void {
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(maxMs);
    console.log(`✓ ${operation} completed in ${duration}ms (max: ${maxMs}ms)`);
  }

  static assertServiceCompliant(service: any, expectedCompliant: boolean = true): void {
    if (expectedCompliant) {
      expect(service.status).not.toBe('failed_validation');
      expect(service.policyValidation?.compliant).toBe(true);
      console.log(`✓ Service is compliant`);
    } else {
      expect(service.status).toBe('failed_validation');
      expect(service.policyValidation?.compliant).toBe(false);
      console.log(`✓ Service correctly identified as non-compliant`);
    }
  }

  static assertNoErrors(response: any): void {
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(response.data.error).toBeUndefined();
  }
}

export class CleanupHelper {
  private static cleanupTasks: Array<() => Promise<void>> = [];

  static registerCleanup(task: () => Promise<void>): void {
    this.cleanupTasks.push(task);
  }

  static async cleanup(): Promise<void> {
    console.log(`🧹 Running ${this.cleanupTasks.length} cleanup tasks...`);

    for (const task of this.cleanupTasks.reverse()) {
      try {
        await task();
      } catch (error) {
        console.error('Cleanup task failed:', error);
      }
    }

    this.cleanupTasks = [];
    console.log('✅ Cleanup completed');
  }

  static reset(): void {
    this.cleanupTasks = [];
  }
}

export class Logger {
  private static indent = 0;

  static testSuite(name: string): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST SUITE: ${name}`);
    console.log(`${'='.repeat(60)}\n`);
  }

  static testCase(name: string): void {
    console.log(`\n${'  '.repeat(this.indent)}📝 ${name}`);
    this.indent++;
  }

  static step(message: string): void {
    console.log(`${'  '.repeat(this.indent)}→ ${message}`);
  }

  static success(message: string): void {
    console.log(`${'  '.repeat(this.indent)}✅ ${message}`);
  }

  static error(message: string, error?: any): void {
    console.log(`${'  '.repeat(this.indent)}❌ ${message}`);
    if (error) {
      console.error(error);
    }
  }

  static endTest(): void {
    this.indent = Math.max(0, this.indent - 1);
  }
}
