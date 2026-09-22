import * as vscode from 'vscode';
import { FeatureDetailPanel } from './adapter/feature-detail-panel';
import { FeatureDocumentWatcher } from './adapter/feature-document-watcher';
import type { FeatureNode, TaskNode } from './adapter/feature-tree-provider';
import { FeatureTreeDataProvider } from './adapter/feature-tree-provider';
import { createOpenTask } from './adapter/open-task';
import { refreshOpenPanelIfTouched, resolveWorkspaceRoot } from './adapter/refresh-open-panel';
import { fetchDocumentRevisions } from './domain/fetch-git-revisions';
import { runOpenFeatureFetch } from './domain/run-open-feature-fetch';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new FeatureTreeDataProvider();
  const detailPanel = new FeatureDetailPanel(context.extensionUri);
  // FeatureDetailPanel implements vscode.Disposable, so pushing it here
  // is what disposes its open webview panel (if any) on deactivate.
  context.subscriptions.push(detailPanel);

  // window.createTreeView, not window.registerTreeDataProvider: the
  // reveal API T9 needs is only exposed on the returned TreeView, not on
  // the provider itself.
  const treeView = vscode.window.createTreeView('oddLedger.features', {
    treeDataProvider: provider,
  });
  context.subscriptions.push(treeView);

  const refreshCommand = vscode.commands.registerCommand('oddLedger.refresh', () => {
    provider.refresh();
  });
  context.subscriptions.push(refreshCommand);

  // `focusedTaskStartLine` is TaskNode's own click passing its item's
  // startLine (see feature-tree-provider.ts's TaskNode command) so the
  // panel can render that one task focused; a FeatureNode's click passes
  // no second argument, so the panel renders with no focused task at all.
  const openFeatureCommand = vscode.commands.registerCommand(
    'oddLedger.openFeature',
    async (node?: FeatureNode, focusedTaskStartLine?: number) => {
      if (!node) {
        // Invoked with no argument, e.g. from the command palette rather
        // than by clicking a tree item: there is no feature to show.
        return;
      }
      // The workspace folder the document actually lives under, so a
      // multi-root workspace reports the right project name and a
      // repo-relative path (T10). Falling back to the document's own
      // directory keeps this from throwing if the folder cannot be
      // resolved; the relative path then degrades to just the filename.
      // Shared with the watcher-triggered refresh path (refresh-open-panel.ts)
      // so both resolve a document's workspace root identically.
      const workspaceRoot = resolveWorkspaceRoot(node.model.documentPath);
      await runOpenFeatureFetch(node.model, workspaceRoot, detailPanel, fetchDocumentRevisions, focusedTaskStartLine);
    },
  );
  context.subscriptions.push(openFeatureCommand);

  // A task node's own click both reveals it in the Markdown at its line
  // and opens the detail panel focused on it — see adapter/open-task.ts
  // for the layout, preview, focus and race-safety reasoning.
  const openTask = createOpenTask(detailPanel);
  const openTaskCommand = vscode.commands.registerCommand('oddLedger.openTask', async (node?: TaskNode) => {
    if (!node) {
      // Invoked with no argument, e.g. from the command palette rather
      // than by clicking a tree item: there is no task to open.
      return;
    }
    await openTask(node);
  });
  context.subscriptions.push(openTaskCommand);

  const filterAllCommand = vscode.commands.registerCommand('oddLedger.filterAll', () => {
    provider.setFilter('all');
  });
  context.subscriptions.push(filterAllCommand);

  const filterOpenCommand = vscode.commands.registerCommand('oddLedger.filterOpen', () => {
    provider.setFilter('open');
  });
  context.subscriptions.push(filterOpenCommand);

  const filterUnprovenCommand = vscode.commands.registerCommand('oddLedger.filterUnproven', () => {
    provider.setFilter('unproven');
  });
  context.subscriptions.push(filterUnprovenCommand);

  // T15: keeps the tree and any open panel honest without a manual
  // refresh. A debounced batch of odd/tasks/*.md change/create/delete
  // events (across every workspace folder, and rebuilt when the folder
  // set itself changes) always rebuilds the tree; refreshOpenPanelIfTouched
  // decides whether the currently open panel's own document was among
  // them and, if so, re-renders it or states that it is gone.
  const documentWatcher = new FeatureDocumentWatcher(({ touchedPaths }) => {
    provider.refresh();
    void refreshOpenPanelIfTouched(detailPanel, touchedPaths);
  });
  context.subscriptions.push(documentWatcher);
}

export function deactivate(): void {
  // Everything activate() created (the tree view, the detail panel
  // manager, the refresh command, openFeature, openTask, the three filter
  // commands, and the document watcher) is a disposable pushed to
  // context.subscriptions, so VS Code tears it down on its own. Nothing
  // else was allocated, so there is nothing to do here.
}
