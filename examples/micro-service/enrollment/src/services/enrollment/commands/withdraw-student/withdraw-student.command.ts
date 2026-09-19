import { Command } from "@zudojs/cqrs";
import type { WithdrawStudentDto } from "../../../../dtos/index.js";

/** Command to withdraw a student from a course. */
export class WithdrawStudentCommand extends Command<"enrollment.withdraw-student"> {
  /** The withdrawal data. */
  public readonly data: WithdrawStudentDto;

  public constructor(data: WithdrawStudentDto) {
    super("enrollment.withdraw-student");
    this.data = data;
  }
}
