import type { EventBus } from "@zudojs/events";
import type { Queue } from "@zudojs/queue";
import {
  UserCreatedEvent,
  StudentEnrolledEvent,
  AssessmentSubmittedEvent,
  ResultPublishedEvent,
} from "../events/index.js";
import type { ProcessNotificationJobData } from "../jobs/index.js";
import { NOTIFICATION_JOB_NAME } from "../constants/index.js";

export interface EventsLoaderDeps {
  readonly eventBus: EventBus;
  readonly queue: Queue<ProcessNotificationJobData>;
}

export function loadEvents(deps: EventsLoaderDeps): void {
  deps.eventBus.on(UserCreatedEvent.type, async (event) => {
    const payload =
      event.payload as import("../events/index.js").UserCreatedPayload;
    await deps.queue.add(NOTIFICATION_JOB_NAME, {
      eventType: event.type,
      userId: payload.userId,
      metadata: {
        email: payload.email,
        name: payload.name,
        role: payload.role,
      },
    });
  });

  deps.eventBus.on(StudentEnrolledEvent.type, async (event) => {
    const payload =
      event.payload as import("../events/index.js").StudentEnrolledPayload;
    await deps.queue.add(NOTIFICATION_JOB_NAME, {
      eventType: event.type,
      userId: payload.studentId,
      metadata: {
        courseId: payload.courseId,
        enrollmentId: payload.enrollmentId,
      },
    });
  });

  deps.eventBus.on(AssessmentSubmittedEvent.type, async (event) => {
    const payload =
      event.payload as import("../events/index.js").AssessmentSubmittedPayload;
    await deps.queue.add(NOTIFICATION_JOB_NAME, {
      eventType: event.type,
      userId: payload.studentId,
      metadata: {
        assessmentId: payload.assessmentId,
        submissionId: payload.submissionId,
        assessmentTitle: payload.assessmentTitle,
        courseId: payload.courseId,
      },
    });
  });

  deps.eventBus.on(ResultPublishedEvent.type, async (event) => {
    const payload =
      event.payload as import("../events/index.js").ResultPublishedPayload;
    await deps.queue.add(NOTIFICATION_JOB_NAME, {
      eventType: event.type,
      userId: payload.studentId,
      metadata: {
        assessmentId: payload.assessmentId,
        courseId: payload.courseId,
        assessmentTitle: payload.assessmentTitle,
        score: payload.score,
        maxScore: payload.maxScore,
      },
    });
  });
}
