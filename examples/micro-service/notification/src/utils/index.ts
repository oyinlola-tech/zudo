import { randomUUID } from "node:crypto";
import { NotificationType } from "../enums/index.js";

export function generateId(): string {
  return randomUUID();
}

export function mapEventTypeToNotificationType(
  eventType: string,
): NotificationType {
  switch (eventType) {
    case "user.created":
      return NotificationType.USER_CREATED;
    case "student.enrolled":
      return NotificationType.STUDENT_ENROLLED;
    case "student.withdrawn":
      return NotificationType.STUDENT_WITHDRAWN;
    case "assessment.submitted":
      return NotificationType.ASSESSMENT_SUBMITTED;
    case "result.published":
      return NotificationType.RESULT_PUBLISHED;
    default:
      return NotificationType.USER_CREATED;
  }
}

export function buildNotificationTitle(type: NotificationType): string {
  switch (type) {
    case NotificationType.USER_CREATED:
      return "Welcome to CampusFlow";
    case NotificationType.STUDENT_ENROLLED:
      return "Course Enrollment Confirmed";
    case NotificationType.STUDENT_WITHDRAWN:
      return "Course Withdrawal Processed";
    case NotificationType.ASSESSMENT_SUBMITTED:
      return "Assessment Submitted";
    case NotificationType.RESULT_PUBLISHED:
      return "Results Published";
  }
}

export function buildNotificationMessage(
  type: NotificationType,
  metadata?: Readonly<Record<string, unknown>>,
): string {
  switch (type) {
    case NotificationType.USER_CREATED:
      return "Your account has been created successfully.";
    case NotificationType.STUDENT_ENROLLED:
      return `You have been enrolled in course ${metadata?.courseId ?? "N/A"}.`;
    case NotificationType.STUDENT_WITHDRAWN:
      return `You have been withdrawn from course ${metadata?.courseId ?? "N/A"}.`;
    case NotificationType.ASSESSMENT_SUBMITTED:
      return `Your submission for ${metadata?.assessmentTitle ?? "the assessment"} has been received.`;
    case NotificationType.RESULT_PUBLISHED:
      return `Results for ${metadata?.assessmentTitle ?? "the assessment"} are now available.`;
  }
}
