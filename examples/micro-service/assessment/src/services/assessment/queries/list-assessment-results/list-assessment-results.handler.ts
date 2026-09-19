import { QueryHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import { ListAssessmentResultsQuery } from "./list-assessment-results.query.js";
import type { AssessmentRepository } from "../../../../interfaces/index.js";

export interface AssessmentResultItem {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentId: string;
  readonly answers: string;
  readonly score: number | null;
  readonly status: string;
  readonly submittedAt: Date;
  readonly gradedAt: Date | null;
}

export class ListAssessmentResultsHandler extends QueryHandler<
  ListAssessmentResultsQuery,
  readonly AssessmentResultItem[]
> {
  public readonly queryType = LIST_ASSESSMENT_RESULTS_QUERY;

  private readonly repository: AssessmentRepository;

  constructor(repository: AssessmentRepository) {
    super();
    this.repository = repository;
  }

  async execute(
    query: ListAssessmentResultsQuery,
    _context?: CqrsContext,
  ): Promise<readonly AssessmentResultItem[]> {
    const submissions = await this.repository.findSubmissionsByAssessment(
      query.assessmentId,
    );

    return submissions.map((sub) => ({
      id: String(sub["id"]),
      assessmentId: String(sub["assessment_id"]),
      studentId: String(sub["student_id"]),
      answers: String(sub["answers"]),
      score: sub["score"] != null ? Number(sub["score"]) : null,
      status: String(sub["status"]),
      submittedAt: new Date(String(sub["submitted_at"])),
      gradedAt:
        sub["graded_at"] != null ? new Date(String(sub["graded_at"])) : null,
    }));
  }
}

const LIST_ASSESSMENT_RESULTS_QUERY = "assessment.results.list" as const;
