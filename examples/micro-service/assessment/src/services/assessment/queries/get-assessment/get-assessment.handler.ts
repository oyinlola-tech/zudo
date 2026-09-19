import { QueryHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import { GetAssessmentQuery } from "./get-assessment.query.js";
import type { AssessmentRepository } from "../../../../interfaces/index.js";
import { AssessmentNotFoundError } from "../../../../errors/index.js";

export interface GetAssessmentResult {
  readonly id: string;
  readonly courseId: string;
  readonly title: string;
  readonly type: string;
  readonly totalPoints: number;
  readonly durationMinutes: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class GetAssessmentHandler extends QueryHandler<
  GetAssessmentQuery,
  GetAssessmentResult
> {
  public readonly queryType = GET_ASSESSMENT_QUERY;

  private readonly repository: AssessmentRepository;

  constructor(repository: AssessmentRepository) {
    super();
    this.repository = repository;
  }

  async execute(
    query: GetAssessmentQuery,
    _context?: CqrsContext,
  ): Promise<GetAssessmentResult> {
    const assessment = await this.repository.findById(query.assessmentId);
    if (!assessment) {
      throw new AssessmentNotFoundError(query.assessmentId);
    }

    return {
      id: String(assessment["id"]),
      courseId: String(assessment["course_id"]),
      title: String(assessment["title"]),
      type: String(assessment["type"]),
      totalPoints: Number(assessment["total_points"]),
      durationMinutes:
        assessment["duration_minutes"] != null
          ? Number(assessment["duration_minutes"])
          : null,
      createdAt: new Date(String(assessment["created_at"])),
      updatedAt: new Date(String(assessment["updated_at"])),
    };
  }
}

const GET_ASSESSMENT_QUERY = "assessment.get" as const;
