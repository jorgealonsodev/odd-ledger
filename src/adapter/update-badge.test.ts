import * as assert from 'node:assert/strict';
import { UpdateBadge } from './update-badge';

interface TestView {
  badge?: { value: number; tooltip: string };
}

function badgeValue(view: TestView): number | undefined {
  return view.badge?.value;
}

function badgeTooltip(view: TestView): string {
  return view.badge?.tooltip ?? '';
}

function fakeWindowFocus(initiallyFocused: boolean) {
  const listeners = new Set<(focused: boolean) => void>();
  return {
    focused: initiallyFocused,
    onDidChangeFocus(listener: (focused: boolean) => void) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    changeFocus(focused: boolean) {
      for (const listener of listeners) {
        listener(focused);
      }
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

suite('unfocused task-document update badge', () => {
  test('uses the initial focused state and counts updates after the window loses focus', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(true);
    const badge = new UpdateBadge(view, windowFocus);

    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(view.badge, undefined);

    windowFocus.changeFocus(false);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);
    assert.match(badgeTooltip(view), /1 task document/);
  });

  test('an initially unfocused window counts distinct paths across watcher batches, not empty batches or repeat saves', () => {
    const view: TestView = {};
    const badge = new UpdateBadge(view, fakeWindowFocus(false));

    badge.recordBatch(new Set());
    assert.equal(view.badge, undefined);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md', '/workspace/odd/tasks/beta.md']));
    badge.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));

    assert.equal(badgeValue(view), 2);
    assert.match(badgeTooltip(view), /2 task documents/);
  });

  test('focus regain clears the native badge and the next blur begins a new count', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(false);
    const badge = new UpdateBadge(view, windowFocus);

    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    windowFocus.changeFocus(true);
    assert.equal(view.badge, undefined);

    windowFocus.changeFocus(false);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);
  });

  test('disposing unsubscribes the window focus listener', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(false);
    const badge = new UpdateBadge(view, windowFocus);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(windowFocus.listenerCount, 1);

    badge.dispose();
    assert.equal(windowFocus.listenerCount, 0);
    windowFocus.changeFocus(true);
    assert.equal(badgeValue(view), 1);
  });
});
