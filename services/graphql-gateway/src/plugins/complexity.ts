import type { ApolloServerPlugin } from '@apollo/server';
import { GraphQLError } from 'graphql';
import {
  getComplexity,
  simpleEstimator,
  fieldExtensionsEstimator,
} from 'graphql-query-complexity';
import type { Context } from '../context';

/**
 * Maximum query complexity allowed
 */
const MAX_COMPLEXITY = 1000;

/**
 * Plugin to limit query complexity
 * Prevents expensive queries that could DoS the server
 */
export const complexityPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart() {
    return {
      async didResolveOperation({ request, document, schema }) {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [
            fieldExtensionsEstimator(),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });

        if (complexity > MAX_COMPLEXITY) {
          throw new GraphQLError(
            `Query is too complex: ${complexity}. Maximum allowed complexity: ${MAX_COMPLEXITY}`,
            {
              extensions: {
                code: 'QUERY_TOO_COMPLEX',
                complexity,
                maxComplexity: MAX_COMPLEXITY,
              },
            }
          );
        }

        console.log(`Query complexity: ${complexity}`);
      },
    };
  },
};
