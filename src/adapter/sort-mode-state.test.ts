import * as assert from 'node:assert/strict';
import { readStoredSortMode, writeStoredSortMode, SORT_MODE_STORAGE_KEY } from './sort-mode-state';

/**
 * Tests the persisted-sort-mode read/write helpers behind the
 * oddLedger.selectSortMode command (feature-sort-modes) against a fake
 * globalState-shaped object — matching vscode.Memento's own `get`/`update`
 * shape structurally. Runs under the adapter-unit @vscode/test-cli
 * profile (Mocha's own `suite`/`test` globals, the same convention every
 * other file under src/adapter/ uses), no workspace folder needed.
 */

function fakeMemento(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get(key: string): unknown {
      return store.get(key);
    },
    async update(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
  };
}

suite('sort mode persistence (feature-sort-modes)', () => {
  test('readStoredSortMode defaults to "created" when nothing is stored', () => {
    const state = fakeMemento();
    assert.equal(readStoredSortMode(state), 'created');
  });

  test('readStoredSortMode returns a validly stored mode', () => {
    const state = fakeMemento({ [SORT_MODE_STORAGE_KEY]: 'name' });
    assert.equal(readStoredSortMode(state), 'name');
  });

  test('readStoredSortMode falls back to "created" for a corrupted or stale stored value', () => {
    const state = fakeMemento({ [SORT_MODE_STORAGE_KEY]: 'oldest-to-newest' });
    assert.equal(readStoredSortMode(state), 'created');
  });

  test('writeStoredSortMode round-trips through readStoredSortMode', () => {
    const state = fakeMemento();
    writeStoredSortMode(state, 'status');
    assert.equal(readStoredSortMode(state), 'status');
  });
});
