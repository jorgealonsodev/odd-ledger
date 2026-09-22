/** Sequences oddLedger.openFeature's two renders: immediate, then filled
 * in once fetchRevisions resolves. Kept free of vscode for unit testing. */

import type { FeatureModel } from './build-feature-model';
import { buildHistory, mostRecentWorkDate, PENDING_HISTORY, type FeatureHistory } from './build-history';
import type { FetchedRevisions } from './fetch-git-revisions';

/** Just the show() shape FeatureDetailPanel needs, so this stays vscode-free. */
export interface OpenFeaturePanel {
  show(model: FeatureModel, workspaceRoot: string, lastWork: string | null, history: FeatureHistory): void;
}

/** Renders `panel` immediately with PENDING_HISTORY, then with the
 * resolved history — unless `isCurrent()` then reports a newer request has taken over, dropping this stale one. */
export async function runOpenFeatureFetch(model: FeatureModel, workspaceRoot: string, panel: OpenFeaturePanel, fetchRevisions: (repoRoot: string, documentPath: string) => Promise<FetchedRevisions>, isCurrent: () => boolean): Promise<void> {
  panel.show(model, workspaceRoot, null, PENDING_HISTORY);
  const { revisions, truncated, skippedCount } = await fetchRevisions(workspaceRoot, model.documentPath);
  if (!isCurrent()) return;
  const history = buildHistory(revisions, { truncated, skippedCount });
  panel.show(model, workspaceRoot, mostRecentWorkDate(history), history);
}
