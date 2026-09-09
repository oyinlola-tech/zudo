import type { RPCProcedure } from "./rpcProcedure.type.js";

import {
  RPCDuplicateProcedureError,
  RPCProcedureNotFoundError,
} from "../errors/rpc.errors.js";

import { MAX_PROCEDURES } from "../constants/rpcConstants.core.js";

import { assertValidProcedureName } from "../validation/rpcValidation.core.js";

/**
 * Registry for RPC procedures.
 *
 * Enforces uniqueness and provides O(1) lookup by procedure name.
 */
export class RPCProcedureRegistry {
  private readonly procedures = new Map<string, RPCProcedure>();

  /**
   * Registers a procedure.
   *
   * @throws {RPCDuplicateProcedureError} if a procedure with the same name is already registered.
   */
  register<TInput = unknown, TOutput = unknown>(
    procedure: RPCProcedure<TInput, TOutput>,
  ): void {
    if (this.procedures.size >= MAX_PROCEDURES) {
      throw new RangeError(
        `Maximum number of procedures (${MAX_PROCEDURES}) exceeded.`,
      );
    }

    assertValidProcedureName(procedure.name);

    const existing = this.procedures.get(procedure.name);
    if (existing !== undefined) {
      throw new RPCDuplicateProcedureError(procedure.name);
    }

    // Stored erased. The dispatcher decodes the wire payload at runtime,
    // so the registry holds procedures of mixed input types; the cast is
    // the single point where that erasure is acknowledged.
    this.procedures.set(
      procedure.name,
      Object.freeze(procedure) as RPCProcedure,
    );
  }

  /**
   * Retrieves a procedure by name.
   */
  get(name: string): RPCProcedure | undefined {
    return this.procedures.get(name);
  }

  /**
   * Determines whether a procedure is registered.
   */
  has(name: string): boolean {
    return this.procedures.has(name);
  }

  /**
   * Retrieves a procedure by name or throws.
   */
  require(name: string): RPCProcedure {
    const procedure = this.get(name);
    if (procedure === undefined) {
      throw new RPCProcedureNotFoundError(name);
    }
    return procedure;
  }

  /**
   * Returns all registered procedure names.
   */
  list(): readonly string[] {
    return Array.from(this.procedures.keys());
  }

  /**
   * Describes every registered procedure.
   *
   * Surfaces the `description` and `idempotent` options, which are
   * otherwise carried on the procedure and never readable — a caller's
   * retry policy needs `idempotent` to decide whether replaying a failed
   * call is safe.
   */
  describe(): readonly {
    name: string;
    description?: string;
    idempotent: boolean;
    timeout?: number;
  }[] {
    return Array.from(this.procedures.values()).map((procedure) => ({
      name: procedure.name,
      ...(procedure.options?.description !== undefined
        ? { description: procedure.options.description }
        : {}),
      idempotent: procedure.options?.idempotent ?? false,
      ...(procedure.options?.timeout !== undefined
        ? { timeout: procedure.options.timeout }
        : {}),
    }));
  }

  /**
   * Unregisters a procedure.
   */
  unregister(name: string): boolean {
    return this.procedures.delete(name);
  }

  /**
   * Clears all registered procedures.
   */
  clear(): void {
    this.procedures.clear();
  }
}
