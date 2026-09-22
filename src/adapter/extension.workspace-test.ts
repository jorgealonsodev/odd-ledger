import { basename, join } from 'node:path';
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { resolveWorkspaceRoot } from './refresh-open-panel';
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
  test('opens a tab titled after the feature name when invoked from a workspace-discovered node', async () => {
    // This is a wiring smoke test: it proves the command still opens a
    // panel end to end when a real workspace folder is open. It does not,
    // and cannot from a vscode.Tab alone, observe which workspace root the
    // panel resolved — the tab exposes no more than its label, and the
    // label comes from the feature name regardless of that resolution. See
    // "resolveWorkspaceRoot finds the real workspace folder..." below for
    // the test that actually exercises the resolution this command uses.
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

  test('resolveWorkspaceRoot finds the real workspace folder for a document inside it, not the dirname fallback', () => {
    // The previous test's tab-count check cannot tell a correct
    // vscode.workspace.getWorkspaceFolder resolution apart from the
    // dirname(documentPath) fallback: both produce a tab titled after the
    // feature name, since the tab title never carries the resolved root.
    // This calls the same function oddLedger.openFeature and the
    // watcher-triggered refresh both use (see extension.ts and
    // refresh-open-panel.ts) directly, against a real open workspace
    // folder, and checks the one thing that actually distinguishes the two
    // paths: the fallback's basename would be "tasks" (the document's own
    // parent directory), while a correct resolution's basename is the
    // workspace folder's own name.
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length === 1, 'expected the fixture workspace folder to be open');
    const workspaceFolderPath = folders![0].uri.fsPath;
    const documentPath = join(workspaceFolderPath, 'odd', 'tasks', 'alpha-widget-cache.md');

    const resolved = resolveWorkspaceRoot(documentPath);

    assert.equal(resolved, workspaceFolderPath);
    assert.notEqual(basename(resolved), 'tasks', 'resolution fell back to the document\'s own directory instead of finding the workspace folder');
  });
});
