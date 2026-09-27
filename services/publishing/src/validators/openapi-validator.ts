import { ValidationResult, ValidationError, ValidationWarning } from '../types';
import { logger } from '../utils/logger';

/**
 * Validates OpenAPI 3.1 specification
 */
export class OpenAPIValidator {
  private readonly strictMode: boolean;

  constructor(strictMode: boolean = true) {
    this.strictMode = strictMode;
  }

  async validate(spec: Record<string, unknown>): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Check OpenAPI version
      if (!spec.openapi || typeof spec.openapi !== 'string') {
        errors.push({
          field: 'openapi',
          message: 'OpenAPI version is required',
          code: 'MISSING_OPENAPI_VERSION',
        });
      } else if (!spec.openapi.startsWith('3.1')) {
        errors.push({
          field: 'openapi',
          message: 'OpenAPI version must be 3.1.x',
          code: 'INVALID_OPENAPI_VERSION',
        });
      }

      // Validate info section
      this.validateInfo(spec.info, errors, warnings);

      // Validate paths
      this.validatePaths(spec.paths, errors, warnings);

      // Validate components
      if (spec.components) {
        this.validateComponents(spec.components, errors, warnings);
      }

      // Validate servers
      if (spec.servers) {
        this.validateServers(spec.servers, errors, warnings);
      }

      // Validate security
      if (spec.security) {
        this.validateSecurity(spec.security, errors, warnings);
      }

      logger.info('OpenAPI validation completed', {
        errors: errors.length,
        warnings: warnings.length,
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error('OpenAPI validation failed', { error });
      errors.push({
        field: 'root',
        message: `Validation error: ${(error as Error).message}`,
        code: 'VALIDATION_ERROR',
      });

      return {
        isValid: false,
        errors,
        warnings,
      };
    }
  }

  private validateInfo(
    info: unknown,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!info || typeof info !== 'object') {
      errors.push({
        field: 'info',
        message: 'Info section is required',
        code: 'MISSING_INFO',
      });
      return;
    }

    const infoObj = info as Record<string, unknown>;

    if (!infoObj.title) {
      errors.push({
        field: 'info.title',
        message: 'Title is required',
        code: 'MISSING_TITLE',
      });
    }

    if (!infoObj.version) {
      errors.push({
        field: 'info.version',
        message: 'Version is required',
        code: 'MISSING_VERSION',
      });
    }

    if (!infoObj.description && this.strictMode) {
      warnings.push({
        field: 'info.description',
        message: 'Description is recommended',
        code: 'MISSING_DESCRIPTION',
      });
    }

    if (!infoObj.contact && this.strictMode) {
      warnings.push({
        field: 'info.contact',
        message: 'Contact information is recommended',
        code: 'MISSING_CONTACT',
      });
    }
  }

  private validatePaths(
    paths: unknown,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!paths || typeof paths !== 'object') {
      errors.push({
        field: 'paths',
        message: 'Paths section is required',
        code: 'MISSING_PATHS',
      });
      return;
    }

    const pathsObj = paths as Record<string, unknown>;
    const pathKeys = Object.keys(pathsObj);

    if (pathKeys.length === 0) {
      errors.push({
        field: 'paths',
        message: 'At least one path must be defined',
        code: 'EMPTY_PATHS',
      });
      return;
    }

    for (const path of pathKeys) {
      if (!path.startsWith('/')) {
        errors.push({
          field: `paths.${path}`,
          message: 'Path must start with /',
          code: 'INVALID_PATH_FORMAT',
        });
      }

      const pathItem = pathsObj[path];
      if (typeof pathItem !== 'object' || pathItem === null) {
        errors.push({
          field: `paths.${path}`,
          message: 'Path item must be an object',
          code: 'INVALID_PATH_ITEM',
        });
        continue;
      }

      this.validatePathItem(path, pathItem as Record<string, unknown>, errors, warnings);
    }
  }

  private validatePathItem(
    path: string,
    pathItem: Record<string, unknown>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];
    const definedMethods = methods.filter((method) => pathItem[method]);

    if (definedMethods.length === 0) {
      errors.push({
        field: `paths.${path}`,
        message: 'At least one HTTP method must be defined',
        code: 'NO_METHODS_DEFINED',
      });
    }

    for (const method of definedMethods) {
      const operation = pathItem[method];
      if (typeof operation !== 'object' || operation === null) {
        errors.push({
          field: `paths.${path}.${method}`,
          message: 'Operation must be an object',
          code: 'INVALID_OPERATION',
        });
        continue;
      }

      this.validateOperation(
        `${path}.${method}`,
        operation as Record<string, unknown>,
        errors,
        warnings
      );
    }
  }

  private validateOperation(
    location: string,
    operation: Record<string, unknown>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!operation.responses) {
      errors.push({
        field: `paths.${location}.responses`,
        message: 'Responses are required',
        code: 'MISSING_RESPONSES',
      });
    }

    if (!operation.operationId && this.strictMode) {
      warnings.push({
        field: `paths.${location}.operationId`,
        message: 'Operation ID is recommended',
        code: 'MISSING_OPERATION_ID',
      });
    }

    if (!operation.summary && !operation.description && this.strictMode) {
      warnings.push({
        field: `paths.${location}`,
        message: 'Summary or description is recommended',
        code: 'MISSING_DOCUMENTATION',
      });
    }
  }

  private validateComponents(
    components: unknown,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (typeof components !== 'object' || components === null) {
      errors.push({
        field: 'components',
        message: 'Components must be an object',
        code: 'INVALID_COMPONENTS',
      });
      return;
    }

    const componentsObj = components as Record<string, unknown>;

    if (componentsObj.schemas && this.strictMode) {
      const schemas = componentsObj.schemas as Record<string, unknown>;
      if (Object.keys(schemas).length === 0) {
        warnings.push({
          field: 'components.schemas',
          message: 'Schema definitions are recommended',
          code: 'NO_SCHEMAS',
        });
      }
    }
  }

  private validateServers(
    servers: unknown,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!Array.isArray(servers)) {
      errors.push({
        field: 'servers',
        message: 'Servers must be an array',
        code: 'INVALID_SERVERS',
      });
      return;
    }

    if (servers.length === 0 && this.strictMode) {
      warnings.push({
        field: 'servers',
        message: 'At least one server should be defined',
        code: 'NO_SERVERS',
      });
    }

    servers.forEach((server, index) => {
      if (!server || typeof server !== 'object') {
        errors.push({
          field: `servers[${index}]`,
          message: 'Server must be an object',
          code: 'INVALID_SERVER',
        });
        return;
      }

      const serverObj = server as Record<string, unknown>;
      if (!serverObj.url) {
        errors.push({
          field: `servers[${index}].url`,
          message: 'Server URL is required',
          code: 'MISSING_SERVER_URL',
        });
      }
    });
  }

  private validateSecurity(
    security: unknown,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!Array.isArray(security)) {
      errors.push({
        field: 'security',
        message: 'Security must be an array',
        code: 'INVALID_SECURITY',
      });
      return;
    }

    if (security.length === 0 && this.strictMode) {
      warnings.push({
        field: 'security',
        message: 'Security requirements should be defined',
        code: 'NO_SECURITY',
      });
    }
  }
}
