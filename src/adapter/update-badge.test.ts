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

function fakeViewVisibility(initiallyVisible: boolean) {
  const listeners = new Set<(visible: boolean) => void>();
  return {
    visible: initiallyVisible,
    onDidChangeVisibility(listener: (visible: boolean) => void) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    changeVisibility(visible: boolean) {
      for (const listener of listeners) {
        listener(visible);
      }
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

// "Seen" means the window is focused AND the view is visible; every state
// below is one where the user cannot see the view.
const UNSEEN_STATES = [
  { label: 'an unfocused window with the view visible', focused: false, visible: true },
  { label: 'a focused window with the view hidden', focused: true, visible: false },
  { label: 'an unfocused window with the view hidden', focused: false, visible: false },
] as const;

suite('unseen task-document update badge', () => {
  test('uses the initial seen state and counts updates after the window loses focus', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(true);
    const badge = new UpdateBadge(view, windowFocus, fakeViewVisibility(true));

    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(view.badge, undefined);

    windowFocus.changeFocus(false);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);
    assert.match(badgeTooltip(view), /1 task document/);
  });

  test('an initially hidden view counts updates even though the window is focused', () => {
    const view: TestView = {};
    const badge = new UpdateBadge(view, fakeWindowFocus(true), fakeViewVisibility(false));

    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));

    assert.equal(badgeValue(view), 1);
    assert.match(badgeTooltip(view), /1 task document/);
    assert.doesNotMatch(badgeTooltip(view), /unfocused/);
  });

  for (const { label, focused, visible } of UNSEEN_STATES) {
    test(`${label} counts distinct paths across watcher batches, not empty batches or repeat saves`, () => {
      const view: TestView = {};
      const badge = new UpdateBadge(view, fakeWindowFocus(focused), fakeViewVisibility(visible));

      badge.recordBatch(new Set());
      assert.equal(view.badge, undefined);
      badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
      badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md', '/workspace/odd/tasks/beta.md']));
      badge.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));

      assert.equal(badgeValue(view), 2);
      assert.match(badgeTooltip(view), /2 task documents/);
    });
  }

  test('regaining focus keeps the badge while the view is hidden; showing the view then clears it', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(false);
    const viewVisibility = fakeViewVisibility(false);
    const badge = new UpdateBadge(view, windowFocus, viewVisibility);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);

    windowFocus.changeFocus(true);
    assert.equal(badgeValue(view), 1);
    assert.doesNotMatch(badgeTooltip(view), /unfocused/);

    badge.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));
    assert.equal(badgeValue(view), 2);

    viewVisibility.changeVisibility(true);
    assert.equal(view.badge, undefined);
  });

  test('showing the view keeps the badge while the window is unfocused; regaining focus then clears it', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(false);
    const viewVisibility = fakeViewVisibility(false);
    const badge = new UpdateBadge(view, windowFocus, viewVisibility);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));

    viewVisibility.changeVisibility(true);
    assert.equal(badgeValue(view), 1);

    windowFocus.changeFocus(true);
    assert.equal(view.badge, undefined);
  });

  test('regaining focus with the view visible completes "seen" and clears the badge; the next blur begins a new count', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(false);
    const badge = new UpdateBadge(view, windowFocus, fakeViewVisibility(true));

    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);
    windowFocus.changeFocus(true);
    assert.equal(view.badge, undefined);

    windowFocus.changeFocus(false);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);
  });

  test('showing the view in a focused window completes "seen" and clears the badge; hiding it begins a new count', () => {
    const view: TestView = {};
    const viewVisibility = fakeViewVisibility(false);
    const badge = new UpdateBadge(view, fakeWindowFocus(true), viewVisibility);

    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);
    viewVisibility.changeVisibility(true);
    assert.equal(view.badge, undefined);

    viewVisibility.changeVisibility(false);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(badgeValue(view), 1);
  });

  test('updates arriving while the user sees the view never create a badge', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(false);
    const viewVisibility = fakeViewVisibility(false);
    const badge = new UpdateBadge(view, windowFocus, viewVisibility);
    windowFocus.changeFocus(true);
    viewVisibility.changeVisibility(true);

    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(view.badge, undefined);
  });

  test('disposing unsubscribes both the window focus and the view visibility listeners', () => {
    const view: TestView = {};
    const windowFocus = fakeWindowFocus(false);
    const viewVisibility = fakeViewVisibility(false);
    const badge = new UpdateBadge(view, windowFocus, viewVisibility);
    badge.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(windowFocus.listenerCount, 1);
    assert.equal(viewVisibility.listenerCount, 1);

    badge.dispose();
    assert.equal(windowFocus.listenerCount, 0);
    assert.equal(viewVisibility.listenerCount, 0);
    windowFocus.changeFocus(true);
    viewVisibility.changeVisibility(true);
    assert.equal(badgeValue(view), 1);
  });
});
