/**
 * zudojs-cli — Update check
 *
 * Asks the npm registry whether a newer `zudojs-cli` exists.
 *
 * This used to run as a `postinstall` script. npm 11 and pnpm 10 no longer
 * run install scripts of freshly added packages without explicit approval,
 * so the check was skipped with a warning on every install and, worse, the
 * warning made the CLI look broken before it had run once. The check now
 * runs on demand from `zudojs info`, where a network round-trip is expected.
 *
 * @module cliVersion/update
 */

import { compareVersions, isValidVersion } from "./cliVersion.core.js";

export interface UpdateCheckOptions {
  /** Milliseconds to wait for the registry before giving up. */
  readonly timeoutMs?: number;
  readonly registryUrl?: string;
  readonly packageName?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
}

export interface UpdateCheckResult {
  readonly current: string;
  /** The newer published version, or `null` when up to date or unknown. */
  readonly latest: string | null;
  /** Why no answer was obtained, when `latest` is `null`. */
  readonly skipped?: "disabled" | "offline" | "unavailable";
}

/**
 * Whether the update check is turned off for this environment.
 *
 * `ZUDOJS_NO_UPDATE_CHECK` disables it explicitly; `CI` and npm's offline
 * mode disable it implicitly.
 */
export function isUpdateCheckDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env["ZUDOJS_NO_UPDATE_CHECK"];
  if (flag !== undefined && flag !== "" && flag !== "0") return true;
  if (env["CI"] !== undefined && env["CI"] !== "" && env["CI"] !== "false")
    return true;
  if (env["npm_config_offline"] === "true") return true;
  return false;
}

/** Looks up the latest published version and compares it with `current`. */
export async function checkForNewerVersion(
  current: string,
  options: UpdateCheckOptions = {},
): Promise<UpdateCheckResult> {
  if (isUpdateCheckDisabled(options.env)) {
    return { current, latest: null, skipped: "disabled" };
  }

  const packageName = options.packageName ?? "zudojs-cli";
  const registryUrl = options.registryUrl ?? "https://registry.npmjs.org";
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 3000,
  );

  try {
    const response = await fetchImpl(
      `${registryUrl}/${encodeURIComponent(packageName)}/latest`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      return { current, latest: null, skipped: "unavailable" };
    }

    const data = (await response.json()) as { version?: unknown };
    const latest = typeof data.version === "string" ? data.version : null;

    if (
      latest === null ||
      !isValidVersion(latest) ||
      !isValidVersion(current) ||
      compareVersions(latest, current) <= 0
    ) {
      return { current, latest: null };
    }

    return { current, latest };
  } catch {
    return { current, latest: null, skipped: "offline" };
  } finally {
    clearTimeout(timer);
  }
}
