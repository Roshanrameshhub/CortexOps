import type { ApolloServerPlugin } from '@apollo/server';
import { GraphQLError } from 'graphql';
// @ts-expect-error - No type definitions available
import depthLimit from 'graphql-depth-limit';
import type { Context } from '../context';

/**
 * Maximum query depth allowed
 */
const MAX_DEPTH = 10;

/**
 * Plugin to limit query depth
 * Prevents deeply nested queries
 */
export const depthLimitPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart() {
    return {
      async didResolveOperation({ document }) {
        try {
          // Validate query depth
          const validateDepth = depthLimit(MAX_DEPTH);
          const errors = validateDepth({
            getDocument: () => document,
          } as any);

          if (errors && errors.length > 0) {
            throw new GraphQLError(
              `Query is too deep. Maximum allowed depth: ${MAX_DEPTH}`,
              {
                extensions: {
                  code: 'QUERY_TOO_DEEP',
                  maxDepth: MAX_DEPTH,
                },
              }
            );
          }
        } catch (error) {
          if (error instanceof GraphQLError) {
            throw error;
          }
          console.error('Depth limit validation error:', error);
        }
      },
    };
  },
};
