/**
 * Error mapper — re-exports from focused files.
 */

export type {
  ErrorMapperContext,
  ErrorMapping,
  ErrorMapperPredicate,
  ErrorMapper,
  ErrorMappingRule,
} from "./errorMapper.types.js";

export {
  ErrorMapperRegistry,
  createErrorMapperRegistry,
} from "./errorMapper.registry.js";

export {
  mapNativeError,
  mapError,
  mapErrorType,
  createErrorMappingRule,
  applyErrorMapping,
  type ErrorConstructor,
} from "./errorMapper.mappers.js";
