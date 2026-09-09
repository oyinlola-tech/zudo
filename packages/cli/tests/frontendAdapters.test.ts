/**
 * zudojs-cli — Frontend Adapter Tests
 *
 * Tests for frontend adapters.
 */

import { describe, it, expect, vi } from "vitest";
import { ReactAdapter } from "../src/adapters/frontend/react.adapter.js";
import { NextAdapter } from "../src/adapters/frontend/next.adapter.js";
import { VueAdapter } from "../src/adapters/frontend/vue.adapter.js";
import { NuxtAdapter } from "../src/adapters/frontend/nuxt.adapter.js";
import { AngularAdapter } from "../src/adapters/frontend/angular.adapter.js";
import { SvelteAdapter } from "../src/adapters/frontend/svelte.adapter.js";
import { SvelteKitAdapter } from "../src/adapters/frontend/sveltekit.adapter.js";
import { AstroAdapter } from "../src/adapters/frontend/astro.adapter.js";
import { VanillaAdapter } from "../src/adapters/frontend/vanilla.adapter.js";
import { FlutterAdapter } from "../src/adapters/frontend/flutter.adapter.js";
import { ReactNativeAdapter } from "../src/adapters/frontend/react-native.adapter.js";
import type { FrontendGenerationContext } from "../src/adapters/frontend/frontendAdapter.type.js";

vi.mock("../src/utils/utils.exec.js", () => ({
  execCommand: vi.fn(async () => ({ stdout: "test", stderr: "" })),
}));

const mockContext = (
  overrides?: Partial<FrontendGenerationContext>,
): FrontendGenerationContext => ({
  project: {
    name: "test-app",
    type: "fullstack",
  },
  projectPath: "/tmp/test-app",
  framework: "react",
  packageManager: "pnpm",
  language: "typescript",
  architecture: "zudojs-standard",
  features: {
    testing: true,
    linting: true,
    formatting: true,
    stateManagement: undefined,
  },
  ...overrides,
});

describe("ReactAdapter", () => {
  const adapter = new ReactAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("react");
    expect(adapter.framework).toBe("react");
  });

  it("is available when node is installed", async () => {
    const available = await adapter.isAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("returns a version string", async () => {
    const version = await adapter.getLatestVersion();
    expect(version).toBeTruthy();
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });

  it("returns dependencies including testing libs", () => {
    const deps = adapter.getDependencies(mockContext());
    const names = deps.map((d) => d.name);
    expect(names).toContain("react");
    expect(names).toContain("react-dom");
    expect(names).toContain("vitest");
  });

  it("validates context", async () => {
    const result = await adapter.validate(mockContext());
    expect(result.valid).toBe(true);
  });
});

describe("NextAdapter", () => {
  const adapter = new NextAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("next");
    expect(adapter.framework).toBe("next");
  });

  it("returns a version string", async () => {
    const version = await adapter.getLatestVersion();
    expect(version).toBeTruthy();
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("VueAdapter", () => {
  const adapter = new VueAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("vue");
    expect(adapter.framework).toBe("vue");
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("NuxtAdapter", () => {
  const adapter = new NuxtAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("nuxt");
    expect(adapter.framework).toBe("nuxt");
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("AngularAdapter", () => {
  const adapter = new AngularAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("angular");
    expect(adapter.framework).toBe("angular");
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("SvelteAdapter", () => {
  const adapter = new SvelteAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("svelte");
    expect(adapter.framework).toBe("svelte");
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("SvelteKitAdapter", () => {
  const adapter = new SvelteKitAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("sveltekit");
    expect(adapter.framework).toBe("sveltekit");
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("AstroAdapter", () => {
  const adapter = new AstroAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("astro");
    expect(adapter.framework).toBe("astro");
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("VanillaAdapter", () => {
  const adapter = new VanillaAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("vanilla");
    expect(adapter.framework).toBe("vanilla");
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("FlutterAdapter", () => {
  const adapter = new FlutterAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("flutter");
    expect(adapter.framework).toBe("flutter");
  });

  it("returns a version string", async () => {
    const version = await adapter.getLatestVersion();
    expect(version).toBeTruthy();
  });

  it("scaffold does not throw", async () => {
    await expect(adapter.scaffold(mockContext())).resolves.toBeUndefined();
  });
});

describe("ReactNativeAdapter", () => {
  const adapter = new ReactNativeAdapter();

  it("has correct name and framework", () => {
    expect(adapter.name).toBe("react-native");
    expect(adapter.framework).toBe("react-native");
  });

  it("returns a version string", async () => {
    const version = await adapter.getLatestVersion();
    expect(version).toBeTruthy();
  });

  it("applyZudojsStructure does not throw", async () => {
    await expect(
      adapter.applyZudojsStructure(mockContext()),
    ).resolves.toBeUndefined();
  });
});
