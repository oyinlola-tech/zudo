/**
 * @zudojs/observability — Sampling
 *
 * Sampling strategies: AlwaysOn, AlwaysOff, Probability, ParentBased.
 */

export {
  AlwaysOnSampler,
  AlwaysOffSampler,
  ProbabilitySampler,
  ParentBasedSampler,
  createAlwaysOnSampler,
  createAlwaysOffSampler,
  createProbabilitySampler,
  createParentBasedSampler,
  isSampled,
  isRecording,
  type ParentBasedSamplerOptions,
} from "./sampler.type.js";
