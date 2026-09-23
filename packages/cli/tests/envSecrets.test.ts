/**
 * zudojs-cli — no generated `.env.example` carries a usable-looking secret.
 *
 * zudojs-cli 2.0.1 scaffolded `JWT_SECRET=change-this-in-production`, and
 * the fullstack root and `zudojs add docker` wrote
 * `POSTGRES_PASSWORD=change-me` / `MYSQL_ROOT_PASSWORD=change-me`. A copied
 * `.env.example` then ships a password anyone can guess. Every secret
 * variable is now empty, under a comment saying where its value comes
 * from; docker compose refuses to start while it is empty (`${VAR:?…}`).
 *
 * This test creates every architecture with every database, applies every
 * `zudojs add` recipe, and scans each `.env*` file it finds.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAddCommand } from "../src/commands/add.command.js";
import { runCreateCommand } from "../src/commands/create.command.js";
import { FEATURE_NAMES } from "../src/constants/index.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";

const root = mkdtempSync(join(tmpdir(), "zudojs-env-secrets-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

function context(cwd: string, values: Record<string, unknown>, args: string[] = []): CLIContext {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn() };
  return {
    args,
    values: values as CLIContext["values"],
    cwd,
    env: {},
    logger: logger as unknown as CLIContext["logger"],
  };
}

async function create(name: string, values: Record<string, string>): Promise<string> {
  const args = Object.keys(values).map((key) => `--${key}`);
  await runCreateCommand(
    context(root, { "project-name": name, "no-install": true, "no-git": true, ...values }, args),
  );
  return join(root, name);
}

/** Applies every `zudojs add` feature; ones a project cannot take are skipped. */
async function addEverything(project: string): Promise<void> {
  for (const feature of FEATURE_NAMES) {
    await runAddCommand(context(project, { feature, "skip-install": true })).catch(() => undefined);
  }
}

/** Every `.env*` file under `dir`, skipping node_modules. */
function envFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : envFiles(path);
    return entry.name.startsWith(".env") ? [path] : [];
  });
}

const SECRET_NAME = /(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)$/i;
const PLACEHOLDER = /change[-_ ]?(me|this)|changeme|replace[-_ ]?me|your[-_ ]|placeholder|^(secret|password|test|example)$/i;
const CREDENTIALS_IN_URL = /\/\/[^/@\s:]+:[^/@\s$]+@/;

let files: string[] = [];

beforeAll(async () => {
  for (const database of ["postgresql", "mysql", "sqlite"]) {
    for (const architecture of ["monolith", "modular-monolith", "microservice"]) {
      await create(`b-${architecture}-${database}`, {
        type: "backend",
        architecture,
        database,
        services: "users",
      });
    }
    await create(`f-${database}`, { type: "fullstack", frontend: "vanilla", database });
  }
  for (const project of ["b-monolith-postgresql", "b-microservice-postgresql", "b-monolith-mysql", "f-postgresql"]) {
    await addEverything(join(root, project));
  }
  files = envFiles(root);
}, 240_000);

describe("generated .env files hold no placeholder secrets", () => {
  it("found the files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("leaves every secret variable empty, under a comment", () => {
    const problems: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, index) => {
        const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
        if (!match || !SECRET_NAME.test(match[1]!)) return;
        if (match[2] !== "") problems.push(`${file}: ${line}`);
        if (!lines[index - 1]?.startsWith("#")) problems.push(`${file}: ${match[1]} has no comment`);
      });
    }
    expect(problems).toEqual([]);
  });

  it("writes no placeholder values or credentials in URLs", () => {
    const problems: string[] = [];
    for (const file of files) {
      for (const line of readFileSync(file, "utf-8").split("\n")) {
        const value = /^[A-Z0-9_]+=(.*)$/.exec(line)?.[1];
        if (value === undefined) continue;
        if (PLACEHOLDER.test(value) || CREDENTIALS_IN_URL.test(value)) problems.push(`${file}: ${line}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("says how to generate the compose database passwords", () => {
    const fullstack = readFileSync(join(root, "f-postgresql", ".env.example"), "utf-8");
    expect(fullstack).toContain("# Password for the docker-compose.yml database; generate with: openssl rand -hex 32\nPOSTGRES_PASSWORD=\n");
    expect(fullstack).toContain("DATABASE_URL=postgresql://localhost:5432/f-postgresql");
    expect(readFileSync(join(root, "f-mysql", ".env.example"), "utf-8")).toContain("\nMYSQL_ROOT_PASSWORD=\n");
    expect(readFileSync(join(root, "b-monolith-postgresql", ".env.example"), "utf-8")).toContain(
      "generate with: openssl rand -hex 32\nPOSTGRES_PASSWORD=\n",
    );
  });

  it("does not give a MySQL project a Postgres container or password", () => {
    const project = join(root, "b-monolith-mysql");
    expect(existsSync(join(project, "compose.yaml"))).toBe(true);
    expect(readFileSync(join(project, "compose.yaml"), "utf-8")).not.toContain("postgres");
    expect(readFileSync(join(project, ".env.example"), "utf-8")).not.toContain("POSTGRES_PASSWORD");
  });
});
