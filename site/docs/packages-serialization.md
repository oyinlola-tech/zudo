---
title: "@zudojs/serialization — Data Translation Layer"
description: "Complete documentation for @zudojs/serialization — JSON serialization with type preservation, transformer registry, envelopes, and encoding utilities."
source: https://zudojs.oyinlola.site/docs/packages-serialization
---

v1.2.1

# @zudojs/serialization

Turns JavaScript values into text you can store or send, and turns that text back into the same values — including Date, BigInt, Map, Set, Uint8Array and Error.

SERIALIZATION JSON TRANSFORMERS ENVELOPES REGISTRY

## OVERVIEW

**Serialization** means turning a value in memory into a flat piece of text (or bytes) that you can save to a file, put in a queue, or send over the network. **Deserialization** is the trip back: text in, value out.

JavaScript already ships with `JSON.stringify` and `JSON.parse`, and for plain objects, arrays, strings, numbers and booleans they are enough. The trouble starts with everything else.

JSON has no notion of a date, a set, or a very large integer. `JSON.stringify(new Date())` gives you a string, and parsing it back gives you a string — the `Date` is gone. A `Map` comes back as `{}`. A `BigInt` throws outright. Round-tripping those types is not automatic, because the format itself cannot describe them.

This package fixes that by *tagging* such values on the way out and rebuilding them on the way in. It also hardens the way back in, because the text you deserialize usually came from somewhere you do not control.

### WHEN YOU NEED IT

- Your payload contains a Date, Map, Set, BigInt, Uint8Array or Error.
- You put messages on a queue or send them between services and the consumer must know how to decode them.
- You parse JSON that arrived from a client, a peer, or a cache, and want depth, size and prototype protection.

### WHEN YOU DON'T

- Plain data you control on both ends — `JSON.stringify` is fine.
- Validating the *shape* of data. That is [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md).
- Encrypting or signing a payload. That is [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md).

> **In plain words:** a *serializer* is an object with two methods, `serialize` and `deserialize`. Everything else on this page exists to make those two methods handle harder payloads safely.

## INSTALLATION

Install the package. Its four Zudojs dependencies are pulled in for you.

```bash
$ npm install @zudojs/serialization
```

It depends on `@zudojs/constants` (tag names and limits), `@zudojs/errors` (the error classes it throws), `@zudojs/types` and `@zudojs/validation`.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

`createSerializer("json")` gives you a serializer for plain data. This is the fast path: it hands straight over to `JSON.stringify` and `JSON.parse`.

```ts
import { createSerializer } from "@zudojs/serialization";

const serializer = createSerializer("json");

const json = serializer.serialize({ name: "Alice", age: 30 });
console.log(json);
// {"name":"Alice","age":30}

const back = serializer.deserialize<{ name: string; age: number }>(json);
console.log(back.name, back.age);
// Alice 30
```

**What you should see:** the exact JSON string above, then `Alice 30`. Nothing was tagged, because nothing needed it.

> **Watch out:** `"json"` is the only format `createSerializer` accepts today. Any other name throws `UnsupportedSerializationFormatError`.

## TYPE PRESERVATION

Turn on `preserveTypes` and the serializer walks your value instead of handing it to `JSON.stringify`. Whenever it meets a type JSON cannot express, it writes a small tagged object in its place.

A tagged object looks like `{ "$type": "Date", "$value": "2026-01-15T10:30:00.000Z" }`. The `$type` key says which type it was; `$value` holds a JSON-safe form of it. On the way back, the matching transformer reads the tag and rebuilds the real value.

A plain object of yours that has its own string `$type` is written as `{ "$type": "Object", "$value": { … } }` and read back unchanged, so user data can never be revived as another type. `"Object"` (`ESCAPED_OBJECT_TAG`) is reserved. A tag its transformer rejects reads back as plain data (throws under `strict`). BigInt tags are capped at 4096 decimal digits (`SerializationLimits.MAX_BIGINT_DIGITS`, shared with schema's `coerce.bigint()`).

Pass the option once to `createSerializer` and it applies to every call on that instance — both directions.

```ts
import { createSerializer } from "@zudojs/serialization";

const serializer = createSerializer("json", { preserveTypes: true });

const order = {
  id: "A-1",
  placedAt: new Date("2026-01-15T10:30:00Z"),
  total: 100n,
  tags: new Set(["urgent"]),
  attributes: new Map([["colour", "red"]]),
};

const json = serializer.serialize(order);
console.log(json);
// {"id":"A-1",
//  "placedAt":{"$type":"Date","$value":"2026-01-15T10:30:00.000Z"},
//  "total":{"$type":"BigInt","$value":"100"},
//  "tags":{"$type":"Set","$value":["urgent"]},
//  "attributes":{"$type":"Map","$value":[["colour","red"]]}}

const back = serializer.deserialize<typeof order>(json);
console.log(back.placedAt instanceof Date); // true
console.log(back.total === 100n);          // true
console.log(back.tags.has("urgent"));      // true
console.log(back.attributes.get("colour")); // red
```

Values nested inside a Map or a Set are restored too, so a `Map` whose values are `Date`s comes back with real dates in it.

You can also decide per call, which overrides the instance default:

```ts
serializer.serialize(order, { pretty: true, indent: 4 });
serializer.deserialize(json, { strict: true, maxDepth: 64 });
```

> **Common mistake:** serializing a `BigInt` without `preserveTypes`. The fast path is plain `JSON.stringify`, which throws *"Do not know how to serialize a BigInt"*. A `Date` fails more quietly — it survives as a string and never becomes a `Date` again.

## TRANSFORMERS

A **transformer** is the small object that knows how to convert one type. It has a `type` tag, a `canSerialize` check, and a `serialize` / `deserialize` pair.

Six come built in, and a `JSONSerializer` created with no arguments already has all of them registered:

| Transformer | Tag | Tagged form |
| --- | --- | --- |
| DateTransformer | "Date" | {"$type":"Date","$value":"2026-01-15T10:30:00.000Z"} |
| BigIntTransformer | "BigInt" | {"$type":"BigInt","$value":"100"} |
| MapTransformer | "Map" | {"$type":"Map","$value":[["k","v"]]} |
| SetTransformer | "Set" | {"$type":"Set","$value":["a","b"]} |
| BufferTransformer | "Buffer" | {"$type":"Buffer","$encoding":"base64","$value":"SGVsbG8="} |
| ErrorTransformer | "Error" | {"$type":"Error","name":"TypeError","message":"wrong type"} |

To handle a type of your own, create a default `JSONSerializer` and call `registerTransformer` on it. The new transformer is added next to the six built-ins, so dates, maps, sets and the rest keep working.

```ts
import { JSONSerializer, type TypeTransformer } from "@zudojs/serialization";

class Money {
  constructor(public readonly cents: number) {}
}

const moneyTransformer: TypeTransformer<Money> = {
  type: "Money",
  canSerialize: (value): value is Money => value instanceof Money,
  // Return just the value; it is wrapped as { $type: "Money", $value } for you.
  serialize: (value) => String(value.cents),
  // deserialize always receives the full tagged object.
  deserialize: (value) =>
    new Money(Number((value as { $value: string }).$value)),
};

const serializer = new JSONSerializer({ defaults: { preserveTypes: true } });
serializer.registerTransformer(moneyTransformer);

const json = serializer.serialize({
  price: new Money(499),
  placedAt: new Date("2026-01-15T10:30:00Z"),
});
console.log(json);
// {"price":{"$type":"Money","$value":"499"},
//  "placedAt":{"$type":"Date","$value":"2026-01-15T10:30:00.000Z"}}

const back = serializer.deserialize<{ price: Money; placedAt: Date }>(json);
console.log(back.price instanceof Money, back.price.cents, back.placedAt instanceof Date);
// true 499 true
```

Since v1.2.0 `serialize` may return just the value, as above, and the serializer wraps it as `{ $type, $value }`. Returning the full tagged object `{ $type: "Money", $value: … }` yourself, as the built-ins do, still works: any plain object with its own string `$type` is taken as-is. `deserialize` always receives the full tagged object, so read `$value` from it. (Before v1.2.0 a bare return was written untagged and read back as a plain string.)

### Your own registry

You can also pass a `TransformerRegistry` of your own, to `new JSONSerializer({ transformers })` or to `createSerializer("json", { transformers })`. Since v1.2.0 the built-in transformers stay behind it: your registry is consulted first (so it can override a built-in tag such as `"Date"`), and dates, maps, sets and the rest still work. Pass `builtins: false` to use only your registry; `createBuiltinTransformers()` returns a registry holding all six if you want to start from them.

```ts
import { createSerializer, TransformerRegistry, type TypeTransformer } from "@zudojs/serialization";

class Money {
  constructor(public readonly cents: number) {}
}

const money: TypeTransformer<Money> = {
  type: "Money",
  canSerialize: (value): value is Money => value instanceof Money,
  serialize: (value) => value.cents,
  deserialize: (value) => new Money((value as { $value: number }).$value),
};

const registry = new TransformerRegistry();
registry.register(money);

const withBuiltins = createSerializer("json", { transformers: registry, preserveTypes: true });
console.log(withBuiltins.serialize({ price: new Money(499), tags: new Set(["sale"]) }));
// {"price":{"$type":"Money","$value":499},"tags":{"$type":"Set","$value":["sale"]}}

const onlyMine = createSerializer("json", { transformers: registry, builtins: false, preserveTypes: true });
try {
  onlyMine.serialize({ tags: new Set(["sale"]) });
} catch (error) {
  console.log((error as Error).name); // SerializeError
  console.log((error as Error).message);
  // Cannot serialize a Set with preserveTypes: no transformer is registered for it, and JSON
  // would write it as {} and lose its contents. Register a transformer for Set, or keep the
  // built-in transformers enabled (do not pass builtins: false).
}
```

> **Nothing is silently flattened to `{}` any more:** with `preserveTypes`, a value no transformer handles that JSON would write as `{}` (a `Map`, `Set`, `WeakMap`, `WeakSet`, `WeakRef`, `Promise`, `RegExp`, `Error`, `ArrayBuffer` or `DataView`) throws `SerializeError` naming the type. With the built-ins enabled that only happens for types that have no built-in transformer, such as `RegExp`. The message names the type with the right article (“an Error”, “an ArrayBuffer”), and suggests keeping the built-ins on only when they are off and one of them would handle the type; otherwise it tells you to register a transformer (since 1.2.1; 1.2.0 said “a Error” and suggested the built-ins even when they were on). Two things are unchanged: with `builtins: false` a `Date` is still written by `JSON.stringify` as an ISO string (and reads back as a string), and the fast path without `preserveTypes` is plain `JSON.stringify`, which still writes a `Map` as `{}`.

## ENVELOPES

An **envelope** is the payload plus a small label describing it. The label carries the format, a schema version, a MIME content type and a character encoding, so whoever picks the message up knows how to decode it instead of guessing.

That matters for queues and cross-service calls: the producer and the consumer are different programs, possibly different versions of your code. A message stamped `version: 1` can be rejected cleanly by a consumer that only understands version 1 — rather than misread.

`serializeToEnvelope` serializes and wraps in one step; `deserializeFromEnvelope` unwraps and parses.

```ts
import {
  JSONSerializer,
  serializeToEnvelope,
  deserializeFromEnvelope,
} from "@zudojs/serialization";

const serializer = new JSONSerializer({
  defaults: { preserveTypes: true },
});

const envelope = serializeToEnvelope(
  { orderId: "A-1", placedAt: new Date("2026-01-15T10:30:00Z") },
  serializer,
);

console.log(envelope.metadata);
// { format: "json", version: 1,
//   contentType: "application/json", encoding: "utf-8" }
console.log(envelope.data);
// {"orderId":"A-1","placedAt":{"$type":"Date","$value":"2026-01-15T10:30:00.000Z"}}

const back = deserializeFromEnvelope<{
  orderId: string;
  placedAt: Date;
}>(envelope, serializer, "json");

console.log(back.orderId, back.placedAt instanceof Date);
// A-1 true
```

The third argument, `"json"`, is the format you expect. If the envelope says something else, the call throws instead of feeding the wrong bytes to your parser.

You can also build and check envelopes by hand. `createEnvelope` wraps data you already serialized, `unwrapEnvelope` validates and returns the payload, `assertValidEnvelope` checks a value that arrived from the wire, and `contentTypeForFormat` maps a format name to its MIME type.

```ts
import {
  createEnvelope,
  unwrapEnvelope,
  contentTypeForFormat,
} from "@zudojs/serialization";

const envelope = createEnvelope('{"order":123}');
console.log(unwrapEnvelope(envelope, "json")); // {"order":123}
console.log(contentTypeForFormat("messagepack")); // application/msgpack
```

> The envelope helpers need a serializer whose `serialize` returns a `string`. Both `new JSONSerializer()` and `createSerializer("json")` are typed that way, so either works here.

## SERIALIZER REGISTRY

A **registry** is a lookup table from a name to a serializer. Code that needs to encode something asks the registry for `"json"` rather than importing a class, so you can swap the implementation in one place.

`createDefaultRegistry()` hands you one with the built-in JSON serializer already in it.

```ts
import {
  createDefaultRegistry,
  SerializerRegistry,
  JSONSerializer,
} from "@zudojs/serialization";

const registry = createDefaultRegistry();
console.log(registry.names()); // ["json"]
console.log(registry.size);    // 1

const serializer = registry.get("json");
console.log(serializer.serialize({ ok: true })); // {"ok":true}

// Or build your own and register instances under any name.
const custom = new SerializerRegistry();
custom.register(new JSONSerializer({ defaults: { pretty: true } }));
console.log(custom.has("json")); // true
```

A serializer registers itself under its own `name` property, so `JSONSerializer` always lands on `"json"`, and registering a second one under that name replaces the first.

> **Common mistake:** asking for a name nobody registered. `registry.get("msgpack")` throws `SerializerNotFoundError`, which lives in `@zudojs/errors` — not in this package. Use `registry.has(name)` first if a miss is expected.

```ts
import { createDefaultRegistry } from "@zudojs/serialization";
import { SerializerNotFoundError } from "@zudojs/errors";

const registry = createDefaultRegistry();

try {
  registry.get("msgpack");
} catch (error) {
  if (error instanceof SerializerNotFoundError) {
    console.log(error.message);
    // No serializer registered with name: "msgpack"
  }
}
```

## UNTRUSTED INPUT

`deserialize` is the risky direction. The string you pass it usually came from a request body, a queue message or a cache — places another program can write to.

The most famous trap is *prototype pollution*. In JavaScript every object inherits from a shared parent object. A payload containing the key `__proto__` can, if it is copied naively, write onto that shared parent — and suddenly every object in your program appears to have an `isAdmin` field.

On the `preserveTypes` path, which rebuilds objects key by key, `__proto__`, `constructor` and `prototype` are dropped. Set `allowUnsafeKeys: true` only for payloads you trust; even then they are added as ordinary own properties, never as a prototype.

```ts
import { JSONSerializer } from "@zudojs/serialization";

const serializer = new JSONSerializer();
const fromTheWire = '{"user":{"__proto__":{"isAdmin":true},"name":"Alice"}}';

const value = serializer.deserialize<{ user: { name: string } }>(
  fromTheWire,
  { preserveTypes: true, maxSize: 64 * 1024, maxDepth: 32 },
);

console.log(value.user.name);            // Alice
console.log(Object.keys(value.user));    // ["name"]
console.log(({} as Record<string, unknown>).isAdmin); // undefined
```

The other guards on that call:

- **maxSize** bounds the input *before* parsing. Default: 10 MB.
- **maxDepth** bounds nesting, so a deeply nested payload cannot exhaust the stack. Default: 128 on the `preserveTypes` path; on the fast path it is enforced whenever you set it (per call or as an instance default).
- An unrecognised `$type` tag is treated as ordinary data, so a peer cannot stop your consumer by sending `{"$type":"anything"}` — and your own records may legitimately carry a `$type` field. Pass `strict: true` to make an unknown tag an error instead.
- **strict** also rejects input that is not valid JSON with a clear message.

Errors get the same care. A stack trace names absolute file paths and internal call structure, and a serialized error routinely ends up in a log sink, so stacks are left out unless you ask:

```ts
const json = serializer.serialize(
  { failure: new Error("boom") },
  { preserveTypes: true },
);
console.log(json);
// {"failure":{"$type":"Error","name":"Error","message":"boom"}}

// Opt in when you really need it:
serializer.serialize(
  { failure: new Error("boom") },
  { preserveTypes: true, includeStack: true },
);
```

On the way back in, a built-in error class is rebuilt with its own constructor: `TypeError`, `RangeError`, `SyntaxError`, `ReferenceError`, `EvalError`, `URIError` and `AggregateError`, so `instanceof` holds. Any other name, such as your own `MyError`, comes back as an `Error` with `name` set. The rebuilt error's `stack` is only its header line:

```ts
const wire = serializer.serialize({ failure: new TypeError("bad input") }, { preserveTypes: true });
const { failure } = serializer.deserialize<{ failure: Error }>(wire, { preserveTypes: true });

console.log(failure instanceof TypeError); // true
console.log(failure.stack);                // "TypeError: bad input" — no frames
```

> A stack that arrives from the wire (sent with `includeStack: true`) is attached to the rebuilt error as a hidden `originalStack` property rather than replacing the real `stack`, so a reconstructed error never lies about where it came from. **Changed in 1.2.1:** a rebuilt error used to be a plain `Error` (so `instanceof TypeError` was `false`), and its `stack` carried the deserializer's own frames, which looked like the original stack. Now the class is right and `stack` is the header line only.

> **Watch out:** the fast path (no `preserveTypes`) is plain `JSON.parse`. There, `__proto__` survives as an inert own property and still never reaches the prototype — but do not spread or deep-merge such an object into another without screening its keys.

## ENCODING UTILITIES

Four small helpers convert between text and bytes. **UTF-8** is the standard way to write text as bytes; **Base64** writes arbitrary bytes as safe ASCII characters, which is how `BufferTransformer` fits binary data into JSON.

They pick the right implementation for Node.js or the browser automatically.

```ts
import {
  toBase64,
  fromBase64,
  encodeUtf8,
  decodeUtf8,
} from "@zudojs/serialization";

const bytes = encodeUtf8("Hello, Zudo!");
console.log(bytes.length);           // 12
console.log(decodeUtf8(bytes));      // Hello, Zudo!

const b64 = toBase64(bytes);
console.log(b64);                    // SGVsbG8sIFp1ZG8h
console.log(decodeUtf8(fromBase64(b64))); // Hello, Zudo!
```

## FULL EXAMPLE

One producer wraps an order in an envelope; one consumer looks the serializer up by name and unwraps it. This is the whole package in twenty-five lines.

```ts
import {
  JSONSerializer,
  SerializerRegistry,
  serializeToEnvelope,
  deserializeFromEnvelope,
} from "@zudojs/serialization";

// Both sides share the same configuration.
const serializer = new JSONSerializer({
  defaults: { preserveTypes: true, maxSize: 1_000_000 },
});

const registry = new SerializerRegistry();
registry.register(serializer);

// Producer: wrap the order for transport.
const order = {
  id: "A-1",
  placedAt: new Date("2026-09-05T12:00:00Z"),
  total: 999999999999999n,
  items: new Set(["widget", "gadget"]),
};
const envelope = serializeToEnvelope(order, serializer);
console.log(envelope.metadata.format, envelope.metadata.version);
// json 1

// Consumer: look the serializer up by name, then unwrap.
const decoder = registry.get("json") as JSONSerializer;
const back = deserializeFromEnvelope<typeof order>(
  envelope,
  decoder,
  "json",
);

console.log(back.id);                       // A-1
console.log(back.placedAt instanceof Date);  // true
console.log(back.total === 999999999999999n); // true
console.log(back.items.has("widget"));       // true
```

## API REFERENCE

Everything below is exported from `@zudojs/serialization`.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| createSerializer(format, options?) | Creates a serializer for a format. | Only `"json"` is supported. Options: `transformers` (consulted before the built-ins), `builtins` (default `true`), plus every serialize/deserialize option (`pretty`, `preserveTypes`, `maxSize`, `maxDepth`, `strict`, …) — kept as per-instance defaults. |
| createBuiltinTransformers() | Returns a new `TransformerRegistry` holding the six built-in transformers. | New in v1.2.0. A starting point for a registry you pass with `builtins: false`. |
| createDefaultRegistry() | Returns a registry holding the built-in JSON serializer. | Size 1, name `"json"`. |
| createEnvelope(data, format?, options?) | Wraps already-serialized data with metadata. | Format defaults to `"json"`; version, contentType and encoding are filled in for you. |
| unwrapEnvelope(envelope, expectedFormat?) | Validates an envelope and returns its payload. | Throws on a malformed envelope, a newer schema version, or a format mismatch. |
| assertValidEnvelope(envelope) | Throws unless the value is a well-formed envelope. | A TypeScript assertion — narrows `unknown` to `SerializedEnvelope`. |
| contentTypeForFormat(format) | Maps a format name to its MIME type. | Unknown formats give `application/octet-stream`. |
| serializeToEnvelope(value, serializer, format?) | Serializes a value and wraps it in one step. | Takes the `contentType` from the serializer. |
| deserializeFromEnvelope(envelope, deserializer, expectedFormat?) | Unwraps an envelope and parses the payload. | Binary payloads must be UTF-8; any other encoding is rejected. |
| toBase64(data) / fromBase64(text) | Convert bytes to and from Base64. | Works in Node.js and the browser. |
| encodeUtf8(text) / decodeUtf8(data) | Convert text to and from UTF-8 bytes. | Works in Node.js and the browser. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| JSONSerializer | The JSON serializer. `serialize`, `deserialize`, `registerTransformer`, plus `name` and `contentType`. | Constructor takes `JSONSerializerOptions`: `{ transformers?, builtins?, defaults? }`. Your `transformers` are consulted first and the built-ins stay behind them unless `builtins: false`. With no arguments it registers all six built-in transformers. |
| SerializerRegistry | Name → serializer lookup. `register`, `unregister`, `get`, `has`, `names`, `clear`, `size`. | Keyed by the serializer's own `name`. `get` throws when the name is unknown. |
| TransformerRegistry | Tag → transformer lookup. `register`, `unregister`, `get`, `findForValue`, `has`, `types`, `clear`, `size`. | Holds at most 256 transformers; `register` throws beyond that. |

### Built-in transformers

`DateTransformer`, `BigIntTransformer`, `MapTransformer`, `SetTransformer`, `BufferTransformer` and `ErrorTransformer` are exported as values, so you can register a subset on your own `TransformerRegistry`. See the table in [Transformers](#transformers).

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| Serializer<TValue, TSerialized> | The contract every serializer satisfies. | `name`, `contentType`, `serialize`, `deserialize`. |
| SerializeOptions | Options for `serialize`. | `pretty`, `preserveTypes`, `maxDepth`, `maxSize`, `indent`, `includeStack`, `allowUnsafeKeys`. |
| DeserializeOptions | Options for `deserialize`. | `preserveTypes`, `maxDepth`, `maxSize`, `strict`, `allowUnsafeKeys`. |
| JSONSerializerOptions | Constructor options for `JSONSerializer`. | `transformers`, `builtins`, `defaults`. Exported since v1.2.0. |
| TypeTransformer<TValue> | The contract a custom transformer implements. | `type`, `canSerialize`, `serialize(value, options?)` (return the bare value or the full tagged object), `deserialize(value, options?)` (always receives the full tagged object). |
| SerializedEnvelope | An envelope: `{ metadata, data }`. | Paired with `SerializationMetadata` (`format`, `version`, `contentType`, `encoding`). |
| SerializedValue | `string \| Uint8Array`. | What a serializer may produce. |
| SerializationFormat | Format identifier. | `"json" \| "text" \| "binary" \| "messagepack" \| string`. |

### Errors

These are thrown by this package but **defined and exported by [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md)**. Import them from there, not from `@zudojs/serialization`.

| Name | When it is thrown | Notes |
| --- | --- | --- |
| SerializerNotFoundError | `SerializerRegistry.get(name)` finds nothing. | Carries `serializerName`. |
| TransformerNotFoundError | `TransformerRegistry.get(type)` finds nothing. | Carries `transformerType`. |
| UnsupportedSerializationFormatError | `createSerializer` gets a format other than `"json"`. | Carries the offending format. |
| SerializationPayloadTooLargeError | Input or output exceeds `maxSize`. | A `SerializationError`. |
| SerializationDepthError | Nesting exceeds `maxDepth`. | A `SerializationError`. |
| InvalidSerializedDataError | Input that is not valid JSON, or an unknown or malformed tag under `strict`. | A `SerializationError`. |
| TransformerError | A transformer rejects a tag under `strict`, or a transformer claims the reserved `"Object"` tag. | A `SerializationError`. |
| SerializeError | A value cannot be written, such as an invalid `Date`, an oversized BigInt, or (with `preserveTypes`) a `Map`, `Set`, `RegExp`, `Promise` or similar that no transformer handles and JSON would write as `{}` | A `SerializationError`. |

Circular references are reported by the `@zudojs/validation` guard (`CircularReferenceError`). Envelope problems (a malformed envelope, a format mismatch, a newer schema version) throw `InvalidSerializedDataError`; registering a 257th transformer throws `TransformerError`.

## COMMON MISTAKES

- **Serializing with `preserveTypes` but deserializing without it.** You get back the raw tagged objects — `{ $type: "Date", $value: "2026-01-15T10:30:00.000Z" }` instead of a `Date`. Fix: set the option on both calls, or set it once via `createSerializer("json", { preserveTypes: true })`.
- **Sending a `BigInt` down the fast path.** `JSON.stringify` throws *"Do not know how to serialize a BigInt"*. Fix: turn on `preserveTypes`.
- **Passing `builtins: false` and then serializing a `Map`.** Under `preserveTypes` it throws `SerializeError`, and a `Date` quietly becomes a string. Fix: leave the built-ins on (the default) and let your registry override only the tags you need.
- **Importing `SerializerNotFoundError` from `@zudojs/serialization`.** The import fails — the class is not re-exported here. Fix: `import { SerializerNotFoundError } from "@zudojs/errors";`
- **Expecting a stack trace on a deserialized error.** Stacks are left out by default, a rebuilt error's own `stack` is only its header line, and a wire-supplied one lands on `originalStack`. Fix: pass `includeStack: true` when serializing, and read `originalStack` on the other side.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — defines `SerializerNotFoundError` and friends. Import them from there.
- [@zudojs/constants](https://zudojs.oyinlola.site/docs/packages-constants.md) — the `$type` / `$value` tag names, the size and depth limits, and the envelope schema version.
- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — reach for it when you need to check the *shape* of data, not just decode it.
- [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) — the usual reason to want envelopes: jobs written now and read by another process later.
- [@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md) — cached values need encoding too, and type preservation keeps a cached `Date` a `Date`.

## COMPLETE EXPORT INDEX

Every name `@zudojs/serialization` exports from its package root at v1.2.3 — **33** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 33 exports**

Classes (3)

`JSONSerializer` `SerializerRegistry` `TransformerRegistry`

Functions (13)

`assertValidEnvelope` `contentTypeForFormat` `createBuiltinTransformers` `createDefaultRegistry` `createEnvelope` `createSerializer` `decodeUtf8` `deserializeFromEnvelope` `encodeUtf8` `fromBase64` `serializeToEnvelope` `toBase64` `unwrapEnvelope`

Interfaces (8)

`CreateSerializerOptions` `DeserializeOptions` `JSONSerializerOptions` `SerializationMetadata` `SerializedEnvelope` `SerializeOptions` `Serializer` `TypeTransformer`

Type aliases (2)

`SerializationFormat` `SerializedValue`

Constants (7)

`BigIntTransformer` `BufferTransformer` `DateTransformer` `ErrorTransformer` `ESCAPED_OBJECT_TAG` `MapTransformer` `SetTransformer`
