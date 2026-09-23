/**
 * @zudojs/database — Database Client Types
 *
 * Transaction-client types owned by this package. They are structural on
 * purpose: nothing here imports `@prisma/client`, so the published
 * declarations resolve whether the consumer's generated client lives in
 * `node_modules/.prisma/client` (`prisma-client-js`) or in an application
 * directory such as `src/generated/prisma` (`prisma-client`, the Prisma 7
 * default).
 */

/**
 * A `Prisma.sql` tagged query. Any `Prisma.Sql` instance satisfies it.
 */
export interface PrismaSqlLike {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
  readonly sql: string;
}

/**
 * The raw-query surface every Prisma interactive transaction client
 * exposes. This is the transaction type used when the concrete client type
 * is not known: the default type argument of `DatabaseClient`,
 * `TransactionManager`, `DatabaseUnitOfWork` and the other transaction
 * helpers, and the type the migration, seed and lock helpers require.
 *
 * `createDatabaseClient({ prisma })` infers the real transaction client
 * (model delegates included) from the client passed in; see
 * {@link TransactionClientOf}.
 *
 * Declared as a type alias rather than an interface so it keeps an
 * implicit index signature and stays assignable to
 * `BaseRepository#withTransaction`'s `TransactionClientLike`.
 */
export type DatabaseTransactionContext = {
  $queryRawUnsafe<TResult = unknown>(
    query: string,
    ...values: unknown[]
  ): Promise<TResult>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRaw<TResult = unknown>(
    query: TemplateStringsArray | PrismaSqlLike,
    ...values: unknown[]
  ): Promise<TResult>;
  $executeRaw(
    query: TemplateStringsArray | PrismaSqlLike,
    ...values: unknown[]
  ): Promise<number>;
};

/**
 * The interactive-transaction callback parameter of a Prisma client: for a
 * generated client this is its own `Omit<PrismaClient, ITXClientDenyList>`
 * (or the extended equivalent after `$extends`), so model delegates such
 * as `tx.user` keep their generated types.
 *
 * Falls back to {@link DatabaseTransactionContext} for clients whose
 * transaction callback cannot be read (hand-written stubs,
 * `PrismaClientLike` itself) or does not expose the raw-query surface.
 */
export type TransactionClientOf<TClient> = TClient extends {
  $transaction(
    callback: (transaction: infer TTransaction) => never,
    ...rest: never[]
  ): unknown;
}
  ? [TTransaction] extends [never]
    ? DatabaseTransactionContext
    : [TTransaction] extends [DatabaseTransactionContext]
      ? TTransaction
      : DatabaseTransactionContext
  : DatabaseTransactionContext;
