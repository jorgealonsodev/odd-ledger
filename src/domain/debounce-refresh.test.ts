import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DebouncedAction, type DebounceTimer } from './debounce-refresh';

/**
 * A timer double that never actually waits: schedule() records the
 * callback under a fresh numeric handle instead of starting a real timer,
 * and flush() runs every callback still on record, simulating every
 * pending delay elapsing at once. cancel() removes a handle the same way
 * clearTimeout would, so DebouncedAction's own cancel-before-reschedule
 * behaviour is something a test can actually observe rather than assume.
 */
class FakeTimer implements DebounceTimer {
  private nextHandle = 0;
  private readonly pending = new Map<number, () => void>();
  readonly scheduleCalls: number[] = [];
  readonly cancelCalls: number[] = [];

  schedule(callback: () => void, delayMs: number): number {
    const handle = this.nextHandle++;
    this.pending.set(handle, callback);
    this.scheduleCalls.push(delayMs);
    return handle;
  }

  cancel(handle: unknown): void {
    this.cancelCalls.push(handle as number);
    this.pending.delete(handle as number);
  }

  /** Runs every callback still scheduled, in schedule order, and clears
   * them — simulating every outstanding delay elapsing at once. */
  flush(): void {
    for (const callback of [...this.pending.values()]) {
      callback();
    }
    this.pending.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}

test('several triggers inside the debounce window run the action exactly once', () => {
  const timer = new FakeTimer();
  let calls = 0;
  const debounced = new DebouncedAction(timer, () => {
    calls++;
  });

  debounced.trigger();
  debounced.trigger();
  debounced.trigger();
  timer.flush();

  assert.equal(calls, 1, 'expected exactly one run for three triggers inside the debounce window');
});

test('trigger cancels the previously scheduled run instead of leaving it pending alongside a new one', () => {
  const timer = new FakeTimer();
  const debounced = new DebouncedAction(timer, () => {});

  debounced.trigger();
  debounced.trigger();

  assert.equal(timer.pendingCount, 1, 'expected the first scheduled run to have been cancelled, not left pending');
  assert.equal(timer.cancelCalls.length, 1, "expected exactly one cancel, for the first trigger's handle");
});

test('a trigger after the action already ran schedules a fresh run', () => {
  const timer = new FakeTimer();
  let calls = 0;
  const debounced = new DebouncedAction(timer, () => {
    calls++;
  });

  debounced.trigger();
  timer.flush();
  assert.equal(calls, 1);

  debounced.trigger();
  timer.flush();
  assert.equal(calls, 2, 'expected a trigger after a completed run to schedule and run again');
});

test('dispose cancels a pending run so it never fires', () => {
  const timer = new FakeTimer();
  let calls = 0;
  const debounced = new DebouncedAction(timer, () => {
    calls++;
  });

  debounced.trigger();
  debounced.dispose();
  timer.flush();

  assert.equal(calls, 0, 'expected dispose to cancel the pending run before it could fire');
});

test('the configured delay is passed to the timer on every schedule call', () => {
  const timer = new FakeTimer();
  const debounced = new DebouncedAction(timer, () => {}, 750);

  debounced.trigger();
  timer.flush();
  debounced.trigger();

  assert.deepEqual(timer.scheduleCalls, [750, 750]);
});
