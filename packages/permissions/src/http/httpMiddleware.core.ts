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
import { loadResource, type ResourceExtractor } from "./httpResource.helper.js";

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
  /** Reports a failure the guard turned into a denial (a failed resource load). */
  readonly onError?: (error: unknown, source: string) => void;
}

/** Options for the requirePermission middleware. */
export interface RequirePermissionMiddlewareOptions extends AuthorizeMiddlewareOptions {
  /** The permission to check (e.g. "post:update"). */
  readonly permission: string;
  /**
   * Loads the resource the permission is checked against (optional). May be
   * async; it is awaited, and a loader that throws or rejects denies (403).
   */
  readonly extractResource?: ResourceExtractor;
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

    const loaded = await loadResource(
      context,
      options.extractResource,
      options.onError,
    );
    if (!loaded.ok) {
      context.state.set(DECISION_STATE_KEY, loaded.decision);
      return createForbiddenResponse(loaded.decision, options);
    }
    const decision = await engine.check(
      actor,
      options.permission,
      loaded.resource,
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
  /**
   * Loads the resource checked for every permission (optional). May be
   * async; it is awaited, and a loader that throws or rejects denies (403).
   */
  readonly extractResource?: ResourceExtractor;
  /**
   * `"all"` (default) requires every permission; `"any"` requires one.
   */
  readonly mode?: "all" | "any";
}

/**
 * Create middleware that checks multiple permissions.
 *
 * Under `"all"` the first denial short-circuits: evaluating the rest costs
 * policy calls and timeouts for an answer that is already decided. An empty
 * permission list denies in either mode.
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

    // An empty list is a configuration error, not a grant: under "all" it
    // used to fall through to next() for any authenticated actor.
    if (permissions.length === 0) {
      return createForbiddenResponse(
        { allowed: false, reason: "no_permissions", publicReason: "Access denied" },
        options,
      );
    }

    const loaded = await loadResource(
      context,
      options.extractResource,
      options.onError,
    );
    if (!loaded.ok) return createForbiddenResponse(loaded.decision, options);
    const resource = loaded.resource;
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
