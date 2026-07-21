import {
  reserveReviewWindow,
  type ReserveReviewWindowInput,
  type ReviewWindowTransition,
} from "@onlyboth/domain";

import type { ReviewWindowRepository } from "../ports/review-window-repository";

export class ReserveReviewWindowHandler {
  public constructor(private readonly repository: ReviewWindowRepository) {}

  public async execute(command: ReserveReviewWindowInput): Promise<ReviewWindowTransition> {
    const result = reserveReviewWindow(command);
    await this.repository.insert(result.window);
    return result;
  }
}
