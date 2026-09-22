/**
 * Debounces a refresh action so a burst of file-system events collapses
 * into a single run (T15). An editor save can fire several change events
 * in quick succession, and a git operation that touches many files can
 * fire many; without coalescing, each one would trigger its own tree
 * rebuild and its own re-render of an open panel.
 *
 * The timer is injected rather than taken from the global scope
 * (setTimeout/clearTimeout), so this stays plain TypeScript over an
 * abstract interface and is testable with a fake timer that never
 * actually waits, without launching an editor — the same boundary as the
 * rest of src/domain/.
 */

/**
 * An abstract scheduler: something that can run a callback after a delay
 * and cancel a still-pending one. The adapter layer's real implementation
 * (feature-document-watcher.ts) wraps setTimeout/clearTimeout; tests
 * inject a fake one instead.
 */
export interface DebounceTimer {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

/**
 * How long DebouncedAction waits, after the most recent trigger(), before
 * running its action. Long enough to coalesce the handful of change
 * events one editor save or one small git operation produces; short
 * enough that the tree and an open panel still feel like they refreshed
 * immediately to someone watching them.
 */
export const REFRESH_DEBOUNCE_MS = 300;

/**
 * Runs `action` once, `delayMs` after the most recent `trigger()` call.
 * Every `trigger()` before that delay elapses cancels the previously
 * scheduled run and starts a fresh one, so any number of triggers in a
 * burst produces exactly one run of `action`.
 */
export class DebouncedAction {
  private pending: unknown;

  constructor(
    private readonly timer: DebounceTimer,
    private readonly action: () => void,
    private readonly delayMs: number = REFRESH_DEBOUNCE_MS,
  ) {}

  /** Schedules (or reschedules) `action`. Safe to call any number of
   * times; only the most recent call within `delayMs` wins. */
  trigger(): void {
    if (this.pending !== undefined) {
      this.timer.cancel(this.pending);
    }
    this.pending = this.timer.schedule(() => {
      this.pending = undefined;
      this.action();
    }, this.delayMs);
  }

  /** Cancels a pending run, if any. Safe to call when nothing is
   * pending. */
  dispose(): void {
    if (this.pending !== undefined) {
      this.timer.cancel(this.pending);
      this.pending = undefined;
    }
  }
}
