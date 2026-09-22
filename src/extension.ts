import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { FeatureDetailPanel } from './adapter/feature-detail-panel';
import type { FeatureNode } from './adapter/feature-tree-provider';
import { FeatureTreeDataProvider } from './adapter/feature-tree-provider';
import { fetchDocumentRevisions } from './domain/fetch-git-revisions';
import { buildHistory, mostRecentWorkDate } from './domain/build-history';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new FeatureTreeDataProvider();
  const detailPanel = new FeatureDetailPanel();
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

  const openFeatureCommand = vscode.commands.registerCommand('oddLedger.openFeature', async (node?: FeatureNode) => {
    if (!node) {
      // Invoked with no argument, e.g. from the command palette rather
      // than by clicking a tree item: there is no feature to show.
      return;
    }
    const documentUri = vscode.Uri.file(node.model.documentPath);
    // The workspace folder the document actually lives under, so a
    // multi-root workspace reports the right project name and a
    // repo-relative path (T10). Falling back to the document's own
    // directory keeps this from throwing if the folder cannot be
    // resolved; the relative path then degrades to just the filename.
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(documentUri)?.uri.fsPath ?? dirname(node.model.documentPath);
    // T13: git-derived history. workspaceRoot is passed as git's own -C
    // directory and node.model.documentPath as a separate argument, so
    // this is the same resolution the subtitle's path already uses, never
    // a second, independent guess at where the repository lives.
    const { revisions, truncated, skippedCount } = await fetchDocumentRevisions(workspaceRoot, node.model.documentPath);
    const history = buildHistory(revisions, { truncated, skippedCount });
    const lastWork = mostRecentWorkDate(history);
    detailPanel.show(node.model, workspaceRoot, lastWork, history);
  });
  context.subscriptions.push(openFeatureCommand);

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
}

export function deactivate(): void {
  // Everything activate() created (the tree view, the detail panel
  // manager, the refresh command, openFeature, and the three filter
  // commands) is a disposable pushed to context.subscriptions, so VS Code
  // tears it down on its own. Nothing else was allocated, so there is
  // nothing to do here.
}
