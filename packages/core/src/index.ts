/**
 * @zudojs/core
 *
 * Core framework primitives and runtime infrastructure.
 *
 * Public API
 * ----------
 *
 * container
 * contracts
 * errors
 * logging
 * lifecycle
 * context
 * configuration
 * modules
 * runtime
 * application
 *
 * Internal implementation details should not be imported directly
 * by consumers when a public export is available here.
 */

/*
 * ============================================================
 * Container
 * ============================================================
 */

export * from "./container/index.js";

/*
 * ============================================================
 * Contracts
 * ============================================================
 */

export * from "./contracts/index.js";

/*
 * ============================================================
 * Errors
 * ============================================================
 */

export * from "./errors/index.js";

/*
 * ============================================================
 * Logging
 * ============================================================
 */

export * from "./logging/index.js";

/*
 * ============================================================
 * Lifecycle
 * ============================================================
 */

export * from "./lifecycle/index.js";

/*
 * ============================================================
 * Context
 * ============================================================
 */

export * from "./context/index.js";

/*
 * ============================================================
 * Configuration
 * ============================================================
 */

export * from "./configuration/index.js";

/*
 * ============================================================
 * Modules
 * ============================================================
 */

export * from "./modules/index.js";

/*
 * The module subsystem's ModuleNotFoundError is the one thrown by the
 * registry, loader, and runtime, so it wins at the root. The generic
 * core error of the same name remains available via "./errors".
 */
export { ModuleNotFoundError } from "./modules/index.js";

/*
 * ============================================================
 * Runtime
 * ============================================================
 */

export * from "./runtime/index.js";

/*
 * ============================================================
 * Application
 * ============================================================
 */

export * from "./application/index.js";

/*
 * ============================================================
 * Aliases for colliding names
 * ============================================================
 *
 * These names are also exported, with different meanings, by sibling
 * packages: `LifecycleState`/`LifecycleManager` by @zudojs/lifecycle
 * and @zudojs/constants, `createRuntime` by @zudojs/runtime,
 * `Container` by @zudojs/container, `ConfigurationManager` by
 * @zudojs/config. The originals stay; import the Core-prefixed alias
 * when two of those packages meet in one file.
 */

export {
  Lifecycle as CoreLifecycle,
  LifecycleManager as CoreLifecycleManager,
  LifecycleState as CoreLifecycleState,
} from "./lifecycle/index.js";
export { Container as CoreContainer } from "./container/index.js";
export { ConfigurationManager as CoreConfigurationManager } from "./configuration/index.js";
export { createRuntime as createCoreRuntime } from "./runtime/index.js";
