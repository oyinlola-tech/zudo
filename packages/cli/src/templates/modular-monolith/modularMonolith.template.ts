/**
 * zudojs-cli — Modular Monolith Template
 *
 * Generated structure:
 * ```
 * project/
 * ├── src/
 * │   ├── index.ts
 * │   ├── app.ts
 * │   ├── server.ts
 * │   ├── configs/
 * │   ├── constants/
 * │   ├── databases/
 * │   ├── errors/
 * │   ├── events/
 * │   ├── interfaces/
 * │   ├── loaders/
 * │   ├── middlewares/
 * │   ├── types/
 * │   ├── utils/
 * │   ├── validators/
 * │   └── modules/
 * │       └── identity/
 * │           ├── index.ts
 * │           ├── commands/
 * │           ├── queries/
 * │           └── events/
 * ├── tests/
 * ├── package.json
 * ├── tsconfig.json
 * ├── zudojs.config.ts
 * └── README.md
 * ```
 */

import type { ScaffoldOptions } from "../../types/index.js";
import { ZUDOJS_PACKAGES_VERSION } from "../../constants/index.js";

export function generateModularMonolithFiles(
  options: ScaffoldOptions,
): Record<string, string> {
  const nameSlug = options.projectName
    .replace(/[^a-z0-9-]+/gi, "-")
    .toLowerCase();
  const modules =
    options.services.length > 0
      ? options.services
      : ["identity", "enrollment", "assessment"];

  const deps = [
    "@zudojs/core",
    "@zudojs/runtime",
    "@zudojs/container",
    "@zudojs/config",
    "@zudojs/logger",
    "@zudojs/errors",
    "@zudojs/constants",
    "@zudojs/types",
    "@zudojs/validation",
    "@zudojs/cqrs",
    "@zudojs/events",
    "@zudojs/messaging",
    "@zudojs/http",
  ];

  const devDeps: Record<string, string> = {
    tsx: "^4.7.0",
    typescript: "^5.7.0",
    "@types/node": "^24.0.0",
    vitest: "^3.0.0",
  };

  const files: Record<string, string> = {};

  // package.json
  files["package.json"] =
    JSON.stringify(
      {
        name: nameSlug,
        version: "0.1.0",
        private: true,
        type: "module",
        license: "MIT",
        zudojs: {
          projectType: "backend",
          architecture: "modular-monolith",
          features: [],
        },
        scripts: {
          dev: "tsx watch src/server.ts",
          start: "node dist/server.js",
          build: "tsc",
          typecheck: "tsc --noEmit",
          test: "vitest run",
        },
        dependencies: Object.fromEntries(
          deps.map((d) => [d, ZUDOJS_PACKAGES_VERSION]),
        ),
        devDependencies: devDeps,
      },
      null,
      2,
    ) + "\n";

  files["tsconfig.json"] = `{
  "compilerOptions": {
    "target": "ES2024",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "lib": ["ES2024"],
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
`;

  files[".env.example"] = `NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://localhost:5432/${nameSlug}
`;

  files[".gitignore"] = `node_modules/
dist/
.env
*.log
`;

  files["README.md"] = `# ${options.projectName}

A modular monolith built with the Zudojs framework.

## Architecture

This project uses a **modular monolith** architecture with the following modules:

${modules.map((m) => `- **${m}**`).join("\n")}

## Getting Started

\`\`\`bash
${options.packageManager === "npm" ? "npm run dev" : options.packageManager === "yarn" ? "yarn dev" : options.packageManager === "bun" ? "bun run dev" : "pnpm run dev"}
\`\`\`

## License

MIT
`;

  // Shared source directories
  files["src/index.ts"] = `export { createApp } from "./app.js";
`;

  files["src/app.ts"] = `import { logger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";

export async function createApp() {
  const log = logger.child({ service: "app" });
  const container = createContainer();

  log.info("${nameSlug} v0.1.0 starting...");

  return {
    container,
    listen: async () => {
      log.info("Server started");
    },
    stop: async () => {
      log.info("Shutting down...");
    },
  };
}
`;

  files["src/server.ts"] = `import { createApp } from "./app.js";
import { createRuntime } from "@zudojs/runtime";

const app = await createApp();

const runtime = createRuntime({
  onShutdown: async () => {
    await app.stop();
  },
});

await runtime.start();
await app.listen();

process.on("SIGTERM", async () => {
  await runtime.stop();
  process.exit(0);
});
`;

  const sharedDirs = [
    "configs",
    "constants",
    "controllers",
    "databases",
    "dtos",
    "enums",
    "errors",
    "events",
    "interfaces",
    "jobs",
    "loaders",
    "loggers",
    "middlewares",
    "models",
    "repositories",
    "routes",
    "services",
    "types",
    "utils",
    "validators",
  ];

  for (const dir of sharedDirs) {
    files[`src/${dir}/index.ts`] = "";
  }

  files["src/modules/index.ts"] =
    modules.map((m) => `export * from "./${m}/index.js";`).join("\n") + "\n";

  // Generate each module with CQRS structure
  for (const mod of modules) {
    const modName = mod!;
    const modNamePascal = modName
      .replace(/-([a-z])/g, (_m: string, c: string) => c.toUpperCase())
      .replace(/^./, (c: string) => c.toUpperCase());

    files[`src/modules/${modName}/index.ts`] =
      `export { ${modNamePascal}Module } from "./${modName}.module.js";
`;

    files[`src/modules/${modName}/${modName}.module.ts`] =
      `import { logger } from "@zudojs/logger";

export class ${modNamePascal}Module {
  private readonly log = logger.child({ module: "${modName}" });

  id = "${modName}-module";

  initialize() {
    this.log.info("${modName} module initialized");
  }
}
`;

    // CQRS structure
    files[`src/modules/${modName}/commands/index.ts`] = ``;
    files[`src/modules/${modName}/queries/index.ts`] = ``;
  }

  files["tests/index.ts"] = `import { describe, it, expect } from "vitest";

describe("Application", () => {
  it("should bootstrap correctly", () => {
    expect(true).toBe(true);
  });
});
`;

  return files;
}
