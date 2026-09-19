import { Command } from "@zudojs/cqrs";
import type { SubmitAssessmentDto } from "../../../../dtos/index.js";

export const SUBMIT_ASSESSMENT_COMMAND = "assessment.submit" as const;

export class SubmitAssessmentCommand extends Command<
  typeof SUBMIT_ASSESSMENT_COMMAND
> {
  public readonly assessmentId: string;
  public readonly studentId: string;
  public readonly answers: string;

  constructor(dto: SubmitAssessmentDto) {
    super(SUBMIT_ASSESSMENT_COMMAND);
    this.assessmentId = dto.assessmentId;
    this.studentId = dto.studentId;
    this.answers = dto.answers;
  }
}
