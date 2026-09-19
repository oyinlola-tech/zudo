/**
 * zudojs-cli — Where a fullstack project's backend files go.
 *
 * A monolith backend is a single app written to `apps/api`. A microservice
 * backend is a set of apps, and nesting it under `apps/api` put the gateway
 * and services at `apps/api/apps/*`, outside the root workspace globs, so
 * their dependencies were never installed and the root docker-compose built
 * directories holding only a Dockerfile. Its apps are written at the root
 * instead (`apps/gateway`, `apps/services/<name>`), next to `apps/web`.
 */

/** Backend files and the directory they are written under. */
export interface FullstackBackendLayout {
  /** Directory relative to the project root ("" for the root). */
  readonly directory: string;
  /** Files relative to `directory`. */
  readonly files: Record<string, string>;
  /** Directories created, relative to the project root, for rollback. */
  readonly createdDirectories: readonly string[];
}

/**
 * Places generated backend files inside a fullstack project. Root-level
 * files of a microservice backend (its own package.json, workspace file,
 * compose file, README) are dropped: the fullstack root owns those.
 */
export function layoutFullstackBackend(
  architecture: string,
  backendFiles: Readonly<Record<string, string>>,
): FullstackBackendLayout {
  if (architecture !== "microservice") {
    const files = { ...backendFiles };
    delete files["pnpm-workspace.yaml"];
    return { directory: "apps/api", files, createdDirectories: ["apps/api"] };
  }

  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(backendFiles)) {
    if (path.startsWith("apps/gateway/") || path.startsWith("apps/services/")) {
      files[path] = content;
    }
  }
  return {
    directory: "",
    files,
    createdDirectories: ["apps/gateway", "apps/services"],
  };
}
