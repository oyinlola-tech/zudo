import { Query } from "@zudojs/cqrs";

export const GET_ASSESSMENT_QUERY = "assessment.get" as const;

export class GetAssessmentQuery extends Query<typeof GET_ASSESSMENT_QUERY> {
  public readonly assessmentId: string;

  constructor(assessmentId: string) {
    super(GET_ASSESSMENT_QUERY);
    this.assessmentId = assessmentId;
  }
}
