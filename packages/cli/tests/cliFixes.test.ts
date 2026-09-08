/**
 * zudojs-cli — Regression tests for CLI-level fixes.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIParser } from "../src/cliParser/cliParser.core.js";
import {
  isHelpRequest,
  isVersionRequest,
} from "../src/cliApplication/cliApplication.builtins.js";
import {
  normalizeName,
  toPascalCase,
  toCamelCase,
} from "../src/utils/utils.name.js";
import { mergeBarrelExport } from "../src/utils/utils.fileSystem.js";
import { generateEvent } from "../src/generators/event/event.generator.js";
import { generateRoute } from "../src/generators/route/route.generator.js";
import type { CLICommand } from "../src/cliType/cliType.type.js";

describe("CLIParser option defaults", () => {
  const command: CLICommand = {
    name: "create",
    options: [
      { name: "services", type: "string", defaultValue: "gateway,api" },
      { name: "type", type: "string", defaultValue: "backend" },
      { name: "dry-run", type: "boolean", defaultValue: false },
    ],
    execute: () => {},
  };

  it("applies documented defaultValues for absent options", () => {
    const result = new CLIParser().parse([], command);
    expect(result.options.services).toBe("gateway,api");
    expect(result.options.type).toBe("backend");
    expect(result.options["dry-run"]).toBe(false);
  });

  it("does not override explicitly provided options", () => {
    const result = new CLIParser().parse(["--services", "a,b"], command);
    expect(result.options.services).toBe("a,b");
    expect(result.options.type).toBe("backend");
  });
});

describe("help/version detection", () => {
  it("only matches -v/-h as the first argument", () => {
    expect(isVersionRequest(["-v"])).toBe(true);
    expect(isVersionRequest(["--version"])).toBe(true);
    expect(isVersionRequest(["create", "-v"])).toBe(false);
    expect(isHelpRequest(["-h"])).toBe(true);
    expect(isHelpRequest(["generate", "--help"])).toBe(false);
  });
});

describe("name utilities", () => {
  it("normalizes arbitrary input to safe identifiers", () => {
    expect(normalizeName("User Signup!")).toBe("user-signup");
    expect(toPascalCase("user-signup")).toBe("UserSignup");
    expect(toCamelCase("send email")).toBe("sendEmail");
  });
});

describe("schematic generators use normalized names", () => {
  it("interpolates a safe identifier for events", async () => {
    const files = await generateEvent(
      { name: "user created!", basePath: "src", dryRun: true },
      "/nonexistent",
    );
    expect(files).toEqual(["src/events/user-created.event.ts"]);
  });

  it("writes nothing when dryRun is set", async () => {
    const files = await generateRoute(
      { name: "Health Check", basePath: "src", dryRun: true },
      "/nonexistent/path/that/cannot/be/written",
    );
    expect(files).toEqual(["src/routes/health-check.route.ts"]);
  });
});

describe("mergeBarrelExport", () => {
  it("appends to existing barrels without losing prior exports", () => {
    const dir = mkdtempSync(join(tmpdir(), "zudojs-barrel-"));
    try {
      writeFileSync(
        join(dir, "index.ts"),
        `export { A } from "./a.js";\n`,
      );

      const merged = mergeBarrelExport(
        dir,
        "index.ts",
        `export { B } from "./b.js";`,
      );
      expect(merged).toContain(`export { A } from "./a.js";`);
      expect(merged).toContain(`export { B } from "./b.js";`);

      // Idempotent for an already-present export.
      writeFileSync(join(dir, "index.ts"), merged);
      const again = mergeBarrelExport(
        dir,
        "index.ts",
        `export { B } from "./b.js";`,
      );
      expect(again).toBe(merged);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates fresh content when the barrel does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "zudojs-barrel-"));
    try {
      const merged = mergeBarrelExport(
        dir,
        "index.ts",
        `export { C } from "./c.js";`,
      );
      expect(merged).toBe(`export { C } from "./c.js";\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
