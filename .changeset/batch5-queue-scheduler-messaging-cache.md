---
"@zudojs/queue": minor
"@zudojs/scheduler": minor
"@zudojs/messaging": minor
"@zudojs/cache": minor
---

**@zudojs/queue**

- Polling honours `pollInterval` on every poll, not only the first. Unset, polls start at 50 ms and back off to 2000 ms while idle, as before. Work no longer waits for the next poll: `add()`, a delayed job coming due, an elapsed retry backoff, `resume()`, `process()`, `releaseJob()`, a reclaimed stalled job and a finished job all wake the poller at once. 40 instant jobs at concurrency 1 used to take about 2 s and now finish in tens of milliseconds, and a job added after an idle spell starts immediately instead of after up to 2 s.
- New optional `Queue.onJobReady(listener)`, implemented by the in-memory queue. A `Worker` subscribes on `start()` and unsubscribes on `stop()`, so an idle worker claims a newly added job at once. `WorkerOptions.pollInterval` now bounds only how often an idle worker re-checks.
- **Behaviour change: process lifetime.** Pending work keeps the Node.js process alive. While a queue has waiting, delayed, retrying or running jobs that one of its processors can run, its poll timer is referenced, so a script whose only work is a queue no longer exits before the jobs run. A started `Worker` keeps the process alive until `stop()` or `forceStop()`. An idle queue, a paused one, work that no processor handles, and a closed queue never hold the process open. Pass `keepAlive: false` (new on `QueueOptions` and `WorkerOptions`) to get back the old unreferenced timers.
- **Behaviour change: payloads.** The default `JsonSerializer` now preserves types, so a `Date` in a payload reaches the processor as a `Date`, matching `Queue<{ d: Date }>`. `BigInt`, `Map`, `Set`, `Uint8Array` and `Error` round-trip too; `BigInt` used to be rejected and `Map`/`Set` flattened to `{}`. Output for plain JSON data is unchanged. `createJsonSerializer()` now defaults to `preserveTypes: true` as well; pass `preserveTypes: false` for plain JSON, where a `Date` becomes its ISO string.
- `PassthroughSerializer` really passes payloads through. It carries the new `Serializer.passthrough` marker, and the in-memory queue stores such payloads by reference (class instances included), as with `serializePayloads: false`. Used standalone it still returns strings unchanged and JSON-encodes anything else, because the `Serializer` contract requires a string.
- **Behaviour change: ordering.** Within a priority, a job is ordered by when it became runnable: when it was added, or when a delayed job's delay elapsed. A delayed job no longer jumps ahead of jobs that were already waiting when it came due. Priority still wins first, as documented. A retried job keeps its original place in line.
- New 1-based `JobContext.attemptNumber` (`job.attempt + 1`), matching `ctx.attempt` in `@zudojs/scheduler`. `job.attempt` keeps its meaning (the number of attempts already made, `0` on the first run) because `shouldRetry`, `calculateRetryDelay`, `job:retrying` and `DeadLetterJob.attempts` are all built on it. Both are now documented.
- `queue.events` works without configuration: a queue created without an `eventEmitter` gets an in-memory emitter (it used to get a silent no-op).

**@zudojs/scheduler**

- **Behaviour change: process lifetime.** A started scheduler keeps the Node.js process alive until `stop()`. Its timer used to be unreferenced, so a script that only ran a scheduler exited 0 with nothing run. The new `SchedulerOptions.keepAlive: false` restores the old behaviour.
- `stop()` is idempotent. On a scheduler that never started, or one already stopped, it resolves (after waiting for any execution still settling) instead of rejecting with `SchedulerStoppedError`.
- `Clock` is exported from the package root (`import type { Clock } from "@zudojs/scheduler"`); it used to fail with TS2305.
- `CronParseError` messages are no longer garbled. The parser passed the reason and the expression in swapped order, producing `Invalid cron expression "Cron field "minute" value 99 is outside 0-59": 99 0 * * *.`; it now reads `Invalid cron expression "99 0 * * *": Cron field "minute" value 99 is outside 0-59.` The `expression` and `reason` metadata fields are swapped back into place too.
- `getExecutions()` records the real attempt: `3` for a run that succeeded on its third attempt (it always said `1`). While a run is in flight the record shows the attempt in progress. `JobExecutor.execute` takes an optional seventh `hooks` argument (`{ onAttempt }`) that reports each attempt as it starts.
- New `JobContext.attemptNumber`, an alias of the 1-based `ctx.attempt` under the name `@zudojs/queue` uses.

**@zudojs/messaging**

- **Behaviour change: cancellation.** An abort during the last or only handler now fails the dispatch with `MessageDispatchAbortedError` (`success: false`), even if that handler returns normally. It used to be reported as `success: true`. As with a timeout, the dispatch settles promptly and does not wait for a handler that ignores its signal. `handlerResults` still lists every handler that finished. This applies to both the bus and a dispatcher used directly.
- `send(input, { context: { correlationId, causationId } })` puts those identifiers on the message it builds, unless the input carries its own. `createDerivedMessage` in a handler therefore continues the chain instead of starting a new one.

**@zudojs/cache**

- `getStats().errors` counts rejected input: an invalid key, namespace, pattern or tag now counts and emits `cache.error`, as an invalid TTL already did. `failSilently` still never hides invalid input.
- **Behaviour change: error codes.** An invalid tag (`tags: [""]`, or one over-long or containing NUL) throws `ERR_INVALID_INPUT` (`ErrorCode.INVALID_INPUT`), the same code as an invalid key. It used to be `CACHE_OPERATION_FAILED`, which reads as an adapter fault.
- Docs: the README said invalid keys throw `CACHE_INVALID_KEY`, but no such code has ever been thrown; the code is and remains `ERR_INVALID_INPUT`, so existing `code` checks keep working. The README now says so.
- `ttl()` returns whole milliseconds, rounded down, on both the service and the memory adapter. It used to return values like `9999.52…` straight after `set({ ttl: 10_000 })`.
