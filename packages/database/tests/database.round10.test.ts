/**
 * @zudojs/database — Round 10 regression tests.
 *
 * One describe block per finding.
 */

import { afterEach, describe, it, expect, vi } from "vitest";

import {
  DatabaseClient,
  noopDatabaseLogger,
  withTransactionRetry,
} from "../src/index.js";
import { createStubPrisma, prismaError } from "./helpers/stubPrisma.js";

/** Default transaction timeout, whose own timer is not a retry delay. */
const TX_TIMEOUT_MS = 10_000;

/** Records every retry delay while firing the timer immediately. */
function recordDelays(): number[] {
  const delays: number[] = [];
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: () => void,
    ms?: number,
  ) => {
    if ((ms ?? 0) > 0 && ms !== TX_TIMEOUT_MS) delays.push(ms ?? 0);
    return real(fn, 0);
  }) as typeof setTimeout);
  return delays;
}

async function failingRetry(
  options: Parameters<typeof withTransactionRetry>[2],
): Promise<number> {
  const client = new DatabaseClient({
    prisma: createStubPrisma({}),
    logger: noopDatabaseLogger,
  });
  let attempts = 0;
  await expect(
    withTransactionRetry(
      client,
      async () => {
        attempts += 1;
        throw prismaError("P2034");
      },
      options,
    ),
  ).rejects.toBeTruthy();
  return attempts;
}

/* ─── INF-13: retry backoff overflowed into immediate retries ────────────── */

describe("INF-13", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clamps a huge backoff to the default ceiling instead of overflowing", async () => {
    const delays = recordDelays();
    const attempts = await failingRetry({ retries: 3, retryDelayMs: 2.2e9 });
    expect(attempts).toBe(4);
    const retryDelays = delays;
    expect(retryDelays).toEqual([30_000, 30_000, 30_000]);
  });

  it("honours maxRetryDelayMs and never exceeds the timer maximum", async () => {
    const delays = recordDelays();
    await failingRetry({
      retries: 30,
      retryDelayMs: 100,
      maxRetryDelayMs: Number.MAX_SAFE_INTEGER,
    });
    const retryDelays = delays;
    expect(retryDelays).toHaveLength(30);
    expect(Math.max(...retryDelays)).toBe(2_147_483_647);
    expect(retryDelays.at(-1)).toBe(2_147_483_647);
  });

  it("spreads delays with full jitter when asked", async () => {
    const delays = recordDelays();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await failingRetry({ retries: 2, retryDelayMs: 1000, jitter: "full" });
    expect(delays).toEqual([500, 1000]);
  });
});
