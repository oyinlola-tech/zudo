import { Query } from "@zudojs/cqrs";

export const GET_ASSESSMENT_RESULT_QUERY = "assessment.result.get" as const;

export class GetAssessmentResultQuery extends Query<
  typeof GET_ASSESSMENT_RESULT_QUERY
> {
  public readonly submissionId: string;

  constructor(submissionId: string) {
    super(GET_ASSESSMENT_RESULT_QUERY);
    this.submissionId = submissionId;
  }
}
