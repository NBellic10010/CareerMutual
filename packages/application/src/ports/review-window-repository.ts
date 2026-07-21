import type { ReviewWindow } from "@onlyboth/domain";

export interface ReviewWindowRepository {
  insert(window: ReviewWindow): Promise<void>;
  getById(id: string): Promise<ReviewWindow | undefined>;
  save(window: ReviewWindow, expectedVersion: number): Promise<void>;
}
