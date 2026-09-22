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
import { fetchDocumentRevisions } from '../domain/fetch-git-revisions';
import { runOpenFeatureFetch, type OpenFeaturePanel } from '../domain/run-open-feature-fetch';

/**
 * The subset of FeatureDetailPanel this module needs: which document (if
 * any) is currently open, the OpenFeaturePanel.show() shape
 * runOpenFeatureFetch already depends on, and showRemoved() for the
 * deleted-while-open case. Kept as a narrow interface, mirroring
 * run-open-feature-fetch.ts's own OpenFeaturePanel, so a test can supply
 * a fake instead of a real webview.
 */
export interface RefreshablePanel extends OpenFeaturePanel {
  readonly openDocumentPath: string | undefined;
  showRemoved(featureName: string): void;
}

/**
 * Resolves the workspace folder a document lives under, falling back to
 * the document's own directory when no folder resolves — the same
 * fallback oddLedger.openFeature already uses (extension.ts), so a
 * watcher-triggered refresh degrades exactly the same way a manual open
 * does when a document sits outside any open workspace folder.
 */
function resolveWorkspaceRoot(documentPath: string): string {
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
 */
export async function refreshOpenPanelIfTouched(panel: RefreshablePanel, touchedPaths: ReadonlySet<string>): Promise<void> {
  const documentPath = panel.openDocumentPath;
  if (!documentPath || !touchedPaths.has(documentPath)) {
    return;
  }

  const featureName = basename(documentPath, '.md');

  if (!existsSync(documentPath)) {
    panel.showRemoved(featureName);
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot(documentPath);
  const text = readFileSync(documentPath, 'utf-8');
  const model = buildFeatureModel(featureName, documentPath, text);
  await runOpenFeatureFetch(model, workspaceRoot, panel, fetchDocumentRevisions);
}
