---
title: "Feature flags — ZudoJS Academy"
description: "Turn features on and off without deploying: rules, evaluation context, percentage rollouts, A/B variants and kill switches with @zudojs/feature-flags."
source: https://zudojs.oyinlola.site/learn/zudo-feature-flags
---

LEVEL 14 · LESSON 15 OF 18

Platform Advanced

# Feature flags

Turn features on and off without deploying: rules, evaluation context, percentage rollouts, A/B variants and kill switches with @zudojs/feature-flags.

- **40 min** to read and try
- **You need:** The Task API project and the observability lesson
- **You build:** Task comments rolled out to beta users and then to 20% of everyone, an A/B test for task sorting, and a kill switch for emails

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Separate deploying code from releasing a feature with a flag served from a provider
- Match rules in order against a server-built evaluation context, never the request body
- Roll out a feature to a deterministic percentage of users and split them into A/B variants
- Turn off a flag as a kill switch and give every non-boolean flag a safe offValue
- Fail closed when the flag store is unreachable, and send only client-visible flags to the browser

## Deploy is not release

You finished task comments for the Task API. Should every user see them the moment you deploy? If there is a bug, everyone meets it at once, and the only fix is another deploy. A **feature flag** separates the two steps:

- **Deploy**: the new code goes to production, switched off.
- **Release**: you switch it on, first for yourself, then for a few users, then for everyone. If something goes wrong, you switch it off again in seconds.

In code, a flag is just a question you ask at runtime: "is `task-comments` on *for this user*?". The answer can differ per user, and it can change while the server runs. Flags are also used for **kill switches** (turn off a feature that is causing trouble, like emails when the mail provider is down) and for **A/B tests** (show two versions to two groups and measure which works better).

Terminal on your computer

```bash
$ npm install @zudojs/feature-flags

added 1 package, and audited 74 packages in 4s
…
```

The package runs in the browser terminal too, so you can press **Run in browser** on every example on this page.

## Your first flag

Flags come from a **provider**, the place where their definitions are stored. `createMemoryProvider` keeps them in memory. `createFeatureFlags` reads from a provider and answers questions:

first.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([
    { key: "task-comments", enabled: true, defaultValue: false },
    { key: "task-export", enabled: true, defaultValue: true },
  ]),
});

console.log("comments:", await flags.isEnabled("task-comments"));
console.log("export:", await flags.isEnabled("task-export"));
console.log("typo:", await flags.isEnabled("task-coments"));
console.log(await flags.evaluate("task-export"));
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
comments: false
export: true
typo: false
{ key: 'task-export', value: true, reason: 'default', defaulted: true }
```

- Each flag has a `key`, a `defaultValue` it serves when nothing else decides, and `enabled`, which you will meet again in the kill switch section.
- An unknown key is simply off. A typo never switches a feature on by accident.
- `evaluate` returns the value *and* the `reason` for it. That is what you log when you wonder why a user sees a feature.

## Rules and the evaluation context

A flag can have **rules**. The **evaluation context** describes who is asking: `userId`, `tenantId`, `sessionId`, `environment` and any `attributes` you add, such as the user's plan. Rules are checked in order, and the **first rule that matches wins**. If none matches, the default is served:

rules.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([
    {
      key: "task-comments",
      enabled: true,
      defaultValue: false,
      rules: [
        { type: "user", users: ["ada", "grace"], value: true },
        { type: "attribute", attribute: "email", operator: "ends_with", value: "@taskapi.dev" },
      ],
    },
    {
      key: "page-size",
      enabled: true,
      defaultValue: 20,
      rules: [{ type: "attribute", attribute: "plan", operator: "in", value: ["pro", "team"], result: 100 }],
    },
  ]),
});

const users = [
  { userId: "ada", attributes: { plan: "free", email: "ada@example.com" } },
  { userId: "linus", attributes: { plan: "pro", email: "linus@taskapi.dev" } },
  { userId: "alan", attributes: { plan: "free", email: "alan@example.com" } },
];
for (const context of users) {
  const comments = await flags.evaluate("task-comments", context);
  const pageSize = await flags.get<number>("page-size", context);
  console.log(context.userId.padEnd(6), "comments:", comments.value, `(${comments.reason})`, "page size:", pageSize);
}
```

Output of `npx tsx rules.ts` and of the browser terminal

```ts
ada    comments: true (target_match) page size: 20
linus  comments: true (rule_match) page size: 100
alan   comments: false (default) page size: 20
```

Ada is on the beta list. Linus is not, but he works at the company, so the second rule matches. Alan matches no rule and gets the default. A flag value does not have to be a boolean: `page-size` is a number. An `attribute` rule compares with an operator (`equals`, `in`, `ends_with`, `greater_than` and more) and serves its `result`, which is `true` when you leave it out.

> THE CONTEXT MUST COME FROM THE SERVER
>
> Build the context from the logged-in user, as [the auth lesson](https://zudojs.oyinlola.site/learn/zudo-auth) verified them, and from your database: never from the request body or a header. If `plan` came from the client, anyone could send `"plan": "pro"` and get pro features for free. And a flag is not a permission: it says whether a feature is *switched on*, not whether this user *may* use it. Keep the permission check from [the permissions lesson](https://zudojs.oyinlola.site/learn/zudo-permissions) as well.

## Percentage rollouts

After the beta, you want comments for 20% of all users, then 50%, then everyone. A `percentage` rule does that. It must not be random: if a user saw comments, reloaded the page and they were gone, that would be a terrible experience. So the rule is **deterministic**: it hashes the flag key and the user id into one of 10,000 **buckets**. The same user always lands in the same bucket:

rollout.ts

```ts
import { getBucket, isInRollout } from "@zudojs/feature-flags";

for (const user of ["ada", "linus", "grace"]) {
  console.log(user, "bucket", getBucket("task-comments", user), "then", getBucket("task-comments", user));
}

const inside = (percentage: number) => {
  let count = 0;
  for (let i = 0; i < 10000; i++) if (isInRollout("task-comments", `user-${i}`, percentage)) count++;
  return count;
};
console.log("20%:", inside(20), "of 10000 users");
console.log("50%:", inside(50), "of 10000 users");

const earlyUsers = Array.from({ length: 10000 }, (_, i) => `user-${i}`).filter((u) => isInRollout("task-comments", u, 20));
console.log("still inside at 50%:", earlyUsers.every((u) => isInRollout("task-comments", u, 50)));
```

Output of `npx tsx rollout.ts` and of the browser terminal

```ts
ada bucket 2563 then 2563
linus bucket 6596 then 6596
grace bucket 6243 then 6243
20%: 2019 of 10000 users
50%: 5010 of 10000 users
still inside at 50%: true
```

A 20% rollout reaches about 20% of users, and when you raise it to 50%, everybody who already had the feature keeps it. The flag key is part of the hash, so the same 20% of users do not end up as the guinea pigs of every experiment.

The rule uses `userId`, then `tenantId`, then `sessionId`. A context with none of them counts as the single user `"anonymous"`, so all anonymous visitors get the same answer. Give logged-out visitors a session id if they should be spread out too.

## Variants: an A/B test

Should the task list be sorted by date or by priority? A `variant` rule splits users into named groups by weight, with the same stable buckets:

variants.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([{
    key: "task-sorting",
    enabled: true,
    defaultValue: "by-date",
    rules: [{ type: "variant", variants: [{ key: "by-date", weight: 50 }, { key: "by-priority", weight: 50 }] }],
  }]),
});

const groups = new Map<string, number>();
for (let i = 0; i < 1000; i++) {
  const result = await flags.evaluate<string>("task-sorting", { userId: `user-${i}` });
  groups.set(result.value, (groups.get(result.value) ?? 0) + 1);
}
console.log(groups);

const grace = await flags.evaluate("task-sorting", { userId: "grace" });
console.log("grace sees", grace.value, "because of", grace.reason);
```

Output of `npx tsx variants.ts` and of the browser terminal

```ts
Map(2) { 'by-priority' => 501, 'by-date' => 499 }
grace sees by-date because of variant_assignment
```

About half of the users are in each group. To learn which version wins, record the variant with what the user did, for example a metric `tasks.completed` with a `variant` label, as in [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability). A variant label is fine there: it has only two values.

## Kill switches and safe defaults

REASON IT OUT

### A number flag such as upload-limit-mb has no natural off value. Why does the package fall back to defaultValue instead of always using 0?

`defaultValue` is the value a flag serves when its rules do not decide anything, which is usually meant to be a safe, ordinary value: 50 MB is a perfectly reasonable everyday upload limit. Now think about what "off" should mean for a flag that is not a simple on/off switch. Is there one answer that is correct for every number, string or object flag in every app, the way `false` is obviously correct for every boolean flag?

**Show the reasoning**

There is not, and that is exactly why the package cannot pick one for you: 0 is the right "off" for an upload limit, but it would be the wrong "off" for a flag holding a page size (0 items per page breaks the page) or a timeout in milliseconds (0 means every request instantly times out). Falling back to `defaultValue` is the package's best guess at a value that will not crash anything, since that value was presumably already tested and shipped as the everyday case. It is a reasonable default default, but for a flag you might actually kill during an incident, it is the wrong choice, because "the everyday value" and "safe during an outage" are different questions. That is why `offValue` exists as an explicit, opt-in field: it lets you answer the second question separately, for the one flag where it matters, instead of the package guessing wrong for everyone.

The mail provider is down, and every task completion tries to send an email and fails. You want emails off, now. Set `enabled: false`: the flag then ignores all its rules and serves its **off value**. For a boolean flag the off value is `false`. For a string, number or object flag there is no natural "off", so it serves its `defaultValue`, unless you declare an `offValue`:

kill-switch.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const provider = createMemoryProvider([
  { key: "emails", enabled: true, defaultValue: false, rules: [{ type: "static", value: true }] },
  { key: "old-emails", enabled: false, defaultValue: true },
  { key: "upload-limit-mb", enabled: false, defaultValue: 50 },
  { key: "upload-limit-safe", enabled: false, defaultValue: 50, offValue: 0 },
]);
const flags = createFeatureFlags({ provider });

console.log("emails:", await flags.isEnabled("emails"));
provider.set({ key: "emails", enabled: false, defaultValue: false, rules: [{ type: "static", value: true }] });
console.log("emails after the switch:", await flags.evaluate("emails"));

console.log("old-emails:", await flags.isEnabled("old-emails"));
console.log("BAD upload-limit-mb:", await flags.get("upload-limit-mb"));
console.log("upload-limit-safe:", await flags.get("upload-limit-safe"));
```

Output of `npx tsx kill-switch.ts` and of the browser terminal

```ts
emails: true
emails after the switch: { key: 'emails', value: false, reason: 'disabled', defaulted: true }
old-emails: false
BAD upload-limit-mb: 50
upload-limit-safe: 0
```

- `emails` is written the recommended way: `defaultValue: false`, and a rule that switches the feature on. Switching it off, deleting it or losing the provider all lead to "off".
- `old-emails` has `defaultValue: true`, but a disabled boolean flag still answers `false`. (Before @zudojs/feature-flags 1.4.0 it served `true`, so the kill switch did nothing.)
- `upload-limit-mb` is the trap that is left. You switched it off during a storage outage, but a number flag that is off serves its `defaultValue`, so uploads of 50 MB are still allowed. `upload-limit-safe` declares `offValue: 0`, and switching it off really stops uploads. Give every non-boolean flag that might be killed an `offValue`.

`provider.set` changed the flag while the program was running, and the very next evaluation saw it. The memory provider announces every change, and `createFeatureFlags` listens. No deploy, no restart. In a real system the flag definitions live in a database or a flag service with an admin page, behind a provider that reads them.

## When the flag store fails

If flags come from a remote service, that service can be down. The rule is the same as for kill switches: **fail closed**, meaning "when in doubt, off":

failures.ts

```ts
import { createFeatureFlags } from "@zudojs/feature-flags";
import type { FeatureFlagProvider } from "@zudojs/feature-flags";

const brokenProvider: FeatureFlagProvider = {
  get: async () => { throw new Error("flag service unreachable"); },
  getAll: async () => { throw new Error("flag service unreachable"); },
};

const flags = createFeatureFlags({
  provider: brokenProvider,
  onError: (error, source) => console.log("onError:", source, "-", error instanceof Error ? error.message : error),
});

console.log("comments:", await flags.isEnabled("task-comments", { userId: "ada" }));
console.log("with fallback:", await flags.getBoolean("task-export", true, { userId: "ada" }));
console.log(await flags.evaluate("task-comments"));
```

Output of `npx tsx failures.ts` and of the browser terminal

```ts
onError: FeatureFlagProvider.getAll - flag service unreachable
comments: false
with fallback: true
{
  key: 'task-comments',
  value: undefined,
  reason: 'error',
  defaulted: true
}
```

An unreachable store never switches a flag on, and the failure goes to `onError`, where the Task API should log it. After a failure, the flags instance leaves the provider alone for 5 seconds before it tries again, so an outage does not add a slow network call to every request. `getBoolean(key, fallback)` lets you choose the value for a missing or unreachable flag: use `true` only for features that are safe to keep running, like the export that every user already has.

## Flags in the browser: snapshots

A web or mobile client also needs flags, to show or hide buttons. Send it a **snapshot**: all flag values, evaluated on the server for this user. Only flags marked `visibility: "client"` are included, because flag definitions can reveal plans you have not announced, or the names of your beta customers:

snapshot.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([
    { key: "task-comments", enabled: true, defaultValue: false, visibility: "client",
      rules: [{ type: "user", users: ["ada"], value: true }] },
    { key: "dark-mode", enabled: true, defaultValue: true, visibility: "client" },
    { key: "acme-migration", enabled: true, defaultValue: false,
      rules: [{ type: "tenant", tenants: ["acme"], value: true }] },
  ]),
});

const snapshot = await flags.snapshot({ userId: "ada" });
const body = Object.fromEntries([...snapshot].map(([key, result]) => [key, result.value]));
console.log(JSON.stringify(body));
```

Output of `npx tsx snapshot.ts` and of the browser terminal

```json
{"task-comments":true,"dark-mode":true}
```

The client gets values, not rules: it cannot see who else is on the beta list. `acme-migration` has no visibility, so it stays on the server. Remember that anything in the snapshot can be changed by the user in their browser: use it to decide what to *show*, and check again on the server before you *do* anything.

## Put it together: flags in the Task API

Keep all flag definitions in one file, with an owner and an end date, so that old flags get removed. A flag you forget becomes an `if` that nobody dares to delete:

src/flags/task.flags.ts

```ts
import type { FeatureFlag } from "@zudojs/feature-flags";

export const taskFlags: FeatureFlag[] = [
  {
    key: "task-comments",
    description: "Comments on tasks. Beta users first, then a gradual rollout.",
    enabled: true,
    defaultValue: false,
    visibility: "client",
    rules: [
      { type: "user", users: ["ada", "grace"], value: true },
      { type: "percentage", percentage: 20, value: true },
    ],
    metadata: { owner: "tasks-team", expiresAt: new Date("2027-03-01") },
  },
  {
    key: "task-emails",
    description: "Kill switch for task emails.",
    enabled: true,
    defaultValue: false,
    rules: [{ type: "static", value: true }],
    metadata: { owner: "tasks-team" },
  },
];
```

The service builds the context from the **verified** user object, and asks the flags before it does the optional work:

src/tasks/task.service.ts

```ts
import type { FeatureFlags } from "@zudojs/feature-flags";

export interface CurrentUser {
  readonly id: string;
  readonly plan: "free" | "pro";
}

export class TaskService {
  constructor(private readonly flags: FeatureFlags) {}

  async getTask(user: CurrentUser, id: number) {
    const context = { userId: user.id, attributes: { plan: user.plan } };
    const task = { id, title: "Buy milk", ownerId: user.id };
    if (await this.flags.isEnabled("task-comments", context)) {
      return { ...task, comments: [] as string[] };
    }
    return task;
  }

  async complete(user: CurrentUser, id: number): Promise<string> {
    const emails = await this.flags.isEnabled("task-emails", { userId: user.id });
    return emails ? `task ${id} done, email sent` : `task ${id} done, email skipped`;
  }
}
```

src/main.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";
import { taskFlags } from "./flags/task.flags.js";
import { TaskService } from "./tasks/task.service.js";

const provider = createMemoryProvider(taskFlags);
const flags = createFeatureFlags({
  provider,
  onError: (error, source) => console.log("flag store problem:", source, error),
});
const service = new TaskService(flags);

for (const id of ["ada", "joan", "linus"]) {
  console.log(id, await service.getTask({ id, plan: "free" }, 1));
}
console.log(await service.complete({ id: "ada", plan: "free" }, 1));

const emails = taskFlags[1];
if (emails) provider.set({ ...emails, enabled: false });
console.log(await service.complete({ id: "ada", plan: "free" }, 1));
flags.close();
```

Output of `npx tsx src/main.ts` and of the browser terminal

```ts
ada { id: 1, title: 'Buy milk', ownerId: 'ada', comments: [] }
joan { id: 1, title: 'Buy milk', ownerId: 'joan', comments: [] }
linus { id: 1, title: 'Buy milk', ownerId: 'linus' }
task 1 done, email sent
task 1 done, email skipped
```

Ada is on the beta list. Joan falls inside the 20% rollout, Linus does not. When the mail provider has an outage, one change to `task-emails` stops the emails, and tasks can still be completed. `flags.close()` stops listening to the provider when the app shuts down.

> TIP
>
> When a feature is fully rolled out and stable, delete the flag and its `if`. The `expiresAt` date helps: after it, the flag serves its off value (`false` for an on/off flag, or its `offValue`) with the reason `expired`, so a forgotten flag switches the feature *off* and somebody notices.

## Practice

TRY IT YOURSELF

### Staff first, then 10%

Write a flag `new-editor` that is on for users whose `email` attribute ends with `@taskapi.dev`, and for 10% of everyone else. Print the value and reason for `ada` (with a staff email) and for `user-1` to `user-3` (no email).

**Show a solution**

new-editor.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([{
    key: "new-editor",
    enabled: true,
    defaultValue: false,
    rules: [
      { type: "attribute", attribute: "email", operator: "ends_with", value: "@taskapi.dev" },
      { type: "percentage", percentage: 10, value: true },
    ],
  }]),
});

const ada = await flags.evaluate("new-editor", { userId: "ada", attributes: { email: "ada@taskapi.dev" } });
console.log("ada", ada.value, ada.reason);
for (const userId of ["user-1", "user-2", "user-3"]) {
  const result = await flags.evaluate("new-editor", { userId });
  console.log(userId, result.value, result.reason);
}
```

Output of `npx tsx new-editor.ts` and of the browser terminal

```ts
ada true rule_match
user-1 true percentage_rollout
user-2 false default
user-3 false default
```

The order of the rules matters: staff are checked first. The users without an email only reach the percentage rule, and each one lands in the same bucket every time you run it.

TRY IT YOURSELF

### Spot the unsafe flags

Which of these definitions are unsafe, and why? (a) `{ key: "max-upload-mb", enabled: false, defaultValue: 100 }`, switched off because the file storage is failing (b) `{ key: "admin-panel", enabled: true, defaultValue: false, rules: [{ type: "attribute", attribute: "role", operator: "equals", value: "admin" }] }` with `role` read from a request header (c) `{ key: "beta-banner", enabled: true, defaultValue: false, visibility: "client" }`

**Show a solution**

(a) is unsafe: a number flag that is off serves its `defaultValue`, so uploads of 100 MB are still allowed while everyone believes they are stopped. Add `offValue: 0`. (b) is unsafe twice: the client controls the header, so anyone can become "admin", and a flag must not replace the permission check anyway. (c) is fine: it is off by default, and a banner is safe to show in the browser.

## Recap

- A feature flag separates deploying code from releasing a feature. You can switch it per user, and change it while the server runs.
- A provider stores definitions. `isEnabled`, `get` and `evaluate` answer for one evaluation context.
- Rules run in order, first match wins: `user`, `tenant`, `attribute`, `percentage`, `schedule`, `variant`, `static`.
- Percentage rollouts and variants are deterministic: the same user always gets the same answer, and raising the percentage keeps everyone who was already in.
- Fail closed: a flag that is off serves its off value: `offValue` if you declare one, else `false` for a boolean flag, else `defaultValue`. Give every non-boolean flag you might kill an `offValue`. An unreachable store never switches a flag on.
- Build the context on the server from the verified user. A flag is not a permission.
- Snapshots send values, not rules, to the browser, and only for `visibility: "client"` flags. Delete flags when they are done.

Next, [Multi-tenancy](https://zudojs.oyinlola.site/learn/zudo-tenancy) serves many companies from one Task API, so every rule, query and cached value stays scoped to the right tenant.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
