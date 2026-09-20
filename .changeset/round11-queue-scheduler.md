---
"@zudojs/queue": minor
"@zudojs/scheduler": patch
---

**@zudojs/queue**

- **Security.** `zudo:context` is now owned by the queue on every enqueue path.
  Job metadata handed to `queue.add()` can no longer carry a context record of
  its own: whatever the caller put under that key is dropped before the job is
  stored, whether or not a context carrier captured anything. Previously, an
  `add()` made with no ambient context kept the caller's record verbatim and
  the queue replayed it around the middleware and the processor, so an
  enqueuer could choose the tenant, correlation id or trace the job ran under.
  Legitimately captured context is unaffected.
- `runJob` no longer leaks an `abort` listener per job on a consumer's signal.
  A worker passes one long-lived signal to every job it dispatches, so a
  long-running worker accumulated one listener — and one retained per-job
  `AbortController` — for every job it had ever processed.
- The default in-memory dead letter store is bounded. It retains the most
  recent 1000 dead-lettered jobs and evicts the oldest beyond that;
  `createInMemoryDeadLetterStore({ maxEntries })` sets a different cap, and
  `Number.POSITIVE_INFINITY` restores the previous unbounded behaviour. A
  store the queue created for itself is also cleared by `close()`; one you
  passed in as `deadLetterStore` is left alone, as before.
- A throwing queue event listener now reaches the configured logger. The
  emitter accepts a `logger` of its own
  (`createInMemoryQueueEventEmitter({ logger })`), and a queue created with
  `logger` hands it to the emitter it was given, so the failure goes to
  `logger.error` instead of always falling back to `process.emitWarning`.
- The four events that `QueueEventMap` declared but nothing emitted now fire.
  `worker:started`, `worker:stopped` and `worker:error` are published by
  `createWorker` on the queue's emitter, reachable through the new optional
  `Queue.events`. `job:cancelled` is emitted when a running job is aborted
  from outside — a draining worker, `close()`, a consumer's signal — and not
  for a job that merely timed out.

**@zudojs/scheduler**

- `handle.cancel()` aborts a running one-shot (`after()` / `at()`), as the
  README says and as a recurring schedule already did. In-flight executions
  are now tracked by schedule id, so a cancel arriving after the schedule was
  retired at dispatch time still reaches the run.
- Cron day-of-week ranges that span Sunday are parsed correctly. `0-7`, `1-7`
  and `mon-sun` all mean every day; previously `0-7` was accepted and quietly
  fired once a week, and `1-7` and `mon-sun` were rejected as inverted ranges.
  `fri-sun` and `sat-sun` work for the same reason. A bare `7` is still
  Sunday, and a genuinely inverted range such as `5-2` is still an error.
- A schedule whose job has been unregistered is retired and reported through
  `onError` with a `SchedulerJobNotFoundError`, instead of re-arming its timer
  forever while dispatching nothing and still reporting itself as active.
- `handle.resume()` on a schedule that is already active is a no-op. It used
  to recompute the next fire time from now, so a supervisor calling it
  idempotently could postpone an hourly job indefinitely. Resuming a paused
  schedule is unchanged.
