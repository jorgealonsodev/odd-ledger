/**
 * Runs oddLedger.openTask's actual work: a click on a task node both
 * reveals that task at its own line in the Markdown source and shows the
 * detail panel for its feature, focused on the same task — one tree-item
 * command performing two actions, because a VS Code TreeItem carries only
 * one.
 *
 * Layout is deliberate: the document opens in the main editor column
 * (`vscode.ViewColumn.One`) as a preview (so walking many tasks does not
 * leave a trail of pinned tabs) without stealing focus from the tree
 * (`preserveFocus: true`, so arrowing through the task list keeps working
 * without a trip back to the tree with the mouse). The detail panel keeps
 * opening beside it (see FeatureDetailPanel.show`) rather than competing
 * for the same column.
 *
 * This feature's history is three rounds of critical findings in exactly
 * this area — a blocking git read that froze the editor, then an
 * asynchronous read that raced two quick opens, then a naive guard that
 * let a closed panel reopen itself — so this module is deliberately
 * careful about the two actions it now performs together:
 *
 *  - the panel is still shown at most once per open, with its history
 *    already resolved (runOpenFeatureFetch's own guarantee, unchanged);
 *  - each invocation from createOpenTask's returned function carries its
 *    own request id against one counter shared by every call from the
 *    same factory instance, and each half (reveal, panel) re-checks it is
 *    still the most recent request immediately before its own visible
 *    side effect — never at entry, where a call already in flight could
 *    still finish first — so two rapid clicks on different tasks can
 *    never leave the panel showing one task while the editor shows
 *    another;
 *  - the two halves run independently (each wrapped in its own recovery),
 *    so a failure in one — a document that cannot be opened, or a git
 *    read that fails — never prevents the other from completing.
 */

import * as vscode from 'vscode';
import { resolveWorkspaceRoot } from './refresh-open-panel';
import { revealTaskArguments } from './feature-tree-provider';
import type { FeatureNode, TaskNode } from './feature-tree-provider';
import { fetchDocumentRevisions } from '../domain/fetch-git-revisions';
import type { FetchedRevisions } from '../domain/fetch-git-revisions';
import { runOpenFeatureFetch } from '../domain/run-open-feature-fetch';
import type { OpenFeaturePanel } from '../domain/run-open-feature-fetch';

/** Just the show() shape oddLedger.openTask needs from the detail panel —
 * identical to OpenFeaturePanel, named separately so a caller reads this
 * module's own dependency rather than reaching into run-open-feature-fetch.ts. */
export type OpenTaskPanel = OpenFeaturePanel;

/** The `vscode.workspace.openTextDocument` seam, injectable so a test can
 * control exactly when it resolves relative to a second, overlapping
 * invocation. Defaults to the real VS Code API. */
export type OpenTextDocument = (uri: vscode.Uri) => Promise<vscode.TextDocument>;

/** The `vscode.window.showTextDocument` seam, same reasoning as
 * OpenTextDocument above. Defaults to the real VS Code API. */
export type ShowTextDocument = (
  document: vscode.TextDocument,
  options: vscode.TextDocumentShowOptions,
) => Promise<vscode.TextEditor>;

const defaultOpenTextDocument: OpenTextDocument = (uri) => Promise.resolve(vscode.workspace.openTextDocument(uri));
const defaultShowTextDocument: ShowTextDocument = (document, options) =>
  Promise.resolve(vscode.window.showTextDocument(document, options));

/**
 * Builds the oddLedger.openTask handler, closing over one request-id
 * counter shared by every click this returned function is invoked for
 * (one counter per createOpenTask call, i.e. one per activate()). See
 * this module's own doc comment above for why the guard exists and where
 * each half re-checks it.
 */
export function createOpenTask(
  panel: OpenTaskPanel,
  fetchRevisions: (repoRoot: string, documentPath: string) => Promise<FetchedRevisions> = fetchDocumentRevisions,
  openTextDocument: OpenTextDocument = defaultOpenTextDocument,
  showTextDocument: ShowTextDocument = defaultShowTextDocument,
): (node: TaskNode) => Promise<void> {
  let latestRequestId = 0;

  return async function openTask(node: TaskNode): Promise<void> {
    const requestId = ++latestRequestId;
    const isStillLatest = (): boolean => requestId === latestRequestId;
    const featureNode = node.parent.parent as FeatureNode;
    const workspaceRoot = resolveWorkspaceRoot(featureNode.model.documentPath);
    const [uri, { selection }] = revealTaskArguments(node);

    const revealPromise = (async () => {
      let document: vscode.TextDocument;
      try {
        document = await openTextDocument(uri);
      } catch {
        // A failed reveal must not prevent the panel from rendering.
        return;
      }
      if (!isStillLatest()) {
        // A newer click already superseded this one: showing this
        // task's line now would fight whatever the newer click just
        // revealed, so this stale reveal is dropped rather than applied.
        return;
      }
      try {
        await showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preview: true,
          preserveFocus: true,
          selection,
        });
      } catch {
        // Same reasoning: a failed reveal must not prevent the panel.
      }
    })();

    const panelPromise = runOpenFeatureFetch(
      featureNode.model,
      workspaceRoot,
      {
        show: (model, root, lastWork, history, focusedTaskStartLine) => {
          if (isStillLatest()) {
            // preserveFocus: true — this click also reveals a document
            // (see revealPromise above); keyboard focus must stay on the
            // tree so arrowing through the task list keeps working.
            panel.show(model, root, lastWork, history, focusedTaskStartLine, true);
          }
        },
      },
      fetchRevisions,
      node.startLine,
    ).catch(() => {
      // A failed panel render must not prevent the document from opening.
    });

    await Promise.all([revealPromise, panelPromise]);
  };
}
