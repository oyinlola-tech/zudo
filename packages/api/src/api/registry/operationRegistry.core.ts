import type {
  AnyAPIOperation,
  APIOperation,
} from "../operation/operation.type.js";

import {
  assertValidOperationShape,
  freezeOperationMetadata,
} from "../operation/operation.type.js";

import {
  APIDuplicateOperationError,
  APIOperationNotFoundError,
  createAPIError,
} from "../errors/index.js";

import type { APIError } from "../errors/index.js";

/**
 * Registry for API operations.
 *
 * Enforces uniqueness and provides O(1) lookup by operation name.
 *
 * Every failure leaving this class is an `APIError`, so a transport can
 * map it by `statusCode` / `code` without special-casing the registry.
 */
export class APIOperationRegistry {
  private readonly operations = new Map<string, APIOperation>();

  private frozen = false;

  /**
   * Registers an operation.
   *
   * The operation and its metadata are frozen on registration, so a
   * registered operation cannot be rewritten through `metadata.tags` or
   * `metadata.timeout` after the fact.
   *
   * @throws {APIDuplicateOperationError} if an operation with the same name is already registered.
   * @throws {APIError} if the registry is frozen.
   * @throws {TypeError | RangeError} if the operation's name or handler is invalid.
   */
  register(operation: AnyAPIOperation): void {
    if (this.frozen) {
      throw frozenRegistryError("register");
    }

    assertValidOperationShape(operation);

    const existing = this.operations.get(operation.name);
    if (existing !== undefined) {
      throw new APIDuplicateOperationError(operation.name);
    }

    freezeOperationMetadata(operation.metadata);
    this.operations.set(
      operation.name,
      Object.freeze(operation) as APIOperation,
    );
  }

  /**
   * Retrieves an operation by name.
   */
  get(name: string): APIOperation | undefined {
    return this.operations.get(name);
  }

  /**
   * Determines whether an operation is registered.
   */
  has(name: string): boolean {
    return this.operations.has(name);
  }

  /**
   * Retrieves an operation by name or throws.
   *
   * @throws {APIOperationNotFoundError} (404) if no operation is registered under `name`.
   */
  require(name: string): APIOperation {
    const operation = this.get(name);
    if (operation === undefined) {
      throw new APIOperationNotFoundError(name);
    }
    return operation;
  }

  /**
   * Returns all registered operations.
   */
  getAll(): readonly APIOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Finds operations by tag.
   */
  findByTag(tag: string): readonly APIOperation[] {
    return this.getAll().filter((operation) =>
      operation.metadata?.tags?.includes(tag),
    );
  }

  /**
   * Unregisters an operation.
   *
   * @throws {APIError} if the registry is frozen.
   */
  unregister(name: string): boolean {
    if (this.frozen) {
      throw frozenRegistryError("unregister");
    }
    return this.operations.delete(name);
  }

  /**
   * Prevents further mutation of the registry.
   */
  freeze(): void {
    this.frozen = true;
  }

  /**
   * Determines whether the registry is frozen.
   */
  isFrozen(): boolean {
    return this.frozen;
  }
}

/**
 * Mutating a frozen registry is a server-side programming error, never a
 * client mistake — hence 500 and `expose: false`.
 */
function frozenRegistryError(action: "register" | "unregister"): APIError {
  return createAPIError(
    `Cannot ${action} operations on a frozen registry.`,
    {
      statusCode: 500,
      expose: false,
      isOperational: false,
    },
  );
}
