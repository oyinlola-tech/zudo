export interface CreateAssessmentDto {
  readonly courseId: string;
  readonly title: string;
  readonly type: string;
  readonly totalPoints: number;
  readonly durationMinutes?: number | null;
}

export interface SubmitAssessmentDto {
  readonly assessmentId: string;
  readonly studentId: string;
  readonly answers: string;
}

export interface PublishResultDto {
  readonly submissionId: string;
  readonly score: number;
}
