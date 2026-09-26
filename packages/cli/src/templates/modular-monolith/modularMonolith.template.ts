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
import { zudojsDependencies } from "../../constants/index.js";
import { normalizeName } from "../../utils/utils.name.js";
import {
  RUNTIME_APP_DEPENDENCIES,
  capabilityPackages,
  moduleSpec,
  renderModuleFile,
  renderPnpmWorkspaceFile,
  resolveProjectCapabilities,
} from "../shared/index.js";
import {
  APP_SOURCE_DEPENDENCIES,
  APP_TEST_DEPENDENCIES,
  applyDatabaseSetting,
  backendAppScripts,
  backendDevDependencies,
  backendTsconfigFiles,
  emptyBarrels,
  renderBackendAppSource,
  runCommand,
} from "../backendApp/index.js";

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
    ...APP_SOURCE_DEPENDENCIES,
    "@zudojs/types",
    "@zudojs/validation",
    "@zudojs/cqrs",
    "@zudojs/messaging",
    ...capabilityPackages(capabilities),
  ];

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
        scripts: backendAppScripts(),
        dependencies: zudojsDependencies(deps),
        devDependencies: {
          ...backendDevDependencies(),
          ...zudojsDependencies(APP_TEST_DEPENDENCIES),
        },
      },
      null,
      2,
    ) + "\n";

  Object.assign(files, backendTsconfigFiles());

  if (options.packageManager === "pnpm") {
    files["pnpm-workspace.yaml"] = renderPnpmWorkspaceFile();
  }

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

Each module owns \`src/modules/<name>/routes/index.ts\`, registered from
\`src/routes/index.ts\`. Add a resource to a module with:

\`\`\`bash
npx zudojs generate resource invoices --module <name>
\`\`\`

## Getting Started

\`\`\`bash
cp .env.example .env
${runCommand(options.packageManager, "dev")}
\`\`\`

## License

MIT
`;

  const moduleSpecs = modules.map((m) =>
    moduleSpec(m, `./modules/${m}/index.js`),
  );

  Object.assign(
    files,
    emptyBarrels(),
    applyDatabaseSetting(
      renderBackendAppSource({
        applicationName: nameSlug,
        title: options.projectName,
        defaultPort: 3000,
        openapi: options.enableOpenAPI === true,
        modules: moduleSpecs,
        routedModules: modules,
      }),
      renderDatabaseEnv(options.database, nameSlug),
    ),
  );

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

  return files;
}
