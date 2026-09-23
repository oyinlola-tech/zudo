---
"@zudojs/database": patch
"@zudojs/queue": patch
"@zudojs/container": patch
"@zudojs/runtime": patch
"@zudojs/serialization": patch
---

Post-release fixes.

- **database:** `new UserRepository(prisma.user)` with a real generated Prisma 7 client failed strict type-checking (TS2345). A generated delegate's methods are generic (`findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, …>)`) and their argument types (`select?: UserSelect | null`) cannot be assigned from one hand-written argument shape. `RepositoryDelegate` now accepts any argument list, the same way `PrismaClientLike.$transaction` already did, and still checks return types, so a delegate whose rows do not match the entity is still rejected. A generated delegate is passed with no cast. `BaseRepository#delegate` is typed by the new `RepositoryDelegateOperations`, the arguments the repository passes, so a subclass that calls `this.delegate.findMany({ where })` compiles as before.
- **queue:** `QueueOptions.deadLetterStore` was typed `DeadLetterStore<never>`, so `createInMemoryDeadLetterStore()` (a `DeadLetterStore<unknown>`) and `createInMemoryDeadLetterStore<T>()` for a `Queue<T>` were both rejected with TS2322. It is now `DeadLetterStore<unknown>`, which accepts either with no annotation. A store already annotated `<never>` still compiles.
- **container:** `registerClass(TOKEN, Service)` (and `{ useClass }`, `classProvider`, `provideClass`) with no `inject` list built a class whose constructor needs arguments, passing `undefined` for each one. 1.2.0 fixed this only for auto-registration. Registering is still allowed, but resolving now throws `ProviderResolutionError` naming the class, the parameter count and the `inject: [...]` fix. Constructors with no parameters, or only defaulted ones, are unaffected.
- **runtime:** a failed stop published `runtime.failed` (`phase: "stop"`) twice, once from the shutdown sequence and once from the runtime. An `onShutdown` that outlives `shutdownTimeout` under `SIGTERM` now leaves the runtime `failed`, sets exit code 1 and publishes `runtime.failed` once. `RuntimeEventType` lacked `"runtime.initialized"` and `"runtime.starting"`, which `RuntimeEventMap` declares and the runtime publishes. It is now derived from the map (`keyof RuntimeEventMap`), and `RuntimeModuleEventType` from the `runtime.module.*` keys, so the two cannot drift again.
- **serialization:** the `SerializeError` for a value JSON would write as `{}` said "a Error" and "a ArrayBuffer", and told the caller to "keep the built-in transformers enabled" even when they were on. It now uses the right article ("an Error"). It suggests the built-ins only when they are disabled and one of them handles the type. Otherwise it suggests registering a transformer.
