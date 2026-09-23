/**
 * Test message bus helpers.
 *
 * A real MessageBus that records every dispatch.
 */

export { createTestMessageBus } from "./testMessageBus.core.js";

export type { RecordedMessage, TestMessageBus } from "./testMessageBus.core.js";
