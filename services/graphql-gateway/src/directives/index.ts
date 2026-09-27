import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLSchema, GraphQLError } from 'graphql';

/**
 * Auth directive transformer
 * Requires user to be authenticated
 */
function authDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDirective = getDirective(schema, fieldConfig, 'auth')?.[0];

      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context, info) {
          if (!context.user) {
            throw new GraphQLError('Authentication required', {
              extensions: {
                code: 'UNAUTHENTICATED',
                http: { status: 401 },
              },
            });
          }

          return resolve(source, args, context, info);
        };
      }

      return fieldConfig;
    },
  });
}

/**
 * RequireRole directive transformer
 * Requires user to have specific role
 */
function requireRoleDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const requireRoleDirective = getDirective(schema, fieldConfig, 'requireRole')?.[0];

      if (requireRoleDirective) {
        const { role: requiredRole } = requireRoleDirective;
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context, info) {
          if (!context.user) {
            throw new GraphQLError('Authentication required', {
              extensions: {
                code: 'UNAUTHENTICATED',
                http: { status: 401 },
              },
            });
          }

          const roleHierarchy: Record<string, number> = {
            USER: 1,
            PROVIDER: 2,
            ADMIN: 3,
            SUPER_ADMIN: 4,
          };

          const userLevel = roleHierarchy[context.user.role] || 0;
          const requiredLevel = roleHierarchy[requiredRole] || 0;

          if (userLevel < requiredLevel) {
            throw new GraphQLError(`Insufficient permissions. Required role: ${requiredRole}`, {
              extensions: {
                code: 'FORBIDDEN',
                http: { status: 403 },
                requiredRole,
                userRole: context.user.role,
              },
            });
          }

          return resolve(source, args, context, info);
        };
      }

      return fieldConfig;
    },
  });
}

/**
 * Rate limit directive transformer
 * Limits requests per time window
 */
function rateLimitDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  // In-memory rate limit storage (use Redis in production)
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const rateLimitDirective = getDirective(schema, fieldConfig, 'rateLimit')?.[0];

      if (rateLimitDirective) {
        const { limit, window } = rateLimitDirective;
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context, info) {
          // Generate rate limit key
          const userId = context.user?.id || context.req.ip || 'anonymous';
          const fieldPath = `${info.parentType.name}.${info.fieldName}`;
          const key = `ratelimit:${userId}:${fieldPath}`;

          const now = Date.now();
          const entry = rateLimitStore.get(key);

          if (entry) {
            if (now < entry.resetAt) {
              // Within the time window
              if (entry.count >= limit) {
                const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

                throw new GraphQLError('Rate limit exceeded', {
                  extensions: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    http: { status: 429 },
                    limit,
                    window,
                    retryAfter,
                    resetAt: new Date(entry.resetAt),
                  },
                });
              }

              entry.count++;
            } else {
              // Time window expired, reset
              entry.count = 1;
              entry.resetAt = now + window * 1000;
            }
          } else {
            // First request
            rateLimitStore.set(key, {
              count: 1,
              resetAt: now + window * 1000,
            });
          }

          return resolve(source, args, context, info);
        };
      }

      return fieldConfig;
    },
  });
}

/**
 * Cache control directive transformer
 * Sets cache hints for responses
 */
function cacheControlDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const cacheDirective = getDirective(schema, fieldConfig, 'cacheControl')?.[0];

      if (cacheDirective) {
        const { maxAge, scope = 'PUBLIC' } = cacheDirective;
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context, info) {
          // Set cache hints in context for later processing
          if (!context.cacheHints) {
            context.cacheHints = [];
          }

          context.cacheHints.push({
            path: info.path,
            maxAge,
            scope,
          });

          return resolve(source, args, context, info);
        };
      }

      return fieldConfig;
    },
  });
}

/**
 * Export directive transformers in order of application
 */
export const directiveTransformers = [
  authDirectiveTransformer,
  requireRoleDirectiveTransformer,
  rateLimitDirectiveTransformer,
  cacheControlDirectiveTransformer,
];
