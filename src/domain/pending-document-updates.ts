/** Tracks the distinct task-document paths updated while the window is unfocused. */
export class PendingDocumentUpdates {
  private readonly paths = new Set<string>();

  constructor(private focused: boolean) {}

  get count(): number {
    return this.paths.size;
  }

  /** Adds paths from one watcher batch only while focus is absent. */
  recordBatch(touchedPaths: ReadonlySet<string>): void {
    if (this.focused) {
      return;
    }

    for (const path of touchedPaths) {
      this.paths.add(path);
    }
  }

  /** Refocusing ends the pending period; the next blur starts from zero. */
  setFocused(focused: boolean): void {
    this.focused = focused;
    if (focused) {
      this.paths.clear();
    }
  }
}
