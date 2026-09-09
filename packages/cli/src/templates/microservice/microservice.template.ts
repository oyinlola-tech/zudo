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
 * ├── zudojs.config.ts
 * ├── docker-compose.yml
 * └── README.md
 * ```
 */

import type { ScaffoldOptions } from "../../types/index.js";
import { ZUDOJS_PACKAGES_VERSION } from "../../constants/index.js";
import { normalizeName } from "../../utils/utils.name.js";
import {
  RUNTIME_APP_DEPENDENCIES,
  moduleSpec,
  renderAppFile,
  renderModuleFile,
  renderServerFile,
  renderZudojsConfig,
} from "../shared/index.js";

/** Default service names used when none are provided. */
export const DEFAULT_MICROSERVICE_SERVICES = [
  "identity",
  "enrollment",
  "assessment",
  "notification",
] as const;

/**
 * The gateway app is always generated at `apps/gateway`, so "gateway" is a
 * reserved name: a service called `gateway` would produce a second, competing
 * gateway at `apps/services/gateway`.
 */
export const RESERVED_MICROSERVICE_APP_NAMES = ["gateway"] as const;

/**
 * Normalizes a requested service list into the service apps generated under
 * `apps/services/`. Reserved names and duplicates are dropped; an empty list
 * falls back to DEFAULT_MICROSERVICE_SERVICES.
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

  const unique = [...new Set(normalized)];

  return unique.length > 0 ? unique : [...DEFAULT_MICROSERVICE_SERVICES];
}

export function generateMicroserviceFiles(
  options: ScaffoldOptions,
): Record<string, string> {
  const nameSlug = options.projectName
    .replace(/[^a-z0-9-]+/gi, "-")
    .toLowerCase();
  const services = resolveMicroserviceServices(options.services);

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
          features: [],
        },
        ...(options.packageManager === "pnpm"
          ? {}
          : { workspaces: workspaceGlobs }),
        scripts: rootScripts,
        devDependencies: {
          tsx: "^4.7.0",
          typescript: "^5.7.0",
        },
      },
      null,
      2,
    ) + "\n";

  if (options.packageManager === "pnpm") {
    files["pnpm-workspace.yaml"] = `packages:
${workspaceGlobs.map((g) => `  - "${g}"`).join("\n")}
`;
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

  files["zudojs.config.ts"] = renderZudojsConfig({
    projectName: nameSlug,
    projectType: "backend",
    architecture: "microservice",
  });

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
${services.map((s, i) => `- **${s}** - Port ${3001 + i}`).join("\n")}

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

  // Shared types
  files["src/types/index.ts"] = ``;

  // Install command used inside Dockerfiles (no lockfile is generated, so
  // never use `npm ci`; enable corepack for pnpm/yarn on bare node images).
  const dockerInstall =
    options.packageManager === "pnpm"
      ? "corepack enable && pnpm install"
      : options.packageManager === "yarn"
        ? "corepack enable && yarn install"
        : "npm install";

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
    tsx: "^4.7.0",
    typescript: "^5.7.0",
    "@types/node": "^24.0.0",
  };

  // Gateway service
  const gatewayDeps = [
    ...RUNTIME_APP_DEPENDENCIES,
    "@zudojs/http",
    "@zudojs/config",
  ];

  files["apps/gateway/package.json"] =
    JSON.stringify(
      {
        name: `${nameSlug}-gateway`,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "tsx watch src/server.ts",
          start: "node dist/server.js",
          build: "tsc",
          typecheck: "tsc --noEmit",
        },
        dependencies: Object.fromEntries(
          [...new Set(gatewayDeps)].map((d) => [d, ZUDOJS_PACKAGES_VERSION]),
        ),
        devDependencies: appDevDeps,
      },
      null,
      2,
    ) + "\n";

  files["apps/gateway/tsconfig.json"] = appTsconfig;

  files["apps/gateway/Dockerfile"] = `FROM node:24-alpine AS builder
WORKDIR /app
COPY apps/gateway/package.json ./
RUN ${dockerInstall}
COPY apps/gateway/tsconfig.json ./
COPY apps/gateway/src ./src
RUN npx tsc

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
`;

  files["apps/gateway/src/index.ts"] =
    `export { createApp } from "./app.js";
`;

  const gatewayModule = moduleSpec("gateway", "./modules/index.js");

  files["apps/gateway/src/app.ts"] = renderAppFile({
    applicationName: `${nameSlug}-gateway`,
    modules: [gatewayModule],
    port: 3000,
  });

  files["apps/gateway/src/modules/gateway.module.ts"] = renderModuleFile({
    module: gatewayModule,
  });

  files["apps/gateway/src/modules/index.ts"] =
    `export { ${gatewayModule.className} } from "./gateway.module.js";\n`;

  files["apps/gateway/src/server.ts"] = renderServerFile();

  // Generate each service
  const serviceDeps = [
    ...RUNTIME_APP_DEPENDENCIES,
    "@zudojs/config",
    "@zudojs/errors",
    "@zudojs/http",
  ];

  if (options.enableCQRS) {
    serviceDeps.push("@zudojs/cqrs");
  }

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
          scripts: {
            dev: "tsx watch src/server.ts",
            start: "node dist/server.js",
            build: "tsc",
            typecheck: "tsc --noEmit",
          },
          dependencies: Object.fromEntries(
            [...new Set(serviceDeps)].map((d) => [d, ZUDOJS_PACKAGES_VERSION]),
          ),
          devDependencies: appDevDeps,
        },
        null,
        2,
      ) + "\n";

    files[`apps/services/${svcName}/tsconfig.json`] = appTsconfig;

    files[`apps/services/${svcName}/Dockerfile`] =
      `FROM node:24-alpine AS builder
WORKDIR /app
COPY apps/services/${svcName}/package.json ./
RUN ${dockerInstall}
COPY apps/services/${svcName}/tsconfig.json ./
COPY apps/services/${svcName}/src ./src
RUN npx tsc

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE ${port}
CMD ["node", "dist/server.js"]
`;

    // Service structure (modular monolith per service)
    const svcDirs = [
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

    files[`apps/services/${svcName}/src/index.ts`] =
      `export { createApp } from "./app.js";
`;

    const svcModule = moduleSpec(svcName, "./modules/index.js");

    files[`apps/services/${svcName}/src/app.ts`] = renderAppFile({
      applicationName: `${nameSlug}-${svcName}`,
      modules: [svcModule],
      port,
    });

    files[`apps/services/${svcName}/src/modules/${svcName}.module.ts`] =
      renderModuleFile({ module: svcModule });

    files[`apps/services/${svcName}/src/modules/index.ts`] =
      `export { ${svcModule.className} } from "./${svcName}.module.js";\n`;

    files[`apps/services/${svcName}/src/server.ts`] = renderServerFile();

    for (const dir of svcDirs) {
      files[`apps/services/${svcName}/src/${dir}/index.ts`] = "";
    }

    files[`apps/services/${svcName}/src/commands/index.ts`] = "";
    files[`apps/services/${svcName}/src/queries/index.ts`] = "";
  }

  return files;
}
