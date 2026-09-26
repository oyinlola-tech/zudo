---
title: "Serialization — ZudoJS Academy"
description: "Turn values into text and back without losing what they were: Dates, BigInts, Maps, Sets, bytes, custom types and versioned payloads with @zudojs/serialization."
source: https://zudojs.oyinlola.site/learn/zudo-serialization
---

LEVEL 14 · LESSON 6 OF 18

Services and contracts Advanced

# Serialization

Turn values into text and back without losing what they were: Dates, BigInts, Maps, Sets, bytes, custom types and versioned payloads with @zudojs/serialization.

- **35 min** to read and try
- **You need:** The background jobs lesson
- **You build:** Reminder job payloads that keep their types across the queue, and survive a change of format

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain exactly what plain JSON.stringify loses and why no type error warns you
- Keep Dates, BigInts, Maps, Sets and bytes across a serialize/deserialize round trip
- Deserialize untrusted text safely against prototype pollution and tag spoofing
- Teach the serializer a custom type with a TypeTransformer
- Wrap payloads in an envelope and version them so old and new readers coexist

## Values that leave your process

Inside a running program, a value is an object in memory. The moment it has to leave, into a queue, a Redis cache, an HTTP response, a file or another service, it must become text or bytes. Turning a value into text is **serialization**. Turning the text back into a value is **deserialization**.

You have done it all course long with `JSON.stringify` and `JSON.parse`. JSON is the common format of the web, but it only knows six kinds of value: strings, numbers, booleans, `null`, arrays and plain objects. Everything else is changed on the way, or refused. Here is a task with the kinds of values a real app has:

json-loses.ts

```ts
const task = {
  id: 1,
  due: new Date("2026-10-05T09:00:00Z"),
  tags: new Set(["home", "urgent"]),
  notes: new Map([["2026-10-01", "called the bank"]]),
  attachment: new Uint8Array([137, 80, 78, 71]),
  lastError: new Error("mail server is down"),
};

const back = JSON.parse(JSON.stringify(task));
console.log(back);
console.log("due is a", typeof back.due);

try {
  JSON.stringify({ views: 12345678901234567890n });
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message);
}
```

Output of `npx tsx json-loses.ts` and of the browser terminal

```json
{
  id: 1,
  due: '2026-10-05T09:00:00.000Z',
  tags: {},
  notes: {},
  attachment: { '0': 137, '1': 80, '2': 78, '3': 71 },
  lastError: {}
}
due is a string
TypeError - Do not know how to serialize a BigInt
```

Only `id` survived. Look at each one:

- **Date** became a string. Code that later calls `due.getTime()` crashes.
- **Set** and **Map** became empty objects: the tags and notes are simply gone.
- **Uint8Array**, raw bytes such as an image, became an object with one key per byte.
- **Error** became `{}`: its message is lost.
- **BigInt**, for whole numbers too big for a normal number, is refused with an error.

None of this is a TypeScript error. The types say `Date`, and the program runs until the first line that uses it as one.

## The same problem in a queue

This is not only a textbook problem. The queue from [the background jobs lesson](https://zudojs.oyinlola.site/learn/zudo-queue) serializes every job's data, exactly as a queue in Redis would. Its default serializer is built on the package of this lesson, so a `Date` arrives as a `Date`. Switch that off with a plain JSON serializer and watch what the processor receives:

queue-date.ts

```ts
import { createInMemoryQueue, createJsonSerializer, createQueueName } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function send(label: string, preserveTypes: boolean): Promise<void> {
  const reminders = createInMemoryQueue<{ taskId: number; remindAt: Date }>(createQueueName("reminders"), {
    serializer: createJsonSerializer({ preserveTypes }),
  });
  reminders.process("send-reminder", async (job) => {
    console.log(`${label}: remindAt is a ${job.data.remindAt.constructor.name}`);
  });
  await reminders.add("send-reminder", { taskId: 1, remindAt: new Date("2026-10-05T09:00:00Z") });
  await wait(100);
  await reminders.close();
}

await send("default", true);
await send("plain JSON", false);
```

Output of `npx tsx queue-date.ts` and of the browser terminal

```ts
default: remindAt is a Date
plain JSON: remindAt is a String
```

With plain JSON, the type `{ remindAt: Date }` promised a `Date`, and the processor received a string. The first call to `remindAt.getTime()` would crash. The queue avoids that by default (since `@zudojs/queue` 1.4.0), and the rest of this lesson shows how: tagged values, which you can also use for your cache, your files and your own types.

## Install @zudojs/serialization

Terminal on your computer

```bash
$ npm install @zudojs/serialization

up to date, audited 78 packages in 2s
…
```

"up to date": the package was already in `node_modules`, because the cache and the queue use it. Installing it yourself still matters: it adds it to your `package.json`, so your code does not depend on another package's choices. The examples run in the browser terminal, and with `npx tsx src/<file>.ts` on your computer.

## Keep the types

`createSerializer("json", { preserveTypes: true })` creates a serializer that still writes JSON, but marks every value that JSON cannot hold, so it can be rebuilt on the way back:

preserve.ts

```ts
import { createSerializer } from "@zudojs/serialization";

const serializer = createSerializer("json", { preserveTypes: true });

const task = {
  id: 1,
  due: new Date("2026-10-05T09:00:00Z"),
  views: 12345678901234567890n,
  tags: new Set(["home", "urgent"]),
  notes: new Map([["2026-10-01", "called the bank"]]),
  attachment: new Uint8Array([137, 80, 78, 71]),
};

const text = serializer.serialize(task);
console.log(text);

const back = serializer.deserialize<typeof task>(text);
console.log(back);
console.log(back.due instanceof Date, back.tags.has("urgent"), back.notes.get("2026-10-01"));
```

Output of `npx tsx preserve.ts` and of the browser terminal

```json
{"id":1,"due":{"$type":"Date","$value":"2026-10-05T09:00:00.000Z"},"views":{"$type":"BigInt","$value":"12345678901234567890"},"tags":{"$type":"Set","$value":["home","urgent"]},"notes":{"$type":"Map","$value":[["2026-10-01","called the bank"]]},"attachment":{"$type":"Buffer","$encoding":"base64","$value":"iVBORw=="}}
{
  id: 1,
  due: 2026-10-05T09:00:00.000Z,
  views: 12345678901234567890n,
  tags: Set(2) { 'home', 'urgent' },
  notes: Map(1) { '2026-10-01' => 'called the bank' },
  attachment: Uint8Array(4) [ 137, 80, 78, 71 ]
}
true true called the bank
```

Read the text: every special value became a small object with a `$type` tag and a `$value`. The date is an ISO string, the BigInt its digits, the Set and Map arrays, and the bytes **base64**, a way of writing bytes as plain letters. It is still valid JSON, so any system can store and send it. Only a reader that understands the tags can rebuild the values, and it did: a real `Date`, `bigint`, `Set`, `Map` and `Uint8Array`.

The option has a cost: the text is longer, and a non-JavaScript service reading it sees the tags. Use it where both sides are your code, such as your queue and your cache. For a public API, send plain JSON with dates as ISO strings, and parse them with a schema as in [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation).

REASON IT OUT

### preserveTypes makes payloads bigger and puts $type tags in the output. Why default to it for the queue and the cache, but not for a public API?

Think about who reads each payload back. A job you put on the queue is read only by your own processors, running the same package. A cache entry is read only by your own app. A public API response is read by whoever calls it: a mobile app, a partner's backend, a script someone else wrote, possibly in a language that has never heard of a `$type` tag.

**Show the reasoning**

Where both sides are your own code, the tags cost you nothing you care about (a few extra bytes) and buy back real correctness: a job's `Date` stays a `Date` without every processor re-parsing strings by hand, and a bug like "the reminder crashed because `remindAt` was a string" simply cannot happen. A public API has no such guarantee about its readers, so the tags become a liability instead: an unfamiliar client either has to learn your tagging convention or gets a confusing `{ "$type": "Date", "$value": "…" }` where it expected a plain string. The fix is not to disable type safety, but to move it to the boundary: send plain JSON with ISO date strings on the wire, and parse the response into real types with a schema, exactly once, right where the untrusted text turns back into a value your code trusts.

## Errors, limits and circular data

An `Error` is rebuilt with its name and message. Its **stack trace**, the list of code lines that led to it, is left out unless you ask for it with `includeStack: true`. Serialized errors end up in queues and logs, and a stack trace tells an attacker about your code, so leaving it out is the safe default.

The serializer also refuses things that would break or overload a program:

limits.ts

```ts
import { createSerializer } from "@zudojs/serialization";

const serializer = createSerializer("json", { preserveTypes: true });

const text = serializer.serialize({ lastError: new Error("mail server is down") });
console.log(text);
const back = serializer.deserialize<{ lastError: Error }>(text);
console.log(back.lastError instanceof Error, back.lastError.message);

const task: { id: number; parent?: unknown } = { id: 1 };
task.parent = task;
const attempts: Array<[string, () => unknown]> = [
  ["circular", () => serializer.serialize(task)],
  ["invalid date", () => serializer.serialize({ due: new Date("not a date") })],
  ["too large", () => serializer.deserialize(`{"title":"${"x".repeat(2000)}"}`, { maxSize: 1000 })],
];
for (const [label, attempt] of attempts) {
  try {
    attempt();
  } catch (error) {
    if (error instanceof Error) console.log(`${label}: ${error.name}: ${error.message}`);
  }
}
```

Output of `npx tsx limits.ts` and of the browser terminal

```json
{"lastError":{"$type":"Error","name":"Error","message":"mail server is down"}}
true mail server is down
circular: CircularReferenceError: Circular reference detected at "root.parent"
invalid date: SerializeError: Cannot serialize an invalid Date.
too large: SerializationPayloadTooLargeError: Serialized payload too large: 2012 bytes (max: 1000)
```

- A **circular** value, one that contains itself, has no end, so it cannot be written out. Plain `JSON.stringify` throws too, with a less helpful message.
- An **invalid date** is refused instead of being written as `null`.
- `maxSize` refuses text larger than a limit in bytes, and `maxDepth` limits how deeply objects may nest. Set both whenever the text comes from outside.

## Reading untrusted input

`deserialize` is where outside data enters your program: a message from a queue, a body from another service. Treat that text as hostile. Three protections are built in:

untrusted.ts

```ts
import { createSerializer } from "@zudojs/serialization";

const serializer = createSerializer("json", { preserveTypes: true });

const attack = '{"name":"Ada","__proto__":{"isAdmin":true}}';
const user = serializer.deserialize<{ name: string; isAdmin?: boolean }>(attack);
console.log(user, "isAdmin:", user.isAdmin, "every object:", ({} as { isAdmin?: boolean }).isAdmin);

const tricky = { $type: "Map", $value: [["role", "admin"]] };
const text = serializer.serialize(tricky);
console.log(text);
console.log(serializer.deserialize(text));

const broken = '{"due":{"$type":"Date","$value":"yesterday"}}';
console.log(serializer.deserialize(broken));
try {
  serializer.deserialize(broken, { strict: true });
} catch (error) {
  if (error instanceof Error) console.log("strict:", error.name, "-", error.message);
}
```

Output of `npx tsx untrusted.ts` and of the browser terminal

```json
{ name: 'Ada' } isAdmin: undefined every object: undefined
{"$type":"Object","$value":{"$type":"Map","$value":[["role","admin"]]}}
{ '$type': 'Map', '$value': [ [ 'role', 'admin' ] ] }
{ due: { '$type': 'Date', '$value': 'yesterday' } }
strict: InvalidSerializedDataError - Invalid Date value: "yesterday"
```

- **Prototype pollution.** The key `__proto__` is special in JavaScript. Merged carelessly, it can add properties such as `isAdmin` to *every* object in the program. The serializer drops `__proto__`, `constructor` and `prototype` keys while it rebuilds objects.
- **Your data cannot pretend to be a tag.** A plain object that happens to have a `$type` key is written in a wrapper (`"$type":"Object"`) and read back as the plain object it was, never as a `Map`.
- **Broken tags stay data.** By default, a tag that does not make sense is left as it is, so one bad record does not stop your consumer. With `strict: true` it throws instead. Use strict mode when a bad payload should be rejected, and send it to the dead-letter queue.

The serializer only checks that the text is safe to rebuild. It does not check that the data makes sense for your app: a reminder with a `taskId` of -5 deserializes fine. Validate the result with a schema, as with any outside input.

## Your own types

The Task API gives each task an estimate, stored in a small `Duration` class. The serializer does not know it, so it would come back as a plain object without its methods. Teach it with a **transformer**: an object that says how to recognise the type, how to write it as a tagged value, and how to rebuild it:

custom.ts

```ts
import { JSONSerializer } from "@zudojs/serialization";
import type { TypeTransformer } from "@zudojs/serialization";

class Duration {
  constructor(readonly minutes: number) {}
  toString(): string {
    return `${Math.floor(this.minutes / 60)}h${this.minutes % 60}m`;
  }
}

const DurationTransformer: TypeTransformer<Duration> = {
  type: "Duration",
  canSerialize: (value): value is Duration => value instanceof Duration,
  serialize: (value) => value.minutes,
  deserialize: (value) => {
    const minutes = (value as { $value?: unknown }).$value;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0) {
      throw new TypeError("A Duration needs a whole number of minutes");
    }
    return new Duration(minutes);
  },
};

const serializer = new JSONSerializer({ defaults: { preserveTypes: true } });
serializer.registerTransformer(DurationTransformer);

const text = serializer.serialize({ estimate: new Duration(90), due: new Date("2026-10-05T09:00:00Z") });
console.log(text);

const back = serializer.deserialize<{ estimate: Duration; due: Date }>(text);
console.log(back.estimate instanceof Duration, String(back.estimate), back.due instanceof Date);

try {
  serializer.deserialize('{"estimate":{"$type":"Duration","$value":-5}}', { strict: true });
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message);
}
```

Output of `npx tsx custom.ts` and of the browser terminal

```json
{"estimate":{"$type":"Duration","$value":90},"due":{"$type":"Date","$value":"2026-10-05T09:00:00.000Z"}}
true 1h30m true
TransformerError - Transformer error (Duration): A Duration needs a whole number of minutes
```

- `serialize` returns the value to store, here the number of minutes. The serializer wraps it as `{ "$type": "Duration", "$value": 90 }` for you, so the reader knows what to rebuild. (Returning the whole tagged object yourself also works.)
- `deserialize` always receives the whole tagged object, and that data comes from outside. Check it, as here, before you build an object from it.
- `new JSONSerializer(...)` plus `registerTransformer` *adds* your type next to the built-in ones, which is why the date still works.

You can also collect your transformers in a `TransformerRegistry` and pass it as the `transformers` option. Your registry is asked first, and the built-in transformers still handle everything else. Pass `builtins: false` only if you want your registry alone:

registry.ts

```ts
import { createSerializer, TransformerRegistry } from "@zudojs/serialization";
import type { TypeTransformer } from "@zudojs/serialization";

class Duration {
  constructor(readonly minutes: number) {}
}

const registry = new TransformerRegistry();
registry.register({
  type: "Duration",
  canSerialize: (value): value is Duration => value instanceof Duration,
  serialize: (value) => value.minutes,
  deserialize: (value) => new Duration(Number((value as { $value?: unknown }).$value)),
} satisfies TypeTransformer<Duration>);

const task = { estimate: new Duration(90), due: new Date("2026-10-05T09:00:00Z") };

const mine = createSerializer("json", { preserveTypes: true, transformers: registry });
console.log(mine.serialize(task));

const onlyMine = createSerializer("json", { preserveTypes: true, transformers: registry, builtins: false });
console.log(onlyMine.serialize(task));
try {
  onlyMine.serialize({ tags: new Set(["home"]) });
} catch (error) {
  if (error instanceof Error) console.log(error.name);
}
```

Output of `npx tsx registry.ts` and of the browser terminal

```json
{"estimate":{"$type":"Duration","$value":90},"due":{"$type":"Date","$value":"2026-10-05T09:00:00.000Z"}}
{"estimate":{"$type":"Duration","$value":90},"due":"2026-10-05T09:00:00.000Z"}
SerializeError
```

With the built-ins, the date is tagged. With `builtins: false`, the date becomes a plain string again, and a `Set`, which JSON would write as an empty `{}`, is refused with a `SerializeError` instead of losing its contents silently. Keep the built-ins unless you have a reason not to.

## Envelopes

When text travels between systems, the reader needs to know how to read it: which format, which version of that format, which character encoding. An **envelope** wraps the text with exactly that information, like the address and stamp on a letter:

envelope.ts

```ts
import { createSerializer, deserializeFromEnvelope, serializeToEnvelope, unwrapEnvelope } from "@zudojs/serialization";
import type { SerializedEnvelope } from "@zudojs/serialization";

const serializer = createSerializer("json", { preserveTypes: true });

const envelope = serializeToEnvelope({ taskId: 1, remindAt: new Date("2026-10-05T09:00:00Z") }, serializer);
console.log(envelope);

const value = deserializeFromEnvelope<{ taskId: number; remindAt: Date }>(envelope, serializer, "json");
console.log(value.remindAt instanceof Date);

const fromTheFuture: SerializedEnvelope = { metadata: { format: "json", version: 2 }, data: "{}" };
for (const [label, check] of [["newer version", () => unwrapEnvelope(fromTheFuture)], ["wrong format", () => unwrapEnvelope(envelope, "messagepack")]] as const) {
  try {
    check();
  } catch (error) {
    if (error instanceof Error) console.log(`${label}: ${error.message}`);
  }
}
```

Output of `npx tsx envelope.ts` and of the browser terminal

```json
{
  metadata: {
    format: 'json',
    version: 1,
    contentType: 'application/json',
    encoding: 'utf-8'
  },
  data: '{"taskId":1,"remindAt":{"$type":"Date","$value":"2026-10-05T09:00:00.000Z"}}'
}
true
newer version: Unsupported envelope wire-format version 2: this build understands up to 1
wrong format: Envelope format mismatch: expected "messagepack", got "json"
```

The reader checks the envelope before it reads the data. A payload written by a newer version of the package, or in a format it does not expect, is refused with a clear error instead of being misread. The envelope's `version` belongs to the serializer: it describes the tagging format, not your data.

## Versioning your own payloads

Your data changes over time too. Say version 1 of the reminder job carried an email address, and version 2 carries a user id instead, so the processor can look up the current address. On the day you deploy version 2, the queue still holds jobs written by version 1. The new processor must read both.

The usual pattern: write a version number into every payload, and **upgrade old payloads when you read them**, one version at a time:

versioning.ts

```ts
import { createSerializer } from "@zudojs/serialization";

interface ReminderV1 { readonly v: 1; readonly taskId: number; readonly email: string }
interface ReminderV2 { readonly v: 2; readonly taskId: number; readonly userId: string; readonly remindAt: Date }
type AnyReminder = ReminderV1 | ReminderV2;

const usersByEmail = new Map([["ada@example.com", "user-ada"]]);

function upgrade(payload: AnyReminder): ReminderV2 {
  if (payload.v === 2) return payload;
  const userId = usersByEmail.get(payload.email);
  if (!userId) throw new Error(`No user for ${payload.email}`);
  return { v: 2, taskId: payload.taskId, userId, remindAt: new Date("2026-10-05T09:00:00Z") };
}

const serializer = createSerializer("json", { preserveTypes: true });
const stored = [
  serializer.serialize({ v: 1, taskId: 1, email: "ada@example.com" }),
  serializer.serialize({ v: 2, taskId: 2, userId: "user-ada", remindAt: new Date("2026-10-06T09:00:00Z") }),
];

for (const text of stored) {
  const reminder = upgrade(serializer.deserialize<AnyReminder>(text));
  console.log(reminder.taskId, reminder.userId, reminder.remindAt.toISOString());
}
```

Output of `npx tsx versioning.ts` and of the browser terminal

```ts
1 user-ada 2026-10-05T09:00:00.000Z
2 user-ada 2026-10-06T09:00:00.000Z
```

Rules that keep version changes painless:

- Put `v` in the payload from day one. Adding it later means guessing what a payload without one is.
- Only *add* fields where you can. A new optional field needs no version bump: old readers ignore it, and new readers use a default when it is missing.
- Deploy readers before writers: first ship code that can read version 2, then code that writes it.
- Keep the upgrade code until no version 1 payload can exist any more: the queue is empty of them, and the cache entries have expired.

## Put it together: the reminder queue

The queue's default serializer, `createJsonSerializer()` from `@zudojs/queue`, uses this package underneath with `preserveTypes` on. Passing it explicitly documents the choice, so nobody switches it to plain JSON by accident. The reminder job keeps its `Date`, and a versioned payload keeps old jobs readable:

reminders.ts

```ts
import { createInMemoryQueue, createJsonSerializer, createQueueName } from "@zudojs/queue";

interface ReminderJob {
  readonly v: 2;
  readonly taskId: number;
  readonly userId: string;
  readonly remindAt: Date;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const reminders = createInMemoryQueue<ReminderJob>(createQueueName("reminders"), {
  serializer: createJsonSerializer(),
});

reminders.process("send-reminder", async (job) => {
  const { taskId, userId, remindAt } = job.data;
  console.log(`task ${taskId} for ${userId}, due ${remindAt.toISOString()}, a ${remindAt.constructor.name}`);
});

await reminders.add("send-reminder", {
  v: 2,
  taskId: 1,
  userId: "user-ada",
  remindAt: new Date("2026-10-05T09:00:00Z"),
});
await wait(200);
await reminders.close();
```

Output of `npx tsx reminders.ts` and of the browser terminal

```ts
task 1 for user-ada, due 2026-10-05T09:00:00.000Z, a Date
```

The same idea applies to the cache from [the caching lesson](https://zudojs.oyinlola.site/learn/zudo-cache): its `JsonCacheSerializer` is built on this package, which is why cached dates came back as dates.

## Practice

TRY IT YOURSELF

### Round-trip a task

Serialize a task with a `createdAt` date, a `Set` of watcher ids and a `Map` from user id to a last-seen date, with `pretty: true`, and check that everything comes back with the right type.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`const text = serializer.serialize(task, { pretty: true });` gives you the text to log. `serializer.deserialize<typeof task>(text)` gives you a fresh value with real `Date`, `Set` and `Map` instances back.

HINT 2

`const text = serializer.serialize(task, { pretty: true }); console.log(text); const back = serializer.deserialize<typeof task>(text);`.

SOLUTION

roundtrip.ts

```ts
import { createSerializer } from "@zudojs/serialization";

const serializer = createSerializer("json", { preserveTypes: true });
const task = {
  createdAt: new Date("2026-10-01T08:00:00Z"),
  watchers: new Set(["user-ada", "user-linus"]),
  lastSeen: new Map([["user-ada", new Date("2026-10-02T10:00:00Z")]]),
};

const text = serializer.serialize(task, { pretty: true });
console.log(text);

const back = serializer.deserialize<typeof task>(text);
console.log(back.createdAt instanceof Date, back.watchers.size, back.lastSeen.get("user-ada") instanceof Date);
```

Output of `npx tsx roundtrip.ts` and of the browser terminal

```json
{
  "createdAt": {
    "$type": "Date",
    "$value": "2026-10-01T08:00:00.000Z"
  },
  "watchers": {
    "$type": "Set",
    "$value": [
      "user-ada",
      "user-linus"
    ]
  },
  "lastSeen": {
    "$type": "Map",
    "$value": [
      [
        "user-ada",
        {
          "$type": "Date",
          "$value": "2026-10-02T10:00:00.000Z"
        }
      ]
    ]
  }
}
true 2 true
```

The date inside the Map was tagged too: types are kept at any depth.

TRY IT YOURSELF

### Version 3

Version 3 of the reminder adds `channel: "email" | "push"`. Extend `upgrade` so that version 1 and 2 payloads become version 3 with `channel: "email"`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Handle the three cases from newest to oldest: already v3, already v2, or v1 needing `toV2` first. Only the v1 and v2 cases fall through to building the v3 object.

HINT 2

`if (payload.v === 3) return payload; const v2 = payload.v === 1 ? toV2(payload) : payload; return { v: 3, taskId: v2.taskId, userId: v2.userId, channel: "email" };`.

SOLUTION

v3.ts

```ts
interface ReminderV1 { readonly v: 1; readonly taskId: number; readonly email: string }
interface ReminderV2 { readonly v: 2; readonly taskId: number; readonly userId: string }
interface ReminderV3 { readonly v: 3; readonly taskId: number; readonly userId: string; readonly channel: "email" | "push" }

const usersByEmail = new Map([["ada@example.com", "user-ada"]]);

function toV2(payload: ReminderV1): ReminderV2 {
  const userId = usersByEmail.get(payload.email);
  if (!userId) throw new Error(`No user for ${payload.email}`);
  return { v: 2, taskId: payload.taskId, userId };
}

function upgrade(payload: ReminderV1 | ReminderV2 | ReminderV3): ReminderV3 {
  if (payload.v === 3) return payload;
  const v2 = payload.v === 1 ? toV2(payload) : payload;
  return { v: 3, taskId: v2.taskId, userId: v2.userId, channel: "email" };
}

console.log(upgrade({ v: 1, taskId: 1, email: "ada@example.com" }));
console.log(upgrade({ v: 2, taskId: 2, userId: "user-ada" }));
console.log(upgrade({ v: 3, taskId: 3, userId: "user-ada", channel: "push" }));
```

Output of `npx tsx v3.ts` and of the browser terminal

```json
{ v: 3, taskId: 1, userId: 'user-ada', channel: 'email' }
{ v: 3, taskId: 2, userId: 'user-ada', channel: 'email' }
{ v: 3, taskId: 3, userId: 'user-ada', channel: 'push' }
```

Each step upgrades one version, and steps chain. Adding version 4 later means one more small step, not rewriting the others.

## Recap

- Serialization turns a value into text to leave the process. Plain JSON turns Dates into strings, empties Maps, Sets and Errors, mangles bytes and refuses BigInt, with no type error.
- `createSerializer("json", { preserveTypes: true })` tags those values with `$type` and rebuilds them on the way back.
- Stack traces are left out by default. Circular data, invalid dates and oversized input are refused. Set `maxSize` and `maxDepth` for outside input.
- Deserializing drops `__proto__` keys and never turns your data into a tag. Use `strict: true` to reject broken tags, and still validate the result.
- A transformer adds your own types: `serialize` returns the value to store, `deserialize` checks its input. Register it with `registerTransformer` or a `TransformerRegistry`. The built-in types keep working unless you pass `builtins: false`.
- Envelopes carry the format and version, and refuse what they cannot read. Version your own payloads with a `v` field and upgrade old ones on read.
- The queue's default serializer keeps job data types. Plain JSON (`preserveTypes: false`) turns a `Date` into a string.

Next, [Calling services with RPC](https://zudojs.oyinlola.site/learn/zudo-rpc) uses this same serializer to move typed values not just across a queue, but over the network to another service.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
