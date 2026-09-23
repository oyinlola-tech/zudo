/**
 * A request timeout beyond Node's timer range must not fire at once.
 */

import { describe, expect, it } from "vitest";

import { createHttpTestClient } from "../../src/httpTestClient/index.js";

const slow = async (): Promise<Response> => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  return new Response("done");
};

describe("timeouts past 2^31-1 ms", () => {
  it.each([3_000_000_000, Number.MAX_SAFE_INTEGER])("waits for the response with .timeout(%s)", async (ms) => {
    const response = await createHttpTestClient(slow).get("/").timeout(ms);
    expect(response.text).toBe("done");
  });

  it("waits for the response with a client-wide timeout of 30 days", async () => {
    const response = await createHttpTestClient(slow, { timeout: 30 * 24 * 3_600_000 }).get("/");
    expect(response.status).toBe(200);
  });
});
