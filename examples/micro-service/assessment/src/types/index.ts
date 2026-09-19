export type AssessmentId = string & { readonly __brand: "AssessmentId" };
export type SubmissionId = string & { readonly __brand: "SubmissionId" };

export function createAssessmentId(id: string): AssessmentId {
  return id as AssessmentId;
}

export function createSubmissionId(id: string): SubmissionId {
  return id as SubmissionId;
}
