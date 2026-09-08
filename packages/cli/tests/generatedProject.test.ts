/**
 * zudojs-cli — Generated Project Tests
 *
 * Verifies that the project templates and infrastructure generator emit
 * projects that can actually install, build, and run.
 */

import { describe, it, expect, vi } from "vitest";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { InfrastructureGenerator } from "../src/generators/infrastructure/infrastructure.generator.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import type { ScaffoldOptions } from "../src/types/index.js";

vi.mock("../src/utils/utils.fileSystem.js", () => ({
  writeFileTree: vi.fn(async () => {}),
}));

function scaffoldOptions(overrides: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
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

const allTemplates: Array<[string, (o: ScaffoldOptions) => Record<string, string>]> = [
  ["monolith", generateMonolithFiles],
  ["modular-monolith", generateModularMonolithFiles],
  ["microservice", generateMicroserviceFiles],
];

describe.each(allTemplates)("%s template", (_name, generate) => {
  const files = generate(scaffoldOptions({ packageManager: "npm" }));
  const combined = Object.values(files).join("\n");

  it("does not emit workspace:* dependency versions", () => {
    expect(combined).not.toContain("workspace:*");
  });

  it("does not emit secret-scrubber artifacts", () => {
    expect(combined).not.toContain("SECRET_");
  });

  it("emits a working dev script", () => {
    expect(combined).not.toContain("node --import tsx watch");
    expect(combined).toContain("tsx watch src/server.ts");
  });

  it("emits build tsconfigs that produce dist output", () => {
    for (const [path, content] of Object.entries(files)) {
      if (!path.endsWith("tsconfig.json")) continue;
      expect(content, path).not.toContain('"noEmit"');
      expect(content, path).toContain('"outDir": "dist"');
      expect(content, path).toContain('"rootDir": "src"');
    }
  });

  it("pins the real @zudojs package version including runtime", () => {
    const packageJsons = Object.entries(files).filter(([p]) =>
      p.endsWith("package.json"),
    );
    const withZudojsDeps = packageJsons.filter(([, c]) =>
      c.includes("@zudojs/"),
    );
    expect(withZudojsDeps.length).toBeGreaterThan(0);
    for (const [path, content] of withZudojsDeps) {
      const pkg = JSON.parse(content) as {
        dependencies?: Record<string, string>;
      };
      const deps = pkg.dependencies ?? {};
      if (Object.keys(deps).length === 0) continue;
      expect(deps["@zudojs/runtime"], path).toBe("0.1.0");
      for (const [dep, version] of Object.entries(deps)) {
        if (dep.startsWith("@zudojs/")) {
          expect(version, `${path} → ${dep}`).toBe("0.1.0");
        }
      }
    }
  });
});

describe("monolith template", () => {
  it("aligns devDependency pins across templates", () => {
    for (const generate of [generateMonolithFiles, generateModularMonolithFiles]) {
      const files = generate(scaffoldOptions());
      const pkg = JSON.parse(files["package.json"]!) as {
        devDependencies: Record<string, string>;
      };
      expect(pkg.devDependencies).toMatchObject({
        tsx: "^4.7.0",
        typescript: "^5.7.0",
        "@types/node": "^24.0.0",
        vitest: "^3.0.0",
      });
    }
  });

  it("does not import unused logger in server.ts", () => {
    const files = generateMonolithFiles(scaffoldOptions());
    expect(files["src/server.ts"]).not.toContain('import { logger }');
    expect(files["src/server.ts"]).not.toContain("const server =");
  });
});

describe("microservice template", () => {
  const services = ["identity", "billing"];
  const files = generateMicroserviceFiles(
    scaffoldOptions({ architecture: "microservice", services }),
  );

  it("emits pnpm workspace globs matching the layout", () => {
    expect(files["pnpm-workspace.yaml"]).toContain("apps/gateway");
    expect(files["pnpm-workspace.yaml"]).toContain("apps/services/*");
  });

  it("emits a workspaces field instead of pnpm-workspace.yaml for npm", () => {
    const npmFiles = generateMicroserviceFiles(
      scaffoldOptions({
        architecture: "microservice",
        services,
        packageManager: "npm",
      }),
    );
    expect(npmFiles["pnpm-workspace.yaml"]).toBeUndefined();
    const pkg = JSON.parse(npmFiles["package.json"]!) as {
      workspaces?: string[];
    };
    expect(pkg.workspaces).toEqual(["apps/gateway", "apps/services/*"]);
  });

  it("assigns gateway port 3000 and service i port 3001+i consistently", () => {
    expect(files["docker-compose.yml"]).toContain('"3000:3000"');
    expect(files["docker-compose.yml"]).toContain('"3001:3001"');
    expect(files["docker-compose.yml"]).toContain('"3002:3002"');
    expect(files["README.md"]).toContain("**gateway** - Port 3000");
    expect(files["README.md"]).toContain("**identity** - Port 3001");
    expect(files["README.md"]).toContain("**billing** - Port 3002");
    expect(files["apps/services/identity/src/app.ts"]).toContain("port 3001");
    expect(files["apps/services/billing/src/app.ts"]).toContain("port 3002");
    expect(files["apps/services/identity/Dockerfile"]).toContain("EXPOSE 3001");
  });

  it("emits coherent Dockerfiles", () => {
    for (const path of [
      "apps/gateway/Dockerfile",
      "apps/services/identity/Dockerfile",
    ]) {
      const dockerfile = files[path]!;
      expect(dockerfile, path).not.toContain("npm ci");
      expect(dockerfile, path).not.toContain("tsconfig.base.json");
      expect(dockerfile, path).toContain("corepack enable && pnpm install");
      expect(dockerfile, path).toContain("node_modules ./node_modules");
    }
  });

  it("emits .gitignore entries on separate lines", () => {
    expect(files[".gitignore"]).toContain("*.log\n");
    expect(files[".gitignore"]).toContain(".data/\n");
    expect(files[".gitignore"]).not.toContain("*.log.data/");
  });

  it("emits service source files without stray leading spaces", () => {
    const app = files["apps/services/identity/src/app.ts"]!;
    for (const line of app.split("\n")) {
      expect(/^ [^ ]/.test(line), JSON.stringify(line)).toBe(false);
    }
  });
});

describe("InfrastructureGenerator", () => {
  async function generatedFiles(
    overrides: Partial<Parameters<InfrastructureGenerator["generate"]>[0]> = {},
  ): Promise<Record<string, string>> {
    const generator = new InfrastructureGenerator();
    vi.mocked(writeFileTree).mockClear();
    await generator.generate(
      {
        projectName: "test-project",
        architecture: "monolith",
        database: "postgresql",
        packageManager: "pnpm",
        ...overrides,
      },
      "/tmp",
    );
    return vi.mocked(writeFileTree).mock.calls[0]![1] as Record<string, string>;
  }

  it("writes service Dockerfiles under apps/services/", async () => {
    const files = await generatedFiles({
      architecture: "microservice",
      services: ["identity"],
    });
    expect(files["apps/services/identity/Dockerfile"]).toBeDefined();
    expect(files["apps/identity/Dockerfile"]).toBeUndefined();
  });

  it("maps microservice compose ports to 3001+i", async () => {
    const files = await generatedFiles({
      architecture: "microservice",
      services: ["a", "b"],
    });
    const compose = files["docker-compose.yml"]!;
    expect(compose).toContain('"3001:3001"');
    expect(compose).toContain('"3002:3002"');
    expect(compose).not.toContain('"3000:3000"');
  });

  it("emits mysql-specific env, image, port, and URL for mysql", async () => {
    const files = await generatedFiles({ database: "mysql" });
    const compose = files["docker-compose.yml"]!;
    expect(compose).toContain("image: mysql:8");
    expect(compose).toContain("3306:3306");
    expect(compose).toContain("MYSQL_ROOT_PASSWORD");
    expect(compose).toContain("mysql://");
    expect(compose).not.toContain("POSTGRES_");
    expect(compose).not.toContain("5432");
  });

  it("emits no db service for sqlite", async () => {
    const files = await generatedFiles({ database: "sqlite" });
    const compose = files["docker-compose.yml"]!;
    expect(compose).not.toContain("db:");
    expect(compose).not.toContain("depends_on");
    expect(compose).toContain("DATABASE_URL=sqlite:");
  });

  it("uses corepack for pnpm and plain npm install for npm", async () => {
    const pnpmFiles = await generatedFiles({ packageManager: "pnpm" });
    expect(pnpmFiles["Dockerfile"]).toContain("corepack enable && pnpm install");

    const npmFiles = await generatedFiles({ packageManager: "npm" });
    expect(npmFiles["Dockerfile"]).toContain("RUN npm install\n");
    expect(npmFiles["Dockerfile"]).not.toContain("--frozen-lockfile");
  });

  it("rejects invalid service names", async () => {
    const generator = new InfrastructureGenerator();
    await expect(
      generator.generate(
        {
          projectName: "p",
          architecture: "microservice",
          database: "postgresql",
          packageManager: "pnpm",
          services: ["ok", "bad;rm -rf /"],
        },
        "/tmp",
      ),
    ).rejects.toThrow(/Invalid service name/);
  });
});
