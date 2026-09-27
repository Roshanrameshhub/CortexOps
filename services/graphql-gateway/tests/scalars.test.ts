import { customScalars } from '../src/resolvers/scalars';
import { GraphQLError } from 'graphql';

describe('Custom Scalars', () => {
  describe('DateTime', () => {
    it('should serialize Date to ISO string', () => {
      const date = new Date('2025-01-19T10:30:00.000Z');
      const result = customScalars.DateTime.serialize(date);
      expect(result).toBe('2025-01-19T10:30:00.000Z');
    });

    it('should serialize string to ISO string', () => {
      const result = customScalars.DateTime.serialize('2025-01-19T10:30:00.000Z');
      expect(result).toBe('2025-01-19T10:30:00.000Z');
    });

    it('should parse valid ISO string', () => {
      const result = customScalars.DateTime.parseValue('2025-01-19T10:30:00.000Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2025-01-19T10:30:00.000Z');
    });

    it('should throw on invalid date string', () => {
      expect(() => customScalars.DateTime.parseValue('invalid')).toThrow(GraphQLError);
    });
  });

  describe('URL', () => {
    it('should validate valid HTTP URL', () => {
      const url = 'http://example.com';
      const result = customScalars.URL.serialize(url);
      expect(result).toBe(url);
    });

    it('should validate valid HTTPS URL', () => {
      const url = 'https://example.com/path?query=value';
      const result = customScalars.URL.serialize(url);
      expect(result).toBe(url);
    });

    it('should throw on invalid URL', () => {
      expect(() => customScalars.URL.serialize('not-a-url')).toThrow(GraphQLError);
    });

    it('should throw on FTP URL', () => {
      expect(() => customScalars.URL.serialize('ftp://example.com')).toThrow(GraphQLError);
    });
  });

  describe('EmailAddress', () => {
    it('should validate valid email', () => {
      const email = 'user@example.com';
      const result = customScalars.EmailAddress.serialize(email);
      expect(result).toBe(email);
    });

    it('should validate email with subdomain', () => {
      const email = 'user@mail.example.com';
      const result = customScalars.EmailAddress.serialize(email);
      expect(result).toBe(email);
    });

    it('should throw on invalid email', () => {
      expect(() => customScalars.EmailAddress.serialize('not-an-email')).toThrow(GraphQLError);
    });

    it('should throw on email without domain', () => {
      expect(() => customScalars.EmailAddress.serialize('user@')).toThrow(GraphQLError);
    });
  });

  describe('PositiveInt', () => {
    it('should validate positive integer', () => {
      const result = customScalars.PositiveInt.serialize(42);
      expect(result).toBe(42);
    });

    it('should throw on zero', () => {
      expect(() => customScalars.PositiveInt.serialize(0)).toThrow(GraphQLError);
    });

    it('should throw on negative integer', () => {
      expect(() => customScalars.PositiveInt.serialize(-5)).toThrow(GraphQLError);
    });

    it('should throw on float', () => {
      expect(() => customScalars.PositiveInt.serialize(3.14)).toThrow(GraphQLError);
    });
  });

  describe('NonNegativeInt', () => {
    it('should validate zero', () => {
      const result = customScalars.NonNegativeInt.serialize(0);
      expect(result).toBe(0);
    });

    it('should validate positive integer', () => {
      const result = customScalars.NonNegativeInt.serialize(42);
      expect(result).toBe(42);
    });

    it('should throw on negative integer', () => {
      expect(() => customScalars.NonNegativeInt.serialize(-1)).toThrow(GraphQLError);
    });
  });

  describe('NonNegativeFloat', () => {
    it('should validate zero', () => {
      const result = customScalars.NonNegativeFloat.serialize(0.0);
      expect(result).toBe(0.0);
    });

    it('should validate positive float', () => {
      const result = customScalars.NonNegativeFloat.serialize(3.14);
      expect(result).toBe(3.14);
    });

    it('should validate positive integer', () => {
      const result = customScalars.NonNegativeFloat.serialize(42);
      expect(result).toBe(42);
    });

    it('should throw on negative float', () => {
      expect(() => customScalars.NonNegativeFloat.serialize(-3.14)).toThrow(GraphQLError);
    });
  });

  describe('JSON', () => {
    it('should serialize object', () => {
      const obj = { key: 'value', nested: { data: 123 } };
      const result = customScalars.JSON.serialize(obj);
      expect(result).toEqual(obj);
    });

    it('should serialize array', () => {
      const arr = [1, 2, 3, 'four'];
      const result = customScalars.JSON.serialize(arr);
      expect(result).toEqual(arr);
    });

    it('should serialize null', () => {
      const result = customScalars.JSON.serialize(null);
      expect(result).toBeNull();
    });

    it('should parse value as-is', () => {
      const obj = { test: true };
      const result = customScalars.JSON.parseValue(obj);
      expect(result).toEqual(obj);
    });
  });
});
