export class FakeClock {
  public constructor(private current: Date) {}

  public now(): Date {
    return new Date(this.current);
  }

  public advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error("FakeClock can advance only by a non-negative duration");
    }
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
