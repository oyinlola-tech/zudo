/**
 * Regression coverage for the round-7 audit findings.
 *
 * Authorization is the package where a silent regression is most expensive,
 * so every fixed finding is pinned here by the behaviour it produces, not by
 * the shape of the code that produces it.
 */

import { describe, it, expect } from "vitest";

import {
  createPermissionEngine,
  createPermissionActor,
  createRoleRegistry,
  createPolicyRegistry,
  createPermissionRegistry,
  createMemoryPermissionCache,
  createMemoryPermissionResolver,
  createMemoryRoleResolver,
  createPermissionEventEmitter,
  createAbility,
  permissionCacheKey,
  matches,
  isValidPermission,
  parsePermission,
  evaluateRules,
  evaluateRulesSync,
  compileRules,
  findMatchingRules,
  resolveRolePermissions,
  isOwner,
  tenantIsolation,
  allOf,
  anyOf,
  not,
  never,
  withObservability,
  AuthorizationAbortedError,
  InvalidPermissionError,
  InvalidRoleError,
  PermissionDeniedError,
  ACTOR_STATE_KEY,
  DECISION_STATE_KEY,
  DECISIONS_STATE_KEY,
  authorize,
  createActorMiddleware,
  createRequirePermissionMiddleware,
  createRequirePermissionsMiddleware,
} from "../src/index.js";
import type {
  PermissionActor,
  PermissionDecision,
  PermissionRule,
  RoleDefinition,
  HttpMiddlewareContext,
  HttpResponseContext,
} from "../src/index.js";

const ROLES: readonly RoleDefinition[] = [
  { name: "reader", permissions: ["post:read"] },
  { name: "editor", permissions: ["post:update"], inherits: ["reader"] },
  { name: "admin", permissions: ["*:*"] },
];

const actor = (
  id: string,
  options?: Parameters<typeof createPermissionActor>[1],
): PermissionActor => createPermissionActor(id, options);

// ─── PERM-01 / PERM-02 · Conditions ────────────────────────────────────────

describe("rule conditions", () => {
  const ownerRule: PermissionRule = {
    name: "own-posts",
    effect: "allow",
    resource: "post",
    action: "update",
    condition: isOwner(),
  };

  it("only applies a conditional rule when the condition holds (PERM-01)", async () => {
    const engine = createPermissionEngine({ rules: [ownerRule] });
    const ada = actor("ada");

    expect(await engine.can(ada, "post:update", { ownerId: "ada" })).toBe(true);
    expect(await engine.can(ada, "post:update", { ownerId: "bob" })).toBe(
      false,
    );
    expect(await engine.can(ada, "post:update")).toBe(false);
  });

  it("applies a conditional deny (PERM-01)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      rules: [
        {
          name: "not-locked",
          effect: "deny",
          resource: "post",
          action: "update",
          condition: (context) =>
            (context.resource as { locked?: boolean } | undefined)?.locked ===
            true,
        },
      ],
    });
    const editor = actor("ada", { roles: ["editor"] });

    expect(await engine.can(editor, "post:update", { locked: false })).toBe(
      true,
    );
    expect(await engine.can(editor, "post:update", { locked: true })).toBe(
      false,
    );
  });

  it("treats a throwing condition as unmet (PERM-01)", async () => {
    const errors: unknown[] = [];
    const engine = createPermissionEngine({
      rules: [
        {
          effect: "allow",
          resource: "post",
          action: "read",
          condition: () => {
            throw new Error("condition exploded");
          },
        },
      ],
      onError: (error) => errors.push(error),
    });

    expect(await engine.can(actor("ada"), "post:read")).toBe(false);
    expect((errors[0] as Error).message).toBe("condition exploded");
  });

  it("composes conditions", async () => {
    const context = {
      actor: actor("ada"),
      permission: parsePermission("post:read"),
      resource: { ownerId: "ada" },
    };
    expect(await allOf(isOwner(), not(never()))(context)).toBe(true);
    expect(await anyOf(never(), isOwner())(context)).toBe(true);
    expect(await allOf(isOwner(), never())(context)).toBe(false);
  });

  it("gives tenantIsolation the metadata it needs (PERM-02)", async () => {
    const engine = createPermissionEngine({
      rules: [
        {
          name: "same-tenant",
          effect: "allow",
          resource: "invoice",
          action: "read",
          condition: tenantIsolation(),
        },
      ],
    });
    const ada = actor("ada");

    expect(
      await engine.can(
        ada,
        "invoice:read",
        { tenantId: "acme" },
        { metadata: { tenantId: "acme" } },
      ),
    ).toBe(true);

    expect(
      await engine.can(
        ada,
        "invoice:read",
        { tenantId: "other" },
        { metadata: { tenantId: "acme" } },
      ),
    ).toBe(false);

    // No metadata at all must deny, not silently pass.
    expect(await engine.can(ada, "invoice:read", { tenantId: "acme" })).toBe(
      false,
    );
  });

  it("compares ids across the string/number boundary (PERM-32)", async () => {
    const context = {
      actor: actor("42"),
      permission: parsePermission("post:read"),
      resource: { ownerId: 42 },
    };
    expect(await isOwner()(context)).toBe(true);
  });
});

// ─── PERM-03 / PERM-28 · Matching ──────────────────────────────────────────

describe("permission matching", () => {
  it("matches denies with the same rules as grants (PERM-03)", async () => {
    const engine = createPermissionEngine({ roles: ROLES });

    const wildcardAction = actor("ada", {
      roles: ["admin"],
      deniedPermissions: ["*:delete"],
    });
    expect(await engine.can(wildcardAction, "post:delete")).toBe(false);
    expect(await engine.can(wildcardAction, "post:read")).toBe(true);

    const namespaced = actor("bob", {
      permissions: ["billing.invoice:read"],
      deniedPermissions: ["billing.*:read"],
    });
    expect(await engine.can(namespaced, "billing.invoice:read")).toBe(false);
  });

  it("still honours the exact and resource-wildcard denies", async () => {
    const engine = createPermissionEngine({ roles: ROLES });
    const admin = actor("ada", {
      roles: ["admin"],
      deniedPermissions: ["post:*"],
    });
    expect(await engine.can(admin, "post:update")).toBe(false);
    expect(await engine.can(admin, "user:update")).toBe(true);
  });

  it("agrees with the rule matcher on namespace wildcards (PERM-28)", () => {
    expect(matches("billing.*:read", "billing.invoice:read")).toBe(true);
    expect(matches("billing.*:read", "billing:read")).toBe(true);
    expect(matches("billing.*:read", "shipping.invoice:read")).toBe(false);
  });

  it("rejects a partial wildcard that could never match (PERM-28)", () => {
    expect(isValidPermission("post*:read")).toBe(false);
    expect(() => parsePermission("post*:read")).toThrow(InvalidPermissionError);
    expect(isValidPermission("post:*")).toBe(true);
    expect(isValidPermission("billing.*:read")).toBe(true);
  });

  it("indexes namespace wildcards so they can be found (PERM-28)", () => {
    const rules: PermissionRule[] = [
      { effect: "allow", resource: "billing.*", action: "read" },
    ];
    const found = findMatchingRules(compileRules(rules), {
      resource: "billing.invoice",
      action: "read",
    });
    expect(found).toHaveLength(1);
  });

  it("returns each rule once, however many patterns it lists", () => {
    const rule: PermissionRule = {
      effect: "allow",
      resource: ["post", "*"],
      action: ["read", "*"],
    };
    const found = findMatchingRules(compileRules([rule]), {
      resource: "post",
      action: "read",
    });
    expect(found).toHaveLength(1);
  });
});

// ─── PERM-04 / PERM-05 / PERM-06 · Policies ────────────────────────────────

describe("policies", () => {
  it("applies a wildcard policy (PERM-04)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      policies: [
        {
          name: "business-hours",
          permissions: ["post:*"],
          evaluate: () => ({ allowed: false, reason: "outside_hours" }),
        },
      ],
    });
    const editor = actor("ada", { roles: ["editor"] });
    expect(await engine.can(editor, "post:update")).toBe(false);
  });

  it("evaluates policies highest priority first (PERM-05)", async () => {
    const order: string[] = [];
    const engine = createPermissionEngine({
      roles: ROLES,
      policies: [
        {
          name: "low",
          priority: 1,
          permissions: ["post:read"],
          evaluate: () => {
            order.push("low");
            return { allowed: true };
          },
        },
        {
          name: "high",
          priority: 10,
          permissions: ["post:read"],
          evaluate: () => {
            order.push("high");
            return { allowed: true };
          },
        },
      ],
    });

    await engine.can(actor("ada", { roles: ["reader"] }), "post:read");
    expect(order).toEqual(["high", "low"]);
  });

  it("short-circuits on the first denial (PERM-05)", async () => {
    const evaluated: string[] = [];
    const engine = createPermissionEngine({
      roles: ROLES,
      policies: [
        {
          name: "deny-first",
          priority: 10,
          permissions: ["post:read"],
          evaluate: () => {
            evaluated.push("deny-first");
            return { allowed: false };
          },
        },
        {
          name: "never-reached",
          priority: 1,
          permissions: ["post:read"],
          evaluate: () => {
            evaluated.push("never-reached");
            return { allowed: true };
          },
        },
      ],
    });

    await engine.can(actor("ada", { roles: ["reader"] }), "post:read");
    expect(evaluated).toEqual(["deny-first"]);
  });

  it("applies the engine's policy timeout (PERM-06)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      policyTimeout: 20,
      policies: [
        {
          name: "slow",
          permissions: ["post:read"],
          evaluate: async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return { allowed: true };
          },
        },
      ],
    });

    const decision = await engine.check(
      actor("ada", { roles: ["reader"] }),
      "post:read",
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("policy_error:slow");
  });

  it("treats a zero timeout as immediate, not disabled (PERM-06)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      policyTimeout: 0,
      policies: [
        {
          name: "any",
          permissions: ["post:read"],
          evaluate: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { allowed: true };
          },
        },
      ],
    });

    const decision = await engine.check(
      actor("ada", { roles: ["reader"] }),
      "post:read",
    );
    expect(decision.allowed).toBe(false);
  });

  it("lets a per-call timeout override the engine default (PERM-06)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      policyTimeout: 1,
      policies: [
        {
          name: "slowish",
          permissions: ["post:read"],
          evaluate: async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { allowed: true };
          },
        },
      ],
    });

    const decision = await engine.check(
      actor("ada", { roles: ["reader"] }),
      "post:read",
      undefined,
      { policyTimeout: 500 },
    );
    expect(decision.allowed).toBe(true);
  });

  it("fails closed when a policy throws (PERM-06)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      policies: [
        {
          name: "broken",
          permissions: ["post:read"],
          evaluate: () => {
            throw new Error("policy exploded");
          },
        },
      ],
    });
    expect(
      await engine.can(actor("ada", { roles: ["reader"] }), "post:read"),
    ).toBe(false);
  });

  it("never lets an allowing policy override a denying one", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      policies: [
        {
          name: "allow",
          priority: 1,
          permissions: ["post:read"],
          evaluate: () => ({ allowed: true }),
        },
        {
          name: "deny",
          priority: 10,
          permissions: ["post:read"],
          evaluate: () => ({ allowed: false }),
        },
      ],
    });
    expect(
      await engine.can(actor("ada", { roles: ["reader"] }), "post:read"),
    ).toBe(false);
  });
});

// ─── PERM-07 · Cancellation ────────────────────────────────────────────────

describe("cancellation", () => {
  it("aborts rather than silently allowing (PERM-07)", async () => {
    const controller = new AbortController();
    controller.abort();
    const engine = createPermissionEngine({ roles: ROLES });

    await expect(
      engine.check(actor("ada", { roles: ["admin"] }), "post:read", undefined, {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AuthorizationAbortedError);
  });

  it("aborts between policy evaluations (PERM-07)", async () => {
    const controller = new AbortController();
    const engine = createPermissionEngine({
      roles: ROLES,
      policies: [
        {
          name: "first",
          priority: 10,
          permissions: ["post:read"],
          evaluate: () => {
            controller.abort();
            return { allowed: true };
          },
        },
        {
          name: "second",
          priority: 1,
          permissions: ["post:read"],
          evaluate: () => ({ allowed: true }),
        },
      ],
    });

    await expect(
      engine.check(
        actor("ada", { roles: ["reader"] }),
        "post:read",
        undefined,
        {
          signal: controller.signal,
        },
      ),
    ).rejects.toBeInstanceOf(AuthorizationAbortedError);
  });
});

// ─── PERM-08 / PERM-09 · Caching ───────────────────────────────────────────

describe("decision caching", () => {
  it("is wired into the engine (PERM-08)", async () => {
    let evaluations = 0;
    const cache = createMemoryPermissionCache();
    const engine = createPermissionEngine({
      roles: ROLES,
      cache,
      policies: [
        {
          name: "counter",
          permissions: ["post:read"],
          evaluate: () => {
            evaluations++;
            return { allowed: true };
          },
        },
      ],
    });

    const reader = actor("ada", { roles: ["reader"] });
    expect(await engine.can(reader, "post:read")).toBe(true);
    expect(await engine.can(reader, "post:read")).toBe(true);
    expect(evaluations).toBe(1);
  });

  it("can be bypassed and invalidated per actor (PERM-08)", async () => {
    let evaluations = 0;
    const cache = createMemoryPermissionCache();
    const engine = createPermissionEngine({
      roles: ROLES,
      cache,
      policies: [
        {
          name: "counter",
          permissions: ["post:read"],
          evaluate: () => {
            evaluations++;
            return { allowed: true };
          },
        },
      ],
    });

    const reader = actor("ada", { roles: ["reader"] });
    await engine.can(reader, "post:read");
    await engine.can(reader, "post:read", undefined, { skipCache: true });
    expect(evaluations).toBe(2);

    await engine.invalidateActor("ada");
    await engine.can(reader, "post:read");
    expect(evaluations).toBe(3);
  });

  it("does not cache a decision a policy marked uncacheable (PERM-08)", async () => {
    let evaluations = 0;
    const engine = createPermissionEngine({
      roles: ROLES,
      cache: createMemoryPermissionCache(),
      policies: [
        {
          name: "volatile",
          permissions: ["post:read"],
          cacheable: false,
          evaluate: () => {
            evaluations++;
            return { allowed: true };
          },
        },
      ],
    });

    const reader = actor("ada", { roles: ["reader"] });
    await engine.can(reader, "post:read");
    await engine.can(reader, "post:read");
    expect(evaluations).toBe(2);
  });

  it("keys decisions by resource so two resources do not share one (PERM-08)", async () => {
    const engine = createPermissionEngine({
      rules: [
        {
          effect: "allow",
          resource: "post",
          action: "update",
          condition: isOwner(),
        },
      ],
      cache: createMemoryPermissionCache(),
    });

    const ada = actor("ada");
    expect(
      await engine.can(ada, "post:update", { id: "1", ownerId: "ada" }),
    ).toBe(true);
    expect(
      await engine.can(ada, "post:update", { id: "2", ownerId: "bob" }),
    ).toBe(false);
  });
});

// ─── PERM-10 · Resolvers ───────────────────────────────────────────────────

describe("resolvers", () => {
  it("loads roles from a role resolver (PERM-10)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      roleResolver: createMemoryRoleResolver(new Map([["ada", ["editor"]]])),
    });
    // The actor carries no roles at all; they come from the resolver.
    expect(await engine.can(actor("ada"), "post:update")).toBe(true);
    expect(await engine.can(actor("bob"), "post:update")).toBe(false);
  });

  it("loads rules from a permission resolver (PERM-10)", async () => {
    const engine = createPermissionEngine({
      permissionResolver: createMemoryPermissionResolver(
        new Map<string, readonly PermissionRule[]>([
          ["ada", [{ effect: "allow", resource: "post", action: "read" }]],
        ]),
      ),
    });
    expect(await engine.can(actor("ada"), "post:read")).toBe(true);
    expect(await engine.can(actor("bob"), "post:read")).toBe(false);
  });

  it("reports a failing resolver and stays fail-closed (PERM-10)", async () => {
    const errors: unknown[] = [];
    const engine = createPermissionEngine({
      roleResolver: {
        resolveRoles: async () => {
          throw new Error("directory unavailable");
        },
      },
      onError: (error) => errors.push(error),
    });
    expect(await engine.can(actor("ada"), "post:read")).toBe(false);
    expect((errors[0] as Error).message).toBe("directory unavailable");
  });
});

// ─── PERM-11 · Fail closed ─────────────────────────────────────────────────

describe("failure handling", () => {
  it("denies rather than throwing on an unknown role (PERM-11)", async () => {
    const errors: unknown[] = [];
    const engine = createPermissionEngine({
      roles: ROLES,
      onError: (error) => errors.push(error),
    });

    const stale = actor("ada", { roles: ["role-that-was-deleted"] });
    const decision = await engine.check(stale, "post:read");
    expect(decision.allowed).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it("still honours the roles it knows alongside an unknown one (PERM-11)", async () => {
    const engine = createPermissionEngine({ roles: ROLES });
    const mixed = actor("ada", { roles: ["reader", "ghost"] });
    expect(await engine.can(mixed, "post:read")).toBe(true);
  });

  it("denies rather than throwing on a malformed permission (PERM-11)", async () => {
    const engine = createPermissionEngine({ roles: ROLES });
    const decision = await engine.check(
      actor("ada", { roles: ["admin"] }),
      "not-a-permission",
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("invalid_permission");
  });
});

// ─── PERM-12 … PERM-18 · HTTP middleware ───────────────────────────────────

interface TestContext extends HttpMiddlewareContext {
  readonly state: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
  };
}

function testContext(overrides?: {
  readonly signal?: AbortSignal;
}): TestContext {
  const state = new Map<string, unknown>();
  return {
    request: {
      id: "req-1",
      method: "GET",
      url: "/posts/1",
      path: "/posts/1",
      headers: new Map(),
      params: new Map(),
      query: new Map(),
    },
    response: { status: 200, headers: {} },
    state: {
      get: <T>(key: string) => state.get(key) as T | undefined,
      set: <T>(key: string, value: T) => {
        state.set(key, value);
      },
    },
    signal: overrides?.signal ?? new AbortController().signal,
    metadata: {},
  };
}

const nextOk = async (): Promise<HttpResponseContext> => ({
  status: 200,
  headers: {},
  body: "ok",
});

describe("http middleware", () => {
  const engine = createPermissionEngine({ roles: ROLES });

  it("extracts the actor itself when asked to (PERM-12)", async () => {
    const middleware = authorize(engine, "post:read", {
      extractActor: () => actor("ada", { roles: ["reader"] }),
    });

    const context = testContext();
    const response = await middleware(context, nextOk);
    expect((response as HttpResponseContext).status).toBe(200);
    expect(context.state.get(ACTOR_STATE_KEY)).toBeDefined();
    expect(
      context.state.get<PermissionDecision>(DECISION_STATE_KEY)?.allowed,
    ).toBe(true);
  });

  it("prefers an actor already in state", async () => {
    let extracted = 0;
    const middleware = createRequirePermissionMiddleware(engine, {
      permission: "post:read",
      extractActor: () => {
        extracted++;
        return actor("bob");
      },
    });

    const context = testContext();
    context.state.set(ACTOR_STATE_KEY, actor("ada", { roles: ["reader"] }));
    const response = await middleware(context, nextOk);
    expect((response as HttpResponseContext).status).toBe(200);
    expect(extracted).toBe(0);
  });

  it("returns 401 when there is no actor at all (PERM-16)", async () => {
    const middleware = authorize(engine, "post:read");
    const response = (await middleware(
      testContext(),
      nextOk,
    )) as HttpResponseContext;
    expect(response.status).toBe(401);
    expect(
      (response.headers as Record<string, string>)["www-authenticate"],
    ).toBe("Bearer");
  });

  it("returns 403 without leaking the internal reason (PERM-13)", async () => {
    const guarded = createPermissionEngine({
      roles: ROLES,
      policies: [
        {
          name: "secretInternalPolicyName",
          permissions: ["post:read"],
          evaluate: () => {
            throw new Error("boom");
          },
        },
      ],
    });

    const middleware = authorize(guarded, "post:read", {
      extractActor: () => actor("ada", { roles: ["reader"] }),
    });
    const response = (await middleware(
      testContext(),
      nextOk,
    )) as HttpResponseContext;

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain(
      "secretInternalPolicyName",
    );
    expect(JSON.stringify(response.body)).not.toContain("policy_error");
  });

  it("hands the real decision to a custom denied response (PERM-15)", async () => {
    let seen: PermissionDecision | undefined;
    const middleware = authorize(engine, "post:delete", {
      extractActor: () => actor("ada", { roles: ["reader"] }),
      deniedResponse: (decision) => {
        seen = decision;
        return { denied: true };
      },
    });

    await middleware(testContext(), nextOk);
    expect(seen?.allowed).toBe(false);
    expect(seen?.reason).toBe("no_matching_rule");
  });

  it("can require an actor in the actor middleware (PERM-17)", async () => {
    const permissive = createActorMiddleware({
      extractActor: () => undefined,
    });
    expect(
      ((await permissive(testContext(), nextOk)) as HttpResponseContext).status,
    ).toBe(200);

    const strict = createActorMiddleware({
      extractActor: () => undefined,
      requireActor: true,
    });
    expect(
      ((await strict(testContext(), nextOk)) as HttpResponseContext).status,
    ).toBe(401);
  });

  it("short-circuits a batch check on the first denial (PERM-18)", async () => {
    const checked: string[] = [];
    const emitter = createPermissionEventEmitter();
    emitter.on((event) => checked.push(event.permission));
    const counting = createPermissionEngine({ roles: ROLES, emitter });

    const middleware = createRequirePermissionsMiddleware(
      counting,
      ["post:delete", "post:read"],
      { extractActor: () => actor("ada", { roles: ["reader"] }) },
    );

    const context = testContext();
    const response = (await middleware(context, nextOk)) as HttpResponseContext;
    expect(response.status).toBe(403);
    expect(checked).toEqual(["post:delete"]);
    expect(
      context.state.get<Map<string, PermissionDecision>>(DECISIONS_STATE_KEY)
        ?.size,
    ).toBe(1);
  });

  it("supports any-of batches and a shared resource (PERM-18)", async () => {
    const middleware = createRequirePermissionsMiddleware(
      engine,
      ["post:delete", "post:read"],
      {
        mode: "any",
        extractActor: () => actor("ada", { roles: ["reader"] }),
        extractResource: () => ({ id: "1" }),
      },
    );
    const response = (await middleware(
      testContext(),
      nextOk,
    )) as HttpResponseContext;
    expect(response.status).toBe(200);
  });

  it("forwards the request signal to the engine (PERM-07)", async () => {
    const controller = new AbortController();
    controller.abort();
    const middleware = authorize(engine, "post:read", {
      extractActor: () => actor("ada", { roles: ["reader"] }),
    });

    await expect(
      middleware(testContext({ signal: controller.signal }), nextOk),
    ).rejects.toBeInstanceOf(AuthorizationAbortedError);
  });

  it("passes request metadata to conditions (PERM-02)", async () => {
    const tenantEngine = createPermissionEngine({
      rules: [
        {
          effect: "allow",
          resource: "invoice",
          action: "read",
          condition: tenantIsolation(),
        },
      ],
    });

    const middleware = authorize(tenantEngine, "invoice:read", {
      extractActor: () => actor("ada"),
      extractResource: () => ({ tenantId: "acme" }),
      extractMetadata: () => ({ tenantId: "acme" }),
    });

    const response = await middleware(testContext(), nextOk);
    expect((response as HttpResponseContext).status).toBe(200);
  });
});

// ─── PERM-14 · Error exposure ──────────────────────────────────────────────

describe("PermissionDeniedError", () => {
  it("keeps the actor id out of the exposed metadata (PERM-14)", async () => {
    const engine = createPermissionEngine({ roles: ROLES });
    let thrown: unknown;
    try {
      await engine.authorize(
        actor("ada", { roles: ["reader"] }),
        "post:delete",
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PermissionDeniedError);
    const error = thrown as PermissionDeniedError;
    expect(error.message).toBe("Access denied");
    expect(JSON.stringify(error.metadata)).not.toContain("ada");
    // The detail is still available for the log.
    expect(error.details.actorId).toBe("ada");
    expect(error.details.reason).toBe("no_matching_rule");
  });
});

// ─── PERM-19 / PERM-20 · Evaluator ─────────────────────────────────────────

describe("evaluator", () => {
  it("reaches the rule engine from a permission grant (PERM-19)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      rules: [
        { effect: "deny", resource: "post", action: "read", name: "blanket" },
      ],
    });
    // A deny rule beats the role's grant, which only works if grants and
    // rules meet in the same evaluation.
    expect(
      await engine.can(actor("ada", { roles: ["reader"] }), "post:read"),
    ).toBe(false);
  });

  it("explains the decision it actually made (PERM-20)", async () => {
    const engine = createPermissionEngine({ roles: ROLES });
    const reader = actor("ada", { roles: ["reader"] });

    const decision = await engine.check(reader, "post:read");
    const explained = await engine.explain(reader, "post:read");

    expect(explained.allowed).toBe(decision.allowed);
    expect(explained.decision.reason).toBe(decision.reason);
    expect(explained.steps.length).toBeGreaterThan(0);
  });

  it("keeps the trace free of unrelated grants (PERM-31)", async () => {
    const engine = createPermissionEngine({ roles: ROLES });
    const many = actor("ada", {
      permissions: ["post:read", "billing:read", "secret.project:read"],
    });

    const explained = await engine.explain(many, "post:read");
    const detail = explained.steps.map((step) => step.detail).join(" ");
    expect(detail).toContain("post:read");
    expect(detail).not.toContain("secret.project:read");
  });
});

// ─── PERM-22 / PERM-23 · Configuration ─────────────────────────────────────

describe("engine configuration", () => {
  it("rejects a malformed grant at construction (PERM-22)", () => {
    expect(() =>
      createPermissionEngine({
        roles: [{ name: "broken", permissions: ["post"] }],
      }),
    ).toThrow(InvalidRoleError);
  });

  it("rejects a duplicate role name (PERM-22)", () => {
    expect(() =>
      createPermissionEngine({
        roles: [
          { name: "dup", permissions: ["a:b"] },
          { name: "dup", permissions: ["c:d"] },
        ],
      }),
    ).toThrow(InvalidRoleError);
  });

  it("can skip validation when a caller insists (PERM-22)", () => {
    expect(() =>
      createPermissionEngine({
        roles: [{ name: "broken", permissions: ["post"] }],
        validateConfiguration: false,
      }),
    ).not.toThrow();
  });

  it("accepts a role registry as its role source (PERM-23)", async () => {
    const roles = createRoleRegistry();
    roles.define({ name: "reader", permissions: ["post:read"] });
    const engine = createPermissionEngine({ roles });

    expect(
      await engine.can(actor("ada", { roles: ["reader"] }), "post:read"),
    ).toBe(true);

    roles.define({ name: "writer", permissions: ["post:write"] });
    engine.invalidateRoles();
    expect(
      await engine.can(actor("ada", { roles: ["writer"] }), "post:write"),
    ).toBe(true);
  });

  it("accepts a policy registry as its policy source (PERM-23)", async () => {
    const policies = createPolicyRegistry();
    policies.define({
      name: "closed",
      permissions: ["post:*"],
      evaluate: () => ({ allowed: false }),
    });

    const engine = createPermissionEngine({ roles: ROLES, policies });
    expect(
      await engine.can(actor("ada", { roles: ["reader"] }), "post:read"),
    ).toBe(false);

    policies.clear();
    expect(
      await engine.can(actor("ada", { roles: ["reader"] }), "post:read"),
    ).toBe(true);
  });

  it("sorts a policy registry's matches by priority (PERM-05)", () => {
    const policies = createPolicyRegistry();
    policies.define({
      name: "low",
      priority: 1,
      permissions: ["post:read"],
      evaluate: () => ({ allowed: true }),
    });
    policies.define({
      name: "high",
      priority: 10,
      permissions: ["post:*"],
      evaluate: () => ({ allowed: true }),
    });
    expect(
      policies.forPermission("post:read").map((policy) => policy.name),
    ).toEqual(["high", "low"]);
  });
});

// ─── PERM-24 · Audit events ────────────────────────────────────────────────

describe("audit events", () => {
  it("emits for every check the engine makes (PERM-24)", async () => {
    const emitter = createPermissionEventEmitter();
    const events: string[] = [];
    emitter.on((event) => events.push(`${event.permission}:${event.allowed}`));

    const engine = createPermissionEngine({ roles: ROLES, emitter });
    await engine.can(actor("ada", { roles: ["reader"] }), "post:read");
    await engine.can(actor("ada", { roles: ["reader"] }), "post:delete");

    expect(events).toEqual(["post:read:true", "post:delete:false"]);
  });

  it("emits when a check throws (PERM-24)", async () => {
    const emitter = createPermissionEventEmitter();
    const events: { allowed: boolean; errored?: boolean }[] = [];
    emitter.on((event) => events.push(event));

    const controller = new AbortController();
    controller.abort();
    const engine = createPermissionEngine({ roles: ROLES, emitter });

    await expect(
      engine.check(actor("ada"), "post:read", undefined, {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AuthorizationAbortedError);

    expect(events).toHaveLength(1);
    expect(events[0]?.allowed).toBe(false);
    expect(events[0]?.errored).toBe(true);
  });

  it("reports a handler that throws instead of hiding it (PERM-24)", () => {
    const failures: unknown[] = [];
    const emitter = createPermissionEventEmitter({
      onHandlerError: (error) => failures.push(error),
    });
    emitter.on(() => {
      throw new Error("sink down");
    });

    expect(() =>
      emitter.emit({
        actorId: "ada",
        permission: "post:read",
        allowed: true,
        durationMs: 1,
      }),
    ).not.toThrow();
    expect((failures[0] as Error).message).toBe("sink down");
  });

  it("wraps a bare check through withObservability (PERM-24)", async () => {
    const emitter = createPermissionEventEmitter();
    const events: unknown[] = [];
    emitter.on((event) => events.push(event));

    const wrapped = withObservability(
      emitter,
      async (_actor: PermissionActor, _permission: string) => {
        throw new Error("nope");
      },
    );

    await expect(wrapped(actor("ada"), "post:read")).rejects.toThrow("nope");
    expect(events).toHaveLength(1);
  });

  it("instruments abilities too", async () => {
    const emitter = createPermissionEventEmitter();
    const events: unknown[] = [];
    emitter.on((event) => events.push(event));

    const engine = createPermissionEngine({ roles: ROLES, emitter });
    const ability = engine.createAbility(actor("ada", { roles: ["reader"] }));
    await ability.can("post:read");
    expect(events).toHaveLength(1);
  });
});

// ─── PERM-26 · Implied permissions ─────────────────────────────────────────

describe("implied permissions", () => {
  it("expands implications when the engine is asked to (PERM-26)", async () => {
    const permissions = createPermissionRegistry();
    permissions.define("post:admin", { implies: ["post:write"] });
    permissions.define("post:write", { implies: ["post:read"] });

    expect([...permissions.expandImplied("post:admin")].sort()).toEqual([
      "post:read",
      "post:write",
    ]);

    const engine = createPermissionEngine({
      expandImplied: (permission) => permissions.expandImplied(permission),
    });
    expect(
      await engine.can(
        actor("ada", { permissions: ["post:admin"] }),
        "post:read",
      ),
    ).toBe(true);
  });

  it("stops at a cycle (PERM-26)", () => {
    const permissions = createPermissionRegistry();
    permissions.define("a:x", { implies: ["b:x"] });
    permissions.define("b:x", { implies: ["a:x"] });
    expect(permissions.expandImplied("a:x")).toEqual(["b:x"]);
  });

  it("validates a structured permission too (PERM-26)", () => {
    const permissions = createPermissionRegistry();
    expect(() => permissions.define({ resource: "a b", action: "" })).toThrow(
      InvalidPermissionError,
    );
  });

  it("reports an unregistered permission through require() (PERM-26)", () => {
    const permissions = createPermissionRegistry();
    expect(() => permissions.require("post:read")).toThrow(
      "Permission not found",
    );
  });
});

// ─── PERM-27 · Role memoization ────────────────────────────────────────────

describe("role resolution", () => {
  it("walks the hierarchy once per distinct role (PERM-27)", async () => {
    let lookups = 0;
    const roles: RoleSourceLike = {
      get(name: string) {
        lookups++;
        return ROLES.find((role) => role.name === name);
      },
    };

    const engine = createPermissionEngine({ roles });
    const editor = actor("ada", { roles: ["editor"] });

    await engine.can(editor, "post:update");
    const afterFirst = lookups;
    await engine.can(editor, "post:update");

    expect(lookups).toBe(afterFirst);
  });

  it("collects rules attached to a role", async () => {
    const engine = createPermissionEngine({
      roles: [
        {
          name: "owner",
          permissions: [],
          rules: [
            {
              effect: "allow",
              resource: "post",
              action: "update",
              condition: isOwner(),
            },
          ],
        },
      ],
    });
    const ada = actor("ada", { roles: ["owner"] });
    expect(await engine.can(ada, "post:update", { ownerId: "ada" })).toBe(true);
    expect(await engine.can(ada, "post:update", { ownerId: "bob" })).toBe(
      false,
    );
  });

  it("returns rules and unknown roles together", () => {
    const resolution = resolveRolePermissions(["editor", "ghost"], (name) =>
      ROLES.find((role) => role.name === name),
    );
    expect(resolution.permissions).toContain("post:read");
    expect(resolution.unknownRoles).toEqual(["ghost"]);
  });
});

/** Minimal structural role source, matching what the engine accepts. */
interface RoleSourceLike {
  get(name: string): RoleDefinition | undefined;
}

// ─── Rule evaluation helpers ───────────────────────────────────────────────

describe("evaluateRulesSync", () => {
  it("skips conditional rules rather than applying them blindly", () => {
    const result = evaluateRulesSync(
      [
        {
          effect: "allow",
          resource: "post",
          action: "read",
          condition: () => true,
        },
      ],
      { resource: "post", action: "read" },
    );
    expect(result.allowed).toBe(false);
  });

  it("evaluates condition-free rules", () => {
    const result = evaluateRulesSync(
      [{ effect: "allow", resource: "post", action: "read" }],
      { resource: "post", action: "read" },
    );
    expect(result.allowed).toBe(true);
  });
});

describe("evaluateRules", () => {
  it("skips a conditional rule when no context is available", async () => {
    const result = await evaluateRules(
      [
        {
          effect: "allow",
          resource: "post",
          action: "read",
          condition: () => true,
        },
      ],
      { resource: "post", action: "read" },
    );
    expect(result.allowed).toBe(false);
  });

  it("reports which rules applied", async () => {
    const result = await evaluateRules(
      [
        { effect: "allow", resource: "post", action: "read", name: "a" },
        { effect: "allow", resource: "post", action: "*", name: "b" },
      ],
      { resource: "post", action: "read" },
    );
    expect(result.applicable.map((rule) => rule.name)).toEqual(["a", "b"]);
  });
});

// ─── Ability ───────────────────────────────────────────────────────────────

describe("Ability", () => {
  it("throws a clean denial from authorize()", async () => {
    const ability = createAbility(actor("ada"), {});
    await expect(ability.authorize("post:read")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });

  it("explains through the same evaluation", async () => {
    const ability = createAbility(
      actor("ada", { permissions: ["post:read"] }),
      {},
    );
    const explained = await ability.explain("post:read");
    expect(explained.allowed).toBe(true);
    expect(explained.decision.allowed).toBe(true);
  });
});

// ─── Cache key ─────────────────────────────────────────────────────────────

describe("permissionCacheKey", () => {
  it("delimits the actor id (PERM-09)", () => {
    expect(permissionCacheKey("1", "post:read")).toBe("actor:1|post:read");
    expect(permissionCacheKey("1", "post:read", "r1")).toBe(
      "actor:1|post:read|r1",
    );
  });
});
