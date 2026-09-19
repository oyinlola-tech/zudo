---
"@zudojs/queue": minor
---

Round 10 fixes:

- INF-09: after a job times out, its concurrency slot and its retry wait up to `QueueOptions.timeoutGraceMs` (new, default 5000 ms) for the processor to actually settle. A processor that ignored `context.signal` used to keep running beside its own retries. Past the grace period, the processor is abandoned and the job fails anyway.
- INF-10: new `QueueOptions.autoProcess` (default `true`) and optional `Queue.setAutoProcess()`. `createWorker` turns the queue's own poller off as a consumer, so a worker is the only thing running jobs, its middleware, timeout and concurrency apply to every job, and `worker.stop()` really stops consumption. Scheduled-job promotion and stalled-job reclaim keep running.
- INF-11: a pending retry timer stays registered until it fires, so `close()` now clears it. It used to be deregistered as soon as it was registered.
- INF-18: a worker's failing poll and a throwing event listener are reported through `logger.error` (new optional member of `QueueLogger`; new `WorkerOptions.logger`), or through `process.emitWarning` (type `ZudoQueueWarning`) when no logger is configured. They no longer go to `console.error`.
- cross/X-06: new `QueueOptions.contextCarriers` with the `QueueContextCarrier` contract, `captureContext`, `runWithContext` and `CONTEXT_METADATA_KEY`. Ambient context (a tenant id, a correlation id) is captured into job metadata at `add()` and restored around the middleware and the processor, for both the queue's poller and a `Worker`.

Behaviour changes: once a `Worker` is created for a queue, the queue no longer consumes jobs itself. A timed-out attempt holds its slot until the processor settles or `timeoutGraceMs` elapses. Default error reporting uses `process.emitWarning` instead of `console.error`.
