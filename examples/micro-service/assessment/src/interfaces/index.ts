export interface AssessmentRepository {
  readonly findById: (
    id: string,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  readonly findByCourseId: (
    courseId: string,
  ) => Promise<readonly Readonly<Record<string, unknown>>[]>;
  readonly create: (
    data: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<Record<string, unknown>>>;
  readonly findSubmissionById: (
    id: string,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  readonly findSubmissionByStudentAndAssessment: (
    studentId: string,
    assessmentId: string,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  readonly createSubmission: (
    data: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<Record<string, unknown>>>;
  readonly updateSubmissionScore: (
    id: string,
    score: number,
  ) => Promise<Readonly<Record<string, unknown>>>;
  readonly findSubmissionsByAssessment: (
    assessmentId: string,
  ) => Promise<readonly Readonly<Record<string, unknown>>[]>;
  readonly findSubmissionsByStudent: (
    studentId: string,
  ) => Promise<readonly Readonly<Record<string, unknown>>[]>;
}
