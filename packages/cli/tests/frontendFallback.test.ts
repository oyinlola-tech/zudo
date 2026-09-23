/**
 * zudojs-cli — Frontend fallback template tests
 *
 * The built-in fallback templates used to carry their own version literals
 * (Vite 6, Next 15, Nuxt 3, Angular 19, TypeScript 5) and several could not
 * install or build at all. These tests pin every range they write to the
 * single table in `dependencyVersions.constant.ts` and check the structural
 * fixes, plus the official scaffolder arguments that made Nuxt always fall
 * back.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderAngularFallback,
  renderAstroFallback,
  renderNextFallback,
  renderNuxtFallback,
  renderReactFallback,
  renderSvelteFallback,
  renderSvelteKitFallback,
  renderVanillaFallback,
  renderVueFallback,
} from "../src/adapters/frontend/fallback/index.js";
import {
  ANGULAR_VITEST_VERSION_RANGE,
  DEPENDENCY_VERSION_RANGES,
  TYPESCRIPT_VERSION_RANGES,
} from "../src/resolvers/dependency/index.js";
import { NuxtAdapter } from "../src/adapters/frontend/nuxt.adapter.js";
import { NextAdapter } from "../src/adapters/frontend/next.adapter.js";
import { AngularAdapter } from "../src/adapters/frontend/angular.adapter.js";
import { execCommand } from "../src/utils/utils.exec.js";
import { scaffoldWithFallback } from "../src/scaffolders/scaffolder.helper.js";
import type { FrontendGenerationContext } from "../src/adapters/frontend/frontendAdapter.type.js";

vi.mock("../src/utils/utils.exec.js", () => ({
  execCommand: vi.fn(async () => ({ stdout: "", stderr: "" })),
}));

const projectPath = mkdtempSync(join(tmpdir(), "zudojs-fallback-"));
afterAll(() => rmSync(projectPath, { recursive: true, force: true }));

const context = (
  language: "typescript" | "javascript" = "typescript",
): FrontendGenerationContext => ({
  project: { name: "web-app", type: "frontend" },
  projectPath,
  framework: "react",
  packageManager: "pnpm",
  language,
  architecture: "zudojs-standard",
  features: {},
});

const renderers = {
  react: () => renderReactFallback(context()),
  "react (js)": () => renderReactFallback(context("javascript")),
  vue: () => renderVueFallback(context()),
  svelte: () => renderSvelteFallback(context()),
  vanilla: () => renderVanillaFallback(context()),
  next: () => renderNextFallback(context()),
  nuxt: () => renderNuxtFallback(context()),
  sveltekit: () => renderSvelteKitFallback(context()),
  astro: () => renderAstroFallback(context()),
  angular: () => renderAngularFallback(context(), "web-app"),
};

type Pkg = Record<string, Record<string, string> | undefined>;

describe("frontend fallback templates", () => {
  for (const [name, render] of Object.entries(renderers)) {
    it(`${name}: every range comes from the shared version table`, () => {
      const files = render();
      expect(files["package.json"], "package.json is written").toBeDefined();
      const pkg = JSON.parse(files["package.json"]!) as Pkg;
      const ranges: Record<string, string> = { ...DEPENDENCY_VERSION_RANGES };
      for (const field of ["dependencies", "devDependencies"]) {
        for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
          if (dep === "typescript") {
            expect(range).toBe(TYPESCRIPT_VERSION_RANGES.frontend);
          } else if (name === "angular" && dep === "vitest") {
            expect(range).toBe(ANGULAR_VITEST_VERSION_RANGE);
          } else {
            expect(range, `${name} → ${dep}`).toBe(ranges[dep]);
          }
        }
      }
    });
  }

  it("Vite-based fallbacks use Vite 8", () => {
    expect(DEPENDENCY_VERSION_RANGES.vite).toMatch(/^\^8\./);
    const pkg = JSON.parse(renderVanillaFallback(context())["package.json"]!) as Pkg;
    expect(pkg["devDependencies"]?.["vite"]).toBe(DEPENDENCY_VERSION_RANGES.vite);
  });

  it("Svelte mounts with the Svelte 5 API", () => {
    const files = renderSvelteFallback(context());
    expect(files["src/main.ts"]).toContain("mount(App");
    expect(files["src/App.svelte"]).not.toContain("<template>");
  });

  it("SvelteKit's app.html has the placeholders kit requires", () => {
    const html = renderSvelteKitFallback(context())["src/app.html"]!;
    expect(html).toContain("%sveltekit.head%");
    expect(html).toContain("%sveltekit.body%");
  });

  it("Nuxt uses the Nuxt 4 app/ directory", () => {
    const files = renderNuxtFallback(context());
    expect(files["app/app.vue"]).toBeDefined();
    expect(JSON.stringify(files)).not.toContain('"latest"');
  });

  it("Angular builds with @angular/build and tests with Vitest", () => {
    const files = renderAngularFallback(context(), "web-app");
    const workspace = files["angular.json"]!;
    expect(workspace).toContain("@angular/build:application");
    expect(workspace).toContain("@angular/build:unit-test");
    expect(JSON.stringify(files)).not.toMatch(/build-angular|karma|jasmine/);
  });

  it("Astro renders the layout title as an expression", () => {
    const layout = renderAstroFallback(context())["src/layouts/Layout.astro"]!;
    expect(layout).toContain("<title>{title}</title>");
  });
});

describe("official scaffolder arguments", () => {
  beforeEach(() => vi.mocked(execCommand).mockClear());

  const argsOf = async (scaffold: () => Promise<void>): Promise<string[]> => {
    await scaffold();
    return [...(vi.mocked(execCommand).mock.calls[0]?.[1] ?? [])];
  };

  it("passes nuxi init the arguments it requires non-interactively", async () => {
    const args = await argsOf(() => new NuxtAdapter().scaffold(context()));
    expect(args).toEqual(
      expect.arrayContaining(["--template", "minimal", "--packageManager", "pnpm", "--force"]),
    );
  });

  it("scaffolds Next into src/ without a nested git repository", async () => {
    const args = await argsOf(() => new NextAdapter().scaffold(context()));
    expect(args).toEqual(
      expect.arrayContaining(["--src-dir", "--disable-git", "--use-pnpm"]),
    );
    expect(args).not.toContain("--no-turbopack");
  });

  it("tells ng new which package manager the project uses", async () => {
    const args = await argsOf(() => new AngularAdapter().scaffold(context()));
    expect(args).toEqual(expect.arrayContaining(["--package-manager", "pnpm"]));
  });

  it("requests Vitest 4 for Angular's unit-test builder", () => {
    const deps = new AngularAdapter().getDependencies({
      ...context(),
      features: { testing: true },
    });
    expect(deps.find((d) => d.name === "vitest")?.version).toBe(
      ANGULAR_VITEST_VERSION_RANGE,
    );
    expect(deps.map((d) => d.name)).not.toContain("@angular-builders/jest");
  });
});

describe("scaffolders that exit 0 without output", () => {
  it("fall back when no package.json was created", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zudojs-silent-scaffold-"));
    try {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ok = await scaffoldWithFallback({
        command: "npm",
        args: ["create", "vite@latest", "."],
        targetPath: dir,
        fallbackFiles: renderVanillaFallback(context()),
      });
      expect(ok).toBe(false);
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(readFileSync(join(dir, "package.json"), "utf-8")).toContain("vite");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("without creating package.json"));
      warn.mockRestore();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pnpm build-script allow list", () => {
  it("allows the native modules @angular/build installs", async () => {
    const { renderPnpmWorkspaceFile } = await import(
      "../src/templates/shared/pnpm.template.js"
    );
    const yaml = renderPnpmWorkspaceFile();
    expect(yaml).toContain('"lmdb": true');
    expect(yaml).toContain('"msgpackr-extract": true');
  });
});
