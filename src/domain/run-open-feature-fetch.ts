/** Sequences oddLedger.openFeature's two renders: immediate, then filled
 * in once fetchRevisions resolves. Kept free of vscode for unit testing. */

import type { FeatureModel } from './build-feature-model';
import { buildHistory, mostRecentWorkDate, PENDING_HISTORY, type FeatureHistory } from './build-history';
import type { FetchedRevisions } from './fetch-git-revisions';

/** Just the show() shape FeatureDetailPanel needs, so this stays vscode-free.
 * `isAlive()` lets the deferred render below tell a panel the user closed
 * mid-fetch from one still open, without this module importing vscode to
 * find out itself. */
export interface OpenFeaturePanel {
  show(model: FeatureModel, workspaceRoot: string, lastWork: string | null, history: FeatureHistory): void;
  isAlive(): boolean;
}

/** Renders `panel` immediately with PENDING_HISTORY, then with the
 * resolved history — unless, by the time the fetch resolves, `isCurrent()`
 * reports a newer request has taken over, or `panel.isAlive()` reports the
 * user closed it while the fetch was still in flight. Either drops this
 * stale render: a superseded request has somewhere newer to draw, and a
 * closed panel has nowhere to draw at all — rendering into it would recreate
 * the very webview the user just dismissed. */
export async function runOpenFeatureFetch(model: FeatureModel, workspaceRoot: string, panel: OpenFeaturePanel, fetchRevisions: (repoRoot: string, documentPath: string) => Promise<FetchedRevisions>, isCurrent: () => boolean): Promise<void> {
  panel.show(model, workspaceRoot, null, PENDING_HISTORY);
  const { revisions, truncated, skippedCount } = await fetchRevisions(workspaceRoot, model.documentPath);
  if (!isCurrent() || !panel.isAlive()) return;
  const history = buildHistory(revisions, { truncated, skippedCount });
  panel.show(model, workspaceRoot, mostRecentWorkDate(history), history);
}
