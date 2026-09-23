/**
 * `zudojs add <feature>` writes a working recipe for every feature it
 * accepts, not just the dependency.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runAddCommand } from "../src/commands/add.command.js";
import { FEATURE_ALIASES, FEATURE_NAMES, FEATURE_PACKAGES } from "../src/constants/index.js";
import { ManifestManager } from "../src/manifest/manifestManager.core.js";
import { FEATURE_RECIPES, resolveFeatureRecipe } from "../src/recipes/index.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function project(architecture: "monolith" | "microservice", database = "postgresql"): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "zudojs-add-"));
  dirs.push(root);
  const services = architecture === "microservice" ? ["identity"] : [];
  const options = {
    projectName: "shop", projectType: "backend", architecture, packageManager: "pnpm", database,
    api: "rest", services, enableCQRS: false, enableMessaging: false, enableObservability: false,
    enableOpenAPI: false, enableDatabase: false, enableQueue: false, enableDocker: false,
    installDeps: false, initGit: false,
  } as ScaffoldOptions;
  await writeFileTree(root, (architecture === "monolith" ? generateMonolithFiles : generateMicroserviceFiles)(options));
  await new ManifestManager(root).create({
    version: "1.0.0", projectType: "backend", architecture, backend: { architecture, api: "rest" },
    database: { provider: database }, workspace: { packageManager: "pnpm" }, capabilities: [],
    ...(services.length > 0 ? { services } : {}),
  });
  return root;
}

function context(cwd: string, values: Record<string, unknown>): CLIContext {
  return {
    args: [], values: { "skip-install": true, ...values } as CLIContext["values"], cwd, env: {},
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn() } as unknown as CLIContext["logger"],
  };
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf-8");

describe("recipe registry", () => {
  it("has a recipe for every feature add accepts, and nothing else", () => {
    expect(Object.keys(FEATURE_RECIPES).sort()).toEqual(Object.keys(FEATURE_PACKAGES).sort());
    expect([...FEATURE_NAMES].sort()).toEqual(Object.keys(FEATURE_RECIPES).sort());
  });

  it("resolves aliases and refuses docs/security with a reason", () => {
    expect(resolveFeatureRecipe("postgres").feature).toBe("database");
    for (const alias of Object.keys(FEATURE_ALIASES)) expect(resolveFeatureRecipe(alias)).toBeDefined();
    expect(() => resolveFeatureRecipe("docs")).toThrow(/documentation sites/);
    expect(() => resolveFeatureRecipe("security")).toThrow(/built in/);
    expect(() => resolveFeatureRecipe("__proto__")).toThrow(/Unknown feature/);
  });
});

describe("zudojs add (monolith)", () => {
  it("redis: integration, registration, config, env and dependency", async () => {
    const root = await project("monolith");
    await runAddCommand(context(root, { feature: "redis" }));
    expect(read(root, "src/integrations/redis.ts")).toContain("createClient");
    expect(read(root, "src/integrations/index.ts")).toContain('import { redisIntegration } from "./redis.js";');
    expect(read(root, "src/integrations/index.ts")).toContain("redisIntegration,");
    expect(read(root, "src/configs/index.ts")).toContain('redis: Object.freeze({ url: text(config, "redis_url"');
    expect(read(root, ".env.example")).toContain("REDIS_URL=redis://localhost:6379");
    const pkg = JSON.parse(read(root, "package.json")) as { dependencies: Record<string, string>; zudojs: { features: string[] } };
    expect(pkg.dependencies["redis"]).toMatch(/^\^6\./);
    expect(pkg.zudojs.features).toContain("redis");
    expect((await new ManifestManager(root).read())?.capabilities).toContain("redis");
  });

  it("is idempotent: adding a feature twice changes nothing the second time", async () => {
    const root = await project("monolith");
    await runAddCommand(context(root, { feature: "websockets" }));
    const snapshot = ["src/integrations/index.ts", "src/configs/index.ts", ".env.example", "package.json"].map((p) => read(root, p));
    await runAddCommand(context(root, { feature: "ws" }));
    expect(["src/integrations/index.ts", "src/configs/index.ts", ".env.example", "package.json"].map((p) => read(root, p))).toEqual(snapshot);
    expect(read(root, "src/integrations/websockets.ts")).toContain("verifyClient");
    const pkg = JSON.parse(read(root, "package.json")) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies["@types/ws"]).toBeDefined();
  });

  it("email: transport abstraction with console and SMTP, no secrets in source", async () => {
    const root = await project("monolith");
    await runAddCommand(context(root, { feature: "email" }));
    const source = read(root, "src/integrations/email.ts");
    expect(source).toContain("export interface EmailTransport");
    expect(source).toContain("consoleTransport");
    expect(source).toContain("createTransport");
    expect(read(root, ".env.example")).toContain("SMTP_PASSWORD=");
    expect(read(root, "src/configs/index.ts")).toContain('smtpPassword: text(config, "smtp_password", "")');
  });

  it("database: Prisma schema, config, client, scripts and build allow-list", async () => {
    const root = await project("monolith");
    await runAddCommand(context(root, { feature: "postgres" }));
    expect(read(root, "prisma/schema.prisma")).toContain('provider            = "prisma-client"');
    expect(read(root, "prisma.config.ts")).toContain("defineConfig");
    expect(read(root, "src/integrations/database.ts")).toContain("new PrismaPg(");
    const pkg = JSON.parse(read(root, "package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };
    expect(pkg.devDependencies["prisma"]).toBe("^7.10.0");
    expect(pkg.dependencies["@prisma/client"]).toBe("^7.10.0");
    expect(pkg.scripts["build"]).toBe("prisma generate && tsc");
    expect(pkg.scripts["db:migrate"]).toBe("prisma migrate dev");
    expect(read(root, "pnpm-workspace.yaml")).toContain('"prisma": true');
    expect(read(root, ".gitignore")).toContain("src/generated/");
  });

  it("database: refuses engines the recipe does not support, before writing anything", async () => {
    const root = await project("monolith", "mysql");
    const before = read(root, "package.json");
    await expect(runAddCommand(context(root, { feature: "database" }))).rejects.toThrow(/PostgreSQL only/);
    expect(read(root, "package.json")).toBe(before);
    expect(existsSync(join(root, "prisma"))).toBe(false);
  });

  it("openapi: mounts the document in server.ts", async () => {
    const root = await project("monolith");
    expect(read(root, "src/server.ts")).not.toContain("mountOpenAPI(router");
    await runAddCommand(context(root, { feature: "openapi" }));
    expect(read(root, "src/server.ts")).toContain("mountOpenAPI(router");
  });

  it("docker: non-root multi-stage Dockerfile and compose without credentials", async () => {
    const root = await project("monolith");
    await runAddCommand(context(root, { feature: "redis" }));
    await runAddCommand(context(root, { feature: "database" }));
    await runAddCommand(context(root, { feature: "docker" }));
    const dockerfile = read(root, "Dockerfile");
    expect(dockerfile).toContain("FROM node:24-alpine AS build");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("COPY prisma ./prisma");
    const compose = read(root, "compose.yaml");
    expect(compose).toContain("image: redis:8-alpine");
    expect(compose).toContain("image: postgres:17-alpine");
    expect(compose).toContain("${POSTGRES_PASSWORD:?");
    expect(compose).toContain('"127.0.0.1:5432:5432"');
    expect(compose).not.toMatch(/POSTGRES_PASSWORD: [a-z]/);
    expect(read(root, ".env.example")).toMatch(/generate with: openssl rand -hex 32\nPOSTGRES_PASSWORD=\n/);
    expect(read(root, ".dockerignore")).toContain(".env");
  });
});

describe("zudojs add (microservice)", () => {
  it("applies an app recipe to every app, or to one with --service", async () => {
    const root = await project("microservice");
    await runAddCommand(context(root, { feature: "cache", service: "identity" }));
    expect(existsSync(join(root, "apps/services/identity/src/integrations/cache.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/gateway/src/integrations/cache.ts"))).toBe(false);
    await runAddCommand(context(root, { feature: "queue" }));
    expect(read(root, "apps/gateway/src/integrations/index.ts")).toContain("queueIntegration,");
    expect(read(root, "apps/services/identity/src/integrations/index.ts")).toContain("queueIntegration,");
    expect(read(root, "apps/services/identity/.env.example")).toContain("QUEUE_CONCURRENCY=5");
  });

  it("rewrites unedited CLI Dockerfiles when Prisma is added, never edited ones", async () => {
    const root = await project("microservice");
    const edited = `${read(root, "apps/gateway/Dockerfile")}# mine\n`;
    await writeFileTree(root, { "apps/gateway/Dockerfile": edited });
    expect(read(root, "apps/services/identity/Dockerfile")).toContain("USER node");
    expect(read(root, "apps/services/identity/Dockerfile")).not.toContain("prisma");
    await runAddCommand(context(root, { feature: "database" }));
    expect(read(root, "apps/services/identity/Dockerfile")).toContain("COPY apps/services/identity/prisma ./prisma");
    expect(read(root, "apps/gateway/Dockerfile")).toBe(edited);
  });
});
