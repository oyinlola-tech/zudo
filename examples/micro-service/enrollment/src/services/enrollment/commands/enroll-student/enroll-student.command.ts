import { Command } from "@zudojs/cqrs";
import type { EnrollStudentDto } from "../../../../dtos/index.js";

/** Command to enroll a student in a course. */
export class EnrollStudentCommand extends Command<"enrollment.enroll-student"> {
  /** The enrollment data. */
  public readonly data: EnrollStudentDto;

  public constructor(data: EnrollStudentDto) {
    super("enrollment.enroll-student");
    this.data = data;
  }
}
