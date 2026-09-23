/**
 * Post-1.4.0 regression: a policy with its own `effect: "grant"` grants when
 * it allows and abstains when it does not, so it can never take away what
 * the actor's roles grant. `defaultPolicyEffect: "grant"` keeps the pre-1.4
 * semantics, where a denying policy denies.
 */
import { describe, expect, it } from "vitest";
import {
  createPermissionActor,
  createPermissionEngine,
  type PermissionPolicyDefinition,
} from "../src/index.js";

interface Post {
  readonly authorId: string;
}

const roles = [
  { name: "editor", permissions: ["post:update"] },
  { name: "viewer", permissions: ["post:read"] },
];

const authorCanEdit: PermissionPolicyDefinition = {
  name: "author-can-edit",
  permissions: ["post:update"],
  effect: "grant",
  evaluate: ({ actor, resource }) => ({
    allowed: (resource as Post | undefined)?.authorId === actor.id,
  }),
};

const editor = createPermissionActor("ed", { roles: ["editor"] });
const author = createPermissionActor("au", { roles: ["viewer"] });
const stranger = createPermissionActor("st", { roles: ["viewer"] });
const post: Post = { authorId: "au" };

describe("effect: 'grant' abstains when it does not allow", () => {
  const engine = createPermissionEngine({ roles, policies: [authorCanEdit] });

  it("does not deny an editor whose role grants the permission", async () => {
    const decision = await engine.check(editor, "post:update", post);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("role_permission");
    expect(await engine.createAbility(editor).can("post:update", post)).toBe(
      true,
    );
  });

  it("grants the author, who has no role for it", async () => {
    const decision = await engine.check(author, "post:update", post);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("policy_allow");
  });

  it("denies someone who is neither", async () => {
    const decision = await engine.check(stranger, "post:update", post);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no_matching_rule");
  });

  it("abstains when it throws or times out, reporting the error", async () => {
    const errors: string[] = [];
    const failing = createPermissionEngine({
      roles,
      policyTimeout: 5,
      onError: (_error, source) => errors.push(source),
      policies: [
        {
          ...authorCanEdit,
          name: "throws",
          evaluate: () => {
            throw new Error("db down");
          },
        },
        {
          ...authorCanEdit,
          name: "hangs",
          evaluate: () => new Promise(() => {}),
        },
      ],
    });
    expect(await failing.can(editor, "post:update", post)).toBe(true);
    expect(await failing.can(author, "post:update", post)).toBe(false);
    expect(errors).toContain("Policy.throws");
    expect(errors).toContain("Policy.hangs");
  });
});

describe("what still denies", () => {
  it("(a) a constraining policy's false denies a role-granted permission", async () => {
    const engine = createPermissionEngine({
      roles,
      policies: [
        authorCanEdit,
        {
          name: "freeze",
          permissions: ["post:*"],
          evaluate: () => ({ allowed: false, reason: "frozen" }),
        },
      ],
    });
    const decision = await engine.check(editor, "post:update", post);
    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("freeze");
    expect(await engine.can(author, "post:update", post)).toBe(false);
  });

  it("(b) a grant policy's true cannot override an explicit deny rule", async () => {
    const engine = createPermissionEngine({
      roles,
      policies: [authorCanEdit],
      rules: [
        {
          resource: "post",
          action: "update",
          effect: "deny",
          name: "no-edits",
        },
      ],
    });
    const decision = await engine.check(author, "post:update", post);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("rule_deny");
  });

  it("(b) nor an actor's denied permission", async () => {
    const engine = createPermissionEngine({ roles, policies: [authorCanEdit] });
    const denied = createPermissionActor("au", {
      roles: ["viewer"],
      deniedPermissions: ["post:update"],
    });
    expect(await engine.can(denied, "post:update", post)).toBe(false);
  });

  it("(c) defaultPolicyEffect: 'grant' keeps the old semantics: a denying policy denies", async () => {
    const legacy: PermissionPolicyDefinition = {
      name: "author-only",
      permissions: ["post:update"],
      evaluate: authorCanEdit.evaluate,
    };
    const engine = createPermissionEngine({
      roles,
      policies: [legacy],
      defaultPolicyEffect: "grant",
    });
    expect(await engine.can(author, "post:update", post)).toBe(true);
    const decision = await engine.check(editor, "post:update", post);
    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("author-only");
  });

  it("(c) under defaultPolicyEffect: 'grant', an explicit effect: 'grant' still abstains", async () => {
    const engine = createPermissionEngine({
      roles,
      policies: [authorCanEdit],
      defaultPolicyEffect: "grant",
    });
    expect(await engine.can(editor, "post:update", post)).toBe(true);
    expect(await engine.can(author, "post:update", post)).toBe(true);
  });
});
