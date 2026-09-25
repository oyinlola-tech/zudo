---
title: "Caching — ZudoJS Academy"
description: "Keep copies of slow results so the Task API answers fast: keys, TTL, namespaces, tags, invalidation, stampede protection, locks and metrics."
source: https://zudojs.oyinlola.site/learn/zudo-cache
---

LEVEL 13 · LESSON 11 OF 12

Caching Core

# Caching

Keep copies of slow results so the Task API answers fast: keys, TTL, namespaces, tags, invalidation, stampede protection, locks and metrics.

- **40 min** to read and try
- **You need:** The Task API project and the Data lessons
- **You build:** A cached task list that stays correct when tasks change

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Build a namespaced cache key from everything the answer depends on, including the user
- Read and write in one call with getOrSet, and stop a cache stampede by sharing one in-flight computation
- Set a TTL that bounds how wrong a stale copy can be
- Invalidate the right entries by key, tag or pattern the moment the underlying data changes
- Serialize what you store instead of caching a shared, mutable object
- Watch hit rate with getStats and events, and keep a broken cache adapter from becoming a fatal error

## Why caching exists

Every time a client asks the Task API for its tasks, your code asks the database. The database is fast, but not free: each query crosses the network, uses a connection, and takes a few milliseconds. When the same list is asked for a hundred times a minute and changes twice a day, most of that work is wasted.

A **cache** is a small, fast store where you keep a copy of a result that was expensive to produce. The next time you need the same result, you read the copy instead of doing the work again.

To see the effect, here is a fake task database. It waits 20 milliseconds, like a real query, and counts how many queries it ran. It stands in for the repository you built in [the database lesson](https://zudojs.oyinlola.site/learn/zudo-database), so every example on this page can run in your browser:

task-db.ts

```ts
export interface Task {
  readonly id: number;
  readonly userId: string;
  readonly title: string;
  readonly done: boolean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class TaskDb {
  queries = 0;
  private readonly rows: Task[] = [
    { id: 1, userId: "ada", title: "Buy milk", done: false },
    { id: 2, userId: "ada", title: "Write report", done: true },
    { id: 3, userId: "linus", title: "Fix bug", done: false },
  ];

  async listTasks(userId: string): Promise<Task[]> {
    this.queries += 1;
    await wait(20);
    return this.rows.filter((task) => task.userId === userId);
  }

  async addTask(userId: string, title: string): Promise<Task> {
    this.queries += 1;
    const task: Task = { id: this.rows.length + 1, userId, title, done: false };
    this.rows.push(task);
    return task;
  }
}
```

no-cache.ts

```ts
import { TaskDb } from "./task-db.js";

const db = new TaskDb();

for (let request = 1; request <= 3; request++) {
  const tasks = await db.listTasks("ada");
  console.log(`request ${request}: ${tasks.length} tasks`);
}
console.log("queries:", db.queries);
```

Output of `npx tsx no-cache.ts` and of the browser terminal

```ts
request 1: 2 tasks
request 2: 2 tasks
request 3: 2 tasks
queries: 3
```

Three requests, three identical queries. With a cache, the first request runs the query and stores the answer. The next two read the copy. Two words you will see everywhere:

- A **hit**: the value was in the cache.
- A **miss**: it was not, so you have to do the slow work.

> THE PRICE OF A CACHE
>
> A copy can be **stale**: the database changed, but the cache still holds the old answer. Most of this lesson is about keeping copies correct: how long they live, and how to throw them away when the data changes. If data must always be exact (a bank balance, a permission check), do not cache it.

## Install @zudojs/cache

In your `task-api` folder:

Terminal on your computer

```bash
$ npm install @zudojs/cache

added 2 packages, and audited 74 packages in 2s
…
```

The `…` hides the same funding, audit and esbuild notes you saw when you created the project. The numbers depend on what you have installed so far. The package runs in the browser terminal too, so you can press **Run in browser** on every example here.

To run an example on your computer, save it in `src/` next to `task-db.ts` and run it with `tsx`, for example `npx tsx src/no-cache.ts`. You should see the same output as the page.

## Your first cache

A `CacheService` is the object you call. Behind it sits an **adapter**, the actual storage. The package ships an in-memory adapter, which keeps entries in a `Map` inside your process:

first.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
import type { Task } from "./task-db.js";

const cache = createCacheService({
  adapter: createMemoryCacheAdapter({ maxEntries: 1000 }),
  config: { defaultTtl: 60_000 },
});

const tasks: Task[] = [{ id: 1, userId: "ada", title: "Buy milk", done: false }];
const saved = await cache.set("tasks.ada", tasks);
console.log(saved.success, saved.key);

const found = await cache.get<Task[]>("tasks.ada");
console.log(found.hit, found.value);

const missing = await cache.get<Task[]>("tasks.linus");
console.log(missing.hit, missing.value);
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
true zudojs:tasks.ada
true [ { id: 1, userId: 'ada', title: 'Buy milk', done: false } ]
false null
```

- `maxEntries` caps the cache at 1,000 entries. When it is full, the entry that was used least recently is dropped. A cache is allowed to forget.
- `defaultTtl` is how long an entry lives, in milliseconds. More on that below.
- `get` never returns the value on its own. It returns `{ hit, value }`. Check `hit` first, because a cached value can itself be `null` or an empty list.
- The stored key is `zudojs:tasks.ada`. The cache added a **prefix**, `zudojs`, so its keys cannot clash with other data in a shared store such as Redis.

> COMMON MISTAKE
>
> Writing `if (!found) { … load from the database … }`. The result object is never falsy, so that branch never runs and the cache never fills. Write `if (!found.hit)`.

## Keys and namespaces

A **key** is the name you store a value under. The cache builds the full key as `prefix:namespace:key`, with a colon between the parts. Because the colon has that job, it is not allowed inside your own key. Each part may only contain letters, digits, `.`, `_` and `-`:

keys.ts

```ts
import { createKeyBuilder, isCacheError } from "@zudojs/cache";

const keys = createKeyBuilder({ prefix: "taskapi" });

console.log(keys.build("tasks.list"));
console.log(keys.build("tasks.list", { namespace: "ada" }));

try {
  keys.build("tasks:list");
} catch (error) {
  if (isCacheError(error)) {
    console.log(error.code, error.statusCode);
    console.log(error.message);
  }
}
```

Output of `npx tsx keys.ts` and of the browser terminal

```ts
taskapi:tasks.list
taskapi:ada:tasks.list
ERR_INVALID_INPUT 400
Invalid cache key part "tasks:list": parts must match /^[a-zA-Z0-9._\-]+$/ and must not contain the separator ":".
```

A bad key is a bug in your code, so it throws a `CacheError` with the code `ERR_INVALID_INPUT` and status 400. It is never treated as a miss.

Why so strict? If a key could contain a colon, a key such as `"ada:tasks.list"` would look exactly like the key `tasks.list` in the namespace `ada`. Someone who controls part of a key could then read or overwrite another user's entry.

A **namespace** groups keys. The same key in two namespaces is two different entries. In the Task API, every user sees only their own tasks, so the user id is a natural namespace:

namespaces.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

await cache.set("tasks.list", ["Buy milk", "Write report"], { namespace: "ada" });
await cache.set("tasks.list", ["Fix bug"], { namespace: "linus" });

console.log((await cache.get("tasks.list", { namespace: "ada" })).value);
console.log((await cache.get("tasks.list", { namespace: "linus" })).value);

console.log(await cache.clear({ namespace: "ada" }));
console.log(await cache.has("tasks.list", { namespace: "ada" }));
console.log(await cache.has("tasks.list", { namespace: "linus" }));
```

Output of `npx tsx namespaces.ts` and of the browser terminal

```json
[ 'Buy milk', 'Write report' ]
[ 'Fix bug' ]
{ cleared: 1 }
false
true
```

> SECURITY: THE KEY MUST INCLUDE WHO IS ASKING
>
> The classic caching data leak: you cache `GET /tasks` under the key `tasks.list` with no user in it. Ada asks first, her list is stored, and Linus now receives Ada's tasks. The key (or namespace) must contain everything the answer depends on: the user, the tenant, the filters, the page number. Take the user id from the verified login token, as in [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth), never from a query parameter the client can change.

A namespace is checked like a key part. An empty string or a wildcard such as `"*"` throws instead of quietly reaching every user's entries.

## TTL: how long an entry lives

**TTL** means "time to live": the number of milliseconds an entry stays valid after you store it. When the time is up, the cache treats the entry as missing, and the next read goes to the database and gets fresh data. A TTL is your safety net against stale data: even if you forget to clear an entry, it cannot stay wrong for longer than its TTL.

ttl.ts

```ts
import { createCacheService, createMemoryCacheAdapter, isCacheError } from "@zudojs/cache";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

await cache.set("tasks.ada", ["Buy milk"], { ttl: 100 });
await cache.set("settings", { theme: "dark" }, { ttl: null });

console.log("right away:", (await cache.get("tasks.ada")).hit);
await wait(150);
console.log("150 ms later:", (await cache.get("tasks.ada")).hit);
console.log("time left:", await cache.ttl("tasks.ada"), await cache.ttl("settings"));

await cache.set("tasks.linus", ["Fix bug"], { ttl: 10_000 });
const left = await cache.ttl("tasks.linus");
console.log("whole ms:", Number.isInteger(left), left !== undefined && left !== null && left <= 10_000);

try {
  await cache.set("tasks.ada", ["Buy milk"], { ttl: 0 });
} catch (error) {
  if (isCacheError(error)) console.log(error.code);
}
```

Output of `npx tsx ttl.ts` and of the browser terminal

```ts
right away: true
150 ms later: false
time left: undefined null
whole ms: true true
CACHE_INVALID_TTL
```

The entry with a 100 ms TTL was gone 150 ms later. `cache.ttl(key)` returns the milliseconds left, `undefined` for a missing key, and `null` for an entry stored with `ttl: null`, which never expires. For a live entry you get whole milliseconds, a little under the TTL you set, because some time has passed since `set`.

The last line shows a common mistake: `ttl: 0` does not mean "forever". It is rejected with `CACHE_INVALID_TTL`. Write `ttl: null` for an entry that never expires.

How long should a TTL be? It is a trade-off. Longer means more hits and less database work. Shorter means stale data disappears sooner. A task list that you also clear on every change (next sections) can live for minutes. Data you cannot clear reliably, such as an answer from another company's API, should live only as long as you can accept it being out of date. The default is 5 minutes, and the maximum is 24 hours.

## getOrSet and the stampede

Almost all cache code does the same three steps: look in the cache; on a miss, do the slow work; store the result. `getOrSet` does all three:

get-or-set.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
import { TaskDb } from "./task-db.js";

const db = new TaskDb();
const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

for (let request = 1; request <= 3; request++) {
  const result = await cache.getOrSet("tasks.list", () => db.listTasks("ada"), {
    namespace: "ada",
    ttl: 60_000,
  });
  console.log(`request ${request}: ${result.value.length} tasks, cached: ${result.cached}`);
}
console.log("queries:", db.queries);
```

Output of `npx tsx get-or-set.ts` and of the browser terminal

```ts
request 1: 2 tasks, cached: false
request 2: 2 tasks, cached: true
request 3: 2 tasks, cached: true
queries: 1
```

One query instead of three. `result.cached` tells you where the value came from.

Now imagine the entry has just expired and 50 requests arrive in the same millisecond. They all miss, so they all run the query at once. The database suddenly gets 50 identical queries: a **cache stampede**. On a busy site this can take the database down right when the cache was supposed to protect it.

`getOrSet` protects you. While one computation for a key is running, other callers for the same key wait for it instead of starting their own:

stampede.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
import { TaskDb } from "./task-db.js";

const db = new TaskDb();
const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

const load = () => cache.getOrSet("tasks.list", () => db.listTasks("ada"), { namespace: "ada" });

const results = await Promise.all([load(), load(), load(), load(), load()]);
console.log("answers:", results.map((r) => r.value.length));
console.log("queries:", db.queries);
```

Output of `npx tsx stampede.ts` and of the browser terminal

```ts
answers: [ 2, 2, 2, 2, 2 ]
queries: 1
```

`Promise.all`, from [the asynchronous JavaScript lesson](https://zudojs.oyinlola.site/learn/js-async), starts all five at the same moment. Five answers, one query.

> NOTE
>
> This protection works inside one process. If you run three copies of the Task API, each copy can still run one query. That is usually fine. For "exactly once across servers", you need a lock in a shared store, which the lock section covers.

REASON IT OUT

### db.listTasks throws instead of resolving. What happens to the four callers that were waiting on it?

Five callers arrive together, only one runs `db.listTasks("ada")`, and the other four wait on that same in-flight computation instead of starting their own. Suppose the database is briefly down and that one call throws. Do the four waiters each get the same rejection, or does `getOrSet` retry the query for each of them since they never really ran it themselves?

**Show the reasoning**

They share the rejection. All five callers are really awaiting the same underlying promise; the leader's call is not copied out to the followers after the fact; they are all holding a reference to it. So when it rejects, every caller's `await` throws the same error, at the same moment, and nothing is written to the cache. That is the correct behavior for a stampede guard: retrying the query five times just because five requests happened to arrive together would defeat the point of sharing the in-flight computation, and it would mean each retry can turn a fast failure into five slow ones stacked on top of a struggling database.

The trade-off is that a caller who did nothing wrong sees an error caused by "whoever happened to arrive first". That is fine for a read like a task list, where the caller retries the whole request; it would matter more for a computation with side effects, which is exactly why `getOrSet`'s callback should stay a pure read, with writes going through invalidation instead.

## Invalidation: when the data changes

Here is the bug every cache has at first. Ada adds a task, and her list does not show it:

stale.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
import { TaskDb } from "./task-db.js";

const db = new TaskDb();
const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
const list = () => cache.getOrSet("tasks.list", () => db.listTasks("ada"), { namespace: "ada" });

console.log("before:", (await list()).value.length);
await db.addTask("ada", "Call the bank");
console.log("after: ", (await list()).value.length);
```

Output of `npx tsx stale.ts` and of the browser terminal

```ts
before: 2
after:  2
```

The database has 3 tasks for Ada, but the cache still holds the old list of 2, and it will keep serving it until the TTL runs out. Removing entries that are no longer correct is called **invalidation**. You have three tools:

- `delete(key)` removes one key you know.
- **Tags**: labels you attach when you store an entry. `invalidateByTag(["tasks"])` removes every entry with that tag, without you listing the keys.
- **Patterns**: `invalidateByPattern("tasks.*")` removes every key that matches. `*` matches any characters, but never crosses the `:` between namespace and key.

Tags are the most useful, because one change often makes several entries stale. A new task changes the full list, the "open tasks" list and the count:

tags.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
const ada = { namespace: "ada", tags: ["tasks"] };

await cache.set("tasks.list", ["Buy milk", "Write report"], ada);
await cache.set("tasks.open", ["Buy milk"], ada);
await cache.set("tasks.count", 2, ada);
await cache.set("profile", { name: "Ada" }, { namespace: "ada", tags: ["profile"] });
await cache.set("tasks.list", ["Fix bug"], { namespace: "linus", tags: ["tasks"] });

console.log(await cache.invalidateByTag(["tasks"], { namespace: "ada" }));
console.log("ada list:", await cache.has("tasks.list", { namespace: "ada" }));
console.log("ada profile:", await cache.has("profile", { namespace: "ada" }));
console.log("linus list:", await cache.has("tasks.list", { namespace: "linus" }));

console.log(await cache.invalidateByPattern("tasks.*", { namespace: "linus" }));
```

Output of `npx tsx tags.ts` and of the browser terminal

```json
{ cleared: 3 }
ada list: false
ada profile: true
linus list: true
{ cleared: 1 }
```

Three of Ada's entries were cleared. Her profile had a different tag and stayed. Linus's list had the same tag, but tags live inside a namespace, so his entry was not touched until the pattern call removed it.

> WATCH OUT
>
> If you tag an entry in a namespace and then call `invalidateByTag` without that namespace, nothing is cleared and no error is thrown. Pass the same namespace on both sides.

Tags follow the same rules as key parts. An empty tag, `tags: [""]`, throws `ERR_INVALID_INPUT`, the same code as a bad key.

The rule to follow: **every code path that writes the data also invalidates its cache entries**, right after the write succeeds. Create, update, delete, and any background job that changes tasks.

## Cached objects are shared

The memory adapter stores the object you give it, not a copy. If any code changes that object later, every reader of the cache sees the change:

copies.ts

```ts
import { createCacheService, createMemoryCacheAdapter, JsonCacheSerializer } from "@zudojs/cache";

const shared = createCacheService({ adapter: createMemoryCacheAdapter() });
const task = { title: "Buy milk", due: new Date("2026-10-01T09:00:00Z") };
await shared.set("task.1", task);
task.title = "CHANGED BY ACCIDENT";
console.log((await shared.get<typeof task>("task.1")).value?.title);

const copying = createCacheService({
  adapter: createMemoryCacheAdapter(),
  config: { serializer: new JsonCacheSerializer() },
});
const task2 = { title: "Buy milk", due: new Date("2026-10-01T09:00:00Z") };
await copying.set("task.1", task2);
task2.title = "CHANGED BY ACCIDENT";
const copy = (await copying.get<typeof task2>("task.1")).value;
console.log(copy?.title, copy?.due instanceof Date);
```

Output of `npx tsx copies.ts` and of the browser terminal

```ts
CHANGED BY ACCIDENT
Buy milk true
```

With a `serializer`, the cache turns the value into text on the way in and builds a new object on the way out, so each reader gets its own copy. `JsonCacheSerializer` also keeps `Date` objects as dates, which plain JSON does not. You will see why in [the serialization lesson](https://zudojs.oyinlola.site/learn/zudo-serialization). A cache in another process, such as Redis, always stores text, so using a serializer from the start also makes the memory adapter behave like the real thing.

## Locks: one at a time

A **lock** is a named ticket that only one piece of code can hold at a time. Anyone else who asks for the same name waits, or gives up. Use it around work that must not run twice at once, such as rebuilding a daily report.

`withLock(name, fn)` takes the lock, runs `fn`, and releases the lock, even if `fn` throws:

locks.ts

```ts
import { createCacheService, createMemoryCacheAdapter, isCacheError } from "@zudojs/cache";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

async function rebuildReport(who: string, retryAttempts = 3): Promise<string> {
  return cache.withLock("daily-report", async () => {
    console.log(who, "starts");
    await wait(50);
    console.log(who, "ends");
    return who;
  }, { ttl: 10_000, retryAttempts });
}

console.log(await Promise.all([rebuildReport("A"), rebuildReport("B")]));

const patient = rebuildReport("C");
const impatient = rebuildReport("D", 0).catch((error: unknown) => {
  if (isCacheError(error)) console.log("D gave up:", error.code);
});
await Promise.all([patient, impatient]);
```

Output of `npx tsx locks.ts` and of the browser terminal

```ts
A starts
A ends
B starts
B ends
[ 'A', 'B' ]
C starts
D gave up: CACHE_LOCK_UNAVAILABLE
C ends
```

A and B asked at the same time. B had to wait: it tried again (by default up to 3 times, 100 ms apart) and ran once A released the lock. They never overlapped. D asked with `retryAttempts: 0`, found the lock taken by C, and gave up straight away with `CACHE_LOCK_UNAVAILABLE`, before C had even finished.

The `ttl` makes the lock a **lease**: if your process crashes while holding it, the lock frees itself after 10 seconds instead of blocking everyone forever. While `fn` runs, the lease is renewed for you, and if it is lost anyway, `withLock` throws instead of pretending it worked.

> ONE PROCESS ONLY
>
> The built-in lock store lives in the memory of one process. Two copies of the Task API do not see each other's locks. To lock across servers, pass a lock store backed by a shared system, such as Redis, as `config.lockStore`. Lock names are keys too: `"report:daily"` is rejected, write `"report.daily"`.

## See what the cache is doing

A cache you cannot measure is a guess. The most important number is the **hit rate**: hits divided by all reads. A hit rate of 0.9 means 9 of 10 reads were served from the cache. If it is low, your TTL may be too short, or your keys too specific to ever repeat.

The service counts hits, misses, sets, deletes and errors, and emits an **event** on every operation that you can listen to:

metrics.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

const subscription = cache.subscribe("cache.miss", (event) => {
  console.log("miss:", event.key);
});

await cache.get("tasks.list", { namespace: "ada" });
await cache.set("tasks.list", ["Buy milk"], { namespace: "ada" });
await cache.get("tasks.list", { namespace: "ada" });
await cache.get("tasks.list", { namespace: "ada" });
await cache.get("tasks.list", { namespace: "linus" });
subscription.unsubscribe();

console.log(cache.getStats());
console.log(cache.getHotKeys(3));
console.log("entries:", await cache.size());
```

Output of `npx tsx metrics.ts` and of the browser terminal

```ts
miss: zudojs:ada:tasks.list
miss: zudojs:linus:tasks.list
{ hits: 2, misses: 2, sets: 1, deletes: 0, errors: 0, hitRate: 0.5 }
[ { key: 'zudojs:ada:tasks.list', hits: 2 } ]
entries: 1
```

- `subscribe(type, handler)` listens for `cache.hit`, `cache.miss`, `cache.set`, `cache.delete`, `cache.clear` or `cache.error`, or `"*"` for all. You will learn how events work in general later, in [Events](https://zudojs.oyinlola.site/learn/zudo-events).
- `errors` counts failed operations, including input the cache refused, such as a bad key, namespace, pattern or tag. Each one also emits `cache.error`. A number that keeps growing usually means a bug in how you build keys.
- `getHotKeys(n)` lists the most-read keys. It tells you where caching pays off most.
- `getLatencyStats(CacheOperation.GET)` gives you how long reads take (p50, p95, p99). You will send numbers like these to a dashboard in [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability).

> WHEN THE CACHE IS DOWN
>
> With Redis, the cache is a separate server that can fail. Set `config.failSilently: true` and a broken cache behaves like a miss: the request goes to the database and still succeeds, only slower. A bad key and a lock that cannot be taken still throw, because those are bugs in your code, not an outage.

## Put it together: a cached task service

Here is the Task API's service with caching built in. Reads go through `getOrSet`, scoped to the user and tagged. Writes go to the database first, then clear the user's task entries:

cached-task.service.ts

```ts
import { createCacheService, createMemoryCacheAdapter, JsonCacheSerializer } from "@zudojs/cache";
import type { CacheService } from "@zudojs/cache";
import type { Task, TaskDb } from "./task-db.js";

export function createTaskCache(): CacheService {
  return createCacheService({
    adapter: createMemoryCacheAdapter({ maxEntries: 10_000 }),
    config: { prefix: "taskapi", defaultTtl: 5 * 60_000, serializer: new JsonCacheSerializer() },
  });
}

export class CachedTaskService {
  constructor(
    private readonly db: TaskDb,
    private readonly cache: CacheService,
  ) {}

  async list(userId: string): Promise<Task[]> {
    const result = await this.cache.getOrSet("tasks.list", () => this.db.listTasks(userId), {
      namespace: userId,
      tags: ["tasks"],
    });
    return result.value;
  }

  async create(userId: string, title: string): Promise<Task> {
    const task = await this.db.addTask(userId, title);
    await this.cache.invalidateByTag(["tasks"], { namespace: userId });
    return task;
  }
}
```

main.ts

```ts
import { CachedTaskService, createTaskCache } from "./cached-task.service.js";
import { TaskDb } from "./task-db.js";

const db = new TaskDb();
const cache = createTaskCache();
const tasks = new CachedTaskService(db, cache);

console.log("ada:", (await tasks.list("ada")).map((t) => t.title));
console.log("ada:", (await tasks.list("ada")).map((t) => t.title));
console.log("linus:", (await tasks.list("linus")).map((t) => t.title));

await tasks.create("ada", "Call the bank");
console.log("ada:", (await tasks.list("ada")).map((t) => t.title));

console.log("queries:", db.queries);
console.log("hit rate:", cache.getStats()?.hitRate);
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
ada: [ 'Buy milk', 'Write report' ]
ada: [ 'Buy milk', 'Write report' ]
linus: [ 'Fix bug' ]
ada: [ 'Buy milk', 'Write report', 'Call the bank' ]
queries: 4
hit rate: 0.25
```

Follow the four queries: Ada's first list, Linus's list, the insert, and Ada's list again after `create` cleared it. Ada's second read was a hit, so the hit rate is 1 of 4 reads. The new task shows up straight away because `create` cleared the stale list, and Linus's cache was never touched.

In the Task API, create the cache once when the app starts and register it in the container, as you did with other services in [the dependency injection lesson](https://zudojs.oyinlola.site/learn/zudo-container), so every request shares the same cache.

## Practice

TRY IT YOURSELF

### Cache one task

Add a `get(userId, id)` method that caches a single task under the key `task.<id>` in the user's namespace, with the `tasks` tag. Check that `create` also clears it, without changing `create`.

**Show a solution**

one-task.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
let queries = 0;

async function loadTask(id: number) {
  queries += 1;
  return { id, title: "Buy milk" };
}

async function get(userId: string, id: number) {
  const result = await cache.getOrSet(`task.${id}`, () => loadTask(id), {
    namespace: userId,
    tags: ["tasks"],
  });
  return result.value;
}

await get("ada", 1);
await get("ada", 1);
console.log("queries:", queries);

await cache.invalidateByTag(["tasks"], { namespace: "ada" });
await get("ada", 1);
console.log("queries:", queries);
```

Output of `npx tsx one-task.ts` and of the browser terminal

```ts
queries: 1
queries: 2
```

Because the single task carries the same `tasks` tag, the `invalidateByTag` call that `create` already makes clears it too. That is the point of tags: new cached views do not need new invalidation code.

TRY IT YOURSELF

### Find the leak

A teammate caches the admin report like this: `cache.getOrSet("report", () => buildReport(user.role))`. An admin and a normal user call it. What goes wrong, and how do you fix it?

**Show a solution**

The key `report` does not include the role, but the answer depends on it. Whoever asks first fills the cache, and everyone else gets that answer. If an admin asks first, normal users receive the admin report: a data leak. Put the role in the key, for example `\`report.${user.role}\``, or better, check the permission before reading the cache at all, so a normal user never reaches the admin data.

TRY IT YOURSELF

### Measure the hit rate

Using `getOrSet`, read the key `tasks.list` 10 times with a TTL of 30 ms, waiting 10 ms between reads. Predict the number of misses, then print `getStats()` to check.

**Show a solution**

hit-rate.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

for (let i = 0; i < 10; i++) {
  await cache.getOrSet("tasks.list", async () => ["Buy milk"], { ttl: 30 });
  await wait(10);
}
const stats = cache.getStats();
console.log("misses:", stats?.misses, "hits:", stats?.hits);
```

Output of `npx tsx hit-rate.ts` and of the browser terminal

```ts
misses: 4 hits: 6
```

Every entry lives 30 ms and you read every 10 ms or so, so roughly one read in three is a miss. Timers are not exact, so your numbers can differ by one. A TTL that is short compared to how often data is read gives a low hit rate.

## Recap

- A cache keeps copies of slow results. A hit reads the copy, a miss does the work. The price is stale data.
- `get` returns `{ hit, value }`. `getOrSet` does read, compute and store in one call, and stops a stampede of identical queries.
- Keys are `prefix:namespace:key`, with no colons in your parts. The key or namespace must include everything the answer depends on, especially the user.
- A TTL limits how long a copy can be wrong. `ttl: null` never expires, and `0` is not allowed.
- Every write path invalidates the entries it made stale: by key, by tag, or by pattern, in the same namespace.
- `withLock` runs work one at a time. The built-in lock and memory adapter only cover one process.
- Watch the hit rate with `getStats()` and events, and use `failSilently` so a broken cache is only slow, not fatal.

Next, [Type-safe application design](https://zudojs.oyinlola.site/learn/zudo-typed-design) closes this course by putting everything you have built behind types the compiler checks: ids, money, states, DTOs, commands, queries and events.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
