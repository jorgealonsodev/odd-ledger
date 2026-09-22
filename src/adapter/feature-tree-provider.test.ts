import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  FeatureNode,
  FeatureTreeDataProvider,
  NextStepNode,
  SectionNode,
  TaskNode,
} from './feature-tree-provider';
import type { FeatureModel, ItemModel, NextStepModel, SectionModel } from '../domain/build-feature-model';
import type { DerivedItemState } from '../domain/derive-checklist-state';

/**
 * These tests run in the default @vscode/test-cli configuration, which
 * opens no workspace folder at all. That is deliberate: it is the
 * mandatory "no folder open at all" case the provider must handle, and it
 * doubles as the
 * simplest reproduction of "nothing to show" the welcome content in
 * package.json is written for.
 *
 * Every node here is built directly from a hand-made model, without going
 * through document discovery or parsing — the workspace profile
 * (feature-tree-provider.workspace-test.ts) is where the full pipeline is
 * exercised end to end.
 */

function item(overrides: Partial<ItemModel> & { derivedState: DerivedItemState }): ItemModel {
  return {
    id: 'T1',
    title: 'Do the thing',
    commitReference: null,
    startLine: 10,
    endLine: 11,
    evidence: '',
    ...overrides,
  };
}

function section(overrides: Partial<SectionModel> & { items: ItemModel[] }): SectionModel {
  return {
    heading: 'Tasks',
    kind: 'tasks',
    counts: { done: 0, total: 0, percentage: 0, doneUnproven: 0 },
    countsTowardProgress: true,
    headingLine: 5,
    ...overrides,
  };
}

function nextStep(overrides: Partial<NextStepModel> = {}): NextStepModel {
  return { line: 'Ship the remaining task.', headingLine: 40, ...overrides };
}

function feature(overrides: Partial<FeatureModel> = {}): FeatureModel {
  return {
    featureName: 'sample-feature',
    documentPath: '/does/not/matter/sample-feature.md',
    title: 'sample-feature',
    branch: null,
    progress: { done: 1, total: 2, percentage: 50, doneUnproven: 0 },
    sections: [],
    nextStep: null,
    ...overrides,
  };
}

suite('FeatureTreeDataProvider — no workspace folder', () => {
  test('reports no workspace folders open, matching this suite\'s premise', () => {
    assert.equal(vscode.workspace.workspaceFolders, undefined);
  });

  test('getChildren returns an empty list at the root when no workspace folder is open', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren();
    assert.deepEqual(children, []);
  });

  test('getTreeItem returns the element itself', () => {
    const provider = new FeatureTreeDataProvider();
    const node = new FeatureNode(feature());
    assert.equal(provider.getTreeItem(node), node);
  });

  test('refresh() fires onDidChangeTreeData', () => {
    const provider = new FeatureTreeDataProvider();
    let fired = false;
    provider.onDidChangeTreeData(() => {
      fired = true;
    });
    provider.refresh();
    assert.equal(fired, true);
  });

  // --- FeatureNode -------------------------------------------------------

  test('a feature node shows its name, done/total, and is expanded by default', () => {
    const node = new FeatureNode(feature({ featureName: 'sample-feature' }));
    assert.equal(node.label, 'sample-feature');
    assert.equal(node.description, '1/2');
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.equal(node.contextValue, 'oddLedger.feature');
  });

  test('a feature node appends an unproven badge only when doneUnproven is non-zero', () => {
    const withUnproven = new FeatureNode(
      feature({ progress: { done: 2, total: 3, percentage: 67, doneUnproven: 1 } }),
    );
    assert.equal(withUnproven.description, '2/3 · 1 unproven');

    const withoutUnproven = new FeatureNode(
      feature({ progress: { done: 2, total: 3, percentage: 67, doneUnproven: 0 } }),
    );
    assert.equal(withoutUnproven.description, '2/3');
  });

  test('a feature node appends the branch to its description only when one is named', () => {
    const named = new FeatureNode(feature({ branch: 'feat/sample' }));
    assert.match(named.description as string, /feat\/sample$/);

    const unnamed = new FeatureNode(feature({ branch: null }));
    assert.ok(!(unnamed.description as string).includes('feat/'));
  });

  test("a feature node's tooltip states absence rather than staying silent when there is no branch", () => {
    const node = new FeatureNode(feature({ branch: null }));
    assert.match(node.tooltip as string, /no branch recorded/);
  });

  test("a feature node's tooltip names the branch when one is present", () => {
    const node = new FeatureNode(feature({ branch: 'feat/sample' }));
    assert.match(node.tooltip as string, /feat\/sample/);
  });

  // --- SectionNode ---------------------------------------------------------

  test('a section node shows its heading as written and its own done/total', () => {
    const parent = new FeatureNode(feature());
    const node = new SectionNode(
      section({ heading: 'Acceptance criteria', kind: null, items: [], counts: { done: 1, total: 3, percentage: 33, doneUnproven: 0 } }),
      parent,
    );
    assert.equal(node.label, 'Acceptance criteria');
    assert.equal(node.description, '1/3');
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.equal(node.contextValue, 'oddLedger.section');
    assert.equal(node.parent, parent);
  });

  // --- TaskNode --------------------------------------------------------------

  test('a task node labels itself with the id when one is present', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ id: 'T4', title: 'Add a limit', derivedState: 'open' }), parent, '/x/f.md');
    assert.equal(node.label, 'T4 Add a limit');
  });

  test('a task node labels itself with only the title when the id is absent', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ id: null, title: 'Untitled item shape', derivedState: 'open' }), parent, '/x/f.md');
    assert.equal(node.label, 'Untitled item shape');
  });

  test('a task node carries documentPath and startLine for reveal-on-click (T9)', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'open', startLine: 42 }), parent, '/x/f.md');
    assert.equal(node.documentPath, '/x/f.md');
    assert.equal(node.startLine, 42);
  });

  test('a task node is always a leaf and carries the task contextValue', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'open' }), parent, '/x/f.md');
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(node.contextValue, 'oddLedger.task');
    assert.equal(node.parent, parent);
  });

  const iconCases: Array<[DerivedItemState, string]> = [
    ['open', 'circle-large-outline'],
    ['done', 'pass'],
    ['done-unproven', 'warning'],
    ['declined', 'circle-slash'],
    ['unknown', 'question'],
  ];
  for (const [state, expectedIconId] of iconCases) {
    test(`a task node in state "${state}" uses the ${expectedIconId} theme icon`, () => {
      const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
      const node = new TaskNode(item({ derivedState: state }), parent, '/x/f.md');
      assert.ok(node.iconPath instanceof vscode.ThemeIcon);
      assert.equal((node.iconPath as vscode.ThemeIcon).id, expectedIconId);
    });
  }

  test('a task node shows its commit reference as the description when present', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'done', commitReference: '4b7c1e9' }), parent, '/x/f.md');
    assert.equal(node.description, '4b7c1e9');
  });

  test('a done-unproven task node describes itself as checked with no evidence recorded', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'done-unproven', commitReference: null }), parent, '/x/f.md');
    assert.equal(node.description, 'checked, no evidence recorded');
  });

  test('a proven-by-evidence task node with no commit reference has no description', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'done', commitReference: null }), parent, '/x/f.md');
    assert.equal(node.description, undefined);
  });

  test("a task node's tooltip is the item's evidence when present", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(
      item({ derivedState: 'done', evidence: 'Verified manually against staging.' }),
      parent,
      '/x/f.md',
    );
    assert.equal(node.tooltip, 'Verified manually against staging.');
  });

  test("a task node's tooltip falls back to a state description when evidence is empty", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'declined', evidence: '' }), parent, '/x/f.md');
    assert.equal(node.tooltip, 'declined');
  });

  // --- closed-feature muting (T9) -----------------------------------------

  test('an open feature node uses the plain checklist icon with no theme colour override', () => {
    const node = new FeatureNode(feature({ progress: { done: 1, total: 2, percentage: 50, doneUnproven: 0 } }));
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'checklist');
    assert.equal((node.iconPath as vscode.ThemeIcon).color, undefined);
  });

  test('a fully-closed feature node renders muted via the disabledForeground theme colour', () => {
    const node = new FeatureNode(feature({ progress: { done: 2, total: 2, percentage: 100, doneUnproven: 0 } }));
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'checklist');
    const color = (node.iconPath as vscode.ThemeIcon).color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.equal(color!.id, 'disabledForeground');
  });

  // --- filter (T9) ---------------------------------------------------------

  test('the provider defaults to the "all" filter and setFilter fires the change event', () => {
    const provider = new FeatureTreeDataProvider();
    let fired = false;
    provider.onDidChangeTreeData(() => {
      fired = true;
    });
    provider.setFilter('open');
    assert.equal(fired, true);
  });

  // --- reveal-on-click (T9) -------------------------------------------------

  test("a task node's command opens the document and reveals its line, converted from 1-based to 0-based", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'open', startLine: 42 }), parent, '/x/f.md');

    assert.ok(node.command);
    assert.equal(node.command!.command, 'vscode.open');
    const [uri, options] = node.command!.arguments as [vscode.Uri, { selection: vscode.Range }];
    assert.equal(uri.fsPath, '/x/f.md');
    assert.ok(options.selection instanceof vscode.Range);
    // startLine is 1-based (line 42 in the document); the reveal API is
    // 0-based, so the selection must land on line 41.
    assert.equal(options.selection.start.line, 41);
    assert.equal(options.selection.end.line, 41);
  });

  test("a task node's command line conversion holds at the first line of a document (startLine 1 -> line 0)", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'open', startLine: 1 }), parent, '/x/f.md');
    const [, options] = node.command!.arguments as [vscode.Uri, { selection: vscode.Range }];
    assert.equal(options.selection.start.line, 0);
  });

  // --- NextStepNode ------------------------------------------------------

  test('a next-step node labels itself "Next: <line>", is a leaf, and carries the full line as tooltip', () => {
    const parent = new FeatureNode(feature());
    const node = new NextStepNode(nextStep({ line: 'Ship the remaining task.' }), parent);
    assert.equal(node.label, 'Next: Ship the remaining task.');
    assert.equal(node.tooltip, 'Ship the remaining task.');
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(node.contextValue, 'oddLedger.nextStep');
    assert.equal(node.parent, parent);
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'arrow-right');
  });

  // --- provider tree walk over hand-made models --------------------------

  test('getChildren(feature) returns its sections, then the next-step node last', () => {
    const provider = new FeatureTreeDataProvider();
    const model = feature({
      sections: [section({ heading: 'Tasks', items: [item({ derivedState: 'open' })] })],
      nextStep: nextStep(),
    });
    const featureNode = new FeatureNode(model);

    const children = provider.getChildren(featureNode);
    assert.equal(children.length, 2);
    assert.ok(children[0] instanceof SectionNode);
    assert.ok(children[1] instanceof NextStepNode);
  });

  test('getChildren(feature) omits the next-step node when the model has none', () => {
    const provider = new FeatureTreeDataProvider();
    const model = feature({
      sections: [section({ heading: 'Tasks', items: [item({ derivedState: 'open' })] })],
      nextStep: null,
    });
    const children = provider.getChildren(new FeatureNode(model));
    assert.equal(children.length, 1);
    assert.ok(children[0] instanceof SectionNode);
  });

  test('getChildren(section) returns one task node per item, and getParent round-trips', () => {
    const provider = new FeatureTreeDataProvider();
    const sectionModel = section({
      heading: 'Tasks',
      items: [item({ id: 'T1', derivedState: 'open' }), item({ id: 'T2', derivedState: 'done' })],
    });
    const featureNode = new FeatureNode(feature({ sections: [sectionModel] }));
    const [sectionNode] = provider.getChildren(featureNode);
    assert.ok(sectionNode instanceof SectionNode);

    const taskNodes = provider.getChildren(sectionNode);
    assert.equal(taskNodes.length, 2);
    assert.deepEqual(
      taskNodes.map((n) => n.label),
      ['T1 Do the thing', 'T2 Do the thing'],
    );

    for (const taskNode of taskNodes) {
      assert.equal(provider.getParent(taskNode), sectionNode);
    }
    assert.equal(provider.getParent(sectionNode), featureNode);
    assert.equal(provider.getParent(featureNode), undefined);
  });

  test('getChildren(task) and getChildren(nextStep) both return no children: they are leaves', () => {
    const provider = new FeatureTreeDataProvider();
    const sectionModel = section({ items: [item({ derivedState: 'open' })] });
    const featureNode = new FeatureNode(feature({ sections: [sectionModel], nextStep: nextStep() }));
    const [sectionNode, nextStepNode] = provider.getChildren(featureNode);
    const [taskNode] = provider.getChildren(sectionNode as SectionNode);

    assert.deepEqual(provider.getChildren(taskNode), []);
    assert.deepEqual(provider.getChildren(nextStepNode), []);
  });
});
