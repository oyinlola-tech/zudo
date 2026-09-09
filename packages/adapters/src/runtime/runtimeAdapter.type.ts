/**
 * @zudojs/adapters/runtime
 *
 * Runtime adapter contracts — bridges Zudojs to execution environments.
 *
 * Examples: Node.js, Bun, Deno, AWS Lambda, Cloudflare Workers.
 */

import type { Adapter } from "../index.js";

/**
 * Runtime adapter — provides platform-specific runtime services.
 */
export interface RuntimeAdapter extends Adapter {
  /** Platform name. */
  readonly platform: string;

  /** Platform version. */
  readonly version?: string;

  /** Creates an AbortSignal tied to the platform's cancellation mechanism. */
  createSignal?(): AbortSignal;

  /** Schedules a task for later execution. */
  schedule?(delay: number, task: () => void): { cancel: () => void };

  /** Spawns a background task. */
  spawn?(task: () => void): { cancel: () => void };
}
