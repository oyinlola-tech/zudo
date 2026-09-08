import { describe, it, expect, vi } from "vitest";
import { Container } from "../src/container/container.js";
import { createToken } from "../src/container/token.js";
import {
  ProviderNotFoundError,
  ProviderAlreadyRegisteredError,
} from "../src/errors/exceptions.js";

// ─── Test tokens ────────────────────────────────────────

const LoggerToken = createToken<Logger>("Logger");
const DatabaseToken = createToken<Database>("Database");
const ConfigToken = createToken<Config>("Config");

interface Logger {
  log(message: string): void;
}

interface Database {
  query(sql: string): unknown[];
}

interface Config {
  host: string;
  port: number;
}

// ─── Test implementations ──────────────────────────────

class ConsoleLogger implements Logger {
  public messages: string[] = [];

  public log(message: string): void {
    this.messages.push(message);
  }
}

class PostgresDatabase implements Database {
  public query(sql: string): unknown[] {
    return [{ sql }];
  }
}

// ─── Tests ──────────────────────────────────────────────

describe("Container", () => {
  describe("register and resolve", () => {
    it("should register and resolve a value provider", () => {
      const container = new Container();
      const config: Config = { host: "localhost", port: 5432 };

      container.register(ConfigToken, { useValue: config });

      const resolved = container.resolve(ConfigToken);

      expect(resolved).toBe(config);
      expect(resolved.host).toBe("localhost");
      expect(resolved.port).toBe(5432);
    });

    it("should register and resolve a class provider", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger });

      const logger = container.resolve(LoggerToken);

      expect(logger).toBeInstanceOf(ConsoleLogger);
      logger.log("hello");
      expect((logger as ConsoleLogger).messages).toEqual(["hello"]);
    });

    it("should register and resolve a factory provider", () => {
      const container = new Container();

      container.register(DatabaseToken, {
        useFactory: (c) => {
          // Factory receives the container for nested resolution
          return new PostgresDatabase();
        },
      });

      const db = container.resolve(DatabaseToken);

      expect(db).toBeInstanceOf(PostgresDatabase);
      expect(db.query("SELECT 1")).toEqual([{ sql: "SELECT 1" }]);
    });

    it("should return the same instance for singleton scope", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger });

      const first = container.resolve(LoggerToken);
      const second = container.resolve(LoggerToken);

      expect(first).toBe(second);
    });

    it("should return different instances for transient scope", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger }, "transient");

      const first = container.resolve(LoggerToken);
      const second = container.resolve(LoggerToken);

      expect(first).not.toBe(second);
      expect(first).toBeInstanceOf(ConsoleLogger);
      expect(second).toBeInstanceOf(ConsoleLogger);
    });
  });

  describe("error handling", () => {
    it("should throw ProviderNotFoundError for unregistered token", () => {
      const container = new Container();

      expect(() => container.resolve(LoggerToken)).toThrow(
        ProviderNotFoundError,
      );
    });

    it("should throw ProviderAlreadyRegisteredError for duplicate registration", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger });

      expect(() =>
        container.register(LoggerToken, { useClass: ConsoleLogger }),
      ).toThrow(ProviderAlreadyRegisteredError);
    });

    it("should provide descriptive error message for missing provider", () => {
      const container = new Container();

      try {
        container.resolve(LoggerToken);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderNotFoundError);
        expect((error as Error).message).toContain("Logger");
      }
    });

    it("should provide descriptive error message for duplicate provider", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger });

      try {
        container.register(LoggerToken, { useClass: ConsoleLogger });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderAlreadyRegisteredError);
        expect((error as Error).message).toContain("Logger");
      }
    });
  });

  describe("has and unregister", () => {
    it("should return true for registered token", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger });

      expect(container.has(LoggerToken)).toBe(true);
    });

    it("should return false for unregistered token", () => {
      const container = new Container();

      expect(container.has(LoggerToken)).toBe(false);
    });

    it("should unregister a token", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger });
      expect(container.has(LoggerToken)).toBe(true);

      const removed = container.unregister(LoggerToken);
      expect(removed).toBe(true);
      expect(container.has(LoggerToken)).toBe(false);
    });

    it("should return false when unregistering non-existent token", () => {
      const container = new Container();

      const removed = container.unregister(LoggerToken);
      expect(removed).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all registrations", () => {
      const container = new Container();

      container.register(LoggerToken, { useClass: ConsoleLogger });
      container.register(DatabaseToken, {
        useClass: PostgresDatabase,
      });

      expect(container.has(LoggerToken)).toBe(true);
      expect(container.has(DatabaseToken)).toBe(true);

      container.clear();

      expect(container.has(LoggerToken)).toBe(false);
      expect(container.has(DatabaseToken)).toBe(false);
    });
  });

  describe("token types", () => {
    it("should work with string tokens", () => {
      const container = new Container();
      const StringToken = createToken<string>("StringValue");

      container.register(StringToken, { useValue: "hello" });

      expect(container.resolve(StringToken)).toBe("hello");
    });

    it("should work with symbol tokens", () => {
      const container = new Container();
      const SymbolToken = Symbol("SymbolValue");

      container.register(SymbolToken, { useValue: 42 });

      expect(container.resolve(SymbolToken)).toBe(42);
    });

    it("should work with class tokens", () => {
      const container = new Container();

      container.register(ConsoleLogger, {
        useClass: ConsoleLogger,
      });

      const logger = container.resolve(ConsoleLogger);
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });
  });

  describe("nested resolution", () => {
    it("should resolve factory dependencies through the container", () => {
      const container = new Container();

      container.register(ConfigToken, {
        useValue: { host: "localhost", port: 5432 },
      });

      container.register(DatabaseToken, {
        useFactory: (c) => {
          expect(c.resolve(ConfigToken).host).toBe("localhost");
          return new PostgresDatabase();
        },
      });

      const db = container.resolve(DatabaseToken);
      expect(db).toBeInstanceOf(PostgresDatabase);
    });
  });
});

// ─── Scoping, cycles, edge cases (via package barrel) ───

import {
  Container as BarrelContainer,
  ContainerScope,
  DependencyResolutionError,
  InvalidProviderError,
  ErrorCode,
} from "../src/index.js";

describe("Container scoping and diagnostics", () => {
  it("caches scoped providers per explicit scope", () => {
    const container = new BarrelContainer();
    container.register(LoggerToken, { useClass: ConsoleLogger }, "scoped");

    const scopeA = container.createScope();
    const scopeB = container.createScope();

    expect(scopeA).toBeInstanceOf(ContainerScope);
    expect(scopeA.resolve(LoggerToken)).toBe(scopeA.resolve(LoggerToken));
    expect(scopeA.resolve(LoggerToken)).not.toBe(scopeB.resolve(LoggerToken));
    expect(scopeA.has(LoggerToken)).toBe(true);
  });

  it("caches scoped providers per currentScope() object", () => {
    let current: object | undefined;
    const container = new BarrelContainer({ currentScope: () => current });
    container.register(LoggerToken, { useClass: ConsoleLogger }, "scoped");

    // No active scope: behaves as transient.
    expect(container.resolve(LoggerToken)).not.toBe(
      container.resolve(LoggerToken),
    );

    const request = {};
    current = request;
    const first = container.resolve(LoggerToken);
    expect(container.resolve(LoggerToken)).toBe(first);

    current = {};
    expect(container.resolve(LoggerToken)).not.toBe(first);
  });

  it("keeps the active scope across nested factory resolutions", () => {
    const container = new BarrelContainer();
    container.register(LoggerToken, { useClass: ConsoleLogger }, "scoped");
    container.register(
      DatabaseToken,
      {
        useFactory: (c) => {
          c.resolve(LoggerToken);
          return new PostgresDatabase();
        },
      },
      "transient",
    );

    const scope = container.createScope();
    const logger = scope.resolve(LoggerToken);
    scope.resolve(DatabaseToken);

    expect(scope.resolve(LoggerToken)).toBe(logger);
  });

  it("caches singleton factories that return undefined", () => {
    const container = new BarrelContainer();
    const factory = vi.fn(() => undefined);
    container.register("maybe", { useFactory: factory });

    expect(container.resolve("maybe")).toBeUndefined();
    expect(container.resolve("maybe")).toBeUndefined();
    expect(factory).toHaveBeenCalledOnce();
  });

  it("throws DependencyResolutionError on circular dependencies", () => {
    const container = new BarrelContainer();
    container.register("a", { useFactory: (c) => c.resolve("b") });
    container.register("b", { useFactory: (c) => c.resolve("a") });

    expect(() => container.resolve("a")).toThrow(DependencyResolutionError);
    try {
      container.resolve("a");
    } catch (error) {
      const resolution = error as DependencyResolutionError;
      expect(resolution.code).toBe(ErrorCode.DEPENDENCY_RESOLUTION_FAILED);
      expect(resolution.chain).toEqual(["a", "b", "a"]);
    }
  });

  it("wraps factory failures with the resolution chain and cause", () => {
    const container = new BarrelContainer();
    const cause = new Error("db down");
    container.register("db", {
      useFactory: () => {
        throw cause;
      },
    });
    container.register("repo", { useFactory: (c) => c.resolve("db") });

    try {
      container.resolve("repo");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      expect((error as DependencyResolutionError).chain).toEqual([
        "repo",
        "db",
      ]);
      expect((error as Error).cause).toBe(cause);
    }
  });

  it("rejects invalid provider definitions at registration", () => {
    const container = new BarrelContainer();

    expect(() => container.register("bad", {} as never)).toThrow(
      InvalidProviderError,
    );
    expect(() =>
      container.register("bad", { useFactory: 42 } as never),
    ).toThrow(InvalidProviderError);
  });
});
