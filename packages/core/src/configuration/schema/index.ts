/**
 * @zudojs/core/configuration/schema
 *
 * Configuration schemas and validation.
 */

export {
  createConfigurationSchema,
  ConfigurationSchemaRegistry,
  createConfigurationSchemaRegistry,
} from "./configurationSchema.schema.js";

export type {
  ConfigurationValidationResult,
  ConfigurationValidationIssue,
  ConfigurationValidationContext,
  ConfigurationValidator,
  ConfigurationSchema,
  ConfigurationSchemaOptions,
} from "./configurationSchema.schema.js";

export {
  ConfigurationValidationError,
  validateConfiguration,
  validateConfigurationOrThrow,
  validateSchema,
  applyConfigurationSchemaDefaults,
} from "./configurationValidation.validator.js";

export type {
  ConfigurationValidationReport,
  ConfigurationValidationOptions,
} from "./configurationValidation.validator.js";
