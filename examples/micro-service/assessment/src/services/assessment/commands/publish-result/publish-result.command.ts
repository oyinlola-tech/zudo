import { Command } from "@zudojs/cqrs";
import type { PublishResultDto } from "../../../../dtos/index.js";

export const PUBLISH_RESULT_COMMAND = "result.publish" as const;

export class PublishResultCommand extends Command<
  typeof PUBLISH_RESULT_COMMAND
> {
  public readonly submissionId: string;
  public readonly score: number;

  constructor(dto: PublishResultDto) {
    super(PUBLISH_RESULT_COMMAND);
    this.submissionId = dto.submissionId;
    this.score = dto.score;
  }
}
