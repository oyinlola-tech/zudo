/**
 * Compile-only fixture: the `PrismaClient` interface that Prisma 7.10.0's
 * `prisma-client` generator emits into `src/generated/prisma/internal/class.ts`
 * for a schema with one `User` model, trimmed to the members
 * `@zudojs/database` touches. The two `$transaction` overloads are verbatim,
 * including the interactive callback's `Omit<PrismaClient, ITXClientDenyList>`
 * parameter, which is the type `createDatabaseClient({ prisma })` must infer
 * for `transaction()` callbacks. `...values: any[]` is written as
 * `unknown[]` (the package bans `any`); that is the stricter shape.
 *
 * Nothing here comes from `@prisma/client`'s generated entry
 * (`.prisma/client`), which the `prisma-client` generator never writes.
 */
import type * as runtime from "@prisma/client/runtime/client";

import type { UserDelegate } from "./prismaClientUserDelegate.fixture.js";

type JsPromise<T> = runtime.Types.Utils.JsPromise<T>;
type PrismaPromise<T> = runtime.Types.Public.PrismaPromise<T>;
type TransactionIsolationLevel =
  "ReadUncommitted" | "ReadCommitted" | "RepeatableRead" | "Serializable";
type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: TransactionIsolationLevel;
};

export interface PrismaClient {
  $on(eventType: "query", callback: (event: runtime.Types.Public.Args<never, never>) => void): PrismaClient;
  $connect(): JsPromise<void>;
  $disconnect(): JsPromise<void>;
  $executeRaw<T = unknown>(query: TemplateStringsArray | runtime.Sql, ...values: unknown[]): PrismaPromise<number>;
  $executeRawUnsafe<T = unknown>(query: string, ...values: unknown[]): PrismaPromise<number>;
  $queryRaw<T = unknown>(query: TemplateStringsArray | runtime.Sql, ...values: unknown[]): PrismaPromise<T>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): PrismaPromise<T>;
  $transaction<P extends PrismaPromise<unknown>[]>(arg: [...P], options?: TransactionOptions): JsPromise<runtime.Types.Utils.UnwrapTuple<P>>;
  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => JsPromise<R>, options?: TransactionOptions): JsPromise<R>;
  get user(): UserDelegate;
}

/** The generated `Prisma.TransactionClient` for the client above. */
export type TransactionClient = Omit<PrismaClient, runtime.ITXClientDenyList>;
