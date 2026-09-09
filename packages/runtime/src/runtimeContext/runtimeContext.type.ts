import type { Environment } from "@zudojs/constants";

import type { RuntimeError } from "@zudojs/errors";

import type { Logger } from "@zudojs/logger";

import type { EventBus } from "@zudojs/events";

import type { Container } from "@zudojs/container";

import type {
  RuntimeId,
  RuntimeStatus,
  RuntimeState,
  RuntimeHealth,
} from "../runtimeState/runtimeState.type.js";

/**
 * Runtime context providing access to the running application state.
 */
export interface RuntimeContext {
  /** Additional runtime metadata supplied through runtime options. */
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly runtimeId: RuntimeId;
  readonly environment: Environment;
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly state: RuntimeState;
  readonly status: RuntimeStatus;
  readonly startedAt?: Date;
  /** When the runtime last reached `stopped`. */
  readonly stoppedAt?: Date;
  /** When the runtime last reached `failed`. */
  readonly failedAt?: Date;
  /** The error that failed the runtime, if it has failed. */
  readonly error?: RuntimeError;
  readonly logger: Logger;
  readonly container: Container;
  readonly eventBus: EventBus;
  readonly health: RuntimeHealth;
  readonly ready: boolean;
}

/**
 * Dependencies required to create the runtime context.
 */
export interface RuntimeContextDependencies {
  /** Additional runtime metadata, surfaced on the context. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly runtimeId: RuntimeId;
  readonly environment: Environment;
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly logger: Logger;
  readonly container: Container;
  readonly eventBus: EventBus;
}

/**
 * Mutable runtime context state (for internal use).
 */
export interface RuntimeContextState {
  status: RuntimeStatus;
  health: RuntimeHealth;
  ready: boolean;
  startedAt?: Date;
  stoppedAt?: Date;
  failedAt?: Date;
  error?: RuntimeError;
}
