/**
 * @zudojs/observability — Sampling
 *
 * Sampling strategies for controlling trace overhead.
 */

import type { SamplingResult, Sampler, SpanContext } from "../types.js";
import { TraceFlags } from "../types.js";
import { generateHexId, isValidTraceId } from "../internal/index.js";
import { ObservabilityConfigError } from "../errors/index.js";

const RECORD_AND_SAMPLE: SamplingResult = { decision: "RECORD_AND_SAMPLE" };
const DO_NOT_RECORD: SamplingResult = { decision: "DO_NOT_RECORD" };

/** Always records and samples. */
export class AlwaysOnSampler implements Sampler {
  shouldSample(): SamplingResult {
    return RECORD_AND_SAMPLE;
  }
}

/** Never records or samples. */
export class AlwaysOffSampler implements Sampler {
  shouldSample(): SamplingResult {
    return DO_NOT_RECORD;
  }
}

/**
 * Samples a fixed fraction of traces.
 *
 * The decision is derived from the trace ID, so every service handling the
 * same trace reaches the same answer and a trace is never sampled in half.
 * The low 8 hex digits are used, matching the OpenTelemetry convention of
 * taking the *trailing* bytes — the leading ones are the least varied in
 * some ID schemes.
 *
 * When no usable trace ID is available the sampler falls back to a random
 * draw at the same rate, rather than failing open in one direction and
 * closed in another.
 */
export class ProbabilitySampler implements Sampler {
  readonly probability: number;

  constructor(probability: number) {
    if (!Number.isFinite(probability)) {
      throw new ObservabilityConfigError(
        `Sampling probability must be a finite number; received ${probability}`,
        { probability },
      );
    }
    this.probability = Math.max(0, Math.min(1, probability));
  }

  shouldSample(_parentContext?: SpanContext, traceId?: string): SamplingResult {
    if (this.probability >= 1) return RECORD_AND_SAMPLE;
    if (this.probability <= 0) return DO_NOT_RECORD;

    const draw =
      traceId !== undefined && isValidTraceId(traceId)
        ? parseInt(traceId.slice(-8), 16) / 0xffffffff
        : parseInt(generateHexId(4), 16) / 0xffffffff;

    return draw < this.probability ? RECORD_AND_SAMPLE : DO_NOT_RECORD;
  }
}

/** Options for {@link ParentBasedSampler}. */
export interface ParentBasedSamplerOptions {
  /** Sampler consulted when there is no parent. Default: always on. */
  readonly root?: Sampler;
  /** Decision when the parent was sampled. Default: sample. */
  readonly remoteParentSampled?: Sampler;
  /** Decision when the parent was not sampled. Default: do not record. */
  readonly remoteParentNotSampled?: Sampler;
}

/**
 * Delegates to the parent's sampling decision, falling back to a root sampler.
 *
 * The parent's decision travels in `SpanContext.traceFlags`, which the tracer
 * stamps on every span context it creates and every child inherits.
 */
export class ParentBasedSampler implements Sampler {
  private readonly root: Sampler;
  private readonly parentSampled: Sampler;
  private readonly parentNotSampled: Sampler;

  constructor(rootOrOptions?: Sampler | ParentBasedSamplerOptions) {
    const options: ParentBasedSamplerOptions =
      rootOrOptions !== undefined && "shouldSample" in rootOrOptions
        ? { root: rootOrOptions }
        : (rootOrOptions ?? {});

    this.root = options.root ?? new AlwaysOnSampler();
    this.parentSampled = options.remoteParentSampled ?? new AlwaysOnSampler();
    this.parentNotSampled =
      options.remoteParentNotSampled ?? new AlwaysOffSampler();
  }

  shouldSample(parentContext?: SpanContext, traceId?: string): SamplingResult {
    if (!parentContext) {
      return this.root.shouldSample(parentContext, traceId);
    }

    const sampled =
      ((parentContext.traceFlags ?? TraceFlags.NONE) & TraceFlags.SAMPLED) ===
      TraceFlags.SAMPLED;

    return sampled
      ? this.parentSampled.shouldSample(parentContext, traceId)
      : this.parentNotSampled.shouldSample(parentContext, traceId);
  }
}

/** True when a sampling decision means the span should be exported. */
export function isSampled(result: SamplingResult): boolean {
  return result.decision === "RECORD_AND_SAMPLE";
}

/** True when a sampling decision means the span should be built at all. */
export function isRecording(result: SamplingResult): boolean {
  return result.decision !== "DO_NOT_RECORD";
}

/** Creates an always-on sampler. */
export function createAlwaysOnSampler(): AlwaysOnSampler {
  return new AlwaysOnSampler();
}

/** Creates an always-off sampler. */
export function createAlwaysOffSampler(): AlwaysOffSampler {
  return new AlwaysOffSampler();
}

/** Creates a probability sampler. */
export function createProbabilitySampler(
  probability: number,
): ProbabilitySampler {
  return new ProbabilitySampler(probability);
}

/** Creates a parent-based sampler. */
export function createParentBasedSampler(
  rootOrOptions?: Sampler | ParentBasedSamplerOptions,
): ParentBasedSampler {
  return new ParentBasedSampler(rootOrOptions);
}
