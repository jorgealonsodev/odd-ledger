/**
 * Re-syncs the detail panel with whatever the file-system watcher (T15)
 * just observed. This is the piece of T15's requirement 3 ("refresh the
 * open panel, not only the tree") that decides *what* the panel should
 * show next; feature-document-watcher.ts only decides *when* to ask.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import * as vscode from 'vscode';
import { buildFeatureModel } from '../domain/build-feature-model';
import { fetchDocumentRevisions, type FetchedRevisions } from '../domain/fetch-git-revisions';
import { runOpenFeatureFetch, type OpenFeaturePanel } from '../domain/run-open-feature-fetch';

/**
 * The subset of FeatureDetailPanel this module needs: which document (if
 * any) is currently open, the OpenFeaturePanel.show() shape
 * runOpenFeatureFetch already depends on, showRemoved() for the
 * deleted-while-open case, and showRefreshFailed() for a refresh that
 * failed without the document being confirmed gone. Kept narrow, so a
 * test can supply a fake instead of a real webview.
 */
export interface RefreshablePanel extends OpenFeaturePanel {
  readonly openDocumentPath: string | undefined;
  showRemoved(featureName: string): void;
  showRefreshFailed(featureName: string): void;
}

/**
 * Resolves the workspace folder a document lives under, falling back to
 * the document's own directory when no folder resolves. Exported so
 * oddLedger.openFeature (extension.ts) can call the same function instead
 * of carrying a second copy of this resolution rule — a watcher-triggered
 * refresh and a manual open now degrade identically, by construction,
 * when a document sits outside any open workspace folder.
 */
export function resolveWorkspaceRoot(documentPath: string): string {
  const documentUri = vscode.Uri.file(documentPath);
  return vscode.workspace.getWorkspaceFolder(documentUri)?.uri.fsPath ?? dirname(documentPath);
}

/**
 * Re-syncs `panel` with `touchedPaths` — the documents a debounced batch
 * of file-system events just reported — but only when the panel is
 * actually open on one of them. An unrelated feature document changing
 * must not re-fetch git history or re-render a panel showing something
 * else entirely.
 *
 * A touched document that no longer exists on disk renders the panel's
 * absence state; one that still exists is re-read and re-rendered
 * through the same runOpenFeatureFetch path oddLedger.openFeature uses,
 * so a watcher-triggered refresh and a manual re-open produce identical
 * output.
 *
 * existsSync only proves something was at documentPath the instant it
 * ran, not that reading or re-fetching it will still succeed a moment
 * later, so both are guarded: a document that vanishes, becomes
 * unreadable, or fails to fetch/render in that window renders the
 * refresh-failed state instead of throwing. The only caller
 * (extension.ts) invokes this as `void refreshOpenPanelIfTouched(...)`,
 * so the returned promise must never reject — an unhandled rejection
 * there would be invisible to the user.
 *
 * `fetchRevisions` defaults to the real fetchDocumentRevisions; a test
 * can inject a fake to exercise the fetch-fails path.
 */
export async function refreshOpenPanelIfTouched(
  panel: RefreshablePanel,
  touchedPaths: ReadonlySet<string>,
  fetchRevisions: (repoRoot: string, documentPath: string) => Promise<FetchedRevisions> = fetchDocumentRevisions,
): Promise<void> {
  const documentPath = panel.openDocumentPath;
  if (!documentPath || !touchedPaths.has(documentPath)) {
    return;
  }

  const featureName = basename(documentPath, '.md');

  if (!existsSync(documentPath)) {
    panel.showRemoved(featureName);
    return;
  }

  try {
    const workspaceRoot = resolveWorkspaceRoot(documentPath);
    const text = readFileSync(documentPath, 'utf-8');
    const model = buildFeatureModel(featureName, documentPath, text);
    await runOpenFeatureFetch(model, workspaceRoot, panel, fetchRevisions);
  } catch {
    panel.showRefreshFailed(featureName);
  }
}
