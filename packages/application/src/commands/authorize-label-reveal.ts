import { authorizeLabelReveal, type ReviewWindowTransition } from "@onlyboth/domain";

import type { ReviewWindowRepository } from "../ports/review-window-repository";

export class AuthorizeLabelRevealHandler {
  public constructor(private readonly repository: ReviewWindowRepository) {}

  public async execute(reviewWindowId: string): Promise<ReviewWindowTransition> {
    const window = await this.repository.getById(reviewWindowId);
    if (window === undefined) {
      throw new Error(`Review Window ${reviewWindowId} was not found`);
    }

    const result = authorizeLabelReveal(window);
    await this.repository.save(result.window, window.version);
    return result;
  }
}
