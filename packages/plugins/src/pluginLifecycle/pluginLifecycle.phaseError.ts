/**
 * Wraps a lifecycle hook's failure in the typed error for its phase.
 *
 * `PluginInitializationError`, `PluginStartError` and `PluginStopError`
 * were exported but never thrown: a hook's raw error was rethrown as-is,
 * so nothing but `diagnostics()` said which plugin had failed. The wrap
 * names the plugin and the phase and keeps the original as `cause`.
 *
 * @module pluginLifecycle/pluginLifecycle.phaseError
 */

import {
  PluginError,
  PluginInitializationError,
  PluginStartError,
  PluginStopError,
} from "@zudojs/errors";

import type { PluginState } from "../pluginTypes/pluginState.type.js";

/** The lifecycle-hook error class for each transient phase. */
const PHASE_ERRORS: Partial<
  Record<
    PluginState,
    new (
      message: string,
      pluginName?: string,
      options?: { readonly cause?: unknown },
    ) => PluginError
  >
> = {
  installing: PluginInitializationError,
  initializing: PluginInitializationError,
  starting: PluginStartError,
  stopping: PluginStopError,
};

/** The verb a phase's failure message uses. */
const PHASE_VERBS: Partial<Record<PluginState, string>> = {
  installing: "install",
  initializing: "initialize",
  starting: "start",
  stopping: "stop",
};

/**
 * Returns the error to throw for a hook that failed in `phase`.
 *
 * A `PluginError` — a `PluginTimeoutError`, `PluginStateError`, or a
 * typed error a plugin threw on purpose — already names the plugin and
 * lets callers branch on it, so it propagates unchanged. Anything else is
 * wrapped in the phase's error class with the original as `cause`; the
 * message quotes the original's so existing substring matches still hold.
 */
export function toPhaseError(
  phase: PluginState,
  pluginName: string,
  error: unknown,
): unknown {
  if (error instanceof PluginError) return error;

  const PhaseError = PHASE_ERRORS[phase];
  if (PhaseError === undefined) return error;

  const detail = error instanceof Error ? error.message : String(error);

  return new PhaseError(
    `Plugin "${pluginName}" failed to ${PHASE_VERBS[phase]}: ${detail}`,
    pluginName,
    { cause: error },
  );
}
