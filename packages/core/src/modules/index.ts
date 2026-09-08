/**
 * Core Modules
 *
 * Public API for the application module system.
 *
 * This barrel intentionally contains exports only.
 * Module implementation logic belongs in the individual
 * module files.
 */

/*
 * Module contract
 */
export {
  type ModuleId,
  type ModuleOptions,
  type ModuleLifecycle,
  type Module,
  BaseModule,
  isModule,
  createModule,
} from "./module.js";

/*
 * Module definition
 */
export * from "./moduleDefinition.definition.js";

/*
 * Module metadata
 */
export * from "./moduleMetadata.metadata.js";

/*
 * Module context
 */
export * from "./moduleContext.context.js";

/*
 * Module dependency graph and dependency utilities
 */
export * from "./moduleDependency/index.js";

/*
 * Module registry
 */
export * from "./moduleRegistry/index.js";

/*
 * Module loading
 */
export * from "./moduleLoader/index.js";

/*
 * Module lifecycle
 */
export * from "./moduleLifecycle/index.js";

/*
 * Module errors
 */
export * from "./moduleError/index.js";
