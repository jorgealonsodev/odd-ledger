/** Tracks the distinct task-document paths updated while the user cannot see the Features view. */
export class PendingDocumentUpdates {
  private readonly paths = new Set<string>();
  private focused: boolean;
  private viewVisible: boolean;

  constructor(initial: { focused: boolean; viewVisible: boolean }) {
    this.focused = initial.focused;
    this.viewVisible = initial.viewVisible;
  }

  get count(): number {
    return this.paths.size;
  }

  /** The view is seen only while the window is focused and the view is visible. */
  private get seen(): boolean {
    return this.focused && this.viewVisible;
  }

  /** Adds paths from one watcher batch only while the view is not seen. */
  recordBatch(touchedPaths: ReadonlySet<string>): void {
    if (this.seen) {
      return;
    }

    for (const path of touchedPaths) {
      this.paths.add(path);
    }
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.clearOnceSeen();
  }

  setViewVisible(visible: boolean): void {
    this.viewVisible = visible;
    this.clearOnceSeen();
  }

  /**
   * Becoming seen ends the pending period; the next unseen stretch starts
   * from zero. No batch is recorded while seen, so reaching it is the only
   * transition with anything to clear, and a signal that leaves the user
   * unseen never clears.
   */
  private clearOnceSeen(): void {
    if (this.seen) {
      this.paths.clear();
    }
  }
}
