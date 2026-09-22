import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FeatureTreeDataProvider } from './feature-tree-provider';
import type { FeatureNode } from './feature-tree-provider';

/**
 * Runs in the workspace @vscode/test-cli profile (see .vscode-test.mjs),
 * which opens fixtures/sample-workspace. extension-activation.test.ts
 * already covers oddLedger.openFeature's no-argument early return and its
 * dirname fallback (exercised there because that profile opens no
 * workspace folder at all); this file covers the other half of the same
 * resolution logic — vscode.workspace.getWorkspaceFolder actually finding
 * the folder a real document lives under.
 */
/** vscode.window.tabGroups reflects a just-created webview panel only
 * after a short delay (observed empirically in this test host), so a
 * check run immediately after executeCommand sees no tab at all. Polls
 * briefly instead of a single fixed sleep, so the common case stays
 * fast. */
async function waitForWebviewTab(label: string, timeoutMs = 2000): Promise<vscode.Tab | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .find((tab) => tab.input instanceof vscode.TabInputWebview && tab.label === label);
    if (found || Date.now() >= deadline) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

suite('oddLedger.openFeature — workspace with odd/tasks/', () => {
  test('opens the detail panel, resolving the workspace root via vscode.workspace.getWorkspaceFolder', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const provider = new FeatureTreeDataProvider();
    const [node] = provider.getChildren() as FeatureNode[];
    assert.ok(node, 'expected at least one feature node from the fixture workspace');

    await vscode.commands.executeCommand('oddLedger.openFeature', node);

    const opened = await waitForWebviewTab(node.model.featureName);
    assert.ok(opened, 'expected a tab titled after the feature name to open');

    await vscode.window.tabGroups.close(opened!);
  });
});
