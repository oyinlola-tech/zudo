/**
 * zudojs-cli — Microservice Template
 *
 * Generated structure:
 * ```
 * project/
 * ├── apps/
 * │   ├── gateway/
 * │   │   ├── src/
 * │   │   ├── package.json
 * │   │   └── tsconfig.json
 * │   └── services/
 * │       └── identity/
 * │           ├── src/
 * │           ├── package.json
 * │           └── tsconfig.json
 * ├── infrastructure/
 * ├── package.json
 * ├── pnpm-workspace.yaml
 * ├── docker-compose.yml
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
  renderAppPackageDockerfile,
  renderModuleFile,
  renderPnpmWorkspaceFile,
  resolveProjectCapabilities,
} from "../shared/index.js";
import {
  DEPENDENCY_VERSION_RANGES,
  TYPESCRIPT_VERSION_RANGES,
} from "../../resolvers/dependency/dependencyVersions.constant.js";
import {
  APP_SOURCE_DEPENDENCIES,
  APP_TEST_DEPENDENCIES,
  applyDatabaseSetting,
  backendDevDependencies,
  emptyBarrels,
  renderBackendAppSource,
} from "../backendApp/index.js";

/**
 * The gateway app is always generated at `apps/gateway`, so "gateway" is a
 * reserved name: a service called `gateway` would produce a second, competing
 * gateway at `apps/services/gateway`.
 */
export const RESERVED_MICROSERVICE_APP_NAMES = ["gateway"] as const;

/**
 * Normalizes a requested service list into the service apps generated under
 * `apps/services/`. Reserved names and duplicates are dropped.
 *
 * An empty request yields an empty list: a new project gets the gateway and
 * nothing else. This used to substitute four example names
 * (`identity`, `enrollment`, `assessment`, `notification`), which put four
 * domains nobody asked for into every microservice project and left the
 * author deleting them before they could start. Services are created when
 * they are named — here, or in another `create` run. `generate service` is
 * refused in a microservice project, because a service is a whole workspace
 * app (package.json, tsconfig, Dockerfile, port) that the schematic does not
 * produce; `generate module --service <name>` adds to an existing app.
 */
export function resolveMicroserviceServices(
  requested: readonly string[],
): readonly string[] {
  const normalized = requested
    .map((service) => normalizeName(service))
    .filter(
      (service) =>
        service.length > 0 &&
        !RESERVED_MICROSERVICE_APP_NAMES.some(
          (reserved) => reserved === service,
        ),
    );

  return [...new Set(normalized)];
}

export function generateMicroserviceFiles(
  options: ScaffoldOptions,
): Record<string, string> {
  const nameSlug = options.projectName
    .replace(/[^a-z0-9-]+/gi, "-")
    .toLowerCase();
  const services = resolveMicroserviceServices(options.services);
  // The workspace root records the capabilities for the project as a whole
  // alongside the manifest, and `zudojs add` keeps the two in step); the
  // gateway and service apps record them next to the dependencies that back
  // them, which is where `zudojs add` writes and `zudojs doctor` reads.
  const capabilities = resolveProjectCapabilities(options);

  const files: Record<string, string> = {};

  // Root package.json (workspace root)
  const rootScripts: Record<string, string> = {
    dev:
      options.packageManager === "npm"
        ? "npm run dev --workspaces --if-present"
        : options.packageManager === "yarn"
          ? "yarn workspaces run dev"
          : options.packageManager === "bun"
            ? "bun run --filter '*' dev"
            : "pnpm -r run dev",
    build:
      options.packageManager === "npm"
        ? "npm run build --workspaces --if-present"
        : options.packageManager === "yarn"
          ? "yarn workspaces run build"
          : options.packageManager === "bun"
            ? "bun run --filter '*' build"
            : "pnpm -r run build",
    typecheck:
      options.packageManager === "npm"
        ? "npm run typecheck --workspaces --if-present"
        : options.packageManager === "yarn"
          ? "yarn workspaces run typecheck"
          : options.packageManager === "bun"
            ? "bun run --filter '*' typecheck"
            : "pnpm -r run typecheck",
    test:
      options.packageManager === "npm"
        ? "npm run test --workspaces --if-present"
        : options.packageManager === "yarn"
          ? "yarn workspaces run test"
          : options.packageManager === "bun"
            ? "bun run --filter '*' test"
            : "pnpm -r run test",
  };

  const workspaceGlobs = ["apps/gateway", "apps/services/*"];

  files["package.json"] =
    JSON.stringify(
      {
        name: nameSlug,
        version: "0.1.0",
        private: true,
        type: "module",
        description: `Microservice architecture built with Zudojs framework`,
        zudojs: {
          projectType: "backend",
          architecture: "microservice",
          features: capabilities,
        },
        ...(options.packageManager === "pnpm"
          ? {}
          : { workspaces: workspaceGlobs }),
        scripts: rootScripts,
        devDependencies: {
          tsx: DEPENDENCY_VERSION_RANGES.tsx,
          typescript: TYPESCRIPT_VERSION_RANGES.backend,
        },
      },
      null,
      2,
    ) + "\n";

  if (options.packageManager === "pnpm") {
    files["pnpm-workspace.yaml"] = renderPnpmWorkspaceFile(workspaceGlobs);
  }

  // Docker Compose — gateway on 3000, service i on 3001+i.
  let composeServices = "";
  for (let i = 0; i < services.length; i++) {
    const svc = services[i]!;
    const port = 3001 + i;
    composeServices += `  ${svc}:
    build:
      context: .
      dockerfile: apps/services/${svc}/Dockerfile
    ports:
      - "${port}:${port}"
    environment:
      - NODE_ENV=development
      - PORT=${port}
    depends_on: []
`;
  }

  files["docker-compose.yml"] = `services:
  gateway:
    build:
      context: .
      dockerfile: apps/gateway/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
${composeServices}
volumes:
  ${services.map((s) => `${s}-data:`).join("\n  ")}
`;

  files[".env.example"] = `NODE_ENV=development
PORT=3000
`;

  files[".gitignore"] = `node_modules/
dist/
.env
*.log
.data/
`;

  files["README.md"] = `# ${options.projectName}

A microservice architecture built with the Zudojs framework.

## Services

- **gateway** - Port 3000
${
  services.length > 0
    ? services.map((s, i) => `- **${s}** - Port ${3001 + i}`).join("\n")
    : `
No services yet. A service is a whole workspace app, so it is created with
\`create\` rather than by a schematic:

\`\`\`bash
npx zudojs create <project> --architecture microservice --services <name>
\`\`\`

To add domain logic to an app that already exists, generate a module into it:

\`\`\`bash
npx zudojs generate module <name> --service <existing-service>
\`\`\``
}

## Getting Started

\`\`\`bash
${options.packageManager === "npm" ? "npm install" : options.packageManager === "yarn" ? "yarn install" : options.packageManager === "bun" ? "bun install" : "pnpm install"}
${options.packageManager === "npm" ? "npm run dev" : options.packageManager === "yarn" ? "yarn dev" : options.packageManager === "bun" ? "bun run dev" : "pnpm dev"}
\`\`\`

## Docker

\`\`\`bash
docker-compose up
\`\`\`

## License

MIT
`;

  // No `src/` at the workspace root: there is no package.json, tsconfig or
  // app there, so nothing would compile a file placed in it. Every app owns
  // its own `src/types/`, and code genuinely shared between apps belongs in a
  // workspace package the author creates deliberately.

  const appTsconfig = `{
  "compilerOptions": {
    "target": "ES2024",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "lib": ["ES2024"],
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
`;

  const appDevDeps = {
    ...backendDevDependencies(),
    ...zudojsDependencies(APP_TEST_DEPENDENCIES),
  };

  const appScripts = {
    dev: "tsx watch src/server.ts",
    start: "node dist/server.js",
    build: "tsc",
    typecheck: "tsc --noEmit",
    test: "vitest run",
  };

  /** The wired source tree of one app, plus its folder barrels. */
  const appSource = (appName: string, port: number): Record<string, string> => {
    const spec = moduleSpec(appName, "./modules/index.js");
    return {
      ...emptyBarrels(),
      ...applyDatabaseSetting(
        renderBackendAppSource({
          applicationName: `${nameSlug}-${appName}`,
          title: `${options.projectName} ${appName}`,
          defaultPort: port,
          openapi: options.enableOpenAPI === true,
          modules: [spec],
          port,
        }),
        renderDatabaseEnv(options.database, `${nameSlug}-${appName}`),
      ),
      [`src/modules/${appName}.module.ts`]: renderModuleFile({ module: spec }),
      "src/modules/index.ts": `export { ${spec.className} } from "./${appName}.module.js";\n`,
    };
  };

  const prefixed = (prefix: string, tree: Record<string, string>): void => {
    for (const [path, content] of Object.entries(tree)) {
      files[`${prefix}/${path}`] = content;
    }
  };

  // Gateway service. It is a backend app like every service: `create` and
  // `zudojs add` write capabilities to it and `zudojs doctor` checks it, so
  // it declares and installs the same capabilities.
  const gatewayDeps = [
    ...RUNTIME_APP_DEPENDENCIES,
    ...APP_SOURCE_DEPENDENCIES,
    ...capabilityPackages(capabilities),
  ];

  files["apps/gateway/package.json"] =
    JSON.stringify(
      {
        name: `${nameSlug}-gateway`,
        version: "0.1.0",
        private: true,
        type: "module",
        zudojs: { features: capabilities },
        scripts: appScripts,
        dependencies: zudojsDependencies(gatewayDeps),
        devDependencies: appDevDeps,
      },
      null,
      2,
    ) + "\n";

  files["apps/gateway/tsconfig.json"] = appTsconfig;

  files["apps/gateway/Dockerfile"] = renderAppPackageDockerfile({
    appPath: "apps/gateway",
    port: 3000,
    packageManager: options.packageManager,
  });

  prefixed("apps/gateway", appSource("gateway", 3000));

  // Generate each service
  const serviceDeps = [
    ...RUNTIME_APP_DEPENDENCIES,
    ...APP_SOURCE_DEPENDENCIES,
    ...capabilityPackages(capabilities),
  ];

  for (const svc of services) {
    const svcName = svc!;
    const svcIndex = services.indexOf(svcName);
    const port = 3001 + svcIndex;

    files[`apps/services/${svcName}/package.json`] =
      JSON.stringify(
        {
          name: `${nameSlug}-${svcName}`,
          version: "0.1.0",
          private: true,
          type: "module",
          zudojs: { features: capabilities },
          scripts: appScripts,
          dependencies: zudojsDependencies(serviceDeps),
          devDependencies: appDevDeps,
        },
        null,
        2,
      ) + "\n";

    files[`apps/services/${svcName}/tsconfig.json`] = appTsconfig;

    files[`apps/services/${svcName}/Dockerfile`] = renderAppPackageDockerfile({
      appPath: `apps/services/${svcName}`,
      port,
      packageManager: options.packageManager,
    });

    prefixed(`apps/services/${svcName}`, appSource(svcName, port));

    files[`apps/services/${svcName}/src/commands/index.ts`] = "";
    files[`apps/services/${svcName}/src/queries/index.ts`] = "";
  }

  return files;
}
