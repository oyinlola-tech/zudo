export interface AssessmentModel {
  readonly id: string;
  readonly courseId: string;
  readonly title: string;
  readonly type: string;
  readonly totalPoints: number;
  readonly durationMinutes: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SubmissionModel {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentId: string;
  readonly answers: string;
  readonly score: number | null;
  readonly status: string;
  readonly submittedAt: Date;
  readonly gradedAt: Date | null;
}
