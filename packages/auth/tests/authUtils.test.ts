import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  generateRandomToken,
  createMemorySessionStore,
  parseBearerToken,
  parseCookies,
  generateCsrfToken,
  isTokenExpired,
  extractUserId,
} from "../src/index.js";

describe("Password utilities", () => {
  it("should hash a password", async () => {
    const hash = await hashPassword("my-secret-password");
    expect(typeof hash).toBe("string");
    expect(hash).toContain("scrypt");
  });

  it("should verify a correct password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("correct-password", hash);
    expect(result).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("wrong-password", hash);
    expect(result).toBe(false);
  });

  it("should detect when rehash is needed", async () => {
    const hash = await hashPassword("password");
    const result = needsRehash(hash);
    expect(typeof result).toBe("boolean");
  });

  it("should generate a random token", () => {
    const token = generateRandomToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("should generate a random token with custom length", () => {
    const token = generateRandomToken(64);
    expect(typeof token).toBe("string");
  });
});

describe("Session store", () => {
  it("should create a memory session store", () => {
    const store = createMemorySessionStore();
    expect(store).toBeDefined();
    expect(typeof store.create).toBe("function");
    expect(typeof store.get).toBe("function");
    expect(typeof store.destroy).toBe("function");
  });

  it("should create and retrieve a session", async () => {
    const store = createMemorySessionStore();
    const session = await store.create({
      userId: "user-123" as never,
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe("user-123");
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const retrieved = await store.get(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(session.id);
  });

  it("should destroy a session", async () => {
    const store = createMemorySessionStore();
    const session = await store.create({
      userId: "user-123" as never,
    });

    await store.destroy(session.id);
    const retrieved = await store.get(session.id);
    expect(retrieved).toBeNull();
  });

  it("should destroy all sessions for a user", async () => {
    const store = createMemorySessionStore();
    await store.create({ userId: "user-1" as never });
    await store.create({ userId: "user-1" as never });
    await store.create({ userId: "user-2" as never });

    await store.destroyAllForUser("user-1" as never);

    const sessions1 = await store.get("session-1" as never);
    expect(sessions1).toBeNull();
  });
});

describe("Auth utilities", () => {
  describe("parseBearerToken", () => {
    it("should extract token from Bearer header", () => {
      const token = parseBearerToken("Bearer abc123");
      expect(token).toBe("abc123");
    });

    it("should return null for missing header", () => {
      expect(parseBearerToken(undefined)).toBeNull();
    });

    it("should return null for non-Bearer header", () => {
      expect(parseBearerToken("Basic abc123")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseBearerToken("")).toBeNull();
    });
  });

  describe("parseCookies", () => {
    it("should parse cookie string", () => {
      const cookies = parseCookies("name=value; other=test");
      expect(cookies.name).toBe("value");
      expect(cookies.other).toBe("test");
    });

    it("should handle empty cookie string", () => {
      expect(Object.keys(parseCookies(""))).toEqual([]);
    });

    it("should handle undefined cookie string", () => {
      expect(Object.keys(parseCookies(undefined))).toEqual([]);
    });
  });

  describe("generateCsrfToken", () => {
    it("should generate a CSRF token", () => {
      const token = generateCsrfToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should generate unique tokens", () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });
});

// ─── Round-7 hardening ─────────────────────────────────────────────────────

/** AUTH-12: RFC 7235 §2.1 makes the auth-scheme token case-insensitive. */
describe("parseBearerToken scheme handling", () => {
  it.each(["Bearer", "bearer", "BEARER", "BeArEr"])(
    "accepts the %s scheme",
    (scheme) => {
      expect(parseBearerToken(`${scheme} abc123`)).toBe("abc123");
    },
  );

  it("tolerates extra and surrounding whitespace", () => {
    expect(parseBearerToken("Bearer   abc123")).toBe("abc123");
    expect(parseBearerToken("  Bearer abc123  ")).toBe("abc123");
    expect(parseBearerToken("Bearer\tabc123")).toBe("abc123");
  });

  it("rejects a scheme-only header", () => {
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
  });

  it("rejects other schemes and multi-token values", () => {
    expect(parseBearerToken("Basic abc123")).toBeNull();
    expect(parseBearerToken("Bearer abc 123")).toBeNull();
    expect(parseBearerToken("NotBearer abc123")).toBeNull();
  });
});

/** AUTH-15: these sit on the HTTP trust boundary and used to throw. */
describe("header parsers tolerate untyped input", () => {
  const junk: readonly unknown[] = [
    ["Bearer a", "Bearer b"],
    123,
    null,
    undefined,
    {},
    Symbol("x"),
    true,
  ];

  it("never throws out of parseBearerToken", () => {
    for (const value of junk) {
      expect(() => parseBearerToken(value)).not.toThrow();
      expect(parseBearerToken(value)).toBeNull();
    }
  });

  it("never throws out of parseCookies", () => {
    for (const value of junk) {
      expect(() => parseCookies(value)).not.toThrow();
      expect(Object.keys(parseCookies(value))).toEqual([]);
    }
  });
});

/** AUTH-16: attacker-controlled cookie names, and unbounded headers. */
describe("parseCookies safety", () => {
  it("returns an object with no prototype", () => {
    const cookies = parseCookies("a=1");
    expect(Object.getPrototypeOf(cookies)).toBeNull();
    expect((cookies as Record<string, unknown>)["toString"]).toBeUndefined();
    expect(
      (cookies as Record<string, unknown>)["hasOwnProperty"],
    ).toBeUndefined();
  });

  it("keeps a __proto__ cookie as an ordinary own property", () => {
    const cookies = parseCookies("__proto__=polluted; a=1");
    expect(Object.getOwnPropertyDescriptor(cookies, "__proto__")?.value).toBe(
      "polluted",
    );
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(cookies["a"]).toBe("1");
  });

  it("does not let a cookie shadow an inherited member for the caller", () => {
    const cookies = parseCookies("constructor=x; hasOwnProperty=y");
    expect(cookies["constructor"]).toBe("x");
    expect(cookies["hasOwnProperty"]).toBe("y");
    // The caller can still interrogate it safely.
    expect(Object.prototype.hasOwnProperty.call(cookies, "constructor")).toBe(
      true,
    );
  });

  it("caps the number of parsed pairs", () => {
    const header = Array.from({ length: 500 }, (_, i) => `k${i}=v`).join("; ");
    expect(Object.keys(parseCookies(header)).length).toBeLessThanOrEqual(100);
  });

  it("ignores an oversized Cookie header entirely", () => {
    const header = `a=1; ${"b".repeat(9000)}=2`;
    expect(Object.keys(parseCookies(header))).toEqual([]);
  });

  it("keeps values containing = intact", () => {
    expect(parseCookies("token=a=b=c")["token"]).toBe("a=b=c");
  });
});

/** AUTH-25: `sub` is attacker-controlled and was returned unchecked. */
describe("unverified claim helpers", () => {
  function unsigned(payload: unknown): string {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
      "base64url",
    );
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${header}.${body}.sig`;
  }

  it("returns null for a non-string sub", () => {
    expect(extractUserId(unsigned({ sub: { $ne: null } }))).toBeNull();
    expect(extractUserId(unsigned({ sub: [1, 2, 3] }))).toBeNull();
    expect(extractUserId(unsigned({ sub: 42 }))).toBeNull();
    expect(extractUserId(unsigned({ sub: "" }))).toBeNull();
    expect(extractUserId(unsigned({}))).toBeNull();
  });

  it("returns a string sub", () => {
    expect(extractUserId(unsigned({ sub: "user-9" }))).toBe("user-9");
  });

  it("returns null for malformed tokens", () => {
    expect(extractUserId("not-a-jwt")).toBeNull();
    expect(extractUserId("a.b.c")).toBeNull();
    expect(extractUserId(undefined)).toBeNull();
  });

  it("reports expiry from the unverified payload", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isTokenExpired(unsigned({ exp: now + 600 }))).toBe(false);
    expect(isTokenExpired(unsigned({ exp: now - 1 }))).toBe(true);
    expect(isTokenExpired(unsigned({ exp: "soon" }))).toBe(true);
    expect(isTokenExpired(unsigned({}))).toBe(true);
    expect(isTokenExpired(unsigned(null))).toBe(true);
    expect(isTokenExpired("not-a-jwt")).toBe(true);
    expect(isTokenExpired(undefined)).toBe(true);
  });
});
