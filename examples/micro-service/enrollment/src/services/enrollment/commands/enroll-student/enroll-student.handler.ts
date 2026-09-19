import { CommandHandler } from "@zudojs/cqrs";
import { randomUUID } from "node:crypto";
import type { EnrollStudentCommand } from "./enroll-student.command.js";
import type { EnrollmentRepository } from "../../../../repositories/enrollment.repository.js";
import type { EventBus } from "@zudojs/events";
import type { EnrollmentModel } from "../../../../models/enrollment.model.js";
import type { EnrollmentId } from "../../../../types/index.js";
import { EnrollmentStatus } from "../../../../enums/index.js";
import { createEnrollmentId } from "../../../../types/index.js";
import {
  AlreadyEnrolledError,
  EnrollmentLimitExceededError,
} from "../../../../errors/index.js";
import { StudentEnrolledEvent } from "../../../../events/index.js";
import { MAX_ENROLLMENTS_PER_STUDENT } from "../../../../constants/index.js";

/** Handler that processes EnrollStudentCommand and persists the enrollment. */
export class EnrollStudentHandler extends CommandHandler<
  EnrollStudentCommand,
  EnrollmentModel
> {
  /** The command type this handler processes. */
  public readonly commandType = "enrollment.enroll-student" as const;

  private readonly enrollments: EnrollmentRepository;
  private readonly events: EventBus;

  public constructor(enrollments: EnrollmentRepository, events: EventBus) {
    super();
    this.enrollments = enrollments;
    this.events = events;
  }

  public async execute(
    command: EnrollStudentCommand,
  ): Promise<EnrollmentModel> {
    const existing = await this.enrollments.findByStudentAndCourse(
      command.data.studentId,
      command.data.courseId,
    );

    if (existing) {
      throw new AlreadyEnrolledError(
        command.data.studentId,
        command.data.courseId,
      );
    }

    const activeCount = await this.enrollments.countActiveByStudentId(
      command.data.studentId,
    );
    if (activeCount >= MAX_ENROLLMENTS_PER_STUDENT) {
      throw new EnrollmentLimitExceededError(
        command.data.studentId,
        MAX_ENROLLMENTS_PER_STUDENT,
      );
    }

    const now = new Date();
    const enrollment: EnrollmentModel = {
      id: createEnrollmentId(randomUUID()),
      studentId: command.data.studentId,
      courseId: command.data.courseId,
      status: EnrollmentStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      withdrawnAt: null,
    };

    await this.enrollments.save(enrollment);

    const event = StudentEnrolledEvent.create({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
      enrolledAt: enrollment.createdAt,
    });

    await this.events.publish(event);

    return enrollment;
  }
}
