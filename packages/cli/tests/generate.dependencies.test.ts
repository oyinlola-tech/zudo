import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeName, toPascalCase } from "../src/utils/utils.name.js";
import {
  describeAddedDependencies,
  ensureZudojsDependencies,
  fileCount,
  importedZudojsPackages,
} from "../src/wiring/index.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(deps: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "zudo-deps-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", dependencies: deps }));
  mkdirSync(join(root, "src/commands"), { recursive: true });
  return root;
}

describe("generated code dependencies", () => {
  it("finds @zudojs imports, including type-only and subpath imports", () => {
    expect(
      importedZudojsPackages(
        'import type { BaseCommand } from "@zudojs/cqrs";\nimport { x } from "@zudojs/http/sub";\nimport y from "zod";',
      ),
    ).toEqual(["@zudojs/cqrs", "@zudojs/http"]);
  });

  it("adds a missing @zudojs package to the owning package.json and keeps existing ones", () => {
    const root = project({ "@zudojs/logger": "^1.0.0" });
    writeFileSync(
      join(root, "src/commands/a.ts"),
      'import type { BaseCommand } from "@zudojs/cqrs";\nimport { createLogger } from "@zudojs/logger";',
    );
    const edits = ensureZudojsDependencies(root, ["src/commands/a.ts"]);
    expect(edits).toEqual([{ packageJson: "package.json", added: ["@zudojs/cqrs"] }]);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@zudojs/cqrs"]).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies["@zudojs/logger"]).toBe("^1.0.0");
    expect(describeAddedDependencies(edits)[0]).toBe("Added @zudojs/cqrs to package.json.");
  });

  it("changes nothing when every import is already a dependency", () => {
    const root = project({ "@zudojs/cqrs": "^1.0.0" });
    writeFileSync(join(root, "src/commands/a.ts"), 'import type { X } from "@zudojs/cqrs";');
    expect(ensureZudojsDependencies(root, ["src/commands/a.ts"])).toEqual([]);
  });
});

describe("generator naming and wording", () => {
  it("keeps camelCase word boundaries", () => {
    expect(normalizeName("createBook")).toBe("create-book");
    expect(toPascalCase("createBook")).toBe("CreateBook");
    expect(normalizeName("HTTPServer")).toBe("http-server");
    expect(normalizeName("user-profile")).toBe("user-profile");
  });

  it("uses the singular for one file", () => {
    expect(fileCount(1)).toBe("1 file");
    expect(fileCount(3)).toBe("3 files");
  });
});
