import { CommandHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import { randomUUID } from "node:crypto";
import { CreateAssessmentCommand } from "./create-assessment.command.js";
import type { AssessmentRepository } from "../../../../interfaces/index.js";
import { AssessmentCreatedEvent } from "../../../../events/index.js";

export interface CreateAssessmentResult {
  readonly id: string;
  readonly courseId: string;
  readonly title: string;
  readonly type: string;
  readonly totalPoints: number;
  readonly durationMinutes: number | null;
  readonly createdAt: Date;
}

export class CreateAssessmentHandler extends CommandHandler<
  CreateAssessmentCommand,
  CreateAssessmentResult
> {
  public readonly commandType = CREATE_ASSESSMENT_COMMAND;

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
    command: CreateAssessmentCommand,
    _context?: CqrsContext,
  ): Promise<CreateAssessmentResult> {
    const id = randomUUID();
    const now = new Date();

    await this.repository.create({
      id,
      courseId: command.courseId,
      title: command.title,
      type: command.assessmentType,
      totalPoints: command.totalPoints,
      durationMinutes: command.durationMinutes,
    });

    const event = AssessmentCreatedEvent.create({
      assessmentId: id,
      courseId: command.courseId,
      title: command.title,
      type: command.assessmentType,
      totalPoints: command.totalPoints,
      durationMinutes: command.durationMinutes,
      createdAt: now,
    });

    await this.publishEvent(event);

    return {
      id,
      courseId: command.courseId,
      title: command.title,
      type: command.assessmentType,
      totalPoints: command.totalPoints,
      durationMinutes: command.durationMinutes,
      createdAt: now,
    };
  }
}

const CREATE_ASSESSMENT_COMMAND = "assessment.create" as const;
