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
 * └── README.md
 * ```
 */

import type { ScaffoldOptions } from "../../types/index.js";
import { renderDatabaseEnv } from "../../adapters/databases/databaseAdapter.resolver.js";
import { ZUDOJS_PACKAGES_VERSION } from "../../constants/index.js";
import { normalizeName } from "../../utils/utils.name.js";
import {
  RUNTIME_APP_DEPENDENCIES,
  capabilityPackages,
  moduleSpec,
  renderAppFile,
  renderModuleFile,
  renderServerFile,
  renderPnpmWorkspaceFile,
  resolveProjectCapabilities,
} from "../shared/index.js";

export function generateModularMonolithFiles(
  options: ScaffoldOptions,
): Record<string, string> {
  const nameSlug = options.projectName
    .replace(/[^a-z0-9-]+/gi, "-")
    .toLowerCase();
  // Normalized: each name becomes a directory segment and a class name.
  //
  // An empty list generates no modules. This used to substitute three example
  // names (`identity`, `enrollment`, `assessment`), so every modular monolith
  // arrived with three domains nobody asked for. Modules are created when they
  // are named — with `--services`, or later with `zudojs generate module <name>`.
  const modules = options.services
    .map((m) => normalizeName(m))
    .filter((m) => m.length > 0);

  // Recorded in package.json and backed by the packages below, so the
  // `zudojs doctor` feature check has something real to verify. The
  // architecture's own CQRS structure means cqrs/messaging are always
  // installed, whether or not they were requested as capabilities.
  const capabilities = resolveProjectCapabilities(options);

  const deps = [
    ...RUNTIME_APP_DEPENDENCIES,
    "@zudojs/config",
    "@zudojs/errors",
    "@zudojs/types",
    "@zudojs/validation",
    "@zudojs/cqrs",
    "@zudojs/messaging",
    "@zudojs/http",
    ...capabilityPackages(capabilities),
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
          features: capabilities,
        },
        scripts: {
          dev: "tsx watch src/server.ts",
          start: "node dist/server.js",
          build: "tsc",
          typecheck: "tsc --noEmit",
          test: "vitest run",
        },
        dependencies: Object.fromEntries(
          [...new Set(deps)].map((d) => [d, ZUDOJS_PACKAGES_VERSION]),
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

  if (options.packageManager === "pnpm") {
    files["pnpm-workspace.yaml"] = renderPnpmWorkspaceFile();
  }

  files[".env.example"] = `NODE_ENV=development
PORT=3000
${renderDatabaseEnv(options.database, nameSlug)}
`;

  files[".gitignore"] = `node_modules/
dist/
.env
*.log
`;

  files["README.md"] = `# ${options.projectName}

A modular monolith built with the Zudojs framework.

## Architecture

This project uses a **modular monolith** architecture.

${
  modules.length > 0
    ? `Modules:

${modules.map((m) => `- **${m}**`).join("\n")}`
    : `No modules yet. Add one with:

\`\`\`bash
npx zudojs generate module <name>
\`\`\``
}

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

  const moduleSpecs = modules.map((m) =>
    moduleSpec(m, `./modules/${m}/index.js`),
  );

  files["src/app.ts"] = renderAppFile({
    applicationName: nameSlug,
    modules: moduleSpecs,
  });

  files["src/server.ts"] = renderServerFile();

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
  for (const spec of moduleSpecs) {
    files[`src/modules/${spec.name}/index.ts`] =
      `export { ${spec.className} } from "./${spec.name}.module.js";\n`;

    files[`src/modules/${spec.name}/${spec.name}.module.ts`] = renderModuleFile({
      module: spec,
    });

    // CQRS structure
    files[`src/modules/${spec.name}/commands/index.ts`] = ``;
    files[`src/modules/${spec.name}/queries/index.ts`] = ``;
  }

  // The name must match vitest's default `include`
  // (`**/*.{test,spec}.?(c|m)[jt]s?(x)`); `tests/index.ts` did not.
  files["tests/app.test.ts"] = `import { describe, it, expect } from "vitest";

describe("Application", () => {
  it("should bootstrap correctly", () => {
    expect(true).toBe(true);
  });
});
`;

  return files;
}
