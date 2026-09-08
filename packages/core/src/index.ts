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
