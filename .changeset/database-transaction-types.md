---
"@zudojs/database": minor
---

Type transaction callbacks from your own Prisma client, and stop importing `@prisma/client` in the published types.

`DatabaseTransactionContext` used to be `Prisma.TransactionClient` from `@prisma/client`. With Prisma 7's `prisma-client` generator the client is generated into your application, not into `node_modules/.prisma/client`. That import then failed under `skipLibCheck: false` (TS2307 "Cannot find module '.prisma/client/default'" and TS2305 "has no exported member 'Prisma'"). Under `skipLibCheck: true` it quietly made every transaction callback's `tx` `any`.

- The transaction client is now inferred from the client you pass: `createDatabaseClient({ prisma })` returns `DatabaseClient<TransactionClientOf<typeof prisma>>`, so `client.transaction(async (tx) => tx.user.create(...))` is fully typed with no cast. `withTransaction`, `withTransactionRetry`, `TransactionManager`, `DatabaseUnitOfWork`, `Database`/`createDatabase`, `DatabaseLockManager`, `MigrationRunner` and `SeedRunner` take the type from the client they wrap.
- `DatabaseTransactionContext` is now a structural type owned by this package (`$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`). It is the default type argument everywhere, so code that annotates it still compiles. `executeRaw`/`queryRaw` take the structural `PrismaSqlLike`, which any `Prisma.sql` value satisfies.
- New exported types: `TransactionClientOf<TClient>` and `PrismaSqlLike`.
- When no client type is available (`new DatabaseClient(options)`, `createDatabaseClient({ adapter })`, `getDatabase()`), callbacks get `DatabaseTransactionContext` without model delegates. Pass the client type to keep delegate typing, for example `createDatabaseClient<PrismaClient>({ adapter })`. Before this change, projects using the legacy `prisma-client-js` generator got delegate types on these paths. After it, those projects need that type argument, or need to pass `prisma`, for `tx.<model>` to compile.
