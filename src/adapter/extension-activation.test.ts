import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FeatureNode } from './feature-tree-provider';
import type { FeatureModel } from '../domain/build-feature-model';
import { EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';

const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };

function webviewTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => tab.input instanceof vscode.TabInputWebview);
}

/** vscode.window.tabGroups reflects a just-created webview panel only after
 * a short delay (observed empirically in this test host), so a check run
 * immediately after executeCommand sees no tab at all. Polls briefly
 * instead of a single fixed sleep, so the common case stays fast. */
async function waitForWebviewTab(label: string, timeoutMs = 2000): Promise<vscode.Tab | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = webviewTabs().find((tab) => tab.label === label);
    if (found || Date.now() >= deadline) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

suite('Extension activation', () => {
  test('activates the odd-ledger extension', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension, 'extension jorgealonsodev.odd-ledger was not found by the test host');

    await extension!.activate();

    assert.equal(extension!.isActive, true);
  });

  test('registers the refresh command', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('oddLedger.refresh'), 'oddLedger.refresh was not registered');
  });

  test('registers the openFeature command (T10)', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('oddLedger.openFeature'), 'oddLedger.openFeature was not registered');
  });

  test('oddLedger.openFeature invoked with no argument returns without opening a panel', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const before = webviewTabs().length;
    await vscode.commands.executeCommand('oddLedger.openFeature');

    assert.equal(webviewTabs().length, before);
  });

  test('oddLedger.openFeature opens the detail panel for a given feature node, resolving the workspace root from the document\'s own directory when no workspace folder is open', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();
    assert.equal(vscode.workspace.workspaceFolders, undefined, 'this test profile opens no workspace folder');

    const model: FeatureModel = {
      featureName: 'sample-feature',
      documentPath: '/workspace/odd/tasks/sample-feature.md',
      title: null,
      branch: null,
      progress: EMPTY_COUNTS,
      sections: [],
      nextStep: null,
      structure: EMPTY_DOCUMENT_STRUCTURE,
    };
    const node = new FeatureNode(model);

    await vscode.commands.executeCommand('oddLedger.openFeature', node);

    const opened = await waitForWebviewTab('sample-feature');
    assert.ok(opened, 'expected a tab titled after the feature name to open');

    await vscode.window.tabGroups.close(opened!);
  });
});
