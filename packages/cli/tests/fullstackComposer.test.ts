/**
 * zudojs-cli — Fullstack Composer Tests
 *
 * Tests for FullstackComposer and FrontendGenerator.
 */

import { describe, it, expect, vi } from "vitest";
import { FullstackComposer } from "../src/generators/fullstack/fullstackComposer.core.js";
import { FrontendGenerator } from "../src/generators/frontend/frontendGenerator.core.js";
import type {
  ProjectConfiguration,
  FrontendFramework,
  FrontendArchitecture,
  PackageManager,
} from "../src/types/index.js";

vi.mock("../src/utils/utils.fileSystem.js", () => ({
  writeFileTree: vi.fn(async () => {}),
  mergeBarrelExport: vi.fn(() => ""),
}));

// Never spawn real scaffolder processes in tests: execCommand rejects so
// adapters fall back to their built-in templates (writeFileTree is mocked).
vi.mock("../src/utils/utils.exec.js", () => ({
  execCommand: vi.fn(async () => {
    throw new Error("process execution disabled in tests");
  }),
  runStreaming: vi.fn(async () => {}),
}));

vi.mock("../src/registries/adapter/packageManagerRegistry.core.js", () => ({
  PackageManagerRegistry: class {
    get(name: string) {
      return {
        install: vi.fn(async () => {}),
        addDev: vi.fn(async () => {}),
      };
    }
  },
}));

describe("FullstackComposer", () => {
  it("creates an instance", () => {
    const composer = new FullstackComposer();
    expect(composer).toBeTruthy();
  });

  it("generates a fullstack project structure", async () => {
    const composer = new FullstackComposer();
    const config: ProjectConfiguration = {
      name: "test-fullstack",
      type: "fullstack",
      backend: {
        architecture: "monolith",
        api: "rest",
        database: "postgresql",
      },
      frontend: {
        framework: "react",
        architecture: "zudojs-standard",
        language: "typescript",
      },
      workspace: {
        packageManager: "pnpm",
      },
      features: ["cqrs", "events"],
    };

    const result = await composer.generate({
      project: config,
      projectPath: "/tmp/test-fullstack-composer",
    });

    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("generates backend module structure for modular-monolith", async () => {
    const composer = new FullstackComposer();
    const config: ProjectConfiguration = {
      name: "test-modular",
      type: "fullstack",
      backend: {
        architecture: "modular-monolith",
        api: "rest",
        database: "postgresql",
      },
      workspace: {
        packageManager: "pnpm",
      },
      features: ["cqrs"],
    };

    const result = await composer.generate({
      project: config,
      projectPath: "/tmp/test-modular-composer",
    });

    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("generates frontend files for react", async () => {
    const composer = new FullstackComposer();
    const config: ProjectConfiguration = {
      name: "test-react-composer",
      type: "fullstack",
      backend: {
        architecture: "monolith",
        api: "rest",
      },
      frontend: {
        framework: "react",
        architecture: "zudojs-standard",
        language: "typescript",
      },
      workspace: {
        packageManager: "pnpm",
      },
    };

    const result = await composer.generate({
      project: config,
      projectPath: "/tmp/test-react-composer",
    });

    expect(result.success).toBe(true);
    expect(result.files).toContain("apps/web/");
  });

  it("generates frontend files for next", async () => {
    const composer = new FullstackComposer();
    const config: ProjectConfiguration = {
      name: "test-next-composer",
      type: "fullstack",
      backend: {
        architecture: "monolith",
        api: "rest",
      },
      frontend: {
        framework: "next",
        architecture: "zudojs-standard",
        language: "typescript",
      },
      workspace: {
        packageManager: "pnpm",
      },
    };

    const result = await composer.generate({
      project: config,
      projectPath: "/tmp/test-next-composer",
    });

    expect(result.success).toBe(true);
    expect(result.files).toContain("apps/web/");
  });

  it("generates workspace configuration files", async () => {
    const composer = new FullstackComposer();
    const config: ProjectConfiguration = {
      name: "test-workspace-composer",
      type: "fullstack",
      backend: {
        architecture: "monolith",
        api: "rest",
      },
      frontend: {
        framework: "react",
        architecture: "zudojs-standard",
        language: "typescript",
      },
      workspace: {
        packageManager: "pnpm",
      },
    };

    const result = await composer.generate({
      project: config,
      projectPath: "/tmp/test-workspace-composer",
    });

    expect(result.success).toBe(true);
    expect(result.files).toContain("package.json");
    expect(result.files).toContain("pnpm-workspace.yaml");
    expect(result.files).toContain("zudojs.config.ts");
  });

  it("returns errors for invalid configuration", async () => {
    const composer = new FullstackComposer();
    const result = await composer.generate({
      project: {
        name: "",
        type: "fullstack",
        backend: {
          architecture: "monolith",
          api: "rest",
        },
        workspace: {
          packageManager: "pnpm",
        },
      } as ProjectConfiguration,
      projectPath: "/tmp/test-invalid-composer",
    });

    expect(result.files.length).toBeGreaterThan(0);
  });
});

describe("FrontendGenerator", () => {
  it("creates an instance", () => {
    const generator = new FrontendGenerator();
    expect(generator).toBeTruthy();
  });

  it("reports available frameworks", () => {
    const generator = new FrontendGenerator();
    const frameworks = generator.getAvailableFrameworks();
    expect(frameworks).toContain("react");
    expect(frameworks).toContain("next");
    expect(frameworks).toContain("vue");
  });

  it("generates a react frontend project", async () => {
    const generator = new FrontendGenerator();
    const result = await generator.generate({
      project: {
        name: "test-frontend-react",
        type: "frontend",
        frontend: {
          framework: "react",
          architecture: "zudojs-standard",
          language: "typescript",
        },
        workspace: {
          packageManager: "pnpm",
        },
      },
      projectPath: "/tmp/test-frontend-react-gen",
      framework: "react",
      architecture: "zudojs-standard",
      language: "typescript",
      packageManager: "pnpm",
    });

    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.framework).toBe("react");
  });

  it("generates a vue frontend project", async () => {
    const generator = new FrontendGenerator();
    const result = await generator.generate({
      project: {
        name: "test-frontend-vue",
        type: "frontend",
        frontend: {
          framework: "vue",
          architecture: "zudojs-standard",
          language: "typescript",
        },
        workspace: {
          packageManager: "pnpm",
        },
      },
      projectPath: "/tmp/test-frontend-vue-gen",
      framework: "vue",
      architecture: "zudojs-standard",
      language: "typescript",
      packageManager: "pnpm",
    });

    expect(result.success).toBe(true);
    expect(result.framework).toBe("vue");
  });

  it("returns error for unknown framework", async () => {
    const generator = new FrontendGenerator();
    await expect(
      generator.generate({
        project: {
          name: "test-unknown",
          type: "frontend",
          frontend: {
            framework: "unknown-framework" as FrontendFramework,
            architecture: "zudojs-standard",
            language: "typescript",
          },
          workspace: {
            packageManager: "pnpm",
          },
        },
        projectPath: "/tmp/test-unknown-gen",
        framework: "unknown-framework",
        architecture: "zudojs-standard",
        language: "typescript",
        packageManager: "pnpm",
      }),
    ).rejects.toThrow("Unknown frontend framework");
  });
});
