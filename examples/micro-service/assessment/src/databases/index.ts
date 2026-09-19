import type { AssessmentRepository } from "../interfaces/index.js";

export interface DatabaseContext {
  readonly assessmentRepository: AssessmentRepository;
}
