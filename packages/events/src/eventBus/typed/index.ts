/**
 * Payload-map-typed view over an `EventBus`.
 *
 * @module eventBus/typed
 */

export { createTypedEventBus } from "./eventBus.typed.js";
export type {
  TypedEvent,
  TypedEventBus,
  TypedPublishOptions,
} from "./eventBus.typed.js";
