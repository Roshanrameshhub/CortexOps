/**
 * Type definitions for the Publishing Service
 */

export interface ServiceProvider {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  createdAt: Date;
}

export enum ServiceStatus {
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  SUSPENDED = 'suspended',
  RETIRED = 'retired',
  FAILED_VALIDATION = 'failed_validation'
}

export enum ServiceCategory {
  TEXT_GENERATION = 'text-generation',
  EMBEDDINGS = 'embeddings',
  CLASSIFICATION = 'classification',
  SUMMARIZATION = 'summarization',
  TRANSLATION = 'translation',
  QUESTION_ANSWERING = 'question-answering',
  CODE_GENERATION = 'code-generation',
  IMAGE_GENERATION = 'image-generation',
  SPEECH_TO_TEXT = 'speech-to-text',
  TEXT_TO_SPEECH = 'text-to-speech'
}

export enum ProtocolType {
  REST = 'rest',
  GRPC = 'grpc',
  WEBSOCKET = 'websocket'
}

export enum AuthenticationType {
  API_KEY = 'api-key',
  OAUTH2 = 'oauth2',
  JWT = 'jwt'
}

export enum PricingModel {
  PER_TOKEN = 'per-token',
  PER_REQUEST = 'per-request',
  SUBSCRIPTION = 'subscription',
  FREE = 'free'
}

export enum SupportLevel {
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

export enum ComplianceLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted'
}

export interface ServiceCapability {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ServiceEndpoint {
  url: string;
  protocol: ProtocolType;
  authentication: AuthenticationType;
}

export interface PricingTier {
  tier: string;
  rate: number;
  unit: string;
  description?: string;
}

export interface ServicePricing {
  model: PricingModel;
  rates: PricingTier[];
  currency?: string;
}

export interface ServiceSLA {
  availability: number;
  maxLatency: number;
  supportLevel: SupportLevel;
  responseTime?: string;
}

export interface ServiceCompliance {
  level: ComplianceLevel;
  certifications: string[];
  dataResidency: string[];
  gdprCompliant?: boolean;
  hipaaCompliant?: boolean;
}

export interface ServiceMetadata {
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  deprecatedAt?: Date;
  suspensionReason?: string;
  tags?: string[];
  documentation?: string;
  exampleUsage?: string;
}

export interface Service {
  id: string;
  registryId: string;
  name: string;
  version: string;
  description: string;
  providerId: string;
  category: ServiceCategory;
  capabilities: ServiceCapability[];
  endpoint: ServiceEndpoint;
  pricing: ServicePricing;
  sla: ServiceSLA;
  compliance: ServiceCompliance;
  status: ServiceStatus;
  metadata: ServiceMetadata;
  openApiSpec?: Record<string, unknown>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export interface PolicyValidationResult {
  compliant: boolean;
  violations: PolicyViolation[];
  policyVersion: string;
  validatedAt: Date;
}

export interface PolicyViolation {
  policy: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  remediation?: string;
}

export interface TestResult {
  passed: boolean;
  total: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface SecurityScanResult {
  passed: boolean;
  vulnerabilities: Vulnerability[];
  scanTime: Date;
  scanner: string;
}

export interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  cve?: string;
  remediation?: string;
}

export interface PerformanceBenchmark {
  passed: boolean;
  metrics: BenchmarkMetric[];
  benchmarkedAt: Date;
}

export interface BenchmarkMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
  passed: boolean;
}

export interface PublishingWorkflowContext {
  serviceId: string;
  providerId: string;
  serviceSpec: Partial<Service>;
  validationResult?: ValidationResult;
  policyResult?: PolicyValidationResult;
  testResult?: TestResult;
  securityResult?: SecurityScanResult;
  benchmarkResult?: PerformanceBenchmark;
  approvalRequired: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  registryId?: string;
  startTime: Date;
  endTime?: Date;
}

export interface WebhookPayload {
  event: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface AnalyticsEvent {
  eventType: string;
  timestamp: Date;
  serviceId?: string;
  providerId?: string;
  userId?: string;
  metadata: Record<string, unknown>;
}
