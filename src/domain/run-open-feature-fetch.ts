/** Runs oddLedger.openFeature's single render: awaits the bounded git read
 * (fetchRevisions), then shows the panel once, already carrying its
 * resolved history. Kept free of vscode for unit testing. */

import type { FeatureModel } from './build-feature-model';
import { buildHistory, mostRecentWorkDate, type FeatureHistory } from './build-history';
import type { FetchedRevisions } from './fetch-git-revisions';

/** Just the show() shape FeatureDetailPanel needs, so this stays vscode-free. */
export interface OpenFeaturePanel {
  show(model: FeatureModel, workspaceRoot: string, lastWork: string | null, history: FeatureHistory): void;
}

/** Awaits the bounded git read, then shows `panel` once with the resolved
 * history. The read stays asynchronous — that is what stops the editor
 * freezing — but there is no earlier, separate render to sequence around
 * it: fetchDocumentRevisions is bounded (MAX_FETCHED_REVISIONS) and fast
 * enough that a single render, arriving once, is enough. */
export async function runOpenFeatureFetch(model: FeatureModel, workspaceRoot: string, panel: OpenFeaturePanel, fetchRevisions: (repoRoot: string, documentPath: string) => Promise<FetchedRevisions>): Promise<void> {
  const { revisions, truncated, skippedCount } = await fetchRevisions(workspaceRoot, model.documentPath);
  const history = buildHistory(revisions, { truncated, skippedCount });
  panel.show(model, workspaceRoot, mostRecentWorkDate(history), history);
}
