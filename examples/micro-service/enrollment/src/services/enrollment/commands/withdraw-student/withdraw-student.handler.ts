import { CommandHandler } from "@zudojs/cqrs";
import type { WithdrawStudentCommand } from "./withdraw-student.command.js";
import type { EnrollmentRepository } from "../../../../repositories/enrollment.repository.js";
import type { EventBus } from "@zudojs/events";
import type { EnrollmentModel } from "../../../../models/enrollment.model.js";
import { EnrollmentStatus } from "../../../../enums/index.js";
import { NotEnrolledError } from "../../../../errors/index.js";
import { StudentWithdrawnEvent } from "../../../../events/index.js";

/** Handler that processes WithdrawStudentCommand and updates the enrollment status. */
export class WithdrawStudentHandler extends CommandHandler<
  WithdrawStudentCommand,
  EnrollmentModel
> {
  /** The command type this handler processes. */
  public readonly commandType = "enrollment.withdraw-student" as const;

  private readonly enrollments: EnrollmentRepository;
  private readonly events: EventBus;

  public constructor(enrollments: EnrollmentRepository, events: EventBus) {
    super();
    this.enrollments = enrollments;
    this.events = events;
  }

  public async execute(
    command: WithdrawStudentCommand,
  ): Promise<EnrollmentModel> {
    const enrollment = await this.enrollments.findByStudentAndCourse(
      command.data.studentId,
      command.data.courseId,
    );

    if (!enrollment) {
      throw new NotEnrolledError(command.data.studentId, command.data.courseId);
    }

    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new NotEnrolledError(command.data.studentId, command.data.courseId);
    }

    const now = new Date();
    await this.enrollments.updateStatus(
      enrollment.id,
      EnrollmentStatus.WITHDRAWN,
      now,
    );

    const event = StudentWithdrawnEvent.create({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
      withdrawnAt: now,
    });

    await this.events.publish(event);

    return {
      ...enrollment,
      status: EnrollmentStatus.WITHDRAWN,
      updatedAt: now,
      withdrawnAt: now,
    };
  }
}
