import { CommandHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import { PublishResultCommand } from "./publish-result.command.js";
import type { AssessmentRepository } from "../../../../interfaces/index.js";
import { ResultPublishedEvent } from "../../../../events/index.js";
import { SubmissionNotFoundError } from "../../../../errors/index.js";

export interface PublishResultResult {
  readonly submissionId: string;
  readonly score: number;
  readonly status: string;
  readonly gradedAt: Date;
}

export class PublishResultHandler extends CommandHandler<
  PublishResultCommand,
  PublishResultResult
> {
  public static readonly TYPE = "result.publish" as const;
  public readonly commandType = PublishResultHandler.TYPE;

  private readonly repository: AssessmentRepository;
  private readonly publishEvent: (event: {
    readonly type: string;
    readonly payload: unknown;
  }) => Promise<void>;

  constructor(
    repository: AssessmentRepository,
    publishEvent: (event: {
      readonly type: string;
      readonly payload: unknown;
    }) => Promise<void>,
  ) {
    super();
    this.repository = repository;
    this.publishEvent = publishEvent;
  }

  async execute(
    command: PublishResultCommand,
    _context?: CqrsContext,
  ): Promise<PublishResultResult> {
    const submission = await this.repository.findSubmissionById(
      command.submissionId,
    );
    if (!submission) {
      throw new SubmissionNotFoundError(command.submissionId);
    }

    const gradedAt = new Date();
    await this.repository.updateSubmissionScore(
      command.submissionId,
      command.score,
    );

    const event = ResultPublishedEvent.create({
      submissionId: command.submissionId,
      assessmentId: String(submission["assessment_id"]),
      studentId: String(submission["student_id"]),
      score: command.score,
      gradedAt,
    });

    await this.publishEvent(event);

    return {
      submissionId: command.submissionId,
      score: command.score,
      status: "graded",
      gradedAt,
    };
  }
}
