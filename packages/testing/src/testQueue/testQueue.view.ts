import type {
  DeadLetterJob,
  InMemoryQueue,
  Job,
  JobId,
  JobOptions,
  Processor,
  Queue,
  QueueEventEmitter,
  QueueName,
  QueueStats,
} from "@zudojs/queue";

import type { RecordedJob, TestQueue } from "./testQueue.type.js";

type RunJobOptions<TData> = Parameters<Queue<TData>["runJob"]>[1];

/**
 * The `TestQueue` handed to tests: every `Queue` member delegates to the
 * underlying `InMemoryQueue` (whose `add` records), plus the recording
 * accessors. Members are arrow functions, so they survive destructuring.
 */
export class RecordingQueueView<TData> implements TestQueue<TData> {
  constructor(
    readonly queue: InMemoryQueue<TData>,
    private readonly recorded: RecordedJob<TData>[],
  ) {}

  get name(): QueueName {
    return this.queue.name;
  }

  get events(): QueueEventEmitter {
    return this.queue.events;
  }

  get jobs(): readonly RecordedJob<TData>[] {
    return [...this.recorded];
  }

  readonly findByName = (name: string): readonly RecordedJob<TData>[] =>
    this.recorded.filter((entry) => entry.job.name === name);

  readonly clear = (): void => {
    this.recorded.length = 0;
  };

  readonly add = (name: string, data: TData, options?: JobOptions): Promise<Job<TData>> =>
    this.queue.add(name, data, options);

  readonly process = (name: string, processor: Processor<TData>): void =>
    this.queue.process(name, processor);

  readonly getJob = (jobId: JobId): Promise<Job<TData> | null> => this.queue.getJob(jobId);

  readonly getNextJob = (): Promise<Job<TData> | null> => this.queue.getNextJob();

  readonly claimNextJob = (): Promise<Job<TData> | null> => this.queue.claimNextJob();

  readonly releaseJob = (jobId: JobId): Promise<boolean> => this.queue.releaseJob(jobId);

  readonly runJob = (job: Job<TData>, options?: RunJobOptions<TData>): Promise<void> =>
    this.queue.runJob(job, options);

  readonly getProcessor = (name: string): Processor<TData> | undefined =>
    this.queue.getProcessor(name);

  readonly getStats = (): Promise<QueueStats> => this.queue.getStats();

  readonly pause = (): Promise<void> => this.queue.pause();

  readonly resume = (): Promise<void> => this.queue.resume();

  readonly isPaused = (): boolean => this.queue.isPaused();

  readonly isDisposed = (): boolean => this.queue.isDisposed();

  readonly getDeadLetterJobs = (): Promise<readonly DeadLetterJob<TData>[]> =>
    this.queue.getDeadLetterJobs();

  readonly close = (): Promise<void> => this.queue.close();

  readonly onJobReady = (listener: () => void): (() => void) =>
    this.queue.onJobReady(listener);

  readonly setAutoProcess = (enabled: boolean): void => this.queue.setAutoProcess(enabled);
}
