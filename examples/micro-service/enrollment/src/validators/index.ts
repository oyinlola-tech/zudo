import { z } from "zod";

/** Zod schema for validating enrollment creation input. */
export const EnrollStudentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  courseId: z.string().min(1, "Course ID is required"),
});

/** Zod schema for validating withdrawal input. */
export const WithdrawStudentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  courseId: z.string().min(1, "Course ID is required"),
});

/** Zod schema for validating enrollment ID parameter. */
export const EnrollmentIdSchema = z.object({
  id: z.string().min(1, "Enrollment ID is required"),
});

/** Zod schema for validating student ID parameter. */
export const StudentIdSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
});
