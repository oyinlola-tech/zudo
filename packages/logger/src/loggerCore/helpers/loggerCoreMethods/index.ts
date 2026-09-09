/**
 * @zudojs/logger/loggerCore/loggerCoreMethods
 *
 * Logger class helper methods.
 */

export { createEntry } from "./loggerCoreMethods.entry.js";

export {
  dispatchEntry,
  dispatchEntrySync,
} from "./loggerCoreMethods.dispatch.js";

export { logAtLevel } from "./loggerCoreMethods.level.js";

export { childLogger, withContextLogger } from "./loggerCoreMethods.child.js";

export {
  setLoggerLevel,
  enableLogger,
  disableLogger,
  flushLogger,
  closeLogger,
} from "./loggerCoreMethods.lifecycle.js";
