import type {
  DatabaseTransactionContext,
  PrismaClientLike,
  PrismaTransactionOptions,
} from "../../src/databaseClient/index.js";

export interface RecordedQuery {
  readonly kind: "query" | "execute";
  readonly sql: string;
  readonly values: readonly unknown[];
  readonly inTransaction: boolean;
}

export type QueryResponder = (
  sql: string,
  values: readonly unknown[],
  query: RecordedQuery,
) => unknown;

export interface StubPrismaOptions {
  /**
   * Returns rows for `$queryRawUnsafe` / affected count for
   * `$executeRawUnsafe`. Defaults: `[]` for queries, `1` for executes.
   */
  readonly respond?: QueryResponder;
  readonly connectDelayMs?: number;
  readonly connectError?: unknown;
  readonly disconnectError?: unknown;
}

export interface StubPrisma extends PrismaClientLike {
  readonly queries: RecordedQuery[];
  readonly calls: string[];
  readonly transactionOptions: (PrismaTransactionOptions | undefined)[];
  connectCount: number;
  disconnectCount: number;
  /** Replaces the responder at runtime. */
  setResponder(respond: QueryResponder): void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createStubPrisma(options: StubPrismaOptions = {}): StubPrisma {
  let responder: QueryResponder | undefined = options.respond;
  const queries: RecordedQuery[] = [];
  const calls: string[] = [];
  const transactionOptions: (PrismaTransactionOptions | undefined)[] = [];

  function makeRaw(inTransaction: boolean) {
    return {
      async $queryRawUnsafe(sql: string, ...values: unknown[]) {
        const query: RecordedQuery = { kind: "query", sql, values, inTransaction };
        queries.push(query);
        const result = responder?.(sql, values, query);
        return result === undefined ? [] : result;
      },
      async $executeRawUnsafe(sql: string, ...values: unknown[]) {
        const query: RecordedQuery = { kind: "execute", sql, values, inTransaction };
        queries.push(query);
        const result = responder?.(sql, values, query);
        return result === undefined ? 1 : (result as number);
      },
    };
  }

  const root = makeRaw(false);
  const tx = makeRaw(true) as unknown as DatabaseTransactionContext;

  const stub: StubPrisma = {
    queries,
    calls,
    transactionOptions,
    connectCount: 0,
    disconnectCount: 0,
    setResponder(respond) {
      responder = respond;
    },
    async $connect() {
      calls.push("$connect");
      stub.connectCount += 1;
      if (options.connectDelayMs) await delay(options.connectDelayMs);
      if (options.connectError) throw options.connectError;
    },
    async $disconnect() {
      calls.push("$disconnect");
      stub.disconnectCount += 1;
      if (options.disconnectError) throw options.disconnectError;
    },
    async $transaction<TResult>(
      callback: (transaction: DatabaseTransactionContext) => Promise<TResult>,
      txOptions?: PrismaTransactionOptions,
    ) {
      calls.push("$transaction");
      transactionOptions.push(txOptions);
      return callback(tx);
    },
    $queryRawUnsafe: root.$queryRawUnsafe as PrismaClientLike["$queryRawUnsafe"],
    $executeRawUnsafe: root.$executeRawUnsafe,
  };

  return stub;
}

/**
 * Builds an error shaped like Prisma's `PrismaClientKnownRequestError`.
 */
export function prismaError(
  code: string,
  message = `Prisma error ${code}`,
  meta?: Record<string, unknown>,
): Error & { code: string; clientVersion: string; meta?: Record<string, unknown> } {
  const error = new Error(message) as Error & {
    code: string;
    clientVersion: string;
    meta?: Record<string, unknown>;
  };
  error.name = "PrismaClientKnownRequestError";
  error.code = code;
  error.clientVersion = "7.10.0";
  error.meta = meta;
  return error;
}
