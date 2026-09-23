/**
 * zudojs-cli — How a generated Dockerfile installs dependencies.
 *
 * A build stage used to copy only `package.json` and run a floating install
 * (`npm install`), so two builds of the same commit could ship different
 * dependency trees. When the lockfile describes the package being built, it
 * is copied and installed frozen: `npm ci`, `pnpm install --frozen-lockfile`,
 * `yarn install --immutable` (yarn 2+) or `--frozen-lockfile` (yarn 1), and
 * `bun install --frozen-lockfile`.
 *
 * The lockfile is copied with a wildcard (`package-lock.json*`), which
 * matches nothing rather than failing when there is none yet (a project
 * created with `--skip-install`), and the install falls back to resolving
 * from `package.json`, as the comment written above it says.
 */

/** The lockfile-related part of a Dockerfile build stage. */
export interface DockerInstallSteps {
  /** Comment lines, already prefixed with `# `. */
  readonly comment: readonly string[];
  /** Files copied next to `package.json` before the install (may be globs). */
  readonly files: readonly string[];
  /** The `RUN` command that installs dependencies. */
  readonly install: string;
  /** The `RUN` command that removes dev dependencies after the build. */
  readonly prune?: string;
}

const FALLBACK = [
  "# The lockfile is optional (copied with a wildcard): with it the install is",
  "# frozen and the image reproducible; with no lockfile yet (nothing has been",
  "# installed) dependencies resolve from package.json. Commit the lockfile.",
];

/** Install steps when the project's lockfile describes the package being built. */
export function lockedInstallSteps(packageManager: string): DockerInstallSteps {
  switch (packageManager) {
    case "pnpm":
      return {
        comment: FALLBACK,
        // pnpm-workspace.yaml carries the build-script allow-list pnpm 11 needs.
        files: ["pnpm-lock.yaml*", "pnpm-workspace.yaml"],
        install:
          "corepack enable && if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi",
        prune: "pnpm prune --prod --ignore-scripts",
      };
    case "yarn":
      return {
        comment: [...FALLBACK, "# yarn 1 takes --frozen-lockfile; yarn 2+ takes --immutable."],
        files: ["yarn.lock*", ".yarnrc.yml*"],
        install:
          "corepack enable && if [ ! -f yarn.lock ]; then yarn install; " +
          "elif yarn --version | grep -q '^1\\.'; then yarn install --frozen-lockfile; " +
          "else yarn install --immutable; fi",
      };
    case "bun":
      return {
        comment: [...FALLBACK, "# The node image has no bun: it is installed from npm for the build."],
        // bun.lock* matches bun.lock (bun 1.2+) and bun.lockb (older bun).
        files: ["bun.lock*"],
        install:
          "npm install -g bun && if [ -f bun.lock ] || [ -f bun.lockb ]; then bun install --frozen-lockfile; else bun install; fi",
        // The first install wrote a lockfile if there was none, so this is frozen.
        prune: "rm -rf node_modules && bun install --production --frozen-lockfile --ignore-scripts",
      };
    default:
      return {
        comment: FALLBACK,
        files: ["package-lock.json*"],
        install: "if [ -f package-lock.json ]; then npm ci; else npm install; fi",
        prune: "npm prune --omit=dev --ignore-scripts",
      };
  }
}

/**
 * Install steps for one app of a workspace, built on its own from its
 * `package.json`. The workspace lockfile at the project root lists every
 * package, so it cannot pin this app's isolated install.
 */
export function workspaceMemberInstallSteps(packageManager: string): DockerInstallSteps {
  const comment = [
    "# This app is one package of a workspace and is installed on its own here.",
    "# The workspace lockfile at the project root describes every package, so it",
    "# cannot pin this install; dependencies resolve from package.json.",
  ];
  switch (packageManager) {
    case "pnpm":
      return {
        comment,
        files: ["pnpm-workspace.yaml"],
        install: "corepack enable && pnpm install",
        prune: "pnpm prune --prod --ignore-scripts",
      };
    case "yarn":
      return { comment, files: [], install: "corepack enable && yarn install" };
    default:
      // The node image has no bun, so a bun workspace app installs with npm.
      return {
        comment,
        files: [],
        install: "npm install",
        prune: "npm prune --omit=dev --ignore-scripts",
      };
  }
}
