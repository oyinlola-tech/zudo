/**
 * Types for the container registry.
 */

import type { ContainerRegistration } from "../containerRegistration/containerRegistration.core.js";

import type {
  InjectionToken,
  Token,
} from "../containerToken/containerToken.type.js";

/**
 * Normalized registry token.
 */
export type RegistryToken<T = unknown> = Token<T> | InjectionToken<T>;

/**
 * Registry change operation.
 */
export enum RegistryOperation {
  REGISTER = "register",
  REPLACE = "replace",
  REMOVE = "remove",
  CLEAR = "clear",
  /** Wholesale replacement of all registrations via `restore()`. */
  RESTORE = "restore",
}

/**
 * Event emitted when the registry changes.
 */
export interface RegistryChangeEvent<T = unknown> {
  readonly operation: RegistryOperation;
  readonly token: RegistryToken<T>;
  readonly registration?: ContainerRegistration<T>;
  readonly previous?: ContainerRegistration<T>;
  readonly timestamp: Date;
}

/**
 * Registry subscription callback.
 */
export type RegistryListener<T = unknown> = (
  event: RegistryChangeEvent<T>,
) => void;

/**
 * Registry options.
 */
export interface ContainerRegistryOptions {
  /**
   * Whether duplicate registrations are allowed.
   * Defaults to false.
   */
  readonly allowDuplicates?: boolean;
}
