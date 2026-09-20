/**
 * zudojs-cli — Generator / template regression tests (audit slice "gen").
 *
 * One `describe` per finding. Every assertion is on observable behaviour:
 * the files a generator actually wrote, the bytes on disk after a symlink
 * escape attempt, or the result of a doctor check run over a scaffolded
 * project.
 */

import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  assertGeneratableName,
  toCamelCase,
  toPascalCase,
} from "../src/utils/utils.name.js";
import { generateModule } from "../src/generators/module/module.generator.js";
import { generateController } from "../src/generators/controller/controller.generator.js";
import { generateCommand } from "../src/generators/command/command.generator.js";
import { generateQuery } from "../src/generators/query/query.generator.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { IntegrationGenerator } from "../src/generators/integration/integrationGenerator.core.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import { runDoctorChecks } from "../src/commands/doctor.command.js";
import { FEATURE_PACKAGES } from "../src/constants/index.js";
import type { ScaffoldOptions } from "../src/types/index.js";
import type { ProjectConfiguration } from "../src/types/index.js";

const createdDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    createdDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function scratch(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `zudojs-cliFix-${name}-`));
  createdDirs.push(dir);
  return dir;
}

function scaffoldOptions(
  overrides: Partial<ScaffoldOptions> = {},
): ScaffoldOptions {
  return {
    projectName: "my-app",
    projectType: "backend",
    architecture: "monolith",
    packageManager: "pnpm",
    database: "postgresql",
    api: "rest",
    services: [],
    enableCQRS: true,
    enableMessaging: true,
    enableObservability: false,
    enableOpenAPI: false,
    enableDatabase: true,
    enableQueue: false,
    enableDocker: false,
    installDeps: false,
    initGit: false,
    ...overrides,
  };
}

/** A valid TypeScript identifier start: never a digit. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

describe("CLI-GEN-01 leading-digit names never become identifiers", () => {
  it.each(["2fa", "9lives", "401-handler"])(
    "rejects %s as a generatable name",
    (name) => {
      expect(() => assertGeneratableName(name, "module name")).toThrow(
        /must start with a letter/i,
      );
    },
  );

  it("still accepts names that merely contain digits", () => {
    expect(assertGeneratableName("oauth2")).toBe("oauth2");
    expect(assertGeneratableName("s3-bucket")).toBe("s3-bucket");
  });

  it("writes nothing when the module name starts with a digit", async () => {
    const dir = await scratch("digit-module");
    mkdirSync(join(dir, "src", "modules"), { recursive: true });

    await expect(
      generateModule({ name: "2fa", basePath: "src/modules" }, dir),
    ).rejects.toThrow();

    expect(existsSync(join(dir, "src", "modules", "index.ts"))).toBe(false);
    expect(existsSync(join(dir, "src", "modules", "2fa"))).toBe(false);
  });

  it("emits a valid identifier from every converter", () => {
    for (const name of ["2fa", "9lives", "401-handler", "1"]) {
      expect(toPascalCase(name), name).toMatch(IDENTIFIER);
      expect(toCamelCase(name), name).toMatch(IDENTIFIER);
    }
    expect(toPascalCase("user-signup")).toBe("UserSignup");
    expect(toCamelCase("send email")).toBe("sendEmail");
  });
});

describe("CLI-GEN-02 writes cannot escape through a symlinked directory", () => {
  it("refuses to write through a symlinked subdirectory", async () => {
    const project = await scratch("symlink-project");
    const outside = await scratch("symlink-target");

    mkdirSync(join(project, "src"), { recursive: true });
    symlinkSync(outside, join(project, "src", "controllers"), "dir");

    await expect(
      generateController({ name: "escaped", basePath: "src" }, project),
    ).rejects.toThrow();

    expect(existsSync(join(outside, "escaped.controller.ts"))).toBe(false);
    expect(existsSync(join(outside, "index.ts"))).toBe(false);
  });

  it("still writes normally into a real subdirectory", async () => {
    const project = await scratch("symlink-ok");
    mkdirSync(join(project, "src"), { recursive: true });

    await generateController({ name: "ok", basePath: "src" }, project);

    expect(
      existsSync(join(project, "src", "controllers", "ok.controller.ts")),
    ).toBe(true);
  });
});

describe("CLI-GEN-03 the sample spec is one vitest actually runs", () => {
  /** Vitest's default `include`: **\/*.{test,spec}.?(c|m)[jt]s?(x) */
  const VITEST_DEFAULT = /\.(test|spec)\.(c|m)?[jt]sx?$/;

  it.each([
    ["monolith", generateMonolithFiles],
    ["modular-monolith", generateModularMonolithFiles],
  ] as const)("%s emits a spec matching vitest's default include", (_n, gen) => {
    const files = gen(scaffoldOptions({ architecture: "modular-monolith" }));

    const pkg = JSON.parse(files["package.json"]!) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.test).toBe("vitest run");

    const specs = Object.keys(files).filter((p) => VITEST_DEFAULT.test(p));
    expect(specs.length).toBeGreaterThan(0);
    expect(files["tests/index.ts"]).toBeUndefined();
    for (const spec of specs) {
      expect(files[spec]).toContain('from "vitest"');
    }
  });

  it("microservice declares no test script it cannot satisfy", () => {
    const files = generateMicroserviceFiles(
      scaffoldOptions({ architecture: "microservice", services: ["identity"] }),
    );
    for (const [path, content] of Object.entries(files)) {
      if (!path.endsWith("package.json")) continue;
      const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
      const test = pkg.scripts?.test;
      if (test === undefined) continue;
      const specs = Object.keys(files).filter((p) => VITEST_DEFAULT.test(p));
      expect(specs.length, `${path} runs "${test}"`).toBeGreaterThan(0);
    }
  });
});

describe("CLI-GEN-05 CQRS schematics without a service group", () => {
  it("writes commands directly under the base path", async () => {
    const dir = await scratch("cqrs-command");

    const written = await generateCommand(
      { name: "create-user", basePath: "src/modules/identity" },
      dir,
    );

    expect(written).toContain(
      "src/modules/identity/commands/create-user/create-user.command.ts",
    );
    for (const path of written) {
      expect(path.split("/")).not.toContain("default");
    }
    expect(
      existsSync(
        join(
          dir,
          "src/modules/identity/commands/create-user/create-user.command.ts",
        ),
      ),
    ).toBe(true);
    expect(existsSync(join(dir, "src/modules/identity/default"))).toBe(false);
  });

  it("writes queries directly under the base path", async () => {
    const dir = await scratch("cqrs-query");

    const written = await generateQuery(
      { name: "list-users", basePath: "src" },
      dir,
    );

    expect(written).toContain("src/queries/list-users/list-users.query.ts");
    expect(existsSync(join(dir, "src/default"))).toBe(false);
  });
});

describe("CLI-GEN-08 CORS config lands inside the backend program", () => {
  const project: ProjectConfiguration = {
    name: "shop",
    type: "fullstack",
    backend: { architecture: "monolith", api: "rest", database: "postgresql" },
    frontend: {
      framework: "react",
      architecture: "zudojs-standard",
      language: "typescript",
    },
    workspace: { packageManager: "pnpm" },
  };

  it("writes apps/api/src/configs/cors.ts and exports it from the barrel", async () => {
    const dir = await scratch("cors");
    // The backend template's configs barrel already exists when the
    // integration generator runs.
    await writeFileTree(dir, { "apps/api/src/configs/index.ts": "" });

    await new IntegrationGenerator().generate({
      project,
      projectPath: dir,
      backendPort: 3000,
      frontendPort: 4321,
    });

    const corsPath = join(dir, "apps", "api", "src", "configs", "cors.ts");
    expect(existsSync(corsPath)).toBe(true);
    expect(readFileSync(corsPath, "utf-8")).toContain("http://localhost:4321");

    expect(existsSync(join(dir, "apps", "api", "config", "cors.ts"))).toBe(
      false,
    );

    const barrel = readFileSync(
      join(dir, "apps", "api", "src", "configs", "index.ts"),
      "utf-8",
    );
    expect(barrel).toContain('from "./cors.js"');
  });
});

describe("CLI-GEN-09 no orphan src/ at a microservice workspace root", () => {
  it("does not write a root src/types directory", () => {
    const files = generateMicroserviceFiles(
      scaffoldOptions({ architecture: "microservice", services: ["identity"] }),
    );
    expect(files["src/types/index.ts"]).toBeUndefined();
    for (const path of Object.keys(files)) {
      expect(path.startsWith("src/"), path).toBe(false);
    }
  });
});

describe("CLI-GEN-10 templates record the capabilities they were built with", () => {
  function features(content: string): string[] {
    const pkg = JSON.parse(content) as {
      zudojs?: { features?: string[] };
      dependencies?: Record<string, string>;
    };
    return pkg.zudojs?.features ?? [];
  }

  function dependencies(content: string): string[] {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>;
    };
    return Object.keys(pkg.dependencies ?? {});
  }

  const enabled = scaffoldOptions({
    enableCQRS: true,
    enableMessaging: true,
    enableObservability: true,
    enableOpenAPI: true,
    enableDatabase: true,
    enableQueue: true,
  });

  it.each([
    ["monolith", generateMonolithFiles, "package.json"],
    [
      "modular-monolith",
      generateModularMonolithFiles,
      "package.json",
    ],
  ] as const)("%s records every enabled capability", (_n, gen, manifest) => {
    const files = gen({ ...enabled, architecture: "modular-monolith" });
    const declared = features(files[manifest]!);

    expect(declared).toEqual([
      "cqrs",
      "messaging",
      "observability",
      "openapi",
      "database",
      "queue",
    ]);

    // Every declared feature must be backed by its package, which is the
    // rule `zudojs doctor` enforces.
    const deps = dependencies(files[manifest]!);
    for (const feature of declared) {
      for (const pkg of FEATURE_PACKAGES[feature] ?? [`@zudojs/${feature}`]) {
        expect(deps, `${feature} → ${pkg}`).toContain(pkg);
      }
    }
  });

  it("records nothing when nothing was enabled", () => {
    const files = generateMonolithFiles(
      scaffoldOptions({
        enableCQRS: false,
        enableMessaging: false,
        enableObservability: false,
        enableOpenAPI: false,
        enableDatabase: false,
        enableQueue: false,
      }),
    );
    expect(features(files["package.json"]!)).toEqual([]);
  });

  it("microservice service apps record their capabilities", () => {
    const files = generateMicroserviceFiles({
      ...enabled,
      architecture: "microservice",
      services: ["identity"],
    });

    expect(features(files["package.json"]!)).toContain("cqrs");

    const svc = files["apps/services/identity/package.json"]!;
    const declared = features(svc);
    expect(declared.length).toBeGreaterThan(0);
    const deps = dependencies(svc);
    for (const feature of declared) {
      for (const pkg of FEATURE_PACKAGES[feature] ?? [`@zudojs/${feature}`]) {
        expect(deps, `${feature} → ${pkg}`).toContain(pkg);
      }
    }
  });

  it("gives `zudojs doctor` a Features check with something to check", async () => {
    const dir = await scratch("doctor-features");
    await writeFileTree(dir, generateMonolithFiles(enabled));

    const declared = features(readFileSync(join(dir, "package.json"), "utf-8"));
    expect(declared.length).toBeGreaterThan(0);

    const check = runDoctorChecks(dir).find((c) => c.name === "Features");
    expect(check?.passed, check?.message).toBe(true);
  });
});
