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
  readonly runtimeId: RuntimeId;
  readonly environment: Environment;
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly state: RuntimeState;
  readonly status: RuntimeStatus;
  readonly startedAt?: Date;
  readonly logger: Logger;
  readonly container: Container;
  readonly eventBus: EventBus;
  readonly health: RuntimeHealth;
  readonly ready: boolean;
}

/**
 * Runtime identity information.
 */
export interface RuntimeIdentity {
  readonly runtimeId: RuntimeId;
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly environment: Environment;
  readonly hostname: string;
  readonly processId: number;
  readonly startedAt?: Date;
}

/**
 * Dependencies required to create the runtime context.
 */
export interface RuntimeContextDependencies {
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
