/**
 * @llm-marketplace/infra - Tracing Module
 *
 * Provides distributed tracing with OpenTelemetry for LLM-Dev-Ops services.
 * Supports Jaeger export and automatic context propagation.
 */

import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  Span,
  Tracer,
  Context,
  propagation,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getLogger } from '../logging';

/**
 * Tracing configuration
 */
export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  jaegerEndpoint?: string;
  sampleRate?: number;
  enabled?: boolean;
}

/**
 * Span attributes for common operations
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * HTTP span attributes
 */
export interface HttpSpanAttributes extends SpanAttributes {
  'http.method': string;
  'http.url': string;
  'http.status_code'?: number;
  'http.request_content_length'?: number;
  'http.response_content_length'?: number;
}

/**
 * Database span attributes
 */
export interface DbSpanAttributes extends SpanAttributes {
  'db.system': string;
  'db.name'?: string;
  'db.operation': string;
  'db.statement'?: string;
}

/**
 * Cache span attributes
 */
export interface CacheSpanAttributes extends SpanAttributes {
  'cache.type': string;
  'cache.operation': string;
  'cache.key': string;
  'cache.hit'?: boolean;
}

let provider: NodeTracerProvider | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry tracing
 */
export function initTracing(config: TracingConfig): Tracer | null {
  if (!config.enabled) {
    getLogger().info('Tracing is disabled');
    return null;
  }

  if (isInitialized) {
    getLogger().warn('Tracing already initialized');
    return trace.getTracer(config.serviceName);
  }

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion ?? '1.0.0',
  });

  provider = new NodeTracerProvider({
    resource,
  });

  // Configure Jaeger exporter if endpoint is provided
  if (config.jaegerEndpoint) {
    const jaegerExporter = new JaegerExporter({
      endpoint: config.jaegerEndpoint,
    });

    provider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));
    getLogger().info(`Tracing initialized with Jaeger endpoint: ${config.jaegerEndpoint}`);
  } else {
    getLogger().info('Tracing initialized without exporter (local only)');
  }

  provider.register();
  isInitialized = true;

  return trace.getTracer(config.serviceName);
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = null;
    isInitialized = false;
    getLogger().info('Tracing shutdown complete');
  }
}

/**
 * Get a tracer instance
 */
export function getTracer(name?: string): Tracer {
  return trace.getTracer(name ?? 'llm-dev-ops');
}

/**
 * Create a span and execute a function within it
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: SpanAttributes;
    parentContext?: Context;
  }
): Promise<T> {
  const tracer = getTracer();
  const parentCtx = options?.parentContext ?? context.active();

  return tracer.startActiveSpan(
    name,
    {
      kind: options?.kind ?? SpanKind.INTERNAL,
      attributes: options?.attributes,
    },
    parentCtx,
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Create a span for HTTP client operations
 */
export async function withHttpSpan<T>(
  method: string,
  url: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes: HttpSpanAttributes = {
    'http.method': method.toUpperCase(),
    'http.url': url,
  };

  return withSpan(`HTTP ${method.toUpperCase()} ${new URL(url).pathname}`, fn, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

/**
 * Create a span for database operations
 */
export async function withDbSpan<T>(
  system: string,
  operation: string,
  fn: (span: Span) => Promise<T>,
  options?: { dbName?: string; statement?: string }
): Promise<T> {
  const attributes: DbSpanAttributes = {
    'db.system': system,
    'db.operation': operation,
    'db.name': options?.dbName,
    'db.statement': options?.statement,
  };

  return withSpan(`${system} ${operation}`, fn, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

/**
 * Create a span for cache operations
 */
export async function withCacheSpan<T>(
  cacheType: string,
  operation: string,
  key: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes: CacheSpanAttributes = {
    'cache.type': cacheType,
    'cache.operation': operation,
    'cache.key': key,
  };

  return withSpan(`cache ${operation}`, fn, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

/**
 * Extract trace context from incoming HTTP headers
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>
): Context {
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  return propagation.extract(context.active(), normalizedHeaders);
}

/**
 * Inject trace context into outgoing HTTP headers
 */
export function injectTraceContext(headers: Record<string, string>): void {
  propagation.inject(context.active(), headers);
}

/**
 * Get current trace ID
 */
export function getTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext().traceId;
}

/**
 * Get current span ID
 */
export function getSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext().spanId;
}

/**
 * Add an event to the current span
 */
export function addSpanEvent(name: string, attributes?: SpanAttributes): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set an attribute on the current span
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Record an exception on the current span
 */
export function recordSpanException(error: Error): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

/**
 * Tracing middleware for Express/Fastify
 */
export function createTracingMiddleware(serviceName: string) {
  const tracer = getTracer(serviceName);

  return async (
    req: { method: string; url: string; headers: Record<string, string | string[] | undefined> },
    _res: unknown,
    next: () => void
  ) => {
    const parentContext = extractTraceContext(req.headers);
    const span = tracer.startSpan(
      `${req.method} ${req.url}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
        },
      },
      parentContext
    );

    context.with(trace.setSpan(parentContext, span), () => {
      next();
    });
  };
}

// Re-export OpenTelemetry types for convenience
export { SpanKind, SpanStatusCode, Span, Tracer, Context };
