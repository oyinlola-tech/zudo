---
title: "Permissions"
description: "Decide what each logged-in user may do with @zudojs/permissions. Roles, resource:action permissions, wildcards, role hierarchy, owner rules, deny rules, policies and explain mode, and the mistakes that let a normal user become an admin."
source: https://zudojs.oyinlola.site/learn/zudo-permissions
---

LESSON 61 OF 84

Users and security Core

# Permissions

Decide what each logged-in user may do with @zudojs/permissions. Roles, resource:action permissions, wildcards, role hierarchy, owner rules, deny rules, policies and explain mode, and the mistakes that let a normal user become an admin.

- **45 min** to read and try
- **You need:** The Task API project and the authentication lesson
- **You build:** A Task API where members can only change their own tasks, admins can change any task, and every escalation attempt is refused

  [Test yourself](#test)

## Who are you, and what may you do?

In [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth) the Task API learned to answer one question: *who is making this request?* A valid token says "this is Ada". That is **authentication**.

This lesson answers the next question: *is Ada allowed to do this?* May she read task 3? Delete it? Change another user's password? That is **authorization**, and the part of your code that decides it is often called the **permission engine**.

The two questions have two different HTTP answers. You met both status codes in [the HTTP lesson](https://zudojs.oyinlola.site/learn/http-deep):

| Status | Meaning | Example |
| --- | --- | --- |
| `401 Unauthorized` | "I don't know who you are." Authentication failed. | No token, or an expired one. |
| `403 Forbidden` | "I know who you are, and the answer is no." Authorization failed. | Ada tries to delete Linus's task. |

Authorization bugs are among the most common serious security bugs in real APIs. A normal user who can act as an admin, or who can edit other people's data, is called a **privilege escalation**. A large part of this lesson shows those attacks against the Task API and checks that each one is refused.

Install the package in your `task-api` folder:

Terminal on your computer

```bash
$ npm install @zudojs/permissions
added 2 packages, and audited 3 packages in 7s

found 0 vulnerabilities
```

npm added two packages: `@zudojs/permissions` and `@zudojs/errors`, which it uses for its error classes. The numbers at the end depend on what your project already has.

> NOTE
>
> @zudojs/permissions works in the browser terminal too, so you can press **Run in browser** on most examples in this lesson. Only the server examples at the end need Node.js.

## Roles and permissions

The simplest way to organise authorization is **role-based access control**, or **RBAC**. You never give rights to people one by one. You give rights to a few **roles**, like `member` and `admin`, and you give each user one or more roles.

In @zudojs/permissions a right is a **permission string** with two parts, `resource:action`: `task:read` means "read tasks", `user:delete` means "delete users". Here are the Task API's roles:

roles.ts

```ts
import type { RoleDefinition } from "@zudojs/permissions";

export const roles: RoleDefinition[] = [
  { name: "viewer", permissions: ["task:read"] },
  { name: "member", permissions: ["task:create"], inherits: ["viewer"] },
  { name: "admin", permissions: ["task:*", "user:read"], inherits: ["member"] },
];
```

`inherits` builds a **role hierarchy**: a member can do everything a viewer can, plus create tasks. An admin can do everything a member can, plus every action on tasks (`task:*`) and reading users. Now give the roles to an engine and ask it questions:

can.ts

```ts
import { createPermissionActor, createPermissionEngine } from "@zudojs/permissions";
import { roles } from "./roles.js";

const engine = createPermissionEngine({ roles });

const ada = createPermissionActor("ada", { roles: ["member"] });
const grace = createPermissionActor("grace", { roles: ["admin"] });

console.log("ada task:read  ", await engine.can(ada, "task:read"));
console.log("ada task:create", await engine.can(ada, "task:create"));
console.log("ada task:delete", await engine.can(ada, "task:delete"));
console.log("ada user:read  ", await engine.can(ada, "user:read"));
console.log("grace task:delete", await engine.can(grace, "task:delete"));
console.log("grace user:delete", await engine.can(grace, "user:delete"));
```

Output of `npx tsx can.ts` and of the browser terminal

```ts
ada task:read   true
ada task:create true
ada task:delete false
ada user:read   false
grace task:delete true
grace user:delete false
```

The person or program asking is called the **actor**. `createPermissionActor(id, { roles })` builds one. Every check takes the actor and a permission string, and `can` answers `true` or `false`. It is `async`, because some checks load data, so you `await` it.

Notice the default: anything no role grants is refused. Grace is an admin, but nobody gave any role `user:delete`, so she cannot delete users. An authorization system should always **deny by default**.

## Wildcards, and how they go wrong

A `*` in a permission means "any". The package supports exactly these forms:

| Pattern | Matches |
| --- | --- |
| `task:read` | Only that permission. |
| `task:*` | Every action on tasks: read, update, delete, and any action you add next year. |
| `*:read` | Read on every resource, including ones you have not written yet. |
| `*:*` | Everything. A "super admin". |
| `billing.*:read` | `billing:read`, `billing.invoice:read`, and so on. |

Wildcards are short to write, and that is exactly the danger. Suppose someone wants members to "read everything they need" and writes `*:read`. It works for tasks. It also quietly grants every other kind of read in the API:

wildcard-mistake.ts

```ts
import { createPermissionActor, createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [{ name: "member", permissions: ["*:read", "task:create"] }],
});
const ada = createPermissionActor("ada", { roles: ["member"] });

for (const permission of ["task:read", "user:read", "audit.log:read", "billing.invoice:read"]) {
  console.log(permission.padEnd(20), await engine.can(ada, permission));
}
```

Output of `npx tsx wildcard-mistake.ts` and of the browser terminal

```ts
task:read            true
user:read            true
audit.log:read       true
billing.invoice:read true
```

Ada can now read every user, the audit log and every invoice. Nothing failed and nothing was logged: the engine did exactly what the role said. The fix is to list what a role needs, `task:read`, and to keep wildcards for roles that really should have everything under a name, like an admin's `task:*`.

> SECURITY: A WILDCARD GROWS WITH YOUR API
>
> A wildcard grants permissions that do not exist yet. When you add `user:export` next month, every role holding `user:*` or `*:*` gets it on day one. Review wildcard grants whenever you add a new action.

Some patterns look like wildcards but mean nothing to the matcher. A grant like that could never match, so the engine refuses it when you create it, instead of letting a broken rule sit in your role table:

bad-patterns.ts

```ts
import { createPermissionEngine } from "@zudojs/permissions";

for (const grant of ["*", "task", "task*:read", "task:read "]) {
  try {
    createPermissionEngine({ roles: [{ name: "member", permissions: [grant] }] });
    console.log(JSON.stringify(grant), "accepted");
  } catch (error) {
    if (error instanceof Error) console.log(error.name, "-", error.message);
  }
}
```

Output of `npx tsx bad-patterns.ts` and of the browser terminal

```ts
InvalidRoleError - Role "member" grants "*", which is not a valid "resource:action" permission
InvalidRoleError - Role "member" grants "task", which is not a valid "resource:action" permission
InvalidRoleError - Role "member" grants "task*:read", which is not a valid "resource:action" permission
InvalidRoleError - Role "member" grants "task:read ", which is not a valid "resource:action" permission
```

Even a trailing space is caught. Failing loudly at startup is much better than a permission that silently never works, or a deny rule that silently never denies.

## Decisions, reasons and unknown roles

`can` gives you a boolean. `check` gives you the whole **decision**, with a machine-readable `reason`. Use it when you need to log why something was refused. The `onError` option reports problems the engine noticed but did not throw for:

check.ts

```ts
import { createPermissionActor, createPermissionEngine } from "@zudojs/permissions";
import { roles } from "./roles.js";

const engine = createPermissionEngine({
  roles,
  onError: (error, source) => {
    if (error instanceof Error) console.log(`[${source}] ${error.message}`);
  },
});

const ada = createPermissionActor("ada", { roles: ["member"] });
console.log(await engine.check(ada, "task:create"));
console.log(await engine.check(ada, "task:delete"));

const typo = createPermissionActor("sam", { roles: ["Admin"] });
console.log(await engine.check(typo, "task:delete"));
```

Output of `npx tsx check.ts` and of the browser terminal

```json
{
  allowed: true,
  reason: 'role_permission',
  matchedPermission: 'task:create'
}
{
  allowed: false,
  reason: 'no_matching_rule',
  publicReason: 'Access denied'
}
[RoleHierarchy] Unknown role "Admin" for actor "sam"
{
  allowed: false,
  reason: 'no_matching_rule',
  publicReason: 'Access denied'
}
```

Two things to notice:

- Role names are compared exactly. `"Admin"` is not `"admin"`. An unknown role gives nothing, and the engine reports it through `onError` so you can fix the data. Every failure in this package denies. None of them turns into a pass.
- A denied decision has two reasons. `reason` is for your logs. `publicReason` (`"Access denied"`) is the only one that is safe to send to the client. Internal reasons can name your rules and policies, which tells an attacker how your system works.

## Resource rules: only the owner may edit

Roles alone cannot say "a member may edit *their own* tasks". The answer depends on the task, not only on the user. Rules that look at the actor and at the resource are called **attribute-based access control**, or **ABAC**.

In @zudojs/permissions you add a **rule** with a **condition**. The rule only applies when the condition returns `true`. `isOwner(field)` is a ready-made condition: it compares `resource[field]` with the actor's id. The Task API stores the owner in `userId`, so you pass that name:

task-engine.ts

```ts
import { createPermissionEngine, isOwner } from "@zudojs/permissions";

export const engine = createPermissionEngine({
  roles: [
    {
      name: "member",
      permissions: ["task:read", "task:create"],
      rules: [
        { name: "own-tasks", effect: "allow", resource: "task", action: ["update", "delete"], condition: isOwner("userId") },
      ],
    },
    { name: "admin", permissions: ["task:*"], inherits: ["member"] },
  ],
});
```

The engine lives in its own file, `task-engine.ts`, so the rest of the Task API can import it. Now check a few tasks:

owner.ts

```ts
import { createPermissionActor } from "@zudojs/permissions";
import { engine } from "./task-engine.js";

const task1 = { id: 1, userId: "ada", title: "Buy milk" };
const task3 = { id: 3, userId: "linus", title: "Fix bug" };
const ada = createPermissionActor("ada", { roles: ["member"] });
const grace = createPermissionActor("grace", { roles: ["admin"] });

console.log("ada updates her task 1:  ", await engine.can(ada, "task:update", task1));
console.log("ada updates linus task 3:", await engine.can(ada, "task:update", task3));
console.log("ada, no task given:      ", await engine.can(ada, "task:update"));
console.log("grace updates task 3:    ", await engine.can(grace, "task:update", task3));
```

Output of `npx tsx owner.ts` and of the browser terminal

```ts
ada updates her task 1:   true
ada updates linus task 3: false
ada, no task given:       false
grace updates task 3:     true
```

The third argument of `can` is the **resource**: the task being changed. Without it, the owner rule has nothing to compare, so it does not apply, and Ada is refused. That is the safe choice. The admin passes through `task:*` and never needs the rule.

Always load the resource from your database before the check, using the id in the URL. Never check against a task object the client sent in the request body: the client would just write its own id into `userId`.

## Escalation 1: comparing the wrong ids

Here is a real-world bug. Someone writes `isOwner("id")`, thinking "compare the ids". But that compares the *task's* id with the *user's* id. Users and tasks are numbered separately, so user 3 "owns" task 3, whoever created it:

wrong-id.ts

```ts
import { createPermissionActor, createPermissionEngine, isOwner } from "@zudojs/permissions";

function engineWith(field: string) {
  return createPermissionEngine({
    roles: [{
      name: "member",
      permissions: ["task:read"],
      rules: [{ effect: "allow", resource: "task", action: "delete", condition: isOwner(field) }],
    }],
  });
}

// Linus owns task 3. The attacker is user "3" in the users table.
const task3 = { id: 3, userId: "linus", title: "Fix bug" };
const attacker = createPermissionActor("3", { roles: ["member"] });

console.log('isOwner("id")     ', await engineWith("id").can(attacker, "task:delete", task3));
console.log('isOwner("userId") ', await engineWith("userId").can(attacker, "task:delete", task3));
console.log('isOwner() default ', await engineWith("ownerId").can(attacker, "task:delete", task3));
```

Output of `npx tsx wrong-id.ts` and of the browser terminal

```ts
isOwner("id")      true
isOwner("userId")  false
isOwner() default  false
```

With `isOwner("id")`, the attacker deleted Linus's task: `task3.id` is `3`, the attacker's id is `"3"`, and they match. (`isOwner` treats the number `3` and the string `"3"` as the same id on purpose, because ids from a database are often numbers while ids from a token are strings.) With the right field, `userId`, the attack is refused.

The last line shows the other way to get the field wrong. `isOwner()` with no argument reads `ownerId`, which Task API tasks do not have. That check is *safe* (a missing owner never matches) but useless: even Ada could not delete her own tasks. Test both directions every time you write an owner rule: the owner is allowed, and somebody else is refused.

## Escalation 2: a condition that passes when data is missing

You can write your own conditions. A condition is a function that receives a **context** with the `actor`, the `resource`, and `metadata`: facts about the request that you pass in, such as the team the user's token belongs to.

Suppose tasks belong to teams, and users may only read tasks of their own team. This hand-written condition looks right:

missing-attr.ts

```ts
import { createPermissionActor, createPermissionEngine, tenantIsolation } from "@zudojs/permissions";
import type { PermissionConditionFn } from "@zudojs/permissions";

const sameTeamByHand: PermissionConditionFn = (ctx) =>
  (ctx.resource as { teamId?: string }).teamId === ctx.metadata?.get("teamId");

function engineWith(condition: PermissionConditionFn) {
  return createPermissionEngine({
    roles: [{ name: "member", permissions: [], rules: [{ effect: "allow", resource: "task", action: "read", condition }] }],
  });
}

const ada = createPermissionActor("ada", { roles: ["member"] });
const teamTask = { id: 4, teamId: "blue", title: "Plan sprint" };
const oldTask = { id: 5, title: "Imported from the old system" };

for (const [name, condition] of [["by hand", sameTeamByHand], ["tenantIsolation", tenantIsolation("teamId", "teamId")]] as const) {
  const engine = engineWith(condition);
  console.log(name);
  console.log("  team red reads blue task:  ", await engine.can(ada, "task:read", teamTask, { metadata: { teamId: "red" } }));
  console.log("  team blue reads blue task: ", await engine.can(ada, "task:read", teamTask, { metadata: { teamId: "blue" } }));
  console.log("  no team reads task, no team:", await engine.can(ada, "task:read", oldTask));
}
```

Output of `npx tsx missing-attr.ts` and of the browser terminal

```ts
by hand
  team red reads blue task:   false
  team blue reads blue task:  true
  no team reads task, no team: true
tenantIsolation
  team red reads blue task:   false
  team blue reads blue task:  true
  no team reads task, no team: false
```

Look at the last line of the hand-written version. The old task has no `teamId`, and this request carried no team either. The condition compares `undefined === undefined`, which is `true`, so a user with no team can read every task that was imported without one.

The built-in `tenantIsolation(actorField, resourceField)` denies when *either* side is missing. That is the rule for every condition you write: **missing data must mean no**. Check that the values exist before you compare them.

> SECURITY: WHERE METADATA COMES FROM
>
> The `teamId` in `metadata` must come from something the client cannot choose: the verified token, or your database. If you fill it from a request header or the query string, an attacker simply sends the task's team and passes.

> NOTE
>
> This works because the `member` role grants nothing by itself: the rule is the only way in. Grants add up, so if a role also granted `task:read`, that grant alone would let team red read blue tasks, and this allow rule would change nothing. When a role grants the permission, enforce the team with a deny rule instead, `condition: not(tenantIsolation("teamId", "teamId"))`. Deny rules beat every grant; the next section shows how they work.

## Deny rules

A rule can also say no. A **deny rule** refuses access even when a role allows it. By default the engine uses **deny-overrides**: if any deny rule applies, the answer is no, whatever else said yes. Here, a locked task cannot be changed by anyone, not even an admin:

deny.ts

```ts
import { createPermissionActor, createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [{ name: "admin", permissions: ["task:*"] }],
  rules: [{
    name: "locked-tasks",
    effect: "deny",
    resource: "task",
    action: ["update", "delete"],
    condition: (ctx) => (ctx.resource as { locked?: boolean }).locked === true,
  }],
  onError: (error, source) => {
    if (error instanceof Error) console.log(`[${source}] ${error.message}`);
  },
});

const grace = createPermissionActor("grace", { roles: ["admin"] });
console.log("normal task:", (await engine.check(grace, "task:update", { id: 1 })).allowed);
console.log("locked task:", await engine.check(grace, "task:update", { id: 2, locked: true }));
console.log("no task:    ", await engine.check(grace, "task:update"));
```

Output of `npx tsx deny.ts` and of the browser terminal

```ts
normal task: true
locked task: {
  allowed: false,
  reason: 'rule_deny',
  publicReason: 'Access denied',
  matchedPermission: 'task:update',
  policy: 'locked-tasks'
}
[RuleCondition.locked-tasks] Cannot read properties of undefined (reading 'locked')
no task:     {
  allowed: false,
  reason: 'rule_deny',
  publicReason: 'Access denied',
  matchedPermission: 'task:update',
  policy: 'locked-tasks'
}
```

The last check is interesting. With no task, the condition reads `.locked` of `undefined` and throws. The engine does not know if the task is locked, so it applies the deny rule: it **fails closed**. It also reported the error through `onError` (the line in square brackets), so you learn about the bug.

The rule is the opposite for allow rules: an allow rule whose condition throws simply does not apply. Either way, an error can only make the answer "no".

## Escalation 3: roles from the request body

The most common escalation in real APIs has nothing to do with the permission engine. It happens when the actor is built from data the client sent. A beginner's PATCH handler often copies the whole body into an object, and that object ends up being the actor:

body-escalation.ts

```ts
import { createPermissionActor, isOwner, createPermissionEngine } from "@zudojs/permissions";
import type { PermissionActor } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [
    { name: "member", permissions: ["task:read"], rules: [
      { effect: "allow", resource: "task", action: ["update", "delete"], condition: isOwner("userId") },
    ] },
    { name: "admin", permissions: ["task:*"] },
  ],
});
const usersTable = new Map([["ada", { roles: ["member"] }], ["grace", { roles: ["admin"] }]]);
const task3 = { id: 3, userId: "linus", title: "Fix bug" };

// INSECURE: the body can overwrite any field of the actor.
function insecureActor(userId: string, body: object): PermissionActor {
  return { id: userId, roles: ["member"], ...body };
}
// SECURE: the id comes from the verified token, the roles from your own database.
function secureActor(userId: string): PermissionActor {
  return createPermissionActor(userId, { roles: usersTable.get(userId)?.roles ?? [] });
}

for (const raw of ['{"title":"x","roles":["admin"]}', '{"title":"x","id":"linus"}']) {
  const body = JSON.parse(raw) as object;
  console.log(raw);
  console.log("  insecure:", await engine.can(insecureActor("ada", body), "task:delete", task3));
  console.log("  secure:  ", await engine.can(secureActor("ada"), "task:delete", task3));
}
```

Output of `npx tsx body-escalation.ts` and of the browser terminal

```json
{"title":"x","roles":["admin"]}
  insecure: true
  secure:   false
{"title":"x","id":"linus"}
  insecure: true
  secure:   false
```

Two attacks, both successful against the insecure version. In the first, Ada sends `"roles": ["admin"]` and becomes an admin. In the second she sends `"id": "linus"` and becomes the owner of Linus's task. The engine was correct both times. It was given a lie.

The rules that stop this whole family of bugs:

- The actor's **id** comes only from the verified token or session ([the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth)).
- The actor's **roles** come only from your database, or from a token *your* server signed.
- The request body is validated with a schema that lists the fields a client may send ([the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation)). A `role`, `roles`, `userId` or `isAdmin` field in a task update is not on that list.
- Changing a user's role is its own endpoint, protected by its own permission, such as `user:update-role`, that only admins have.

## Escalation 4: a policy that says yes

A **policy** is a named function that runs on every check for the permissions it lists. It returns a decision. Policies are good for a restriction like "tasks can only be changed during office hours". By default a policy is a **constraint**: its "no" refuses the request, but its "yes" only means "no objection". The user's roles and rules must still grant the permission:

policy.ts

```ts
import { createPermissionActor, createPermissionEngine, isOwner } from "@zudojs/permissions";
import type { PermissionPolicyDefinition } from "@zudojs/permissions";

const officeHours: PermissionPolicyDefinition = {
  name: "office-hours",
  permissions: ["task:create", "task:update", "task:delete"],
  cacheable: false,
  evaluate: (ctx) => {
    const hour = ctx.metadata?.get("hour");
    return typeof hour === "number" && hour >= 9 && hour < 17
      ? { allowed: true }
      : { allowed: false, reason: "outside_office_hours" };
  },
};

const engine = createPermissionEngine({
  roles: [{ name: "member", permissions: ["task:read"], rules: [
    { name: "own-tasks", effect: "allow", resource: "task", action: "delete", condition: isOwner("userId") },
  ] }],
  policies: [officeHours],
});

const guest = createPermissionActor("guest-17");
const ada = createPermissionActor("ada", { roles: ["member"] });
const adasTask = { id: 1, userId: "ada" };
console.log("guest 10:00", await engine.can(guest, "task:delete", adasTask, { metadata: { hour: 10 } }));
console.log("ada   10:00", await engine.check(ada, "task:delete", adasTask, { metadata: { hour: 10 } }));
console.log("ada   20:00", await engine.check(ada, "task:delete", adasTask, { metadata: { hour: 20 } }));
console.log("ada   no hour", await engine.can(ada, "task:delete", adasTask));
```

Output of `npx tsx policy.ts` and of the browser terminal

```ts
guest 10:00 false
ada   10:00 {
  allowed: true,
  reason: 'role_permission',
  matchedPermission: 'task:delete',
  policy: 'office-hours'
}
ada   20:00 {
  allowed: false,
  reason: 'outside_office_hours',
  policy: 'office-hours',
  publicReason: 'Access denied'
}
ada   no hour false
```

The guest has no role that grants `task:delete`, so office hours change nothing for them. Ada may delete her own task at 10:00, because her `own-tasks` rule grants it and the policy has no objection. At 20:00 the policy refuses, and the decision names it. With no hour at all the policy also says no: missing data means no. The hour comes from your server's clock, which you pass in as metadata. That also makes the rule easy to test, as you just saw.

A policy can also *grant* access on its own, if you write `effect: "grant"`. That is where the escalation hides. Here is the same office-hours policy with that one extra line:

policy-grant.ts

```ts
import { createPermissionActor, createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [{ name: "member", permissions: ["task:read"] }],
  policies: [{
    name: "office-hours",
    effect: "grant",
    permissions: ["task:*"],
    cacheable: false,
    evaluate: (ctx) => {
      const hour = ctx.metadata?.get("hour");
      return typeof hour === "number" && hour >= 9 && hour < 17
        ? { allowed: true }
        : { allowed: false, reason: "outside_office_hours" };
    },
  }],
});

const guest = createPermissionActor("guest-17");
console.log("BAD 10:00", await engine.check(guest, "task:delete", { id: 3 }, { metadata: { hour: 10 } }));
```

Output of `npx tsx policy-grant.ts` and of the browser terminal

```ts
BAD 10:00 { allowed: true, reason: 'policy_allow', policy: 'office-hours' }
```

A guest with **no roles at all** may now delete any task, as long as it is office hours. A granting policy's "yes" is a real grant, even when no role gave the permission. So keep the default for restrictions, and use `effect: "grant"` only for a policy that proves the right by itself, such as "the actor owns this resource". (Before @zudojs/permissions 1.4.0 every policy granted like this, and the package's own README taught the office-hours example this way.)

## Explain mode: why was that refused?

When a real user says "I can't delete my task", you need to know why. `explain` runs the same check and also returns every step the engine took:

explain.ts

```ts
import { createPermissionActor } from "@zudojs/permissions";
import { engine } from "./task-engine.js";

const ada = createPermissionActor("ada", { roles: ["member"] });

for (const task of [{ id: 3, userId: "linus" }, { id: 1, userId: "ada" }]) {
  const result = await engine.explain(ada, "task:delete", task);
  console.log(`ada deletes task ${task.id}:`);
  for (const step of result.steps) {
    console.log(" ", step.matched ? "yes" : "no ", step.type.padEnd(10), step.detail);
  }
}
```

Output of `npx tsx explain.ts` and of the browser terminal

```ts
ada deletes task 3:
  yes role       Role: member
  no  permission No permission matched "task:delete" among 2 granted
  no  deny       Decision: deny (no_matching_rule)
ada deletes task 1:
  yes role       Role: member
  no  permission No permission matched "task:delete" among 2 granted
  yes rule       Rule allow: own-tasks
  yes permission Decision: allow (role_permission)
```

Read the two traces. In both, Ada's role was found, and none of her two granted permissions (`task:read`, `task:create`) is `task:delete`. For task 3 nothing else applied, so the answer is the default: deny, `no_matching_rule`. For task 1 the `own-tasks` rule applied, because she owns it. That is why naming your rules pays off: the trace tells you which one decided.

Explain mode is for your logs and your debugging. Do not send its steps to a client: they describe your roles and rules.

## Permissions in the Task API

Now put the engine behind real HTTP routes. You built the router in [the HTTP lesson](https://zudojs.oyinlola.site/learn/zudo-http). Every route that changes a task does three things, in this order:

1. **Authenticate**: find the user from the token. No user means `401`.
2. **Load** the task from the database by the id in the URL. No task means `404`.
3. **Authorize**: ask the engine about *this* user and *this* task. No means `403`.

Authenticating first means an anonymous caller cannot even learn which task ids exist. To keep the example in one file, a small `sessions` map stands in for the token checks from [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth), and a `Map` stands in for the database. The example starts the server, sends it six requests, prints the answers and stops:

server.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter, forbidden, notFound, unauthorized } from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";
import { createPermissionActor, createPermissionEngine, isOwner } from "@zudojs/permissions";
import type { PermissionActor } from "@zudojs/permissions";

interface Task { id: number; userId: string; title: string }
const tasks = new Map<number, Task>([[1, { id: 1, userId: "ada", title: "Buy milk" }], [3, { id: 3, userId: "linus", title: "Fix bug" }]]);
const userRoles = new Map([["ada", ["member"]], ["linus", ["member"]], ["grace", ["admin"]]]);
const sessions = new Map<string, string>(); // token -> user id, filled at login

const engine = createPermissionEngine({
  roles: [
    { name: "member", permissions: ["task:read"], rules: [
      { name: "own-tasks", effect: "allow", resource: "task", action: ["update", "delete"], condition: isOwner("userId") },
    ] },
    { name: "admin", permissions: ["task:*"], inherits: ["member"] },
  ],
});

function currentActor(request: HttpRequestContext): PermissionActor {
  const token = request.getHeader("authorization")?.replace(/^Bearer /, "");
  const userId = token ? sessions.get(token) : undefined;
  if (!userId) throw unauthorized("Log in first");
  return createPermissionActor(userId, { roles: userRoles.get(userId) ?? [] });
}

const router = createRouter();
router.delete("/tasks/:id", async (ctx) => {
  const actor = currentActor(ctx.request);
  const task = tasks.get(Number(ctx.params.id));
  if (!task) throw notFound("No such task");
  const decision = await engine.check(actor, "task:delete", task);
  if (!decision.allowed) throw forbidden(decision.publicReason);
  tasks.delete(task.id);
  return createResponseContext().json({ deleted: task.id });
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 0 }),
  handler: async (request: HttpRequestContext) => (await router.dispatch(request)).response,
});
await server.start();

function login(userId: string): string {
  const token = randomUUID();
  sessions.set(token, userId);
  return token;
}
async function del(id: number, token?: string, body?: object): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${server.address?.port}/tasks/${id}`, {
    method: "DELETE",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  console.log(`DELETE /tasks/${id}`, res.status, await res.text());
}

const ada = login("ada");
await del(3);
await del(3, ada);
await del(3, ada, { roles: ["admin"], id: "linus" });
await del(9, ada);
await del(1, ada);
await del(3, login("grace"));
await server.stop();
```

Output of `npx tsx server.ts`

```ts
DELETE /tasks/3 401 {"error":"Log in first","code":"UNAUTHORIZED"}
DELETE /tasks/3 403 {"error":"Access denied","code":"FORBIDDEN"}
DELETE /tasks/3 403 {"error":"Access denied","code":"FORBIDDEN"}
DELETE /tasks/9 404 {"error":"No such task","code":"NOT_FOUND"}
DELETE /tasks/1 200 {"deleted":1}
DELETE /tasks/3 200 {"deleted":3}
```

Line by line:

- No token: `401`, before the task is even looked up.
- Ada deletes Linus's task: `403`. The body says only `"Access denied"`, the public reason.
- Ada tries both body attacks from above at once: still `403`. The handler never reads the body to decide who Ada is.
- A task that does not exist: `404`.
- Ada deletes her own task, and Grace, an admin, deletes Linus's: both `200`.

`unauthorized()`, `forbidden()` and `notFound()` from @zudojs/http create errors that carry their status code. When a handler throws one, the server answers with that status, as you saw in [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors).

Run it on your computer. The server needs @zudojs/http, which the Task API already has:

Terminal on your computer

```bash
$ npx tsx server.ts
```

It prints the same six lines as above and exits.

### The ready-made guard

Many routes do not need a loaded resource: "only admins may list users" depends on the role alone. For those, @zudojs/permissions has a ready-made route guard, `authorize(engine, permission, options)`. You give it `extractActor`, which returns the actor or `undefined`, and put it in the route's `middleware` list:

guard.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";
import { authorize, createPermissionActor, createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [{ name: "member", permissions: ["task:read"] }, { name: "admin", permissions: ["task:*", "user:read"] }],
});
const userRoles = new Map([["ada", ["member"]], ["grace", ["admin"]]]);
const sessions = new Map([["token-ada", "ada"], ["token-grace", "grace"]]);

const canReadUsers = authorize(engine, "user:read", {
  extractActor: ({ request }) => {
    const token = request.getHeader?.("authorization")?.replace(/^Bearer /, "");
    const userId = token ? sessions.get(token) : undefined;
    return userId ? createPermissionActor(userId, { roles: userRoles.get(userId) ?? [] }) : undefined;
  },
});

const router = createRouter();
router.get("/admin/users", () => createResponseContext().json(["ada", "grace"]), { middleware: [canReadUsers] });

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 0 }),
  handler: async (request: HttpRequestContext) => (await router.dispatch(request)).response,
});
await server.start();
for (const token of [undefined, "token-ada", "token-grace"]) {
  const res = await fetch(`http://127.0.0.1:${server.address?.port}/admin/users`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  console.log(token ?? "no token", res.status, await res.text());
}
await server.stop();
```

Output of `npx tsx guard.ts`

```ts
no token 401 {"error":"Unauthorized","message":"Authentication required"}
token-ada 403 {"error":"Forbidden","message":"Access denied"}
token-grace 200 ["ada","grace"]
```

No actor means `401`, an actor without `user:read` means `403`, and only then does the handler run. (Since @zudojs/permissions 1.4.0 with @zudojs/http 1.4.0 the guard answers with these real status codes and fits the router's types without a cast.) The guard also takes an `extractResource` loader, but for a task route keep the three steps in the handler, as above: a guard would answer a missing task with `403`, not `404`.

## Practice

TRY IT YOURSELF

### An editor role

Add an `editor` role to `roles.ts`. Editors can do everything a member can, and can update any task, but must not delete tasks. Print a small table of `task:update` and `task:delete` for a member, an editor and an admin.

**Show a solution**

editor.ts

```ts
import { createPermissionActor, createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [
    { name: "viewer", permissions: ["task:read"] },
    { name: "member", permissions: ["task:create"], inherits: ["viewer"] },
    { name: "editor", permissions: ["task:update"], inherits: ["member"] },
    { name: "admin", permissions: ["task:*", "user:read"], inherits: ["editor"] },
  ],
});

for (const role of ["member", "editor", "admin"]) {
  const actor = createPermissionActor(`user-${role}`, { roles: [role] });
  const update = await engine.can(actor, "task:update");
  const remove = await engine.can(actor, "task:delete");
  console.log(role.padEnd(7), "update:", update, " delete:", remove);
}
```

Output of `npx tsx editor.ts` and of the browser terminal

```ts
member  update: false  delete: false
editor  update: true  delete: false
admin   update: true  delete: true
```

The editor gets the one exact permission it needs, `task:update`, not `task:*`, which would include delete.

TRY IT YOURSELF

### Find the escalation

A teammate wrote this condition so that support staff can read any task: `(ctx) => ctx.metadata?.get("support") === true`, and filled the metadata with `{ support: request.getHeader("x-support") === "yes" }`. What can an attacker do, and how do you fix it?

**Show a solution**

Anyone can send the header `x-support: yes` and read every task. The fix is to make support a **role**, stored in your database, and grant it `task:read`. The client never gets to say which role it has:

support.ts

```ts
import { createPermissionActor, createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [{ name: "member", permissions: [] }, { name: "support", permissions: ["task:read"] }],
});
const rolesInDatabase = new Map([["ada", ["member"]], ["sam", ["support"]]]);

for (const userId of ["ada", "sam"]) {
  const actor = createPermissionActor(userId, { roles: rolesInDatabase.get(userId) ?? [] });
  console.log(userId, await engine.can(actor, "task:read", { id: 3, userId: "linus" }));
}
```

Output of `npx tsx support.ts` and of the browser terminal

```ts
ada false
sam true
```

TRY IT YOURSELF

### Locked tasks, but only for members

Change the deny rule from the deny section so that a locked task stops members, but an admin can still update it. Use `allOf` and `not` from the package to combine conditions.

**Show a solution**

locked.ts

```ts
import { allOf, createPermissionActor, createPermissionEngine, isOwner, not } from "@zudojs/permissions";
import type { PermissionConditionFn } from "@zudojs/permissions";

const isLocked: PermissionConditionFn = (ctx) => (ctx.resource as { locked?: boolean }).locked === true;
const isAdmin: PermissionConditionFn = (ctx) => ctx.actor.roles?.includes("admin") === true;

const engine = createPermissionEngine({
  roles: [
    { name: "member", permissions: [], rules: [{ effect: "allow", resource: "task", action: "update", condition: isOwner("userId") }] },
    { name: "admin", permissions: ["task:*"] },
  ],
  rules: [{ name: "locked", effect: "deny", resource: "task", action: "update", condition: allOf(isLocked, not(isAdmin)) }],
});

const lockedTask = { id: 1, userId: "ada", locked: true };
console.log("ada:  ", await engine.can(createPermissionActor("ada", { roles: ["member"] }), "task:update", lockedTask));
console.log("grace:", await engine.can(createPermissionActor("grace", { roles: ["admin"] }), "task:update", lockedTask));
```

Output of `npx tsx locked.ts` and of the browser terminal

```ts
ada:   false
grace: true
```

`isAdmin` reads the roles on the actor, which your server built from the database, so it is safe to trust.

## Recap

- Authentication says who you are (`401` if unknown). Authorization says what you may do (`403` if not).
- Roles hold `resource:action` permissions. `inherits` builds a hierarchy. Everything not granted is denied.
- Wildcards like `*:read` grant more than you think, including permissions you add later. Malformed patterns are rejected at startup.
- Rules with conditions, such as `isOwner("userId")`, check the actual resource. Test that the owner passes *and* that someone else is refused.
- Missing data must mean no. Deny rules win over allows, and a condition that throws can only make the answer no.
- A policy is a constraint by default: it can refuse, but its "yes" grants nothing. `effect: "grant"` makes its "yes" a grant, so use it only for a policy that proves the right by itself.
- The actor's id and roles come from the verified token and your database, never from the request body, a header or the query string.
- Send `publicReason` to clients; keep `reason` and `explain` steps for your logs.

Permissions decide what a logged-in user may do. The next lesson protects the whole API from everyone else: floods of requests, other websites, forged requests and malicious URLs.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
