import type {
  Processor,
  ProcessorInfo,
  ProcessorRegistry,
} from "./processor.type.js";

import { JobError } from "@zudojs/errors";

import { assertProcessor } from "./processor.type.js";

/**
 * Creates a new ProcessorRegistry.
 */
export function createProcessorRegistry(): ProcessorRegistry {
  const processors = new Map<string, Processor>();
  const infoMap = new Map<string, ProcessorInfo>();

  return {
    register<TData, TResult>(
      jobName: string,
      processor: Processor<TData, TResult>,
      options?: { description?: string },
    ): void {
      assertProcessor(processor, jobName);

      if (processors.has(jobName)) {
        throw new JobError(
          `Processor already registered for job "${jobName}".`,
          { jobId: jobName },
        );
      }

      processors.set(jobName, processor as Processor);
      infoMap.set(jobName, {
        jobName,
        registeredAt: new Date(),
        description: options?.description,
      });
    },

    get<TData, TResult>(
      jobName: string,
    ): Processor<TData, TResult> | undefined {
      return processors.get(jobName) as Processor<TData, TResult> | undefined;
    },

    has(jobName: string): boolean {
      return processors.has(jobName);
    },

    getAll(): ProcessorInfo[] {
      return Array.from(infoMap.values());
    },

    unregister(jobName: string): boolean {
      const deleted = processors.delete(jobName);
      infoMap.delete(jobName);
      return deleted;
    },

    clear(): void {
      processors.clear();
      infoMap.clear();
    },
  };
}
