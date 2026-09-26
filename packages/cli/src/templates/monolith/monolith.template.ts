/**
 * zudojs-cli — Monolith Templates
 *
 * Template file generators for monolith architecture projects.
 *
 * Generated structure (see `templates/backendApp` for the wired source):
 * ```
 * project/
 * ├── src/
 * │   ├── index.ts        # exports only
 * │   ├── app.ts          # runtime assembly (modules + integrations)
 * │   ├── server.ts       # config → router → registerRoutes → HTTP
 * │   ├── container.ts    # composition root
 * │   ├── configs/        # typed configuration from the environment
 * │   ├── controllers/  dtos/  repositories/  services/  routes/
 * │   ├── integrations/   # lifecycle-managed clients (zudojs add)
 * │   ├── modules/        # runtime modules
 * │   └── utils/          # HTTP helpers
 * ├── tests/examples.test.ts
 * ├── package.json
 * ├── tsconfig.json
 * └── README.md
 * ```
 */

import type { ScaffoldOptions } from "../../types/index.js";
import { renderDatabaseEnv } from "../../adapters/databases/databaseAdapter.resolver.js";
import { zudojsDependencies } from "../../constants/index.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";
import {
  RUNTIME_APP_DEPENDENCIES,
  capabilityPackages,
  moduleSpec,
  renderModuleFile,
  renderServiceFile,
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
  runCommand,
  renderBackendAppSource,
} from "../backendApp/index.js";

export function generateMonolithFiles(
  options: ScaffoldOptions,
): Record<string, string> {
  const name = options.projectName;
  const nameSlug = name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

  // Recorded in package.json and backed by the packages below, so the
  // `zudojs doctor` feature check has something real to verify.
  const capabilities = resolveProjectCapabilities(options);

  const deps = [
    ...RUNTIME_APP_DEPENDENCIES,
    ...APP_SOURCE_DEPENDENCIES,
    "@zudojs/types",
    "@zudojs/validation",
    ...capabilityPackages(capabilities),
  ];

  if (options.enableCQRS) {
    deps.push("@zudojs/events");
  }

  const files: Record<string, string> = {};

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
.DS_Store
`;

  files["README.md"] = `# ${name}

A Zudojs framework application.

## Getting Started

\`\`\`bash
cp .env.example .env
${runCommand(options.packageManager, "dev")}
\`\`\`

The server answers \`GET /health\` and the example resource at
\`/api/v1/examples\`${options.enableOpenAPI ? "; the OpenAPI document is at `/openapi.json` and the docs page at `/docs`" : ""}.

## Generate and add

\`\`\`bash
npx zudojs generate resource users   # DTO, repository, service, controller, routes, test — registered
npx zudojs add redis                 # also: database, websockets, email, docker, queue, ...
\`\`\`

## Structure

\`\`\`
src/
├── server.ts        # Entry point: config, router, HTTP server
├── app.ts           # Runtime assembly (modules + integrations)
├── container.ts     # Composition root
├── configs/         # Typed configuration (.env)
├── controllers/     # HTTP handlers
├── dtos/            # @zudojs/schema request/response schemas
├── integrations/    # Redis, database, WebSockets, email (zudojs add)
├── modules/         # Runtime modules
├── repositories/    # Data access
├── routes/          # registerRoutes and per-resource routes
├── services/        # Use cases
└── utils/           # HTTP helpers
\`\`\`

## License

MIT
`;

  // Normalized: the name becomes a file path segment and a class name.
  const moduleName = normalizeName(options.services[0] ?? "app") || "app";
  const serviceClassName = `${toPascalCase(moduleName)}Service`;
  const appModule = moduleSpec(moduleName, "./modules/index.js");

  Object.assign(
    files,
    emptyBarrels(),
    applyDatabaseSetting(
      renderBackendAppSource({
        applicationName: nameSlug,
        title: name,
        defaultPort: 3000,
        openapi: options.enableOpenAPI === true,
        modules: [appModule],
      }),
      renderDatabaseEnv(options.database, nameSlug),
    ),
  );

  files[`src/modules/${moduleName}.module.ts`] = renderModuleFile({
    module: appModule,
    service: {
      className: serviceClassName,
      importPath: "../services/index.js",
    },
  });

  files["src/modules/index.ts"] =
    `export { ${appModule.className} } from "./${moduleName}.module.js";\n`;

  files[`src/services/${moduleName}.service.ts`] = renderServiceFile(moduleName);

  files["src/services/index.ts"] =
    `export { ${serviceClassName} } from "./${moduleName}.service.js";\n`;

  return files;
}
