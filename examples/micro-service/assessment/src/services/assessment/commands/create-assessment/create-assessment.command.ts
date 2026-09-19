import { Command } from "@zudojs/cqrs";
import type { CreateAssessmentDto } from "../../../../dtos/index.js";

export const CREATE_ASSESSMENT_COMMAND = "assessment.create" as const;

export class CreateAssessmentCommand extends Command<
  typeof CREATE_ASSESSMENT_COMMAND
> {
  public readonly courseId: string;
  public readonly title: string;
  public readonly assessmentType: string;
  public readonly totalPoints: number;
  public readonly durationMinutes: number | null;

  constructor(dto: CreateAssessmentDto) {
    super(CREATE_ASSESSMENT_COMMAND);
    this.courseId = dto.courseId;
    this.title = dto.title;
    this.assessmentType = dto.type;
    this.totalPoints = dto.totalPoints;
    this.durationMinutes = dto.durationMinutes ?? null;
  }
}
