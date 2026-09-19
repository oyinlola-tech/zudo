import { QueryHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import { GetAssessmentResultQuery } from "./get-assessment-result.query.js";
import type { AssessmentRepository } from "../../../../interfaces/index.js";
import { SubmissionNotFoundError } from "../../../../errors/index.js";

export interface GetAssessmentResultResult {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentId: string;
  readonly answers: string;
  readonly score: number | null;
  readonly status: string;
  readonly submittedAt: Date;
  readonly gradedAt: Date | null;
}

export class GetAssessmentResultHandler extends QueryHandler<
  GetAssessmentResultQuery,
  GetAssessmentResultResult
> {
  public readonly queryType = GET_ASSESSMENT_RESULT_QUERY;

  private readonly repository: AssessmentRepository;

  constructor(repository: AssessmentRepository) {
    super();
    this.repository = repository;
  }

  async execute(
    query: GetAssessmentResultQuery,
    _context?: CqrsContext,
  ): Promise<GetAssessmentResultResult> {
    const submission = await this.repository.findSubmissionById(
      query.submissionId,
    );
    if (!submission) {
      throw new SubmissionNotFoundError(query.submissionId);
    }

    return {
      id: String(submission["id"]),
      assessmentId: String(submission["assessment_id"]),
      studentId: String(submission["student_id"]),
      answers: String(submission["answers"]),
      score: submission["score"] != null ? Number(submission["score"]) : null,
      status: String(submission["status"]),
      submittedAt: new Date(String(submission["submitted_at"])),
      gradedAt:
        submission["graded_at"] != null
          ? new Date(String(submission["graded_at"]))
          : null,
    };
  }
}

const GET_ASSESSMENT_RESULT_QUERY = "assessment.result.get" as const;
