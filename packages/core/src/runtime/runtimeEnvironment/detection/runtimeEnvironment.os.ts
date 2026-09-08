import * as os from "node:os";

import type { RuntimeOS } from "../runtimeEnvironment.type.js";

import { getProcessObject } from "./runtimeEnvironment.detection.js";

/**
 * Returns the Node `os` module when running on a Node-compatible
 * engine, or undefined on engines without a process object.
 */
export function getNodeOsObject(): RuntimeOS | undefined {
  if (!getProcessObject()) {
    return undefined;
  }

  return os;
}

export function safeCall<T>(fn: (() => T) | undefined): T | undefined {
  if (!fn) {
    return undefined;
  }

  try {
    return fn();
  } catch {
    return undefined;
  }
}
