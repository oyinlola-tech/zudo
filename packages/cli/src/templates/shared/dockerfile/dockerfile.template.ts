/**
 * zudojs-cli — Generated Dockerfiles.
 *
 * Shared by the microservice template, the InfrastructureGenerator and
 * `zudojs add docker`. Every image is multi-stage on Node 24: a build stage
 * installs, compiles and prunes dev dependencies; the runtime stage copies
 * only `dist`, production `node_modules` and `package.json`, runs as the
 * unprivileged `node` user and declares a /health HEALTHCHECK. The images
 * used to run as root and ship the whole dev toolchain.
 */

import {
  lockedInstallSteps,
  workspaceMemberInstallSteps,
} from "./dockerfile.install.js";

function runnerFor(packageManager: string): string {
  return packageManager === "npm" || packageManager === "bun" ? "npm" : packageManager;
}

/**
 * The runtime stage of a single-package image. With Prisma, the schema,
 * migrations and `prisma.config.ts` come along (the CLI is a runtime
 * dependency), so the same image applies migrations.
 */
function runtimeStage(port: number, dist: string, from: string, prisma = false): string {
  const migrations = prisma
    ? `COPY --from=build --chown=node:node ${from}/prisma ./prisma
COPY --from=build --chown=node:node ${from}/prisma.config.ts ./
# Apply migrations with this image before starting a new version:
#   docker run --rm --env-file .env <image> npx prisma migrate deploy
`
    : "";
  return `FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node ${from}/package.json ./
COPY --from=build --chown=node:node ${from}/node_modules ./node_modules
COPY --from=build --chown=node:node ${from}/${dist} ./${dist}
${migrations}USER node
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD ["node", "-e", "fetch('http://127.0.0.1:${port}/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "${dist}/server.js"]
`;
}

/**
 * A self-contained Dockerfile for one app package. The build context is the
 * project root; `appPath` is the app's directory (`.` for a single-app
 * project). pnpm's `pnpm-workspace.yaml` is copied for its build-script
 * allow-list, without which pnpm 11 refuses to install.
 *
 * An app at the project root copies its lockfile and installs frozen (see
 * `dockerfile.install.ts`); an app inside a workspace cannot use the
 * workspace lockfile on its own, and its Dockerfile says so.
 */
export function renderAppPackageDockerfile(options: {
  readonly appPath: string;
  readonly port: number;
  readonly packageManager: string;
  /** The app has Prisma: copy the schema and config before installing. */
  readonly prisma?: boolean;
}): string {
  const app = options.appPath.replace(/^\.\/?/, "").replace(/\/$/, "");
  const at = (file: string): string => (app === "" ? file : `${app}/${file}`);
  const pm = options.packageManager;
  const steps = app === "" ? lockedInstallSteps(pm) : workspaceMemberInstallSteps(pm);
  const manifests = app === ""
    ? [`COPY ${["package.json", ...steps.files].join(" ")} ./`]
    : [`COPY ${at("package.json")} ./`, ...steps.files.map((file) => `COPY ${file} ./`)];
  const lines = [
    "# syntax=docker/dockerfile:1",
    "FROM node:24-alpine AS build",
    "WORKDIR /app",
    ...steps.comment,
    ...manifests,
    ...(options.prisma ? [`COPY ${at("prisma.config.ts")} ./`, `COPY ${at("prisma")} ./prisma`] : []),
    `RUN ${steps.install}`,
    `COPY ${at("tsconfig.json")} ./`,
    `COPY ${at("src")} ./src`,
    `RUN ${runnerFor(pm)} run build`,
    ...(steps.prune === undefined ? [] : [`RUN ${steps.prune}`]),
    "",
  ];
  return `${lines.join("\n")}\n${runtimeStage(options.port, "dist", "/app", options.prisma === true)}`;
}

/**
 * A Dockerfile for a workspace whose server lives in `appDirectory`. The whole
 * workspace is installed, then only that app is built and started: the root
 * `build` script writes `apps/*\/dist`, never a root `dist/`.
 */
export function renderWorkspaceAppDockerfile(options: {
  readonly appDirectory: string;
  readonly port: number;
  readonly packageManager: string;
}): string {
  const dir = options.appDirectory.replace(/^\.\/?/, "").replace(/\/$/, "");
  const runner = runnerFor(options.packageManager);
  const build =
    dir === "" ? `${runner} run build` : `cd ${dir} && ${runner} run build`;
  const dist = dir === "" ? "dist" : `${dir}/dist`;
  // The whole workspace is copied, lockfile included, so it installs frozen.
  const steps = lockedInstallSteps(options.packageManager);
  // pnpm links workspace dependencies through the root node_modules, so
  // the runtime stage takes the whole built workspace.
  return `# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
${steps.comment.join("\n")}
COPY . .
RUN ${steps.install}
RUN ${build}

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE ${options.port}
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD ["node", "-e", "fetch('http://127.0.0.1:${options.port}/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "${dist}/server.js"]
`;
}
