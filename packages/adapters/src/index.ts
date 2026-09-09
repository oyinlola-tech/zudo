/**
 * @zudojs/adapters
 *
 * Boundary layer between Zudojs and external platforms.
 *
 * Provides:
 * - Adapter contracts and base interface
 * - Adapter registry
 * - Capability system
 * - Adapter metadata
 * - Lifecycle contracts
 * - Transport-specific adapter interfaces (HTTP, messaging, storage, queue, runtime, WebSocket, CLI, scheduler)
 * - Error types (re-exported from @zudojs/errors)
 * - Testing utilities
 *
 * @module @zudojs/adapters
 */

// Core adapter
export type { Adapter } from "./adapter/index.js";
export { AdapterRegistry } from "./adapter/index.js";
export type { AdapterCapabilityName } from "./adapter/index.js";

// Capabilities
export type { AdapterCapabilities } from "./capabilities/index.js";

// Metadata
export type { AdapterMetadata } from "./metadata/index.js";

// Lifecycle
export type {
  AdapterHealthStatus,
  AdapterHealth,
  AdapterOperationOptions,
  LifecycleAdapter,
} from "./lifecycle/index.js";

export {
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
} from "./lifecycle/index.js";

// Errors
export {
  AdapterError,
  AdapterNotFoundError,
  AdapterAlreadyRegisteredError,
  AdapterNotSupportedError,
  AdapterCapabilityMissingError,
  AdapterConnectionError,
  AdapterOperationError,
  AdapterTimeoutError,
  AdapterDisposeError,
  AdapterInitializationError,
  AdapterConfigurationError,
  createAdapterError,
  isAdapterError,
} from "./errors/index.js";

export type { AdapterErrorOptions } from "./errors/index.js";

// HTTP
export type {
  HTTPRequestLike,
  HTTPResponseLike,
  HTTPAdapter,
  HTTPListenOptions,
  HTTPRequestAdapter,
  HTTPResponseAdapter,
  HTTPServerAdapter,
} from "./http/index.js";

// Messaging
export type {
  MessageAdapter,
  MessageHandler,
  Subscription,
} from "./messaging/index.js";

// Storage
export type { StorageAdapter } from "./storage/index.js";

// Queue
export type { QueueAdapter, QueueStats } from "./queue/index.js";

// Runtime
export type { RuntimeAdapter } from "./runtime/index.js";

// WebSocket
export type {
  WebSocketAdapter,
  WebSocketSession,
  WebSocketReadyState,
} from "./websocket/index.js";

// CLI
export type { CLIAdapter, CLIOptions, CLIResult } from "./cli/index.js";

// Scheduler
export type {
  SchedulerAdapter,
  ScheduledTask,
  ScheduledJob,
} from "./scheduler/index.js";

// Testing
export type { Adapter as MockAdapter } from "./testing/index.js";
export type { AdapterHealth as MockAdapterHealth } from "./testing/index.js";
export type { AdapterRegistry as MockAdapterRegistry } from "./testing/index.js";

export {
  createMockAdapter,
  createMockAdapterRegistry,
  createMockHealth,
} from "./testing/index.js";
