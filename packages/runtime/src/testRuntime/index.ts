/**
 * @zudojs/runtime/testing
 *
 * Testing helpers. Exposed through the "@zudojs/runtime/testing" subpath
 * rather than the package root, so a test-only module never sits on the
 * main entry point.
 */

export type { MockModule } from "./testRuntime.core.js";

export {
  createTestRuntime,
  createMockModule,
  withTestRuntime,
} from "./testRuntime.core.js";
