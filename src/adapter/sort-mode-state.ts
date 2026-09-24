/**
 * Persists the Features tree's chosen sort mode (feature-sort-modes)
 * across reloads, the same globalState `Memento` (`context.globalState`)
 * extension.ts already has available. Filters (T9) were never persisted
 * before this feature, so this establishes the pattern rather than
 * following an existing one.
 *
 * Takes a structurally-typed `{ get, update }` object rather than the
 * literal `vscode.Memento` type, so this stays testable with a small fake
 * object and no real extension host — the same reasoning
 * resolveWorkspaceRoot (refresh-open-panel.ts) already applies for
 * vscode-adjacent decision logic worth unit-testing directly.
 */

import type { LedgerSortMode } from '../domain/filter-and-order-features';
import { isLedgerSortMode } from '../domain/filter-and-order-features';

/** The globalState key the chosen sort mode is stored under. */
export const SORT_MODE_STORAGE_KEY = 'oddLedger.sortMode';

/** Just the read/write shape this module needs from vscode.Memento. */
export interface SortModeStorage {
  get(key: string): unknown;
  update(key: string, value: unknown): Thenable<void>;
}

/** Reads the persisted sort mode, defaulting to `created` (this feature's
 * own default) when nothing is stored yet or the stored value is not one
 * of the three known modes — a stale value from a future version of this
 * extension, for instance, must never reach orderFeatures unvalidated. */
export function readStoredSortMode(state: Pick<SortModeStorage, 'get'>): LedgerSortMode {
  const stored = state.get(SORT_MODE_STORAGE_KEY);
  return isLedgerSortMode(stored) ? stored : 'created';
}

/** Persists `mode` as the new sort mode. Fire-and-forget: `Memento.update`
 * already returns a Thenable this module has no further use for, the same
 * way extension.ts's own persistSortMode callback treats it. */
export function writeStoredSortMode(state: Pick<SortModeStorage, 'update'>, mode: LedgerSortMode): void {
  void state.update(SORT_MODE_STORAGE_KEY, mode);
}
