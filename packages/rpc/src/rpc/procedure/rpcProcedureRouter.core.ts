import type { RPCProcedure } from "./rpcProcedure.type.js";

import type { RPCProcedureName } from "../types/rpcProcedureName.type.js";

import {
  RPCDuplicateProcedureError,
  RPCProcedureNotFoundError,
} from "../errors/rpc.errors.js";

import { assertValidProcedureName } from "../validation/rpcValidation.core.js";

/**
 * Router for grouping RPC procedures by namespace.
 */
export class RPCProcedureRouter {
  private readonly routes = new Map<string, RPCProcedure>();

  /**
   * Registers a procedure in this router.
   */
  register(procedure: RPCProcedure): this {
    assertValidProcedureName(procedure.name);

    const existing = this.routes.get(procedure.name);
    if (existing !== undefined) {
      throw new RPCDuplicateProcedureError(procedure.name);
    }

    this.routes.set(procedure.name, Object.freeze(procedure));
    return this;
  }

  /**
   * Retrieves a procedure by name.
   */
  get(name: RPCProcedureName): RPCProcedure | undefined {
    return this.routes.get(name);
  }

  /**
   * Determines whether a procedure is registered.
   */
  has(name: RPCProcedureName): boolean {
    return this.routes.has(name);
  }

  /**
   * Requires a procedure by name or throws.
   */
  require(name: RPCProcedureName): RPCProcedure {
    const procedure = this.get(name);
    if (procedure === undefined) {
      throw new RPCProcedureNotFoundError(name);
    }
    return procedure;
  }

  /**
   * Returns all registered procedures.
   */
  list(): readonly RPCProcedure[] {
    return Array.from(this.routes.values());
  }

  /**
   * Unregisters a procedure.
   */
  unregister(name: RPCProcedureName): boolean {
    return this.routes.delete(name);
  }

  /**
   * Clears all procedures.
   */
  clear(): void {
    this.routes.clear();
  }
}
