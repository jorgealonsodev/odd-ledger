import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  // Providers, commands and the detail panel register here in later tasks.
  // Every disposable they create must be pushed to context.subscriptions.
  void context;
}

export function deactivate(): void {
  // Nothing to tear down yet.
}
