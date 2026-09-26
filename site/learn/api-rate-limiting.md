---
title: "Rate limiting — ZudoJS Academy"
description: "Build fixed-window, sliding-window and token-bucket rate limiters, choose what to count, answer 429 with Retry-After, and share limits across servers."
source: https://zudojs.oyinlola.site/learn/api-rate-limiting
---

LEVEL 9 · LESSON 3 OF 4

APIs under real traffic Core

# Rate limiting

Build fixed-window, sliding-window and token-bucket rate limiters, choose what to count, answer 429 with Retry-After, and share limits across servers.

- **50 min** to read and try
- **You need:** Idempotency and safe retries, and HTTP in depth
- **You build:** A rate-limited transfer API with per-user and per-IP token buckets, weighted route costs, 429 responses with Retry-After, and a limiter shared through PostgreSQL

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a rate limiter protects and where in the request path it belongs
- Implement fixed-window, sliding-window and token-bucket limiters with an injectable clock
- Compare the algorithms on the same traffic and pick one for a given endpoint
- Choose limit keys (user, API key, IP) and explain NAT, spoofing and unauthenticated traffic
- Answer 429 with a correct Retry-After and write clients that honour it
- Share a limit across several servers and reason about where the bottleneck is at 50,000 requests per second

## Monday, 09:00

The transfer API from [the last lesson](https://zudojs.oyinlola.site/learn/api-idempotency) is live. On Monday at 09:00 a partner company deploys a new version of their payroll script. It has a bug: when a transfer returns 422 it retries immediately, forever, with no backoff. By 09:02 it sends 3,000 requests per second. The database spends all its time on those requests, every other customer's transfer times out, and their apps start retrying too. By 09:05 the whole bank is down, and not one attacker was involved.

The same week, someone runs a script against `POST /sessions` that tries the 10,000 most common passwords against every e-mail address it can find, and a competitor scrapes your public exchange-rate endpoint 50 times a second.

All three are the same problem: one client uses far more than its share of a limited resource. A **rate limiter** counts the requests each client makes over time, and refuses the excess with **429 Too Many Requests** before they reach anything expensive. It does not make your server faster. It decides *who* gets the capacity you have, so that one broken script cannot take it all.

This lesson builds rate limiters from scratch: four algorithms, the choice of what to count, the HTTP side, sharing limits between servers, and the capacity question behind all of it. [The ZudoJS security lesson](https://zudojs.oyinlola.site/learn/zudo-security#rate-limit) later uses a ready-made limiter from `@zudojs/security`; after this lesson you will know what it does inside.

## Four ways to count

Every limiter answers one question per request: "has this client used up its allowance?" A limit has two parts, an amount and a period: "100 requests per minute". The four common algorithms differ in how they measure the period. All four below take the current time, `now`, as an argument instead of reading the clock, so tests can replay any traffic pattern instantly. The file has no Node APIs, so it runs in the browser too:

limiters.js

```ts
export function fixedWindow({ limit, windowMs }) {
  const windows = new Map();
  return (key, now) => {
    const start = Math.floor(now / windowMs) * windowMs;
    let window = windows.get(key);
    if (!window || window.start !== start) {
      window = { start, count: 0 };
      windows.set(key, window);
    }
    if (window.count >= limit) return { allowed: false, retryAfterMs: start + windowMs - now };
    window.count++;
    return { allowed: true, remaining: limit - window.count };
  };
}

export function slidingLog({ limit, windowMs }) {
  const logs = new Map();
  return (key, now) => {
    const log = (logs.get(key) ?? []).filter((time) => time > now - windowMs);
    logs.set(key, log);
    if (log.length >= limit) return { allowed: false, retryAfterMs: log[0] + windowMs - now };
    log.push(now);
    return { allowed: true, remaining: limit - log.length };
  };
}

export function slidingCounter({ limit, windowMs }) {
  const counters = new Map();
  return (key, now) => {
    const start = Math.floor(now / windowMs) * windowMs;
    let c = counters.get(key) ?? { start, current: 0, previous: 0 };
    if (c.start !== start) c = { start, current: 0, previous: c.start === start - windowMs ? c.current : 0 };
    counters.set(key, c);
    const estimate = c.previous * (1 - (now - start) / windowMs) + c.current;
    if (estimate + 1 > limit) return { allowed: false };
    c.current++;
    return { allowed: true };
  };
}

export function tokenBucket({ capacity, refillPerSecond }) {
  const buckets = new Map();
  return (key, now, cost = 1) => {
    const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.at) / 1000) * refillPerSecond);
    bucket.at = now;
    buckets.set(key, bucket);
    if (bucket.tokens < cost) {
      return { allowed: false, retryAfterMs: Math.ceil(((cost - bucket.tokens) / refillPerSecond) * 1000) };
    }
    bucket.tokens -= cost;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  };
}
```

Each factory returns a function `(key, now) => decision`. The **key** names whose allowance is being counted: a user id, an API key, an IP address. How to choose it has [its own section](#keys).

### Fixed window

The simplest: cut time into windows of equal length (a minute: 09:00:00 to 09:00:59, then 09:01:00 …) and count requests per key per window. When the count reaches the limit, refuse until the next window starts. It needs one counter per key, and `retryAfterMs` is simply the time until the window ends.

Its weakness is the window **boundary**. A client that knows the limit can send it all at the end of one window and again at the start of the next:

boundary.js

```ts
import { fixedWindow, slidingLog } from "./limiters.js";

const burst = [];
for (let i = 0; i < 100; i++) burst.push(59_000 + i * 10);
for (let i = 0; i < 100; i++) burst.push(60_000 + i * 10);
console.log("requests:", burst.length, "between", burst[0] / 1000, "s and", burst.at(-1) / 1000, "s");

for (const [name, limiter] of [
  ["fixed window", fixedWindow({ limit: 100, windowMs: 60_000 })],
  ["sliding log", slidingLog({ limit: 100, windowMs: 60_000 })],
]) {
  const allowed = burst.filter((time) => limiter("partner", time).allowed).length;
  console.log(`${name}: ${allowed} allowed in 2 seconds, with a limit of 100 per minute`);
}
```

Output of `node boundary.js` and of the browser terminal

```ts
requests: 200 between 59 s and 60.99 s
fixed window: 200 allowed in 2 seconds, with a limit of 100 per minute
sliding log: 100 allowed in 2 seconds, with a limit of 100 per minute
```

The fixed window let 200 requests through in two seconds: 100 counted in the window that ended at 60 s, 100 in the window that started there. For a limit meant to protect a database, twice the load in a short spike can be the difference between slow and down.

### Sliding window log

The sliding log keeps the timestamp of every allowed request, and at each new request asks "how many in the last 60 seconds, counted back from *now*?". There are no boundaries, so the limit holds for every 60-second span. You just saw it allow exactly 100. The cost is memory: it stores up to `limit` timestamps per key. For 100 per minute that is fine; for 10,000 per hour across a million API keys, it is not.

### Sliding window counter

A cheap approximation of the log: keep only the counts of the current and the previous fixed window, and *estimate* the last 60 seconds by weighting the previous window by how much of it still overlaps. Twenty seconds into a window, the last 60 seconds contain 40 seconds of the previous window, so it counts `previous × 40/60 + current`. Two numbers per key, and nearly the accuracy of the log, as long as traffic within a window is roughly even.

### Token bucket

The token bucket thinks differently. Each key has a bucket holding up to `capacity` tokens. Every request takes one token; a request that finds the bucket empty is refused. Tokens flow back in at `refillPerSecond`, up to the capacity. Two numbers describe it, and they mean two different things:

- the **refill rate** is the long-run average the client may sustain;
- the **capacity** is the largest **burst** it may send at once after being quiet.

The implementation does not use a timer. It stores the token count and the time it was last updated, and on each request adds the tokens that would have dripped in since then. This is called **lazy refill**, and it is why one limiter can track a million keys without a million timers. Watch a bucket of 5 tokens that refills 1 per second:

bucket-timeline.js

```ts
import { tokenBucket } from "./limiters.js";

const take = tokenBucket({ capacity: 5, refillPerSecond: 1 });
const timeline = [0, 0, 0, 0, 0, 0, 0, 500, 1_000, 3_000, 3_000, 3_000, 3_000];

for (const time of timeline) {
  const decision = take("ada", time);
  const detail = decision.allowed ? `${decision.remaining} left` : `refused, retry in ${decision.retryAfterMs} ms`;
  console.log(`t=${String(time).padStart(5)} ms  ${detail}`);
}
```

Output of `node bucket-timeline.js` and of the browser terminal

```ts
t=    0 ms  4 left
t=    0 ms  3 left
t=    0 ms  2 left
t=    0 ms  1 left
t=    0 ms  0 left
t=    0 ms  refused, retry in 1000 ms
t=    0 ms  refused, retry in 1000 ms
t=  500 ms  refused, retry in 500 ms
t= 1000 ms  0 left
t= 3000 ms  1 left
t= 3000 ms  0 left
t= 3000 ms  refused, retry in 1000 ms
t= 3000 ms  refused, retry in 1000 ms
```

Five requests at once drained the bucket; that is the burst. The sixth and seventh were refused, and each refusal says exactly how long until one token is back. Half a second later there was half a token, still not enough. At 1,000 ms one token had returned. By 3,000 ms two more had dripped in, so two requests passed, then the bucket was empty again.

A close relative, the **leaky bucket**, puts requests in a queue that drains at a fixed rate instead of refusing them. It smooths traffic into a steady stream, which suits calls to a slow partner system; for a public API, refusing quickly is usually better than making clients wait in a queue.

### Side by side

Now run all four on the same traffic: 25 requests spread evenly from 9 s to 11 s, which straddles a window boundary at 10 s. The limit is "10 per 10 seconds", or for the token bucket, a capacity of 10 refilling at 1 per second (the same long-run rate). The last column is the real test: the most requests any limiter let through inside one 10-second span:

compare.js

```ts
import { fixedWindow, slidingCounter, slidingLog, tokenBucket } from "./limiters.js";

const traffic = Array.from({ length: 25 }, (_, i) => 9_000 + Math.round((i * 2_000) / 24));

function maxInAnySpan(times, spanMs) {
  return Math.max(...times.map((start) => times.filter((t) => t >= start && t < start + spanMs).length));
}

const limiters = {
  "fixed window": fixedWindow({ limit: 10, windowMs: 10_000 }),
  "sliding log": slidingLog({ limit: 10, windowMs: 10_000 }),
  "sliding counter": slidingCounter({ limit: 10, windowMs: 10_000 }),
  "token bucket": tokenBucket({ capacity: 10, refillPerSecond: 1 }),
};

for (const [name, limiter] of Object.entries(limiters)) {
  const allowed = traffic.filter((time) => limiter("client", time).allowed);
  console.log(name.padEnd(16), "allowed", String(allowed.length).padStart(2), "| most in any 10 s:", maxInAnySpan(allowed, 10_000));
}
```

Output of `node compare.js` and of the browser terminal

```ts
fixed window     allowed 20 | most in any 10 s: 20
sliding log      allowed 10 | most in any 10 s: 10
sliding counter  allowed 11 | most in any 10 s: 11
token bucket     allowed 12 | most in any 10 s: 12
```

| Algorithm | Memory per key | Accuracy | Good for |
| --- | --- | --- | --- |
| Fixed window | 1 counter | Up to 2× the limit at a boundary | Coarse daily or hourly quotas; the easiest to share in Redis |
| Sliding log | Up to `limit` timestamps | Exact | Small, strict limits: 5 log-ins per 15 minutes |
| Sliding counter | 2 counters | Close; assumes even traffic | General API limits at scale |
| Token bucket | 2 numbers | Exact for its own definition: rate plus burst | APIs where short bursts are normal (a page load fires 8 requests) |

## What to count: user, key or IP

The algorithm is the easy part. The harder question is *whose* allowance a request uses. The options:

- **Per user or per API key.** Fair and precise: each customer or partner gets its own allowance, and plans can differ (a free plan gets 60 per minute, a paid one 6,000). But it only works *after* authentication, and checking a credential may itself cost a database lookup.
- **Per IP address.** Works before authentication, so it protects the log-in endpoint and the authentication step itself. But one IP can be many people: an office, a university or a whole mobile network behind **NAT** (network address translation, where many devices share one public address). And one person can use many IPs.

Here are both failure modes in one run. Thirty colleagues in one office share an IP and each make two requests. Meanwhile an attacker without an account sends requests with a made-up API key each time:

keys.js

```ts
import { tokenBucket } from "./limiters.js";

function run(label, keyOf) {
  const limiter = tokenBucket({ capacity: 10, refillPerSecond: 1 });
  let office = 0, attacker = 0;
  for (let i = 0; i < 30; i++) {
    for (let n = 0; n < 2; n++) {
      if (limiter(keyOf({ ip: "102.89.4.17", user: `staff-${i}` }), 0).allowed) office++;
    }
  }
  for (let i = 0; i < 60; i++) {
    if (limiter(keyOf({ ip: "198.51.100.66", user: `fake-key-${i}` }), 0).allowed) attacker++;
  }
  console.log(`${label}: office ${office}/60 served, attacker ${attacker}/60 served`);
}

run("per IP  ", (r) => `ip:${r.ip}`);
run("per user", (r) => `user:${r.user}`);
```

Output of `node keys.js` and of the browser terminal

```ts
per IP  : office 10/60 served, attacker 10/60 served
per user: office 60/60 served, attacker 60/60 served
```

Per IP, the office was throttled after 10 requests as if it were one greedy client, and the attacker was stopped after 10 too. Per user, the office was fine, and the attacker walked straight through, because every made-up key got a fresh bucket. The practical answer is **layers**:

1. A generous **per-IP** limit first, before any expensive work, to stop floods and key-spraying. Set it high enough for a busy office.
2. Authenticate. Unknown keys are rejected and counted against the IP, never given buckets of their own.
3. A **per-user** (or per-API-key) limit for fairness, sized by plan.
4. Special, strict limits for sensitive endpoints: log-in attempts per account and per IP, password resets per e-mail, transfers per account. [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication) builds the log-in protections.

### Which IP?

Behind a load balancer, `req.socket.remoteAddress` is the load balancer's address, and the client's address arrives in a header such as `X-Forwarded-For`. That header is written by whoever sends the request, so an attacker can put any value in it. Trust only the entries added by proxies *you* run (the right-most ones), and never the whole header. With IPv6, one customer usually controls a whole block of addresses (a `/64` prefix, 264 addresses), so limit by the prefix, not the full address. The [security lesson](https://zudojs.oyinlola.site/learn/zudo-security#rate-limit) shows `extractClientIp` doing this.

## 429, Retry-After and the headers

A refused request gets **429 Too Many Requests**. A good 429 tells the client exactly what to do:

- `Retry-After: 3`: wait at least 3 seconds (it may also be an HTTP date). Round *up*: telling a client "0" invites an immediate retry that is refused again.
- A problem details body ([RFC 9457](https://zudojs.oyinlola.site/learn/rest-design#errors)) that says which limit was hit.
- Optionally, the client's current allowance on every response, so well-behaved clients slow down *before* hitting the limit. Many APIs send `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`; an IETF draft is standardising the same idea as `RateLimit` and `RateLimit-Policy` headers.

Not all requests cost the same. Listing exchange rates is a cache read; a transfer is a database transaction with locks. A token bucket handles this naturally: an expensive route takes more tokens. Here is the transfer API with a per-user bucket (10 tokens, refilling 2 per second), where `POST /transfers` costs 5 tokens and a `GET` costs 1. Unauthenticated requests are limited by IP. The clock is injected so the example can move time forward:

server.jsNode.js only

```ts
import http from "node:http";
import { tokenBucket } from "./limiters.js";

const users = new Map([["token-ada", "ada"], ["token-payroll", "payroll-partner"]]);
const COST = { GET: 1, POST: 5 };
const perUser = tokenBucket({ capacity: 10, refillPerSecond: 2 });
const perIp = tokenBucket({ capacity: 20, refillPerSecond: 5 });
let now = 0;

const server = http.createServer((req, res) => {
  const user = users.get((req.headers.authorization ?? "").replace("Bearer ", ""));
  const key = user ? `user:${user}` : `ip:${req.socket.remoteAddress}`;
  const decision = (user ? perUser : perIp)(key, now, COST[req.method] ?? 1);
  if (!decision.allowed) {
    const seconds = Math.ceil(decision.retryAfterMs / 1000);
    res.writeHead(429, { "Content-Type": "application/problem+json", "Retry-After": String(seconds) });
    return res.end(JSON.stringify({ status: 429, title: "Too Many Requests", detail: `Limit reached for ${key}; retry in ${seconds} s` }));
  }
  res.writeHead(req.method === "POST" ? 201 : 200, { "X-RateLimit-Remaining": String(decision.remaining) }).end();
});

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, token) => {
    const res = await fetch(`${base}/transfers`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return `${method} ${res.status} remaining=${res.headers.get("x-ratelimit-remaining")} retry-after=${res.headers.get("retry-after")}`;
  };

  console.log("payroll partner, three transfers at t=0:");
  for (let i = 0; i < 3; i++) console.log(" ", await call("POST", "token-payroll"));
  console.log("ada, unaffected:", await call("GET", "token-ada"));

  now = 2_000;
  console.log("payroll partner at t=2s:", await call("POST", "token-payroll"));
  server.close();
});
```

Output of `node server.js`

```ts
payroll partner, three transfers at t=0:
  POST 201 remaining=5 retry-after=null
  POST 201 remaining=0 retry-after=null
  POST 429 remaining=null retry-after=3
ada, unaffected: GET 200 remaining=9 retry-after=null
payroll partner at t=2s: POST 429 remaining=null retry-after=1
```

- Two transfers used the partner's 10 tokens. The third was refused with `Retry-After: 3`: it needs 5 tokens at 2 per second, which is 2.5 seconds, rounded up.
- Ada has her own bucket, so the partner's script cannot use up her allowance. That is the whole point of per-user limits: the Monday 09:00 incident becomes the partner's problem only.
- Two seconds later, 4 tokens had returned, not 5, so the next transfer was still refused, with a new, shorter wait. The client that honours `Retry-After` waits 3 seconds and succeeds.

### The client's side

A 429 is retryable, like the network errors in [the idempotency lesson](https://zudojs.oyinlola.site/learn/api-idempotency#http), with one difference: the server has told you how long to wait. Use `Retry-After` instead of your own backoff when it is present, add a little jitter, and cap the total wait. And because a transfer retried after a 429 carries the same idempotency key, the retry is safe.

> COMMON MISTAKE
>
> Counting a request only after the expensive work, for example rate limiting in the transfer handler after the database transaction. By then the damage is done. The limiter must run first, and a refusal must be cheap: no body parsing, no database, no password hashing.

## One limit, many servers

Every limiter so far keeps its counts in the memory of one process. Your API runs as several copies (called **instances**) behind a load balancer, each with its own memory, so each counts separately. With three instances and a limit of 100 per minute, a client that is spread across them gets 300. For generous fairness limits that may be acceptable; for "5 log-in attempts per 15 minutes" it is not.

The fix is a **shared store** that every instance asks, with an operation that is **atomic**: "add one and tell me the new count" must be a single step, or two instances can read 99, both add one, and both allow. PostgreSQL can do it with one statement: `INSERT … ON CONFLICT DO UPDATE … RETURNING` creates the counter for this key and window, or increments it, and returns the result, all at once:

shared-counter.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { fixedWindow } from "./limiters.js";

const db = new PGlite();
await db.exec(`CREATE TABLE rate_counters (
  key text NOT NULL, window_start bigint NOT NULL, count integer NOT NULL,
  PRIMARY KEY (key, window_start))`);

function sharedFixedWindow({ limit, windowMs }) {
  return async (key, now) => {
    const start = Math.floor(now / windowMs) * windowMs;
    const { rows: [row] } = await db.query(
      `INSERT INTO rate_counters (key, window_start, count) VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = rate_counters.count + 1
       RETURNING count`,
      [key, start],
    );
    return { allowed: row.count <= limit };
  };
}

const local = [1, 2, 3].map(() => fixedWindow({ limit: 5, windowMs: 60_000 }));
const shared = [1, 2, 3].map(() => sharedFixedWindow({ limit: 5, windowMs: 60_000 }));

let localAllowed = 0, sharedAllowed = 0;
for (let i = 0; i < 15; i++) {
  const instance = i % 3;
  if (local[instance]("login:ada@example.com", 1_000).allowed) localAllowed++;
  if ((await shared[instance]("login:ada@example.com", 1_000)).allowed) sharedAllowed++;
}
console.log("15 attempts over 3 instances, limit 5");
console.log("  memory per instance:", localAllowed, "allowed");
console.log("  shared counter:     ", sharedAllowed, "allowed");
await db.close();
```

Output of `node shared-counter.js`

```ts
15 attempts over 3 instances, limit 5
  memory per instance: 15 allowed
  shared counter:      5 allowed
```

With counts in memory, the attacker got three times the limit simply because the load balancer spread the attempts. With the shared counter, exactly 5. Old windows can be deleted by a scheduled job; `window_start` is part of the key, so they are never read again.

A database works for low-volume, high-value limits such as log-in attempts. For limits checked on every API request, most teams use **Redis**, an in-memory data store that answers in well under a millisecond. The fixed window above is two Redis commands: `INCR` (atomic add-and-return) and `EXPIRE` (delete the key when the window is over):

redis-cli (example output)

```bash
$ redis-cli
127.0.0.1:6379> INCR rate:login:ada@example.com:29348211
(integer) 1
127.0.0.1:6379> EXPIRE rate:login:ada@example.com:29348211 60 NX
(integer) 1
127.0.0.1:6379> INCR rate:login:ada@example.com:29348211
(integer) 2
127.0.0.1:6379> TTL rate:login:ada@example.com:29348211
(integer) 57
```

The number at the end of the key is the window: the current time divided by 60 seconds. `NX` sets the expiry only the first time. A token bucket needs to read, compute and write in one step, which in Redis is done with a small Lua script that Redis runs atomically. Libraries do this for you; the idea is exactly the `tokenBucket` function above.

## 50,000 requests per second

REASON IT OUT

### 50,000 requests per second: where is the bottleneck?

Marketing announces a promotion: the first 10,000 customers to transfer ₦5,000 get ₦500 back. At 12:00 the API receives 50,000 requests per second. It runs as 20 instances behind a load balancer, with one PostgreSQL primary and a pool of 100 database connections, and a Redis for rate limits. A transfer transaction holds a database connection for about 5 ms. Before reading on, think:

- How many requests per second does each instance handle? How many are in flight at once if each takes 80 ms?
- How many transfers per second can the database pool complete at most?
- If every request asks Redis for its rate limit, how many Redis operations per second is that, and what happens if Redis is slow or down?
- Does rate limiting let you serve 50,000 transfers per second?
- Where is the cheapest place to refuse a request?

**Show the reasoning**

**Per instance:** 50,000 / 20 = 2,500 requests per second each. By **Little's law** (requests in flight = arrival rate × time each spends in the system), 50,000 × 0.08 s = 4,000 requests are in flight at any moment, 200 per instance: 200 open sockets, 200 request objects in memory. That is fine for Node.js if the requests are waiting on I/O, not burning CPU.

**The database is the bottleneck.** 100 connections, each busy 5 ms per transfer, can finish at most 100 / 0.005 = 20,000 transfers per second, and in practice less, because transfers on popular accounts wait for each other's row locks. 50,000 transfers per second cannot all be served, whatever you do in the API layer.

**Redis:** 50,000 operations per second is within what one Redis can do, but every request now waits for a network round trip to it, and Redis becomes a single point of failure. Decide in advance whether a limiter that cannot reach its store **fails open** (allow the request) or **fails closed** (refuse it); see [failure cases](#failures).

**Rate limiting does not add capacity.** It decides who gets it. Here that means: a per-user limit on transfers (each customer gets the promotion once or twice, not 400 times), and a global limit that keeps total transfers below what the database can do, answering the rest with 429 or 503 and `Retry-After` so the queue does not grow until everything times out.

**Refuse as early as possible.** A flood from a few IPs is cheapest to stop at the edge (the CDN, a firewall or the load balancer), before it reaches Node.js at all. Inside the app, the limiter runs before authentication lookups, body parsing and database work. A 429 should cost microseconds.

The same arithmetic as a small program. Capacity planning is mostly multiplication; the skill is knowing which numbers to multiply:

capacity.js

```ts
const load = { requestsPerSecond: 50_000, instances: 20, secondsPerRequest: 0.08 };
const database = { connections: 100, secondsPerTransfer: 0.005 };

const perInstance = load.requestsPerSecond / load.instances;
const inFlight = load.requestsPerSecond * load.secondsPerRequest;
const maxTransfers = database.connections / database.secondsPerTransfer;

console.log("per instance:", perInstance, "requests/s");
console.log("in flight (Little's law):", inFlight, "requests,", inFlight / load.instances, "per instance");
console.log("database ceiling:", maxTransfers, "transfers/s");
console.log("excess to refuse or queue:", load.requestsPerSecond - maxTransfers, "requests/s");
console.log("global limit at 80% of the ceiling:", maxTransfers * 0.8, "transfers/s");
```

Output of `node capacity.js` and of the browser terminal

```ts
per instance: 2500 requests/s
in flight (Little's law): 4000 requests, 200 per instance
database ceiling: 20000 transfers/s
excess to refuse or queue: 30000 requests/s
global limit at 80% of the ceiling: 16000 transfers/s
```

The global limit is set below the ceiling on purpose: a database at 100% of capacity is slow for everyone, and slow requests hold connections longer, which lowers the ceiling further. Headroom keeps latency stable.

## Failure cases

- **The store is down.** If the limiter's Redis or table cannot be reached, fail *open* for general API limits (a short outage of the limiter should not take the API down) and fail *closed* for security limits such as log-in attempts (an outage must not become an unlimited password-guessing window). Write the choice down per limit, and alert on it.
- **Unbounded memory.** An in-memory limiter keyed by IP grows by one entry per address it ever saw. Evict idle keys (the second exercise shows a neat trick for token buckets), or cap the map size.
- **Keys the attacker controls.** Limiting per API key before checking that the key exists gives every made-up key a fresh allowance, as `keys.js` showed.
- **Retry storms.** Clients that retry 429s immediately turn a limit into a loop. `Retry-After`, backoff and jitter on the client side are part of the design.
- **Limiting the wrong things.** Health checks from your load balancer and internal service calls should not share a bucket with customers.
- **Clocks.** Instances disagree about the time by a few milliseconds. Shared counters should take the window from one clock (the store's), or accept small errors at window edges.

## Testing a limiter

Because every limiter takes `now` as an argument, tests can replay hours of traffic in microseconds. The strongest test checks the promise itself, not a few chosen cases: for random traffic, the sliding log never allows more than the limit in *any* window. The traffic comes from a small seeded random generator, so the test gives the same result every run:

property.js

```ts
import { fixedWindow, slidingLog } from "./limiters.js";

function seeded(seed) {
  return () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
}

function worstWindow(makeLimiter, seed) {
  const random = seeded(seed);
  const limiter = makeLimiter();
  const allowed = [];
  let time = 0;
  for (let i = 0; i < 2_000; i++) {
    time += Math.floor(random() * 400);
    if (limiter("client", time).allowed) allowed.push(time);
  }
  let worst = 0;
  for (let i = 0; i < allowed.length; i++) {
    let j = i;
    while (j < allowed.length && allowed[j] < allowed[i] + 10_000) j++;
    worst = Math.max(worst, j - i);
  }
  return worst;
}

for (const seed of [1, 2, 3]) {
  const log = worstWindow(() => slidingLog({ limit: 20, windowMs: 10_000 }), seed);
  const fixed = worstWindow(() => fixedWindow({ limit: 20, windowMs: 10_000 }), seed);
  console.log(`seed ${seed}: sliding log worst ${log}, fixed window worst ${fixed} (limit 20)`);
}
```

Output of `node property.js` and of the browser terminal

```ts
seed 1: sliding log worst 20, fixed window worst 31 (limit 20)
seed 2: sliding log worst 20, fixed window worst 28 (limit 20)
seed 3: sliding log worst 20, fixed window worst 26 (limit 20)
```

The sliding log keeps its promise on every seed; the fixed window breaks it at window boundaries, which is the bug from the start of this lesson, now found by a test without anyone having to think of the boundary. This style is called **property-based testing**; [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies) does it with the fast-check library.

## Practice

TRY IT YOURSELF

### Fail open or fail closed

Write `withFallback(check, mode)` that wraps an async limiter check. If the check throws (the store is down), it returns `{ allowed: true }` in `"open"` mode and `{ allowed: false, retryAfterMs: 1000 }` in `"closed"` mode, and logs a warning either way. Use it for a general API limit and a log-in limit while the store is down.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

The whole risky part is `await check(key, now)`, in a `try`. Everything else is choosing what to return once you're in the `catch`.

HINT 2

`try { return await check(key, now); } catch (error) { console.log(\`warning: rate limit store failed (${error.message}); failing ${mode}\`); return mode === "open" ? { allowed: true } : { allowed: false, retryAfterMs: 1000 }; }`

SOLUTION

fallback.js

```ts
function withFallback(check, mode) {
  return async (key, now) => {
    try {
      return await check(key, now);
    } catch (error) {
      console.log(`warning: rate limit store failed (${error.message}); failing ${mode}`);
      return mode === "open" ? { allowed: true } : { allowed: false, retryAfterMs: 1000 };
    }
  };
}

const storeDown = async () => {
  throw new Error("connection refused");
};

const apiLimit = withFallback(storeDown, "open");
const loginLimit = withFallback(storeDown, "closed");
console.log("GET /rates:", await apiLimit("user:ada", 0));
console.log("POST /sessions:", await loginLimit("ip:102.89.4.17", 0));
```

Output of `node fallback.js` and of the browser terminal

```ts
warning: rate limit store failed (connection refused); failing open
GET /rates: { allowed: true }
warning: rate limit store failed (connection refused); failing closed
POST /sessions: { allowed: false, retryAfterMs: 1000 }
```

Browsing exchange rates keeps working through the outage; log-in attempts are refused until the store is back, so the outage cannot be used to guess passwords. The warning is not optional: a limiter that silently fails open is a limiter you do not have.

TRY IT YOURSELF

### Forget full buckets

An in-memory token bucket keeps an entry for every key it has seen. Add a `sweep(now)` function that deletes every bucket that would be *full* at `now`. Explain why deleting a full bucket changes nothing for that client, then show the map shrinking.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Call the existing `refill` helper for each bucket to find out what it would hold *right now*, without changing the bucket itself, then compare that to `capacity`.

HINT 2

`for (const [key, bucket] of buckets) { if (refill(bucket, now) >= capacity) buckets.delete(key); } return buckets.size;`

SOLUTION

sweep.js

```ts
function tokenBucket({ capacity, refillPerSecond }) {
  const buckets = new Map();
  const refill = (bucket, now) => Math.min(capacity, bucket.tokens + ((now - bucket.at) / 1000) * refillPerSecond);
  return {
    take(key, now) {
      const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
      bucket.tokens = refill(bucket, now);
      bucket.at = now;
      buckets.set(key, bucket);
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
    sweep(now) {
      for (const [key, bucket] of buckets) {
        if (refill(bucket, now) >= capacity) buckets.delete(key);
      }
      return buckets.size;
    },
  };
}

const limiter = tokenBucket({ capacity: 10, refillPerSecond: 1 });
for (let ip = 1; ip <= 1_000; ip++) limiter.take(`ip:10.0.${ip >> 8}.${ip & 255}`, 0);
for (let i = 0; i < 10; i++) limiter.take("ip:198.51.100.66", 5_000);

console.log("after 5 s:", limiter.sweep(5_000), "buckets");
console.log("after 9 s:", limiter.sweep(9_000), "buckets");
console.log("after 15 s:", limiter.sweep(15_000), "buckets");
```

Output of `node sweep.js` and of the browser terminal

```ts
after 5 s: 1 buckets
after 9 s: 1 buckets
after 15 s: 0 buckets
```

A missing bucket is created full, so a full bucket and no bucket give the client exactly the same allowance. The 1,000 one-off visitors each used one token at time 0 and were full again after one second, so the first sweep removed them. The busy client emptied its bucket at 5 s, so its entry stays until it has refilled, 10 seconds later. Memory now grows with *active* clients, not with every address ever seen.

TRY IT YOURSELF

### A daily quota

A free plan allows 1,000 requests per day (UTC), counted with a fixed window. Write `dailyQuota(limit)` returning `(key, now)` decisions with a `retryAfterSeconds` that points at the next UTC midnight. Test it at 23:59:30 UTC with the quota already used up.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

The id needs both the key and the day number, exactly like the worked example's `id`, just built from `DAY` instead of `HOUR`.

HINT 2

`const day = Math.floor(now / DAY); const id = \`${key}:${day}\`; const count = used.get(id) ?? 0; if (count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil(((day + 1) * DAY - now) / 1000) }; used.set(id, count + 1); return { allowed: true, remaining: limit - count - 1 };`

SOLUTION

daily.js

```ts
const DAY = 24 * 60 * 60 * 1000;

function dailyQuota(limit) {
  const used = new Map();
  return (key, now) => {
    const day = Math.floor(now / DAY);
    const id = `${key}:${day}`;
    const count = used.get(id) ?? 0;
    if (count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil(((day + 1) * DAY - now) / 1000) };
    used.set(id, count + 1);
    return { allowed: true, remaining: limit - count - 1 };
  };
}

const quota = dailyQuota(1_000);
const lateNight = Date.UTC(2026, 8, 24, 23, 59, 30);
for (let i = 0; i < 1_000; i++) quota("key:free-plan-17", lateNight - 3_600_000);
console.log(quota("key:free-plan-17", lateNight));
console.log(quota("key:free-plan-17", lateNight + 31_000));
```

Output of `node daily.js` and of the browser terminal

```json
{ allowed: false, retryAfterSeconds: 30 }
{ allowed: true, remaining: 999 }
```

For a daily quota the boundary burst does not matter much (2,000 requests around midnight is still a small number), and a fixed window is easy to explain to customers: "resets at midnight UTC". The key includes the day number, so yesterday's entries are never read again and can be swept.

## Summary

- A rate limiter counts requests per key over time and refuses the excess with 429. It does not add capacity; it decides who gets it.
- Fixed windows are simple but allow twice the limit around a boundary. Sliding logs are exact but store a timestamp per request. Sliding counters approximate the log with two numbers. Token buckets allow a burst up to their capacity and a long-run rate equal to their refill rate.
- Pass the time in as an argument, refill lazily, and test with replayed or random traffic.
- Layer the keys: a generous per-IP limit before authentication, per-user or per-key limits after it, and strict limits on sensitive endpoints. Never give unverified keys their own buckets, and do not trust `X-Forwarded-For` blindly.
- Answer 429 with a rounded-up `Retry-After` and a problem details body; charge expensive routes more tokens; refuse before doing any expensive work.
- Several instances need a shared, atomic counter: a database row for low-volume security limits, Redis for per-request limits. Decide per limit whether to fail open or closed.
- At high load, find the real bottleneck with Little's law and simple arithmetic, usually the database, and set a global limit below its ceiling.

Next: [API contracts](https://zudojs.oyinlola.site/learn/api-contracts), where you write down everything your API promises, in a form machines can check.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
