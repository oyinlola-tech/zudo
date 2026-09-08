/**
 * HTTP middleware adapter for @zudojs/permissions.
 *
 * Provides middleware factories that integrate the authorization engine
 * with @zudojs/http's middleware pipeline.
 *
 * @module http/httpMiddleware
 */

import type {
  PermissionActor,
  PermissionDecision,
  AuthorizationOptions,
} from "../permissionTypes/index.js";
import type { PermissionEngine } from "../evaluator/authorizationEngine.js";
import type { HttpMiddleware, HttpMiddlewareContext } from "./httpTypes.js";
import {
  createForbiddenResponse,
  createUnauthorizedResponse,
  type DeniedResponseOptions,
} from "./httpHelpers.js";

// ─── Options ──────────────────────────────────────────────────────────────

/** Options shared by the permission middleware. */
export interface AuthorizeMiddlewareOptions extends DeniedResponseOptions {
  /**
   * Extracts an actor from the request context.
   *
   * The guard middleware calls this itself when no actor is already in
   * state, so `authorize(engine, permission, { extractActor })` works on its
   * own — installing `createActorMiddleware` first is an optimisation, not a
   * requirement.
   */
  readonly extractActor?: (
    context: HttpMiddlewareContext,
  ) => PermissionActor | Promise<PermissionActor> | undefined;
  /** Authorization options (policyTimeout, metadata). */
  readonly authorization?: AuthorizationOptions;
  /**
   * Forwards `context.signal` to the engine so a client disconnect stops
   * policy evaluation. Default: `true`.
   */
  readonly forwardSignal?: boolean;
  /** Builds per-request metadata for conditions and policies. */
  readonly extractMetadata?: (
    context: HttpMiddlewareContext,
  ) => Record<string, unknown> | undefined;
}

/** Options for the requirePermission middleware. */
export interface RequirePermissionMiddlewareOptions extends AuthorizeMiddlewareOptions {
  /** The permission to check (e.g. "post:update"). */
  readonly permission: string;
  /** Extracts the resource from the request (optional). */
  readonly extractResource?: (context: HttpMiddlewareContext) => unknown;
}

/** Options for {@link createActorMiddleware}. */
export interface ActorMiddlewareOptions extends AuthorizeMiddlewareOptions {
  /** Required: this middleware exists to run it. */
  readonly extractActor: (
    context: HttpMiddlewareContext,
  ) => PermissionActor | Promise<PermissionActor> | undefined;
  /**
   * Answer 401 immediately when no actor could be extracted, instead of
   * letting the request continue to whatever comes next. Default: `false`,
   * preserving the "authenticate here, authorize later" split.
   */
  readonly requireActor?: boolean;
}

// ─── State Keys ───────────────────────────────────────────────────────────

/** State key for the current actor. */
export const ACTOR_STATE_KEY = "permissions:actor";

/** State key for the authorization decision. */
export const DECISION_STATE_KEY = "permissions:decision";

/** State key for the batch decision map. */
export const DECISIONS_STATE_KEY = "permissions:decisions";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Finds the actor for a request: from state first, then by extracting it.
 */
async function resolveActor(
  context: HttpMiddlewareContext,
  options: AuthorizeMiddlewareOptions,
): Promise<PermissionActor | undefined> {
  const existing = context.state.get<PermissionActor>(ACTOR_STATE_KEY);
  if (existing) return existing;

  if (!options.extractActor) return undefined;
  const actor = await options.extractActor(context);
  if (actor) context.state.set(ACTOR_STATE_KEY, actor);
  return actor;
}

function buildAuthorization(
  context: HttpMiddlewareContext,
  options: AuthorizeMiddlewareOptions,
): AuthorizationOptions {
  const metadata = options.extractMetadata?.(context);
  return {
    ...options.authorization,
    ...(options.forwardSignal !== false ? { signal: context.signal } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

// ─── Middleware Factories ──────────────────────────────────────────────────

/**
 * Create middleware that extracts the actor from the request and stores it in state.
 */
export function createActorMiddleware(
  options: ActorMiddlewareOptions,
): HttpMiddleware {
  return async (context, next) => {
    const actor = await options.extractActor(context);
    if (actor) {
      context.state.set(ACTOR_STATE_KEY, actor);
    } else if (options.requireActor === true) {
      return createUnauthorizedResponse(options);
    }
    return next();
  };
}

/**
 * Create middleware that checks a permission and returns 403 if denied.
 *
 * An unauthenticated request gets 401; an authenticated one that is not
 * permitted gets 403.
 */
export function createRequirePermissionMiddleware(
  engine: PermissionEngine,
  options: RequirePermissionMiddlewareOptions,
): HttpMiddleware {
  return async (context, next) => {
    const actor = await resolveActor(context, options);
    if (!actor) return createUnauthorizedResponse(options);

    const resource = options.extractResource?.(context);
    const decision = await engine.check(
      actor,
      options.permission,
      resource,
      buildAuthorization(context, options),
    );

    context.state.set(DECISION_STATE_KEY, decision);
    if (!decision.allowed) return createForbiddenResponse(decision, options);
    return next();
  };
}

/**
 * Create middleware that checks a permission and short-circuits on denial.
 */
export function authorize(
  engine: PermissionEngine,
  permission: string,
  options: Omit<RequirePermissionMiddlewareOptions, "permission"> = {},
): HttpMiddleware {
  return createRequirePermissionMiddleware(engine, {
    ...options,
    permission,
  });
}

/** Options for {@link createRequirePermissionsMiddleware}. */
export interface RequirePermissionsMiddlewareOptions extends AuthorizeMiddlewareOptions {
  /** Extracts the resource checked for every permission (optional). */
  readonly extractResource?: (context: HttpMiddlewareContext) => unknown;
  /**
   * `"all"` (default) requires every permission; `"any"` requires one.
   */
  readonly mode?: "all" | "any";
}

/**
 * Create middleware that checks multiple permissions.
 *
 * Under `"all"` the first denial short-circuits: evaluating the rest costs
 * policy calls and timeouts for an answer that is already decided.
 */
export function createRequirePermissionsMiddleware(
  engine: PermissionEngine,
  permissions: readonly string[],
  options: RequirePermissionsMiddlewareOptions = {},
): HttpMiddleware {
  const mode = options.mode ?? "all";

  return async (context, next) => {
    const actor = await resolveActor(context, options);
    if (!actor) return createUnauthorizedResponse(options);

    const resource = options.extractResource?.(context);
    const authorization = buildAuthorization(context, options);
    const results = new Map<string, PermissionDecision>();
    let lastDenial: PermissionDecision | undefined;

    for (const permission of permissions) {
      const decision = await engine.check(
        actor,
        permission,
        resource,
        authorization,
      );
      results.set(permission, decision);

      if (decision.allowed) {
        if (mode === "any") {
          context.state.set(DECISIONS_STATE_KEY, results);
          return next();
        }
      } else {
        lastDenial = decision;
        if (mode === "all") break;
      }
    }

    context.state.set(DECISIONS_STATE_KEY, results);

    if (mode === "all" && lastDenial) {
      return createForbiddenResponse(lastDenial, options);
    }
    if (mode === "any") {
      return createForbiddenResponse(
        lastDenial ?? { allowed: false, publicReason: "Access denied" },
        options,
      );
    }
    return next();
  };
}
