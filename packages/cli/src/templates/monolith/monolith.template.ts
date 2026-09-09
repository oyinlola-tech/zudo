/**
 * zudojs-cli — Monolith Templates
 *
 * Template file generators for monolith architecture projects.
 *
 * Generated structure:
 * ```
 * project/
 * ├── src/
 * │   ├── index.ts      # exports only
 * │   ├── app.ts        # application assembly
 * │   ├── server.ts     # entry point
 * │   ├── configs/
 * │   ├── constants/
 * │   ├── controllers/
 * │   ├── databases/
 * │   ├── dtos/
 * │   ├── enums/
 * │   ├── errors/
 * │   ├── events/
 * │   ├── interfaces/
 * │   ├── jobs/
 * │   ├── loaders/
 * │   ├── loggers/
 * │   ├── middlewares/
 * │   ├── models/
 * │   ├── modules/
 * │   ├── repositories/
 * │   ├── routes/
 * │   ├── services/
 * │   ├── types/
 * │   ├── utils/
 * │   └── validators/
 * ├── tests/
 * ├── package.json
 * ├── tsconfig.json
 * ├── zudojs.config.ts
 * └── README.md
 * ```
 */

import type { ScaffoldOptions } from "../../types/index.js";
import { ZUDOJS_PACKAGES_VERSION } from "../../constants/index.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";
import {
  RUNTIME_APP_DEPENDENCIES,
  moduleSpec,
  renderAppFile,
  renderModuleFile,
  renderServerFile,
  renderServiceFile,
  renderZudojsConfig,
} from "../shared/index.js";

export function generateMonolithFiles(
  options: ScaffoldOptions,
): Record<string, string> {
  const name = options.projectName;
  const nameSlug = name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

  const deps = [
    ...RUNTIME_APP_DEPENDENCIES,
    "@zudojs/config",
    "@zudojs/errors",
    "@zudojs/types",
    "@zudojs/validation",
    "@zudojs/schema",
    "@zudojs/http",
  ];

  if (options.enableCQRS) {
    deps.push("@zudojs/cqrs", "@zudojs/events", "@zudojs/messaging");
  }

  if (options.enableDatabase) {
    deps.push("@zudojs/database");
  }

  if (options.enableQueue) {
    deps.push("@zudojs/queue");
  }

  if (options.enableObservability) {
    deps.push("@zudojs/observability");
  }

  if (options.enableOpenAPI) {
    deps.push("@zudojs/openapi");
  }

  const devDeps: Record<string, string> = {
    tsx: "^4.7.0",
    typescript: "^5.7.0",
    "@types/node": "^24.0.0",
    vitest: "^3.0.0",
  };

  const files: Record<string, string> = {};

  // Root files
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
          architecture: "monolith",
          features: [],
        },
        scripts: {
          dev: "tsx watch src/server.ts",
          start: "node dist/server.js",
          build: "tsc",
          typecheck: "tsc --noEmit",
          test: "vitest run",
          lint: "tsc --noEmit",
        },
        dependencies: Object.fromEntries(
          [...new Set(deps)].map((d) => [d, ZUDOJS_PACKAGES_VERSION]),
        ),
        devDependencies: devDeps,
      },
      null,
      2,
    ) + "\n";

  // tsconfig
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

  files["zudojs.config.ts"] = renderZudojsConfig({
    projectName: nameSlug,
    projectType: "backend",
    architecture: "monolith",
  });

  // Environment
  files[".env.example"] = `NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://localhost:5432/${nameSlug}
JWT_SECRET=change-this-in-production
`;

  files[".gitignore"] = `node_modules/
dist/
.env
*.log
.DS_Store
`;

  files["README.md"] = `# ${name}

A Zudojs framework application.

## Getting Started

\`\`\`bash
${options.packageManager === "npm" ? "npm run dev" : options.packageManager === "yarn" ? "yarn dev" : options.packageManager === "bun" ? "bun run dev" : "pnpm run dev"}
\`\`\`

## Structure

\`\`\`
src/
├── server.ts        # Entry point
├── app.ts           # Application assembly
├── configs/         # Configuration
├── constants/       # Shared constants
├── controllers/     # HTTP controllers
├── databases/       # Database connections
├── dtos/            # Data transfer objects
├── enums/           # Enumerations
├── errors/          # Error types
├── events/          # Domain events
├── interfaces/      # Shared interfaces
├── jobs/            # Background jobs
├── loaders/         # Module loaders
├── loggers/         # Logger configuration
├── middlewares/     # HTTP middleware
├── models/          # Data models
├── modules/         # Runtime modules
├── repositories/    # Data repositories
├── routes/          # HTTP routes
├── services/        # Application services
├── types/           # Shared types
├── utils/           # Utilities
└── validators/      # Input validators
\`\`\`

## License

MIT
`;

  // src/ entry points
  files["src/index.ts"] = `export { createApp } from "./app.js";
`;

  files["src/server.ts"] = renderServerFile();

  // Normalized: the name becomes a file path segment and a class name.
  const moduleName = normalizeName(options.services[0] ?? "app") || "app";
  const serviceClassName = `${toPascalCase(moduleName)}Service`;
  const appModule = moduleSpec(moduleName, "./modules/index.js");

  files["src/app.ts"] = renderAppFile({
    applicationName: nameSlug,
    modules: [appModule],
  });

  files[`src/modules/${moduleName}.module.ts`] = renderModuleFile({
    module: appModule,
    service: {
      className: serviceClassName,
      importPath: "../services/index.js",
    },
  });

  files["src/modules/index.ts"] =
    `export { ${appModule.className} } from "./${moduleName}.module.js";\n`;

  // Shared directories with empty index.ts
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
    "types",
    "utils",
    "validators",
  ];

  for (const dir of sharedDirs) {
    files[`src/${dir}/index.ts`] = "";
  }

  // Services
  files[`src/services/${moduleName}.service.ts`] = renderServiceFile(moduleName);

  files["src/services/index.ts"] =
    `export { ${serviceClassName} } from "./${moduleName}.service.js";\n`;

  // Controllers
  files["src/controllers/health.controller.ts"] =
    `export class HealthController {
  check() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
`;

  files["src/controllers/index.ts"] =
    `export { HealthController } from "./health.controller.js";
`;

  // Tests
  files["tests/index.ts"] = `import { describe, it, expect } from "vitest";

describe("Application", () => {
  it("should be configured correctly", () => {
    expect(true).toBe(true);
  });
});
`;

  return files;
}
