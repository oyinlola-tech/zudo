/**
 * zudojs-cli — a new project gets no services unless it asks for them.
 *
 * `create` used to substitute example domain names when the service list was
 * empty — four for a microservice project (`identity`, `enrollment`,
 * `assessment`, `notification`) and three for a modular monolith (`identity`,
 * `enrollment`, `assessment`). Every project therefore arrived carrying
 * domains its author had never asked for and had to delete before starting.
 *
 * These tests pin the rule that replaced it: a service or module exists
 * because someone named it.
 */

import { describe, it, expect } from "vitest";

import type { ScaffoldOptions } from "../src/types/index.js";

import {
  generateMicroserviceFiles,
  resolveMicroserviceServices,
} from "../src/templates/microservice/index.js";

import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";

function options(overrides: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return {
    projectName: "my-app",
    projectType: "backend",
    architecture: "microservice",
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
  } as ScaffoldOptions;
}

/** Directory names directly under `apps/services/`. */
function serviceDirectories(files: Record<string, string>): string[] {
  return [
    ...new Set(
      Object.keys(files)
        .filter((path) => path.startsWith("apps/services/"))
        .map((path) => path.split("/")[2] ?? ""),
    ),
  ].filter(Boolean);
}

/** Directory names directly under `src/modules/`, excluding the barrel. */
function moduleDirectories(files: Record<string, string>): string[] {
  return [
    ...new Set(
      Object.keys(files)
        .filter((path) => path.startsWith("src/modules/"))
        .map((path) => path.split("/")[2] ?? ""),
    ),
  ].filter((entry) => entry.length > 0 && !entry.endsWith(".ts"));
}

const DEMO_NAMES = ["identity", "enrollment", "assessment", "notification"];

describe("microservice — services are created only when named", () => {
  it("generates no services for an empty request", () => {
    const files = generateMicroserviceFiles(options({ services: [] }));

    expect(serviceDirectories(files)).toEqual([]);
  });

  it("still generates the gateway", () => {
    const files = generateMicroserviceFiles(options({ services: [] }));

    expect(files["apps/gateway/src/app.ts"]).toBeDefined();
  });

  it("names no example domain anywhere in the generated tree", () => {
    const files = generateMicroserviceFiles(options({ services: [] }));
    const everything = Object.keys(files).join("\n") + Object.values(files).join("\n");

    for (const name of DEMO_NAMES) {
      expect(everything).not.toContain(name);
    }
  });

  it("generates exactly the services requested", () => {
    const files = generateMicroserviceFiles(
      options({ services: ["billing", "search"] }),
    );

    expect(serviceDirectories(files).sort()).toEqual(["billing", "search"]);
  });

  it("resolves an empty request to an empty list", () => {
    expect(resolveMicroserviceServices([])).toEqual([]);
  });

  it("still drops the reserved gateway name and duplicates", () => {
    expect(resolveMicroserviceServices(["gateway", "billing", "billing"])).toEqual(
      ["billing"],
    );
  });

  it("tells the reader how to add one, with a command that works", () => {
    const files = generateMicroserviceFiles(options({ services: [] }));
    const readme = files["README.md"] ?? "";

    // `generate service` is refused in a microservice project, so the README
    // must not send the reader to it — it did, briefly, which is how a
    // generated file came to teach a command the CLI rejects.
    expect(readme).not.toContain("generate service");
    expect(readme).toContain("--architecture microservice --services");
    expect(readme).toContain("generate module <name> --service");
  });
});

describe("modular monolith — modules are created only when named", () => {
  const base = options({ architecture: "modular-monolith" });

  it("generates no modules for an empty request", () => {
    const files = generateModularMonolithFiles({ ...base, services: [] });

    expect(moduleDirectories(files)).toEqual([]);
  });

  it("names no example domain anywhere in the generated tree", () => {
    const files = generateModularMonolithFiles({ ...base, services: [] });
    const everything = Object.keys(files).join("\n") + Object.values(files).join("\n");

    for (const name of DEMO_NAMES) {
      expect(everything).not.toContain(name);
    }
  });

  it("generates exactly the modules requested", () => {
    const files = generateModularMonolithFiles({
      ...base,
      services: ["billing", "search"],
    });

    expect(moduleDirectories(files).sort()).toEqual(["billing", "search"]);
  });

  it("leaves an app that registers no modules rather than a broken one", () => {
    const files = generateModularMonolithFiles({ ...base, services: [] });

    expect(files["src/app.ts"]).toBeDefined();
    expect(files["src/app.ts"]).not.toContain("Module()");
    expect(files["src/modules/index.ts"]).toBe("\n");
  });

  it("tells the reader how to add one", () => {
    const files = generateModularMonolithFiles({ ...base, services: [] });

    expect(files["README.md"]).toContain("zudojs generate module <name>");
  });
});
