import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { FeatureNode, SectionNode, TaskNode } from './feature-tree-provider';
import type { FeatureModel, ItemModel, SectionModel } from '../domain/build-feature-model';
import { EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';

const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };

function item(overrides: Partial<ItemModel> = {}): ItemModel {
  return {
    id: 'T1',
    title: 'Do the thing',
    derivedState: 'open',
    commitReference: null,
    startLine: 1,
    endLine: 1,
    evidence: '',
    ...overrides,
  };
}

function section(overrides: Partial<SectionModel> = {}): SectionModel {
  return {
    heading: 'Tasks',
    kind: 'tasks',
    counts: EMPTY_COUNTS,
    countsTowardProgress: true,
    headingLine: 5,
    items: [item()],
    ...overrides,
  };
}

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

  test('registers the selectSortMode command (feature-sort-modes)', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('oddLedger.selectSortMode'), 'oddLedger.selectSortMode was not registered');
  });

  test('oddLedger.openFeature invoked with no argument returns without opening a panel', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const before = webviewTabs().length;
    await vscode.commands.executeCommand('oddLedger.openFeature');

    // A tab count checked synchronously right after executeCommand cannot
    // fail this assertion even when the guard is broken: tabGroups only
    // reflects a newly created webview panel after the same short settle
    // delay waitForWebviewTab exists to poll through (see its own comment
    // above), so a wrongly-opened panel would not show up here yet either.
    // Waiting out that window first is what lets this test actually
    // observe whether a panel opened.
    await new Promise((resolve) => setTimeout(resolve, 500));
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

  test('oddLedger.openFeature opens the detail panel in column one, never a column derived from whichever editor happens to be active', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    // A second editor, active in column two, before the panel opens at
    // all: `vscode.ViewColumn.Beside` (the value this defect traces back
    // to) means "the column after whichever one is active", so this is
    // exactly the state that would land the panel in column three instead
    // of its fixed home. `vscode.ViewColumn.Active` would fail the same
    // way, landing the panel in column two instead of column one.
    const scratch = await vscode.workspace.openTextDocument({ content: 'scratch', language: 'plaintext' });
    await vscode.window.showTextDocument(scratch, { viewColumn: vscode.ViewColumn.Two });
    const scratchTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.equal(vscode.window.activeTextEditor?.viewColumn, vscode.ViewColumn.Two, 'expected column two to be active before opening the panel');

    const model: FeatureModel = {
      featureName: 'column-fixture-feature',
      documentPath: '/workspace/odd/tasks/column-fixture-feature.md',
      title: null,
      branch: null,
      progress: EMPTY_COUNTS,
      sections: [],
      nextStep: null,
      structure: EMPTY_DOCUMENT_STRUCTURE,
    };
    const node = new FeatureNode(model);

    await vscode.commands.executeCommand('oddLedger.openFeature', node);

    const opened = await waitForWebviewTab('column-fixture-feature');
    assert.ok(opened, 'expected a tab titled after the feature name to open');
    assert.equal(
      opened!.group.viewColumn,
      vscode.ViewColumn.One,
      'expected the panel to open in column one regardless of which column was active',
    );

    await vscode.window.tabGroups.close(opened!);
    if (scratchTab) {
      await vscode.window.tabGroups.close(scratchTab);
    }
  });

  test('opening a second feature while a different column is active does not move the already-open panel out of column one', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const firstModel: FeatureModel = {
      featureName: 'reveal-fixture-first',
      documentPath: '/workspace/odd/tasks/reveal-fixture-first.md',
      title: null,
      branch: null,
      progress: EMPTY_COUNTS,
      sections: [],
      nextStep: null,
      structure: EMPTY_DOCUMENT_STRUCTURE,
    };
    await vscode.commands.executeCommand('oddLedger.openFeature', new FeatureNode(firstModel));
    const firstTab = await waitForWebviewTab('reveal-fixture-first');
    assert.ok(firstTab, 'expected the first feature\'s panel to open');
    assert.equal(firstTab!.group.viewColumn, vscode.ViewColumn.One);

    // A different column becomes active before the second click — exactly
    // the condition that would drag an already-open panel's tab into
    // whatever group is now active, if reveal() ever passed a column
    // computed from "active" instead of staying put.
    const scratch = await vscode.workspace.openTextDocument({ content: 'scratch', language: 'plaintext' });
    await vscode.window.showTextDocument(scratch, { viewColumn: vscode.ViewColumn.Two });
    const scratchTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.equal(vscode.window.activeTextEditor?.viewColumn, vscode.ViewColumn.Two, 'expected column two to be active before the second click');

    const secondModel: FeatureModel = {
      featureName: 'reveal-fixture-second',
      documentPath: '/workspace/odd/tasks/reveal-fixture-second.md',
      title: null,
      branch: null,
      progress: EMPTY_COUNTS,
      sections: [],
      nextStep: null,
      structure: EMPTY_DOCUMENT_STRUCTURE,
    };
    await vscode.commands.executeCommand('oddLedger.openFeature', new FeatureNode(secondModel));

    const revealedTab = await waitForWebviewTab('reveal-fixture-second');
    assert.ok(revealedTab, 'expected the same panel, retitled for the second feature');
    assert.equal(
      revealedTab!.group.viewColumn,
      vscode.ViewColumn.One,
      'expected the panel tab to stay in column one rather than following the newly active column',
    );
    assert.equal(webviewTabs().length, 1, 'expected exactly one detail panel tab: the panel reused, not duplicated');

    await vscode.window.tabGroups.close(revealedTab!);
    if (scratchTab) {
      await vscode.window.tabGroups.close(scratchTab);
    }
  });

  // --- oddLedger.openTask: reveal + panel together, from one click ---------

  function writeFixtureFeature(dir: string, featureName: string, lines: string[]): { featureNode: FeatureNode; documentPath: string } {
    const documentPath = join(dir, `${featureName}.md`);
    writeFileSync(documentPath, lines.join('\n'), 'utf-8');
    const featureNode = new FeatureNode({
      featureName,
      documentPath,
      title: null,
      branch: null,
      progress: EMPTY_COUNTS,
      sections: [],
      nextStep: null,
      structure: EMPTY_DOCUMENT_STRUCTURE,
    } satisfies FeatureModel);
    return { featureNode, documentPath };
  }

  test('registers the oddLedger.openTask command', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('oddLedger.openTask'), 'oddLedger.openTask was not registered');
  });

  test('oddLedger.openTask invoked with no argument does nothing observable', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const before = webviewTabs().length;
    await vscode.commands.executeCommand('oddLedger.openTask');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(webviewTabs().length, before);
  });

  test('oddLedger.openTask reveals the task\'s own line in its document (1-based to 0-based) and opens its feature panel', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const dir = mkdtempSync(join(tmpdir(), 'odd-ledger-open-task-'));
    try {
      const { featureNode, documentPath } = writeFixtureFeature(dir, 'sample-feature', [
        '# sample-feature',
        '',
        '## Tasks',
        '',
        '- [ ] T1 First task',
        '- [ ] T2 Second task',
      ]);
      const sectionNode = new SectionNode(section({ items: [item({ startLine: 6 })] }), featureNode);
      // T2 is on line 6 (1-based) of the fixture above; the reveal API is
      // 0-based, so the selection this command produces must land on
      // line 5 — not line 0, not T1's own line.
      const taskNode = new TaskNode(item({ id: 'T2', startLine: 6 }), sectionNode, documentPath);

      await vscode.commands.executeCommand('oddLedger.openTask', taskNode);

      const editor = vscode.window.activeTextEditor;
      assert.ok(editor, 'expected a text editor to become active');
      assert.equal(editor!.document.uri.fsPath, documentPath);
      assert.equal(editor!.selection.start.line, 5);
      assert.equal(editor!.viewColumn, vscode.ViewColumn.One, 'expected the document in column one');

      const opened = await waitForWebviewTab('sample-feature');
      assert.ok(opened, 'expected the feature\'s detail panel to also open');
      assert.equal(opened!.group.viewColumn, vscode.ViewColumn.One, 'expected the panel as a tab in the same column as the document');

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.window.tabGroups.close(opened!);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('two rapid clicks on tasks in different features leave the panel and the editor describing the same, most recent task', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const dir = mkdtempSync(join(tmpdir(), 'odd-ledger-open-task-race-'));
    try {
      const alpha = writeFixtureFeature(dir, 'alpha-feature', ['# alpha-feature', '', '## Tasks', '', '- [ ] T1 Alpha task']);
      const beta = writeFixtureFeature(dir, 'beta-feature', ['# beta-feature', '', '## Tasks', '', '- [ ] T1 Beta task']);
      const alphaTask = new TaskNode(
        item({ id: 'T1', startLine: 5 }),
        new SectionNode(section({ items: [] }), alpha.featureNode),
        alpha.documentPath,
      );
      const betaTask = new TaskNode(
        item({ id: 'T1', startLine: 5 }),
        new SectionNode(section({ items: [] }), beta.featureNode),
        beta.documentPath,
      );

      // Fired back to back, deliberately not awaited between them, so the
      // second click's work can genuinely overlap the first's — exactly
      // the "two rapid clicks" scenario the race guard (open-task.ts)
      // exists for.
      const first = vscode.commands.executeCommand('oddLedger.openTask', alphaTask);
      const second = vscode.commands.executeCommand('oddLedger.openTask', betaTask);
      await Promise.all([first, second]);

      const editor = vscode.window.activeTextEditor;
      assert.ok(editor, 'expected a text editor to become active');
      assert.equal(editor!.document.uri.fsPath, beta.documentPath, 'expected the editor to show the most recent click\'s document');

      // Exactly one panel tab, titled after the most recent click's
      // feature: the panel is reused (never a second panel), and a stale
      // render from the first click must not have won the race.
      const openTabs = webviewTabs();
      assert.equal(openTabs.length, 1, 'expected exactly one detail panel tab, reused rather than duplicated');
      assert.equal(openTabs[0].label, 'beta-feature', 'expected the panel to describe the same feature the editor now shows');

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.window.tabGroups.close(openTabs[0]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
