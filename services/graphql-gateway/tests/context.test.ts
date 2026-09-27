import { requireAuth, requireRole } from '../src/context';
import type { Context, User } from '../src/context';

describe('Context utilities', () => {
  const mockContext = (user?: User): Context => ({
    user,
    dataSources: {} as any,
    loaders: {} as any,
    cache: {} as any,
    pubsub: {} as any,
    req: {} as any,
    requestId: 'test-request',
    startTime: Date.now(),
  });

  describe('requireAuth', () => {
    it('should return user when authenticated', () => {
      const user: User = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'USER',
      };

      const context = mockContext(user);
      const result = requireAuth(context);

      expect(result).toEqual(user);
    });

    it('should throw when not authenticated', () => {
      const context = mockContext();

      expect(() => requireAuth(context)).toThrow('Authentication required');
    });
  });

  describe('requireRole', () => {
    it('should allow user with exact role', () => {
      const user: User = {
        id: 'user-123',
        email: 'admin@example.com',
        role: 'ADMIN',
      };

      const context = mockContext(user);
      const result = requireRole(context, 'ADMIN');

      expect(result).toEqual(user);
    });

    it('should allow user with higher role', () => {
      const user: User = {
        id: 'user-123',
        email: 'admin@example.com',
        role: 'SUPER_ADMIN',
      };

      const context = mockContext(user);
      const result = requireRole(context, 'ADMIN');

      expect(result).toEqual(user);
    });

    it('should throw when user has lower role', () => {
      const user: User = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'USER',
      };

      const context = mockContext(user);

      expect(() => requireRole(context, 'ADMIN')).toThrow('Insufficient permissions');
    });

    it('should throw when not authenticated', () => {
      const context = mockContext();

      expect(() => requireRole(context, 'USER')).toThrow('Authentication required');
    });

    it('should respect role hierarchy', () => {
      const superAdmin: User = {
        id: 'user-123',
        email: 'superadmin@example.com',
        role: 'SUPER_ADMIN',
      };

      const context = mockContext(superAdmin);

      // Super admin should pass all role checks
      expect(() => requireRole(context, 'USER')).not.toThrow();
      expect(() => requireRole(context, 'PROVIDER')).not.toThrow();
      expect(() => requireRole(context, 'ADMIN')).not.toThrow();
      expect(() => requireRole(context, 'SUPER_ADMIN')).not.toThrow();
    });
  });
});
