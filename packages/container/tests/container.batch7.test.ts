/**
 * Batch-7 lesson-writer regression tests for @zudojs/container.
 */

import { describe, it, expect, expectTypeOf } from "vitest";

import {
  createContainer,
  createToken,
  describeToken,
  factoryProvider,
  provideFactory,
} from "../src/index.js";
import type { ProviderToken } from "../src/index.js";

class Db {
  readonly kind = "db";
}

class Api {
  constructor(readonly db: Db) {}
}

class Clock {
  now(): number {
    return 1;
  }
}

describe("BATCH7-CONTAINER-4: factory deps are typed from the inject list", () => {
  it("compiles the README example and passes the resolved dependency", () => {
    const container = createContainer();
    const DB = createToken<Db>("Db");
    const API = createToken<Api>("Api");

    container.registerValue(DB, new Db());
    container.registerFactory(API, (db) => new Api(db), [DB]);

    expect(container.resolve(API).db.kind).toBe("db");
  });

  it("infers each parameter from its token, including class tokens", () => {
    const container = createContainer();
    const DB = createToken<Db>("Db");
    const PAIR = createToken<string>("pair");

    container.registerValue(DB, new Db());
    container.registerClass(Clock, Clock);
    container.registerFactory(
      PAIR,
      (db, clock) => {
        expectTypeOf(db).toEqualTypeOf<Db>();
        expectTypeOf(clock).toEqualTypeOf<Clock>();
        return `${db.kind}:${clock.now()}`;
      },
      [DB, Clock],
    );

    expect(container.resolve(PAIR)).toBe("db:1");
  });

  it("rejects a factory whose parameters do not match the tokens", () => {
    const container = createContainer();
    const DB = createToken<Db>("Db");
    const CLOCK = createToken<Clock>("Clock");

    container.registerValue(CLOCK, new Clock());
    expect(() =>
      container.registerFactory(
        DB,
        // @ts-expect-error — the inject list supplies a Clock, not a Db.
        (db: Db) => db,
        [CLOCK],
      ),
    ).not.toThrow();
  });

  it("keeps the old call forms compiling", () => {
    const container = createContainer();
    const A = createToken<number>("a");
    const B = createToken<number>("b");
    const C = createToken<number>("c");
    const loose: readonly ProviderToken[] = ["seed"];

    container.registerValue("seed", 2);
    container.registerFactory(A, () => 1);
    container.registerFactory(C, (...deps: unknown[]) => deps.length, loose);
    container.registerFactory(B, (seed) => {
      expectTypeOf(seed).toEqualTypeOf<unknown>();
      return (seed as number) * 2;
    }, ["seed"]);

    expect(container.resolve(A)).toBe(1);
    expect(container.resolve(B)).toBe(4);
    expect(container.resolve(C)).toBe(1);
  });

  it("types factoryProvider and provideFactory the same way", () => {
    const DB = createToken<Db>("Db");
    const API = createToken<Api>("Api");

    const provider = factoryProvider((db) => new Api(db), [DB]);
    const registration = provideFactory(API, (db) => new Api(db), [DB]);

    expect(provider.inject).toHaveLength(1);
    expect(registration.provide).toBe(API);
  });
});

describe("BATCH7-CONTAINER-5: errors name createToken tokens", () => {
  it("describes a symbol token by its name", () => {
    const TOKEN = createToken<Db>("Database");

    expect(describeToken(TOKEN)).toBe("Database");
    expect(describeToken(TOKEN.token)).toBe("Database");
  });

  it("shows the name in a not-found error", () => {
    const container = createContainer();
    const MISSING = createToken<Db>("MissingService");

    let message = "";
    try {
      container.resolve(MISSING);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("MissingService");
    expect(message).not.toContain("Symbol(");
  });

  it("shows the name in a dependency chain", () => {
    const container = createContainer();
    const DB = createToken<Db>("Database");
    const API = createToken<Api>("ApiService");

    container.registerFactory(API, (db) => new Api(db), [DB]);

    let message = "";
    try {
      container.resolve(API);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("Database");
    expect(message).not.toContain("Symbol(");
  });
});
