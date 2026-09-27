import { GraphQLScalarType, GraphQLError, Kind } from 'graphql';

/**
 * DateTime scalar - ISO 8601 date-time string
 */
const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO 8601 date-time string',

  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }
    if (typeof value === 'number') {
      return new Date(value).toISOString();
    }
    throw new GraphQLError('DateTime must be a Date, string, or number');
  },

  parseValue(value: unknown): Date {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new GraphQLError('Invalid DateTime string');
      }
      return date;
    }
    throw new GraphQLError('DateTime must be a string');
  },

  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING) {
      const date = new Date(ast.value);
      if (isNaN(date.getTime())) {
        throw new GraphQLError('Invalid DateTime string');
      }
      return date;
    }
    throw new GraphQLError('DateTime must be a string');
  },
});

/**
 * JSON scalar - arbitrary JSON value
 */
const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',

  serialize(value: unknown): unknown {
    return value;
  },

  parseValue(value: unknown): unknown {
    return value;
  },

  parseLiteral(ast): unknown {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.OBJECT:
        return ast.fields.reduce((acc, field) => {
          acc[field.name.value] = JSONScalar.parseLiteral(field.value);
          return acc;
        }, {} as Record<string, unknown>);
      case Kind.LIST:
        return ast.values.map((v) => JSONScalar.parseLiteral(v));
      case Kind.NULL:
        return null;
      default:
        throw new GraphQLError('Invalid JSON value');
    }
  },
});

/**
 * URL scalar - valid HTTP/HTTPS URL
 */
const URLScalar = new GraphQLScalarType({
  name: 'URL',
  description: 'Valid HTTP or HTTPS URL',

  serialize(value: unknown): string {
    if (typeof value !== 'string') {
      throw new GraphQLError('URL must be a string');
    }

    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Protocol must be HTTP or HTTPS');
      }
      return value;
    } catch (error) {
      throw new GraphQLError(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  parseValue(value: unknown): string {
    if (typeof value !== 'string') {
      throw new GraphQLError('URL must be a string');
    }

    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Protocol must be HTTP or HTTPS');
      }
      return value;
    } catch (error) {
      throw new GraphQLError(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  parseLiteral(ast): string {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('URL must be a string');
    }

    try {
      const url = new URL(ast.value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Protocol must be HTTP or HTTPS');
      }
      return ast.value;
    } catch (error) {
      throw new GraphQLError(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

/**
 * EmailAddress scalar - valid email format
 */
const EmailAddressScalar = new GraphQLScalarType({
  name: 'EmailAddress',
  description: 'Valid email address',

  serialize(value: unknown): string {
    if (typeof value !== 'string') {
      throw new GraphQLError('EmailAddress must be a string');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new GraphQLError('Invalid email address');
    }

    return value;
  },

  parseValue(value: unknown): string {
    if (typeof value !== 'string') {
      throw new GraphQLError('EmailAddress must be a string');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new GraphQLError('Invalid email address');
    }

    return value;
  },

  parseLiteral(ast): string {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('EmailAddress must be a string');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(ast.value)) {
      throw new GraphQLError('Invalid email address');
    }

    return ast.value;
  },
});

/**
 * PositiveInt scalar - integer > 0
 */
const PositiveIntScalar = new GraphQLScalarType({
  name: 'PositiveInt',
  description: 'Positive integer (> 0)',

  serialize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new GraphQLError('PositiveInt must be a positive integer');
    }
    return value;
  },

  parseValue(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new GraphQLError('PositiveInt must be a positive integer');
    }
    return value;
  },

  parseLiteral(ast): number {
    if (ast.kind !== Kind.INT) {
      throw new GraphQLError('PositiveInt must be an integer');
    }
    const value = parseInt(ast.value, 10);
    if (value <= 0) {
      throw new GraphQLError('PositiveInt must be greater than 0');
    }
    return value;
  },
});

/**
 * NonNegativeInt scalar - integer >= 0
 */
const NonNegativeIntScalar = new GraphQLScalarType({
  name: 'NonNegativeInt',
  description: 'Non-negative integer (>= 0)',

  serialize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new GraphQLError('NonNegativeInt must be a non-negative integer');
    }
    return value;
  },

  parseValue(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new GraphQLError('NonNegativeInt must be a non-negative integer');
    }
    return value;
  },

  parseLiteral(ast): number {
    if (ast.kind !== Kind.INT) {
      throw new GraphQLError('NonNegativeInt must be an integer');
    }
    const value = parseInt(ast.value, 10);
    if (value < 0) {
      throw new GraphQLError('NonNegativeInt must be non-negative');
    }
    return value;
  },
});

/**
 * NonNegativeFloat scalar - float >= 0
 */
const NonNegativeFloatScalar = new GraphQLScalarType({
  name: 'NonNegativeFloat',
  description: 'Non-negative float (>= 0)',

  serialize(value: unknown): number {
    if (typeof value !== 'number' || value < 0) {
      throw new GraphQLError('NonNegativeFloat must be a non-negative number');
    }
    return value;
  },

  parseValue(value: unknown): number {
    if (typeof value !== 'number' || value < 0) {
      throw new GraphQLError('NonNegativeFloat must be a non-negative number');
    }
    return value;
  },

  parseLiteral(ast): number {
    if (ast.kind !== Kind.FLOAT && ast.kind !== Kind.INT) {
      throw new GraphQLError('NonNegativeFloat must be a number');
    }
    const value = parseFloat(ast.value);
    if (value < 0) {
      throw new GraphQLError('NonNegativeFloat must be non-negative');
    }
    return value;
  },
});

/**
 * Export all custom scalars
 */
export const customScalars = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  URL: URLScalar,
  EmailAddress: EmailAddressScalar,
  PositiveInt: PositiveIntScalar,
  NonNegativeInt: NonNegativeIntScalar,
  NonNegativeFloat: NonNegativeFloatScalar,
};
