import { describe, it, expect } from "vitest";
import {
  isPlainObject, isEmail, isUuid, systemClock, systemRandom, toNumber,
  FixedClock, SeededRandom, toBoolean, isUuidV4, isPromise, isThenable,
  mapToObject, safeJsonParse, defineSecureRandom,
} from "../src/index.js";
import type { Maybe, DeepReadonly, PseudoRandom } from "../src/index.js";

interface AppConfig { db: { host: string } }

describe("README examples", () => {
  it("quick start", () => {
    const value: unknown = { a: 1 };
    if (isPlainObject(value)) {
      for (const key of Object.keys(value)) { expect(key).toBe("a"); expect(value[key]).toBe(1); }
    }
    const id: Maybe<string> = null;
    expect(id).toBeNull();
    const config: DeepReadonly<AppConfig> = { db: { host: "localhost" } };
    expect(config.db.host).toBe("localhost");
    const token = systemRandom.string(32);
    expect(token).toHaveLength(32);
    expect(typeof systemClock.now()).toBe("number");
    const query: { limit?: unknown } = { limit: "5" };
    expect(toNumber(query.limit, 20)).toBe(5);
    expect(isEmail("a@b.co")).toBe(true);
    expect(isUuid("018f8b6d-1c2f-7c9e-8a1b-2c3d4e5f6071")).toBe(true);
  });
  it("test doubles", () => {
    const clock = new FixedClock(0);
    const random: PseudoRandom = new SeededRandom(42);
    clock.advance(1_000);
    expect(clock.now()).toBe(1_000);
    expect(typeof random.int(10)).toBe("number");
  });
  it("safety notes", () => {
    expect(toNumber("", 7)).toBe(7);
    expect(toNumber("0x10", 7)).toBe(7);
    expect(toNumber("1e999", 7)).toBe(7);
    expect(toBoolean(NaN, false)).toBe(false);
    expect(isUuidV4("018f8b6d-1c2f-7c9e-8a1b-2c3d4e5f6071")).toBe(false);
    expect(isPromise(Promise.resolve(1))).toBe(true);
    expect(isPromise({ then() {} })).toBe(false);
    expect(isThenable({ then() {} })).toBe(true);
    expect(typeof defineSecureRandom).toBe("function");
    const m = new Map<string, number>([["__proto__", 1], ["a", 2]]);
    const o = mapToObject(m);
    expect(Object.getPrototypeOf(o)).toBe(null);
    const parsed = safeJsonParse<Record<string, unknown>>('{"__proto__":{"x":1},"a":1}', {});
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(parsed).toBeDefined();
  });
});
