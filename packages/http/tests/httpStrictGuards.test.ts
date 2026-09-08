/**
 * Regressions for defects that only became visible once `strictNullChecks`,
 * `noUncheckedIndexedAccess` and `strictPropertyInitialization` were enabled
 * for this package.
 */

import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import { Socket } from "node:net";

function fakeRequest(
  headers: Record<string, string | string[] | undefined> = {},
): IncomingMessage {
  return {
    method: "GET",
    url: "/resource?a=1",
    headers: { host: "example.com", ...headers },
    socket: new Socket(),
  } as unknown as IncomingMessage;
}

describe("NodeHTTPRequest.aborted", () => {
  it("reports the abort state instead of being permanently undefined", async () => {
    const { createHTTPRequest } =
      await import("../src/httpRequest/http.request.js");

    const controller = new AbortController();

    const request = createHTTPRequest(fakeRequest(), {
      signal: controller.signal,
    });

    /* Before the fix `aborted` was a declared-but-never-assigned field, so it
     * read `undefined` here and every `if (request.aborted)` check was dead. */
    expect(request.aborted).toBe(false);

    controller.abort();

    expect(request.aborted).toBe(true);
  });

  it("is false, not undefined, when no signal was supplied", async () => {
    const { createHTTPRequest } =
      await import("../src/httpRequest/http.request.js");

    const request = createHTTPRequest(fakeRequest());

    expect(request.aborted).toBe(false);
  });
});

describe("mergeResponseContext", () => {
  it("skips headers whose value is an explicit undefined", async () => {
    const { createResponseContext } =
      await import("../src/httpResponse/httpResponse.context.js");
    const { mergeResponseContext } =
      await import("../src/httpAdapter/http.adapter.js");

    const source = createResponseContext({
      headers: {
        "x-present": "yes",
        "x-absent": undefined,
      },
    });

    const target = createResponseContext();

    /* Before the fix this threw `TypeError: value.join is not a function`
     * because `ResponseHeaders` permits an explicit `undefined` value. */
    const merged = mergeResponseContext(target, source);

    expect(merged.headers["x-present"]).toBe("yes");
    expect(merged.headers["x-absent"]).toBeUndefined();
  });

  it("still joins array-valued headers", async () => {
    const { createResponseContext } =
      await import("../src/httpResponse/httpResponse.context.js");
    const { mergeResponseContext } =
      await import("../src/httpAdapter/http.adapter.js");

    const source = createResponseContext({
      headers: { "set-cookie": ["a=1", "b=2"] },
    });

    const merged = mergeResponseContext(createResponseContext(), source);

    expect(merged.headers["set-cookie"]).toBe("a=1, b=2");
  });
});
