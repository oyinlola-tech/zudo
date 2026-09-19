/**
 * Ability — pre-resolved authorization context for a specific actor.
 *
 * @module ability/ability
 */

import type {
  PermissionActor,
  PermissionDecision,
  ExplainResult,
  AuthorizationOptions,
} from "../permissionTypes/index.js";
import { evaluate, evaluateWithTrace } from "../evaluator/evaluator.core.js";
import type { EvaluatorOptions } from "../evaluator/evaluator.pipeline.js";
import { PermissionDeniedError } from "../permissionErrors/index.js";
import type { PermissionEventEmitter } from "../observability/observability.core.js";
import { observed } from "../evaluator/engineSupport/index.js";

/**
 * An Ability provides fast permission checks for a pre-resolved actor.
 */
export interface Ability {
  /** Check if the actor can perform the action. Returns boolean. */
  can(
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<boolean>;
  /** Check if the actor cannot perform the action. Returns boolean. */
  cannot(
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<boolean>;
  /** Full authorization check with decision details. */
  check(
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<PermissionDecision>;
  /** Explain the authorization decision with step-by-step trace. */
  explain(
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<ExplainResult>;
  /** Throw PermissionDeniedError if not allowed. */
  authorize(
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<void>;
  /** The actor this ability was created for. */
  readonly actor: PermissionActor;
}

/**
 * Create an Ability for an actor.
 */
export function createAbility(
  actor: PermissionActor,
  evaluatorOptions: EvaluatorOptions,
  emitter?: PermissionEventEmitter,
): Ability {
  function run(
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<PermissionDecision> {
    return observed(
      emitter,
      actor,
      permission,
      resource,
      () => evaluate(actor, permission, resource, evaluatorOptions, options),
      (decision) => decision,
    );
  }

  return {
    actor,

    async can(permission, resource, options) {
      return (await run(permission, resource, options)).allowed;
    },

    async cannot(permission, resource, options) {
      return !(await run(permission, resource, options)).allowed;
    },

    async check(permission, resource, options) {
      return run(permission, resource, options);
    },

    async explain(permission, resource, options) {
      return observed(
        emitter,
        actor,
        permission,
        resource,
        () =>
          evaluateWithTrace(
            actor,
            permission,
            resource,
            evaluatorOptions,
            options,
          ),
        (result) => result.decision,
      );
    },

    async authorize(permission, resource, options) {
      const decision = await run(permission, resource, options);
      if (!decision.allowed) {
        throw new PermissionDeniedError(
          decision.publicReason ?? "Access denied",
          {
            actorId: actor.id,
            permission,
            reason: decision.reason,
            policy: decision.policy,
          },
        );
      }
    },
  };
}
