import { z } from "zod";

/**
 * Schema for creating a new user.
 */
export const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["student", "instructor", "admin"]).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Schema for updating a user.
 */
export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * Schema for user login.
 */
export const loginUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type LoginUserInput = z.infer<typeof loginUserSchema>;

/**
 * Schema for creating an enrollment.
 */
export const createEnrollmentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  courseId: z.string().min(1, "Course ID is required"),
});

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

/**
 * Schema for creating an assessment.
 */
export const createAssessmentSchema = z.object({
  courseId: z.string().min(1, "Course ID is required"),
  title: z.string().min(1, "Title is required").max(200),
  type: z.enum(["quiz", "midterm", "final", "assignment"]),
  totalPoints: z.number().int().positive("Total points must be positive"),
  dueDate: z.string().datetime().optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

/**
 * Schema for creating a submission.
 */
export const createSubmissionSchema = z.object({
  assessmentId: z.string().min(1, "Assessment ID is required"),
  studentId: z.string().min(1, "Student ID is required"),
  content: z.string().min(1, "Content is required"),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

/**
 * Schema for creating a notification.
 */
export const createNotificationSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  type: z.string().min(1, "Notification type is required"),
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
