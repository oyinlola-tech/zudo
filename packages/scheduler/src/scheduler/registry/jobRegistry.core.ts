import type { JobDefinition } from "../job/jobDefinition.type.js";

import {
  SchedulerJobAlreadyExistsError,
  SchedulerJobNotFoundError,
} from "../errors/scheduler.errors.js";

import { MAX_JOBS } from "../constants/schedulerConstants.core.js";

/**
 * Registry for job definitions.
 */
export class JobRegistry {
  private readonly jobs = new Map<string, JobDefinition>();

  /**
   * Registers a job definition.
   */
  register(job: JobDefinition): void {
    if (this.jobs.size >= MAX_JOBS) {
      throw new Error(`Maximum number of jobs (${MAX_JOBS}) exceeded.`);
    }

    const existing = this.jobs.get(job.id);
    if (existing !== undefined) {
      throw new SchedulerJobAlreadyExistsError(job.id);
    }

    this.jobs.set(job.id, Object.freeze(job));
  }

  /**
   * Retrieves a job definition by ID.
   */
  get(id: string): JobDefinition | undefined {
    return this.jobs.get(id);
  }

  /**
   * Retrieves a job definition by ID, throwing when it is not registered.
   *
   * @param id - The job identifier.
   * @returns The job definition.
   * @throws {SchedulerJobNotFoundError} when no job is registered under `id`.
   */
  getOrThrow(id: string): JobDefinition {
    const job = this.jobs.get(id);
    if (!job) {
      throw new SchedulerJobNotFoundError(id);
    }
    return job;
  }

  /**
   * Determines whether a job is registered.
   */
  has(id: string): boolean {
    return this.jobs.has(id);
  }

  /**
   * Returns all registered job IDs.
   */
  list(): readonly string[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * Unregisters a job.
   */
  unregister(id: string): boolean {
    return this.jobs.delete(id);
  }

  /**
   * Clears all registered jobs.
   */
  clear(): void {
    this.jobs.clear();
  }
}
