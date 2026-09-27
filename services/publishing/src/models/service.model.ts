/**
 * Service Model
 * Defines the service entity and related types according to SPARC specification
 */

import { z } from 'zod';

/**
 * Service status enumeration
 */
export enum ServiceStatus {
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  SUSPENDED = 'suspended',
  RETIRED = 'retired',
}

/**
 * Service category enumeration
 */
export enum ServiceCategory {
  TEXT_GENERATION = 'text-generation',
  EMBEDDINGS = 'embeddings',
  CLASSIFICATION = 'classification',
  TRANSLATION = 'translation',
  SUMMARIZATION = 'summarization',
  QUESTION_ANSWERING = 'question-answering',
  SENTIMENT_ANALYSIS = 'sentiment-analysis',
  CODE_GENERATION = 'code-generation',
  IMAGE_GENERATION = 'image-generation',
  SPEECH_TO_TEXT = 'speech-to-text',
  TEXT_TO_SPEECH = 'text-to-speech',
  OTHER = 'other',
}

/**
 * Endpoint protocol enumeration
 */
export enum EndpointProtocol {
  REST = 'rest',
  GRPC = 'grpc',
  WEBSOCKET = 'websocket',
}

/**
 * Endpoint authentication enumeration
 */
export enum EndpointAuthentication {
  API_KEY = 'api-key',
  OAUTH2 = 'oauth2',
  JWT = 'jwt',
}

/**
 * Pricing model enumeration
 */
export enum PricingModel {
  PER_TOKEN = 'per-token',
  PER_REQUEST = 'per-request',
  SUBSCRIPTION = 'subscription',
  FREE = 'free',
}

/**
 * Support level enumeration
 */
export enum SupportLevel {
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

/**
 * Compliance level enumeration
 */
export enum ComplianceLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
}

/**
 * Provider information
 */
export interface Provider {
  id: string;
  name: string;
  verified: boolean;
}

/**
 * Service capability
 */
export interface Capability {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

/**
 * Service endpoint configuration
 */
export interface Endpoint {
  url: string;
  protocol: EndpointProtocol;
  authentication: EndpointAuthentication;
}

/**
 * Pricing tier
 */
export interface PricingTier {
  tier: string;
  rate: number;
  unit: string;
  inputRate?: number;
  outputRate?: number;
}

/**
 * Pricing configuration
 */
export interface Pricing {
  model: PricingModel;
  rates: PricingTier[];
}

/**
 * SLA configuration
 */
export interface SLA {
  availability: number; // percentage
  maxLatency: number; // milliseconds
  supportLevel: SupportLevel;
}

/**
 * Compliance configuration
 */
export interface Compliance {
  level: ComplianceLevel;
  certifications: string[];
  dataResidency: string[]; // country codes
}

/**
 * Service metadata
 */
export interface ServiceMetadata {
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  deprecatedAt: Date | null;
  suspensionReason?: string;
}

/**
 * Service entity interface (as per SPARC Section 3.3)
 */
export interface Service {
  id: string;
  registryId: string;
  name: string;
  version: string;
  description: string;
  provider: Provider;
  category: ServiceCategory;
  tags: string[];
  capabilities: Capability[];
  endpoint: Endpoint;
  pricing: Pricing;
  sla: SLA;
  compliance: Compliance;
  status: ServiceStatus;
  metadata: ServiceMetadata;
}

/**
 * Validation schemas
 */

// Capability schema
const capabilitySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  parameters: z.record(z.any()),
});

// Endpoint schema
const endpointSchema = z.object({
  url: z.string().url(),
  protocol: z.nativeEnum(EndpointProtocol),
  authentication: z.nativeEnum(EndpointAuthentication),
});

// Pricing tier schema
const pricingTierSchema = z.object({
  tier: z.string().min(1).max(50),
  rate: z.number().nonnegative(),
  unit: z.string().min(1).max(50),
  inputRate: z.number().nonnegative().optional(),
  outputRate: z.number().nonnegative().optional(),
});

// Pricing schema
const pricingSchema = z.object({
  model: z.nativeEnum(PricingModel),
  rates: z.array(pricingTierSchema).min(1),
});

// SLA schema
const slaSchema = z.object({
  availability: z.number().min(0).max(100),
  maxLatency: z.number().int().positive(),
  supportLevel: z.nativeEnum(SupportLevel),
});

// Compliance schema
const complianceSchema = z.object({
  level: z.nativeEnum(ComplianceLevel),
  certifications: z.array(z.string()),
  dataResidency: z.array(z.string().length(2)), // ISO country codes
});

/**
 * Service creation input validation schema
 */
export const createServiceSchema = z.object({
  registryId: z.string().uuid(),
  name: z.string().min(1).max(255),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/, 'Invalid semantic version'),
  description: z.string().min(1).max(5000),
  category: z.nativeEnum(ServiceCategory),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
  capabilities: z.array(capabilitySchema).min(1),
  endpoint: endpointSchema,
  pricing: pricingSchema,
  sla: slaSchema,
  compliance: complianceSchema,
});

/**
 * Service update input validation schema
 */
export const updateServiceSchema = z.object({
  description: z.string().min(1).max(5000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  capabilities: z.array(capabilitySchema).min(1).optional(),
  endpoint: endpointSchema.optional(),
  pricing: pricingSchema.optional(),
  sla: slaSchema.optional(),
  compliance: complianceSchema.optional(),
  status: z.nativeEnum(ServiceStatus).optional(),
  suspensionReason: z.string().max(500).optional(),
});

/**
 * Service search/filter parameters
 */
export interface ServiceSearchParams {
  query?: string;
  category?: ServiceCategory;
  tags?: string[];
  status?: ServiceStatus;
  providerId?: string;
  complianceLevel?: ComplianceLevel;
  minAvailability?: number;
  maxLatency?: number;
  pricingModel?: PricingModel;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'publishedAt' | 'name' | 'popularity';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Service DTO (Data Transfer Object) for API responses
 */
export interface ServiceDTO {
  id: string;
  registryId: string;
  name: string;
  version: string;
  description: string;
  provider: Provider;
  category: ServiceCategory;
  tags: string[];
  capabilities: Capability[];
  endpoint: Endpoint;
  pricing: Pricing;
  sla: SLA;
  compliance: Compliance;
  status: ServiceStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  deprecatedAt: Date | null;
}

/**
 * Convert Service to ServiceDTO
 */
export function toServiceDTO(service: Service): ServiceDTO {
  return {
    id: service.id,
    registryId: service.registryId,
    name: service.name,
    version: service.version,
    description: service.description,
    provider: service.provider,
    category: service.category,
    tags: service.tags,
    capabilities: service.capabilities,
    endpoint: service.endpoint,
    pricing: service.pricing,
    sla: service.sla,
    compliance: service.compliance,
    status: service.status,
    createdAt: service.metadata.createdAt,
    updatedAt: service.metadata.updatedAt,
    publishedAt: service.metadata.publishedAt,
    deprecatedAt: service.metadata.deprecatedAt,
  };
}

/**
 * Service status transition validation
 */
export const validStatusTransitions: Record<ServiceStatus, ServiceStatus[]> = {
  [ServiceStatus.PENDING_APPROVAL]: [ServiceStatus.ACTIVE, ServiceStatus.SUSPENDED],
  [ServiceStatus.ACTIVE]: [ServiceStatus.DEPRECATED, ServiceStatus.SUSPENDED, ServiceStatus.RETIRED],
  [ServiceStatus.DEPRECATED]: [ServiceStatus.ACTIVE, ServiceStatus.RETIRED],
  [ServiceStatus.SUSPENDED]: [ServiceStatus.ACTIVE, ServiceStatus.RETIRED],
  [ServiceStatus.RETIRED]: [], // Cannot transition from retired
};

/**
 * Validate service status transition
 */
export function isValidStatusTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return validStatusTransitions[from].includes(to);
}
