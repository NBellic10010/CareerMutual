import type { ReviewWindowRepository } from "@onlyboth/application";
import type { ReviewWindow } from "@onlyboth/domain";

export class InMemoryReviewWindowRepository implements ReviewWindowRepository {
  private readonly windows = new Map<string, ReviewWindow>();

  public async insert(window: ReviewWindow): Promise<void> {
    if (this.windows.has(window.id)) {
      throw new Error(`Review Window ${window.id} already exists`);
    }
    this.windows.set(window.id, structuredClone(window));
  }

  public async getById(id: string): Promise<ReviewWindow | undefined> {
    const window = this.windows.get(id);
    return window === undefined ? undefined : structuredClone(window);
  }

  public async save(window: ReviewWindow, expectedVersion: number): Promise<void> {
    const current = this.windows.get(window.id);
    if (current === undefined) {
      throw new Error(`Review Window ${window.id} does not exist`);
    }
    if (current.version !== expectedVersion) {
      throw new Error(
        `Review Window version conflict: expected ${expectedVersion}, received ${current.version}`,
      );
    }
    this.windows.set(window.id, structuredClone(window));
  }
}
