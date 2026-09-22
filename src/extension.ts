import * as vscode from 'vscode';
import { FeatureTreeDataProvider } from './adapter/feature-tree-provider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new FeatureTreeDataProvider();

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
  // Everything activate() created (the tree view, the refresh command and
  // the three filter commands) is a disposable pushed to
  // context.subscriptions, so VS Code tears it down on its own. Nothing
  // else was allocated, so there is nothing to do here.
}
