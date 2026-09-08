import type {
  Configuration,
  ConfigurationValue,
} from "../core/configuration.js";

import { normalizeConfigurationPath } from "../core/configurationPath.path.js";

/**
 * Result returned by a configuration schema validator.
 */
export interface ConfigurationValidationResult<T> {
  /**
   * Whether validation succeeded.
   */
  readonly success: boolean;

  /**
   * Validated and potentially transformed value.
   */
  readonly value?: T;

  /**
   * Validation errors.
   */
  readonly errors: readonly ConfigurationValidationIssue[];
}

/**
 * Represents one configuration validation issue.
 */
export interface ConfigurationValidationIssue {
  /**
   * Configuration path where the error occurred.
   */
  readonly path: string;

  /**
   * Human-readable error message.
   */
  readonly message: string;

  /**
   * Optional validation error code.
   */
  readonly code?: string;

  /**
   * Value that failed validation.
   */
  readonly value?: unknown;
}

/**
 * Context supplied to configuration validators.
 */
export interface ConfigurationValidationContext {
  /**
   * Configuration being validated.
   */
  readonly configuration: Configuration;

  /**
   * Current configuration path.
   */
  readonly path: string;
}

/**
 * Function capable of validating a configuration value.
 */
export type ConfigurationValidator<T> = (
  value: T,
  context: ConfigurationValidationContext,
) =>
  ConfigurationValidationResult<T> | Promise<ConfigurationValidationResult<T>>;

/**
 * Options used to create a configuration schema.
 */
export interface ConfigurationSchemaOptions<T> {
  /**
   * Configuration path represented by the schema.
   */
  readonly path: string;

  /**
   * Whether the configuration value is required.
   *
   * Defaults to true.
   */
  readonly required?: boolean;

  /**
   * Optional default value.
   */
  readonly defaultValue?: T;

  /**
   * Optional custom validator.
   */
  readonly validator?: ConfigurationValidator<T>;

  /**
   * Optional description.
   */
  readonly description?: string;
}

/**
 * Schema describing and validating one configuration value.
 */
export interface ConfigurationSchema<T = ConfigurationValue> {
  /**
   * Configuration path.
   */
  readonly path: string;

  /**
   * Whether the value must exist.
   */
  readonly required: boolean;

  /**
   * Default value.
   */
  readonly defaultValue?: T;

  /**
   * Human-readable description.
   */
  readonly description?: string;

  /**
   * Validates the configuration value.
   */
  validate(
    configuration: Configuration,
  ): Promise<ConfigurationValidationResult<T>>;
}

/**
 * Creates a configuration schema.
 */
export function createConfigurationSchema<T = ConfigurationValue>(
  options: ConfigurationSchemaOptions<T>,
): ConfigurationSchema<T> {
  const path = normalizeConfigurationPath(options.path);

  if (!path) {
    throw new Error("Configuration schema path cannot be empty.");
  }

  const required = options.required ?? true;

  return Object.freeze({
    path,
    required,
    defaultValue: options.defaultValue,
    description: options.description,

    async validate(
      configuration: Configuration,
    ): Promise<ConfigurationValidationResult<T>> {
      const exists = configuration.has(path);

      if (!exists) {
        if (options.defaultValue !== undefined) {
          /*
           * Defaults are validated too, so an invalid default
           * cannot silently pass validation.
           */
          if (options.validator) {
            return options.validator(options.defaultValue, {
              configuration,
              path,
            });
          }

          return {
            success: true,
            value: options.defaultValue,
            errors: [],
          };
        }

        if (required) {
          return {
            success: false,
            errors: [
              {
                path,
                message: `Required configuration "${path}" is not defined.`,
                code: "CONFIGURATION_REQUIRED",
              },
            ],
          };
        }

        return {
          success: true,
          value: undefined,
          errors: [],
        };
      }

      const value = configuration.get<T>(path);

      if (!options.validator) {
        return {
          success: true,
          value,
          errors: [],
        };
      }

      return options.validator(value as T, {
        configuration,
        path,
      });
    },
  });
}

/**
 * Collection of configuration schemas.
 */
export class ConfigurationSchemaRegistry {
  private readonly schemas = new Map<string, ConfigurationSchema>();

  /**
   * Registers a schema.
   */
  public register<T>(schema: ConfigurationSchema<T>): void {
    if (this.schemas.has(schema.path)) {
      throw new Error(
        `Configuration schema "${schema.path}" is already registered.`,
      );
    }

    this.schemas.set(schema.path, schema as ConfigurationSchema);
  }

  /**
   * Registers multiple schemas.
   */
  public registerMany(schemas: readonly ConfigurationSchema[]): void {
    for (const schema of schemas) {
      this.register(schema);
    }
  }

  /**
   * Retrieves a schema.
   */
  public get<T>(path: string): ConfigurationSchema<T> | undefined {
    return this.schemas.get(normalizeConfigurationPath(path)) as
      ConfigurationSchema<T> | undefined;
  }

  /**
   * Checks whether a schema exists.
   */
  public has(path: string): boolean {
    return this.schemas.has(normalizeConfigurationPath(path));
  }

  /**
   * Removes a schema.
   */
  public remove(path: string): boolean {
    return this.schemas.delete(normalizeConfigurationPath(path));
  }

  /**
   * Returns all registered schemas.
   */
  public getAll(): readonly ConfigurationSchema[] {
    return [...this.schemas.values()];
  }

  /**
   * Returns the number of registered schemas.
   */
  public size(): number {
    return this.schemas.size;
  }

  /**
   * Removes all schemas.
   */
  public clear(): void {
    this.schemas.clear();
  }
}

/**
 * Creates a schema registry.
 */
export function createConfigurationSchemaRegistry(): ConfigurationSchemaRegistry {
  return new ConfigurationSchemaRegistry();
}
