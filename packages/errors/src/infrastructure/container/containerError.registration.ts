/**
 * Container registration and resolution error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ContainerError } from "./containerError.base.js";

/** Error thrown when a duplicate registration occurs. */
export class DuplicateRegistrationError extends ContainerError {
  public override readonly token: string;
  public readonly existingScope?: string;

  constructor(
    token: string,
    message?: string,
    options: { existingScope?: string } = {},
  ) {
    super(message ?? `Token "${token}" is already registered.`, {
      code: ErrorCode.CONTAINER_DUPLICATE_REGISTRATION,
      token,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
    this.token = token;
    this.existingScope = options.existingScope;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      token: this.token,
      ...(this.existingScope !== undefined
        ? { existingScope: this.existingScope }
        : {}),
    };
  }
}

/** Error thrown when a registration is not found. */
export class RegistrationNotFoundError extends ContainerError {
  public readonly requestedToken: string;

  constructor(token: string, message?: string) {
    super(message ?? `No registration found for token "${token}".`, {
      code: ErrorCode.CONTAINER_REGISTRATION_NOT_FOUND,
      token,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
    this.requestedToken = token;
  }

  public override toJSON() {
    return { ...super.toJSON(), requestedToken: this.requestedToken };
  }
}

/** Error thrown when a circular dependency is detected. */
export class CircularDependencyError extends ContainerError {
  public readonly chain: readonly string[];

  constructor(chain: readonly string[], message?: string) {
    super(message ?? `Circular dependency detected: ${chain.join(" -> ")}.`, {
      code: ErrorCode.CONTAINER_CIRCULAR_DEPENDENCY,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
    this.chain = Object.freeze([...chain]);
  }

  public override toJSON() {
    return { ...super.toJSON(), chain: this.chain };
  }
}

/** Error thrown when provider resolution fails. */
export class ProviderResolutionError extends ContainerError {
  public override readonly token: string;

  constructor(token: string, message?: string, cause?: unknown) {
    super(message ?? `Failed to resolve provider for token "${token}".`, {
      code: ErrorCode.CONTAINER_PROVIDER_RESOLUTION_FAILED,
      token,
      statusCode: 500,
      expose: false,
      cause,
    });
    this.token = token;
  }
}

/** Error thrown when a container lifecycle event fails. */
export class ContainerLifecycleError extends ContainerError {
  public readonly phase: string;

  constructor(phase: string, message?: string, cause?: unknown) {
    super(message ?? `Container lifecycle event "${phase}" failed.`, {
      code: ErrorCode.CONTAINER_LIFECYCLE,
      statusCode: 500,
      expose: false,
      cause,
    });
    this.phase = phase;
  }

  public override toJSON() {
    return { ...super.toJSON(), phase: this.phase };
  }
}
