/**
 * @zudojs/serialization — Transformer policy.
 *
 * How the serializer resolves transformers (a caller registry layered over
 * the built-ins), normalises what a transformer's `serialize` returns, and
 * refuses values it would otherwise silently write as `{}`.
 */

export {
  createBuiltinTransformers,
  layerTransformers,
  type TransformerLookup,
} from "./transformerLookup.core.js";
export { assertNotLossy, toTaggedOutput } from "./transformerOutput.helper.js";
