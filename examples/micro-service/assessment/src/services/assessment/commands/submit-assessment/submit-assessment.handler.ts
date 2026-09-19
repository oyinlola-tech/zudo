import { CommandHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import { randomUUID } from "node:crypto";
import { SubmitAssessmentCommand } from "./submit-assessment.command.js";
import type { AssessmentRepository } from "../../../../interfaces/index.js";
import { AssessmentSubmittedEvent } from "../../../../events/index.js";
import {
  AssessmentNotFoundError,
  DuplicateSubmissionError,
} from "../../../../errors/index.js";

export interface SubmitAssessmentResult {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentId: string;
  readonly answers: string;
  readonly status: string;
  readonly submittedAt: Date;
}

export class SubmitAssessmentHandler extends CommandHandler<
  SubmitAssessmentCommand,
  SubmitAssessmentResult
> {
  public readonly commandType = SUBMIT_ASSESSMENT_COMMAND;

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
    command: SubmitAssessmentCommand,
    _context?: CqrsContext,
  ): Promise<SubmitAssessmentResult> {
    const assessment = await this.repository.findById(command.assessmentId);
    if (!assessment) {
      throw new AssessmentNotFoundError(command.assessmentId);
    }

    const existing = await this.repository.findSubmissionByStudentAndAssessment(
      command.studentId,
      command.assessmentId,
    );
    if (existing) {
      throw new DuplicateSubmissionError(
        command.studentId,
        command.assessmentId,
      );
    }

    const id = randomUUID();
    const now = new Date();

    await this.repository.createSubmission({
      id,
      assessmentId: command.assessmentId,
      studentId: command.studentId,
      answers: command.answers,
      status: "submitted",
    });

    const event = AssessmentSubmittedEvent.create({
      submissionId: id,
      assessmentId: command.assessmentId,
      studentId: command.studentId,
      submittedAt: now,
    });

    await this.publishEvent(event);

    return {
      id,
      assessmentId: command.assessmentId,
      studentId: command.studentId,
      answers: command.answers,
      status: "submitted",
      submittedAt: now,
    };
  }
}

const SUBMIT_ASSESSMENT_COMMAND = "assessment.submit" as const;
