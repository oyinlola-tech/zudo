/**
 * zudojs-cli — Generated Dockerfiles.
 *
 * Shared by the microservice template and the InfrastructureGenerator so the
 * fullstack microservice project and the standalone one build the same way.
 */

/** The dependency install command for a package manager inside a Dockerfile. */
export function dockerInstallCommand(packageManager: string): string {
  // No lockfile is generated, so never `npm ci`; bare node images need
  // corepack for pnpm/yarn; bun is not available there, so npm is used.
  switch (packageManager) {
    case "pnpm":
      return "corepack enable && pnpm install";
    case "yarn":
      return "corepack enable && yarn install";
    default:
      return "npm install";
  }
}

/**
 * A self-contained Dockerfile for one app of a microservice project. The
 * build context is the project root; only `appPath` is copied in.
 */
export function renderAppPackageDockerfile(options: {
  readonly appPath: string;
  readonly port: number;
  readonly packageManager: string;
}): string {
  const { appPath, port } = options;
  return `FROM node:24-alpine AS builder
WORKDIR /app
COPY ${appPath}/package.json ./
RUN ${dockerInstallCommand(options.packageManager)}
COPY ${appPath}/tsconfig.json ./
COPY ${appPath}/src ./src
RUN npx tsc

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE ${port}
CMD ["node", "dist/server.js"]
`;
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
  const install = dockerInstallCommand(options.packageManager);
  const runner =
    options.packageManager === "npm" || options.packageManager === "bun"
      ? "npm"
      : options.packageManager;
  const build =
    dir === "" ? `${runner} run build` : `cd ${dir} && ${runner} run build`;
  const dist = dir === "" ? "dist" : `${dir}/dist`;
  return `FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN ${install}
RUN ${build}

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE ${options.port}
CMD ["node", "${dist}/server.js"]
`;
}
