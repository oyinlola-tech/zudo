import { Query } from "@zudojs/cqrs";

export const LIST_ASSESSMENT_RESULTS_QUERY = "assessment.results.list" as const;

export class ListAssessmentResultsQuery extends Query<
  typeof LIST_ASSESSMENT_RESULTS_QUERY
> {
  public readonly assessmentId: string;

  constructor(assessmentId: string) {
    super(LIST_ASSESSMENT_RESULTS_QUERY);
    this.assessmentId = assessmentId;
  }
}
