---
"@zudojs/database": patch
---

`PrismaClientLike` now accepts a real Prisma 7 client generated into the application (`prisma-client` generator). Its overloaded `$transaction` could not be assigned to the single generic signature the interface declared, so `createDatabaseClient({ prisma: new PrismaClient(...) })` needed an `as unknown as PrismaClientLike` cast; the cast is no longer needed.
