import { describe, it, expect } from "vitest";

import { createMockFn } from "../src/index.js";

describe("#101 createMockFn one-shot results", () => {
  it("consumes mockResolvedValueOnce / mockRejectedValueOnce in order, then falls back", async () => {
    const fetchUser = createMockFn<[id: string], Promise<string>>();
    fetchUser.mockResolvedValue("persistent");
    fetchUser.mockRejectedValueOnce(new Error("first fails"));
    fetchUser.mockResolvedValueOnce("second");

    await expect(fetchUser("u1")).rejects.toThrow("first fails");
    await expect(fetchUser("u2")).resolves.toBe("second");
    await expect(fetchUser("u3")).resolves.toBe("persistent");
    expect(fetchUser.callCount).toBe(3);
  });

  it("supports mockReturnValueOnce and mockImplementationOnce ahead of the default", () => {
    const next = createMockFn<[], number>(0);
    next.mockReturnValueOnce(1);
    next.mockImplementationOnce(() => 2);

    expect([next(), next(), next()]).toEqual([1, 2, 0]);
    expect(next.results).toEqual([1, 2, 0]);
  });

  it("mockReset drops queued one-shots; mockClear keeps them", () => {
    const fn = createMockFn<[], string>("default");
    fn.mockReturnValueOnce("queued");
    fn.mockClear();
    expect(fn()).toBe("queued");

    fn.mockReturnValueOnce("dropped");
    fn.mockReset();
    expect(fn()).toBe("default");
    expect(fn.callCount).toBe(1);
  });

  it("records a throwing one-shot implementation like any other throw", () => {
    const fn = createMockFn<[], void>();
    const boom = new Error("boom");
    fn.mockImplementationOnce(() => {
      throw boom;
    });

    expect(() => fn()).toThrow(boom);
    expect(fn()).toBeUndefined();
    expect(fn.errors).toEqual([boom]);
    expect(fn.results).toEqual([undefined, undefined]);
  });
});
