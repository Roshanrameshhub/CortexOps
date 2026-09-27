/**
 * Logger utility for Marketplace Packaging Agent
 *
 * Structured logging with correlation ID support.
 */

import { getConfig } from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  agent_id: string;
  agent_version: string;
  correlation_id?: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private correlationId?: string;

  /**
   * Set correlation ID for subsequent log entries
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Clear correlation ID
   */
  clearCorrelationId(): void {
    this.correlationId = undefined;
  }

  /**
   * Log at debug level
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log at info level
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log at warn level
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log at error level
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Log with timing information
   */
  timed(message: string, startTime: number, data?: Record<string, unknown>): void {
    this.info(message, {
      ...data,
      duration_ms: Date.now() - startTime,
    });
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const config = getConfig();

    // Check if this level should be logged
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[config.logging.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      agent_id: config.agent.id,
      agent_version: config.agent.version,
      ...data,
    };

    if (this.correlationId) {
      entry.correlation_id = this.correlationId;
    }

    const output = config.logging.format === 'json'
      ? JSON.stringify(entry)
      : this.formatPretty(entry);

    switch (level) {
      case 'debug':
      case 'info':
        console.log(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  /**
   * Format log entry for human-readable output
   */
  private formatPretty(entry: LogEntry): string {
    const { timestamp, level, message, agent_id, agent_version, correlation_id, ...rest } = entry;
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${agent_id}@${agent_version}]`;
    const suffix = correlation_id ? ` [${correlation_id}]` : '';
    const data = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
    return `${prefix}${suffix} ${message}${data}`;
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();
