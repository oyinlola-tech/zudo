/**
 * Test event bus helpers.
 *
 * A real EventBus that records every publication.
 */

export { createTestEventBus } from "./testEventBus.core.js";

export type { RecordedEvent, TestEventBus } from "./testEventBus.type.js";
