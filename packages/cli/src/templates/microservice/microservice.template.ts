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
import { ZUDOJS_PACKAGES_VERSION } from "../../constants/index.js";

/** Default service names used when none are provided. */
export const DEFAULT_MICROSERVICE_SERVICES = [
  "identity",
  "enrollment",
  "assessment",
  "notification",
] as const;

export function generateMicroserviceFiles(
  options: ScaffoldOptions,
): Record<string, string> {
  const nameSlug = options.projectName
    .replace(/[^a-z0-9-]+/gi, "-")
    .toLowerCase();
  const services =
    options.services.length > 0
      ? options.services
      : DEFAULT_MICROSERVICE_SERVICES;

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
    "@zudojs/http",
    "@zudojs/config",
    "@zudojs/logger",
    "@zudojs/runtime",
  ];

  files["apps/gateway/package.json"] =
    JSON.stringify(
      {
        name: "@zudojs/gateway",
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
          gatewayDeps.map((d) => [d, ZUDOJS_PACKAGES_VERSION]),
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
    `export { createGateway } from "./app.js";
`;

  files["apps/gateway/src/app.ts"] = `import { logger } from "@zudojs/logger";

export async function createGateway() {
  const log = logger.child({ service: "gateway" });
  log.info("Gateway starting...");

  return {
    listen: async () => {
      log.info("Gateway listening on port 3000");
    },
    stop: async () => {
      log.info("Gateway shutting down...");
    },
  };
}
`;

  files["apps/gateway/src/server.ts"] =
    `import { createGateway } from "./app.js";
import { createRuntime } from "@zudojs/runtime";

const app = await createGateway();

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

  // Generate each service
  const serviceDeps = [
    "@zudojs/core",
    "@zudojs/runtime",
    "@zudojs/container",
    "@zudojs/config",
    "@zudojs/logger",
    "@zudojs/errors",
    "@zudojs/constants",
    "@zudojs/http",
  ];

  if (options.enableCQRS) {
    serviceDeps.push("@zudojs/cqrs", "@zudojs/events");
  }

  for (const svc of services) {
    const svcName = svc!;
    const svcIndex = services.indexOf(svcName);
    const port = 3001 + svcIndex;

    files[`apps/services/${svcName}/package.json`] =
      JSON.stringify(
        {
          name: `@zudojs/${nameSlug}-${svcName}`,
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

    files[`apps/services/${svcName}/src/app.ts`] =
      `import { logger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";

export async function createApp() {
  const log = logger.child({ service: "${svcName}" });
  const container = createContainer();

  log.info("${svcName} v0.1.0 starting...");

  return {
    container,
    listen: async () => {
      log.info("Listening on port ${port}");
    },
    stop: async () => {
      log.info("Shutting down...");
    },
  };
}
`;

    files[`apps/services/${svcName}/src/server.ts`] =
      `import { createApp } from "./app.js";
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

    for (const dir of svcDirs) {
      files[`apps/services/${svcName}/src/${dir}/index.ts`] = "";
    }

    files[`apps/services/${svcName}/src/commands/index.ts`] = "";
    files[`apps/services/${svcName}/src/queries/index.ts`] = "";
  }

  return files;
}
