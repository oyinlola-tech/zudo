import type { AssessmentRepository } from "../interfaces/index.js";

export class AssessmentRepositoryImpl implements AssessmentRepository {
  constructor(private readonly db: AssessmentRepository) {}

  async findById(id: string) {
    return this.db.findById(id);
  }

  async findByCourseId(courseId: string) {
    return this.db.findByCourseId(courseId);
  }

  async create(data: Readonly<Record<string, unknown>>) {
    return this.db.create(data);
  }

  async findSubmissionById(id: string) {
    return this.db.findSubmissionById(id);
  }

  async findSubmissionByStudentAndAssessment(
    studentId: string,
    assessmentId: string,
  ) {
    return this.db.findSubmissionByStudentAndAssessment(
      studentId,
      assessmentId,
    );
  }

  async createSubmission(data: Readonly<Record<string, unknown>>) {
    return this.db.createSubmission(data);
  }

  async updateSubmissionScore(id: string, score: number) {
    return this.db.updateSubmissionScore(id, score);
  }

  async findSubmissionsByAssessment(assessmentId: string) {
    return this.db.findSubmissionsByAssessment(assessmentId);
  }

  async findSubmissionsByStudent(studentId: string) {
    return this.db.findSubmissionsByStudent(studentId);
  }
}
