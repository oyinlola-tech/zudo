import { resolveEnvironment } from "@zudojs/constants";

import type { RuntimeEnvironmentVariables } from "../runtimeEnvironment/runtimeEnvironment.type.js";
import type { RuntimeMode } from "./runtimeOptions.type.js";

/**
 * Derives the runtime mode used when `RuntimeOptions.mode` is not set.
 *
 * `NODE_ENV` is read through `resolveEnvironment()` from `@zudojs/constants`,
 * so every layer maps the same value to the same environment (`prod` and
 * `Production` are production, unset is development). `staging` has no
 * runtime mode of its own and runs as `production`.
 *
 * @param variables - Environment variables to read instead of `process.env`.
 */
export function resolveDefaultRuntimeMode(
  variables?: RuntimeEnvironmentVariables,
): RuntimeMode {
  const environment = resolveEnvironment(
    variables === undefined ? undefined : { ...variables },
  );
  return environment === "staging" ? "production" : environment;
}
