/**
 * @zudojs/observability — Noop
 *
 * No-op implementations that discard all telemetry.
 */

export {
  NoopObservability,
  createNoopObservability,
  noopLogger,
  noopCounter,
  noopGauge,
  noopHistogram,
  noopMetricsRegistry,
  noopSpan,
  noopTracer,
  noopPropagationManager,
  INVALID_PROPAGATION_CONTEXT,
} from "./noopObservability.core.js";
