import type { Environment } from "@zudojs/constants";

import type { RuntimeId } from "../runtimeState/runtimeState.type.js";

/**
 * Runtime configuration options.
 */
export interface RuntimeOptions {
  /**
   * Runtime identifier.
   * Auto-generated if not provided.
   */
  readonly runtimeId?: RuntimeId;

  /**
   * Application environment.
   */
  readonly environment: Environment;

  /**
   * Application name.
   */
  readonly applicationName: string;

  /**
   * Application version.
   */
  readonly applicationVersion?: string;

  /**
   * Whether to handle process signals (SIGTERM, SIGINT).
   * @default true
   */
  readonly handleSignals?: boolean;

  /**
   * Whether to handle fatal errors (uncaughtException, unhandledRejection).
   * @default true
   */
  readonly handleFatalErrors?: boolean;

  /**
   * Graceful shutdown timeout in milliseconds.
   * @default 30000
   */
  readonly shutdownTimeout?: number;

  /**
   * Startup timeout in milliseconds.
   * @default 60000
   */
  readonly startupTimeout?: number;

  /**
   * Whether to enable runtime events.
   * @default true
   */
  readonly emitEvents?: boolean;

  /**
   * Whether to enable readiness tracking.
   * @default true
   */
  readonly trackReadiness?: boolean;

  /**
   * Whether to enable health tracking.
   * @default true
   */
  readonly trackHealth?: boolean;

  /**
   * Additional runtime metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Resolved runtime options with defaults applied.
 */
export interface ResolvedRuntimeOptions {
  readonly runtimeId: RuntimeId;
  readonly environment: Environment;
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly handleSignals: boolean;
  readonly handleFatalErrors: boolean;
  readonly shutdownTimeout: number;
  readonly startupTimeout: number;
  readonly emitEvents: boolean;
  readonly trackReadiness: boolean;
  readonly trackHealth: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Default runtime options.
 */
export const DEFAULT_RUNTIME_OPTIONS = Object.freeze({
  handleSignals: true,
  handleFatalErrors: true,
  shutdownTimeout: 30_000,
  startupTimeout: 60_000,
  emitEvents: true,
  trackReadiness: true,
  trackHealth: true,
  applicationVersion: "0.1.0",
} as const);
