/**
 * @zudojs/feature-flags — Round 9 regression tests.
 *
 * One describe block per finding. Each test failed against the code as it
 * stood before the fix.
 */

import { describe, it, expect } from "vitest";

import {
  createCachedProvider,
  createCompositeProvider,
  createEnvironmentProvider,
  createFeatureFlags,
  createMemoryProvider,
  evaluateFlag,
  FeatureFlagNotFoundError,
} from "../src/index.js";
import type { FeatureFlag, FeatureFlagProvider } from "../src/index.js";

function flag(key: string, overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return { key, enabled: true, defaultValue: false, ...overrides };
}

describe("FEATURE-FLAGS-R9-01: a cached provider forwards change announcements", () => {
  it("lets createFeatureFlags see a flag flipped behind the cache", async () => {
    const memory = createMemoryProvider([flag("f")]);
    const flags = createFeatureFlags({
      provider: createCachedProvider(memory, { ttl: 60_000 }),
    });

    expect(await flags.isEnabled("f")).toBe(false);
    memory.set(flag("f", { defaultValue: true }));
    expect(await flags.isEnabled("f")).toBe(true);
  });

  it("drops its cache before announcing, so a listener's get() is fresh", async () => {
    const memory = createMemoryProvider([flag("f")]);
    const cached = createCachedProvider(memory, { ttl: 60_000 });
    expect((await cached.get("f"))?.defaultValue).toBe(false);

    const seen: unknown[] = [];
    const unsubscribe = cached.subscribe!(() => {
      seen.push(cached.get("f"));
    });
    memory.set(flag("f", { defaultValue: true }));
    expect((await seen[0])).toMatchObject({ defaultValue: true });

    unsubscribe();
    memory.set(flag("f", { defaultValue: "later" }));
    expect(seen).toHaveLength(1);
  });

  it("offers no subscribe() when the upstream has none", () => {
    const silent: FeatureFlagProvider = {
      async get() {
        return undefined;
      },
      async getAll() {
        return [];
      },
    };
    expect(createCachedProvider(silent).subscribe).toBeUndefined();
  });
});

describe("FEATURE-FLAGS-R9-02: a composite provider forwards change announcements", () => {
  it("lets createFeatureFlags see a flag flipped in a member", async () => {
    const memory = createMemoryProvider([flag("f")]);
    const flags = createFeatureFlags({
      provider: createCompositeProvider([memory]),
    });

    expect(await flags.isEnabled("f")).toBe(false);
    memory.set(flag("f", { defaultValue: true }));
    expect(await flags.isEnabled("f")).toBe(true);
  });

  it("announces the merged view, keeping earlier members' precedence", async () => {
    const first = createMemoryProvider([flag("shared", { defaultValue: "first" })]);
    const second = createMemoryProvider([
      flag("shared", { defaultValue: "second" }),
      flag("only-second"),
    ]);
    const composite = createCompositeProvider([first, second]);
    await composite.getAll();

    const announced: (readonly FeatureFlag[])[] = [];
    composite.subscribe!((flags) => announced.push(flags));

    second.set(flag("only-second", { defaultValue: true }));

    expect(announced).toHaveLength(1);
    const view = new Map(announced[0]!.map((f) => [f.key, f.defaultValue]));
    expect(view.get("shared")).toBe("first");
    expect(view.get("only-second")).toBe(true);
  });

  it("stops every member subscription on unsubscribe", async () => {
    const a = createMemoryProvider([flag("a")]);
    const b = createMemoryProvider([flag("b")]);
    const flags = createFeatureFlags({ provider: createCompositeProvider([a, b]) });
    expect(await flags.isEnabled("b")).toBe(false);

    flags.close();
    b.set(flag("b", { defaultValue: true }));
    expect(await flags.isEnabled("b")).toBe(false);
  });

  it("offers no subscribe() when no member has one", () => {
    const env = createEnvironmentProvider({ env: {} });
    expect(createCompositeProvider([env]).subscribe).toBeUndefined();
  });

  it("works through the README's cached-over-composite stack", async () => {
    const memory = createMemoryProvider([flag("f")]);
    const provider = createCachedProvider(
      createCompositeProvider([
        createEnvironmentProvider({ env: {} }),
        memory,
      ]),
      { ttl: 30_000 },
    );
    const flags = createFeatureFlags({ provider });

    expect(await flags.isEnabled("f")).toBe(false);
    memory.set(flag("f", { defaultValue: true }));
    expect(await flags.isEnabled("f")).toBe(true);
  });
});

describe("FEATURE-FLAGS-R9-03: an empty environment value is not the number zero", () => {
  it("keeps a blank value as the string it is", async () => {
    const provider = createEnvironmentProvider({
      env: { FEATURE_EMPTY: "", FEATURE_BLANK: "   ", FEATURE_ZERO: "0" },
    });
    const all = new Map((await provider.getAll()).map((f) => [f.key, f.defaultValue]));

    expect(all.get("EMPTY")).toBe("");
    expect(all.get("BLANK")).toBe("   ");
    expect(all.get("ZERO")).toBe(0);
  });

  it("still parses booleans and numbers", async () => {
    const provider = createEnvironmentProvider({
      env: { FEATURE_ON: "true", FEATURE_OFF: "false", FEATURE_RATE: "2.5" },
    });
    const all = new Map((await provider.getAll()).map((f) => [f.key, f.defaultValue]));

    expect(all.get("ON")).toBe(true);
    expect(all.get("OFF")).toBe(false);
    expect(all.get("RATE")).toBe(2.5);
  });
});

describe("FEATURE-FLAGS-R9-04: a failed lookup is an error, not a missing flag", () => {
  function flakyProvider(): FeatureFlagProvider {
    return {
      async get(): Promise<FeatureFlag | undefined> {
        throw new Error("store down");
      },
      async getAll() {
        return [];
      },
    };
  }

  it("reports `error` when get() throws after a successful load", async () => {
    const sources: string[] = [];
    const flags = createFeatureFlags({
      provider: flakyProvider(),
      onError: (_error, source) => sources.push(source),
    });

    const result = await flags.evaluate("unknown");
    expect(result.reason).toBe("error");
    expect(result.value).toBeUndefined();
    expect(sources).toEqual(["FeatureFlagProvider.get"]);
  });

  it("does not throw FeatureFlagNotFoundError for a store that could not be asked", async () => {
    const flags = createFeatureFlags({
      provider: flakyProvider(),
      throwOnMissing: true,
    });

    const result = await flags.evaluate("unknown");
    expect(result.reason).toBe("error");
  });

  it("still reports not_found when the store answered", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider([]),
      throwOnMissing: true,
    });
    await expect(flags.evaluate("unknown")).rejects.toBeInstanceOf(
      FeatureFlagNotFoundError,
    );
  });
});

describe("FEATURE-FLAGS-R9-05: an ISO-string expiresAt expires", () => {
  const active = { rules: [{ type: "static", value: true }] } as const;

  it("expires a flag whose metadata came through JSON", () => {
    const result = evaluateFlag(
      flag("f", {
        ...active,
        metadata: { expiresAt: "2000-01-01T00:00:00Z" as unknown as Date },
      }),
    );
    expect(result.reason).toBe("expired");
    expect(result.value).toBe(false);
  });

  it("survives a JSON round trip of a Date", () => {
    const serialized = JSON.parse(
      JSON.stringify(flag("f", { ...active, metadata: { expiresAt: new Date(0) } })),
    ) as FeatureFlag;
    expect(evaluateFlag(serialized).reason).toBe("expired");
  });

  it("still honours a Date, and a future expiry", () => {
    expect(
      evaluateFlag(flag("f", { ...active, metadata: { expiresAt: new Date(0) } }))
        .reason,
    ).toBe("expired");
    expect(
      evaluateFlag(
        flag("f", { ...active, metadata: { expiresAt: new Date(Date.now() + 60_000) } }),
      ).reason,
    ).toBe("static");
  });

  it("treats an unparseable expiry as no expiry", () => {
    expect(
      evaluateFlag(
        flag("f", { ...active, metadata: { expiresAt: "not a date" as unknown as Date } }),
      ).reason,
    ).toBe("static");
  });
});
