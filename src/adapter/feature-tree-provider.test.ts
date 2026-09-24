import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  FeatureNode,
  FeatureTreeDataProvider,
  NextStepNode,
  revealTaskArguments,
  SectionNode,
  TaskNode,
} from './feature-tree-provider';
import type { FeatureModel, ItemModel, NextStepModel, SectionModel } from '../domain/build-feature-model';
import { EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';
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

/** Every tooltip in this tree that can carry document text is a
 * vscode.MarkdownString, never a plain string — this asserts that shape
 * and reads its rendered value back out, so content assertions below stay
 * readable while still proving the type on every call site that uses it.
 * `appendText` (used for title/heading/branch text this extension itself
 * derives, not free document prose) escapes a literal space as `&nbsp;`
 * so Markdown never collapses or reflows it; that escaping is real and
 * correct MarkdownString behaviour, not something these content
 * assertions care about, so it is normalized back to an ordinary space
 * before returning. */
function markdownTooltipValue(tooltip: vscode.MarkdownString | string | vscode.MarkdownString[] | undefined): string {
  assert.ok(tooltip instanceof vscode.MarkdownString, `expected a MarkdownString tooltip, got: ${JSON.stringify(tooltip)}`);
  return (tooltip as vscode.MarkdownString).value.replace(/&nbsp;/g, ' ');
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
    structure: EMPTY_DOCUMENT_STRUCTURE,
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
    assert.match(markdownTooltipValue(node.tooltip), /no branch recorded/);
  });

  test("a feature node's tooltip names the branch when one is present", () => {
    const node = new FeatureNode(feature({ branch: 'feat/sample' }));
    assert.match(markdownTooltipValue(node.tooltip), /feat\/sample/);
  });

  test("a feature node's tooltip leads with its full feature name, which the sidebar label can truncate", () => {
    const node = new FeatureNode(feature({ featureName: 'a-very-long-feature-name-the-sidebar-would-cut' }));
    assert.match(markdownTooltipValue(node.tooltip), /^a-very-long-feature-name-the-sidebar-would-cut/);
  });

  test("a feature node's tooltip is a MarkdownString, and is never trusted", () => {
    const node = new FeatureNode(feature());
    assert.ok(node.tooltip instanceof vscode.MarkdownString);
    assert.notEqual((node.tooltip as vscode.MarkdownString).isTrusted, true);
  });

  test("a feature node's command opens the detail panel, passing itself as the argument (T10)", () => {
    const node = new FeatureNode(feature());
    assert.ok(node.command);
    assert.equal(node.command!.command, 'oddLedger.openFeature');
    assert.deepEqual(node.command!.arguments, [node]);
  });

  // --- SectionNode ---------------------------------------------------------

  test('a section node shows its heading as written and its own done/total', () => {
    const parent = new FeatureNode(feature());
    const node = new SectionNode(
      section({ heading: 'Acceptance criteria', kind: null, items: [item({ id: 'T1', derivedState: 'open' })], counts: { done: 1, total: 3, percentage: 33, doneUnproven: 0 } }),
      parent,
    );
    assert.equal(node.label, 'Acceptance criteria');
    assert.equal(node.description, '1/3');
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.equal(node.contextValue, 'oddLedger.section');
    assert.equal(node.parent, parent);
  });

  test("a section node's tooltip leads with its full heading and states its own done/total, and is never trusted", () => {
    const node = new SectionNode(
      section({ heading: 'Acceptance criteria', items: [item({ id: 'T1', derivedState: 'done' })], counts: { done: 1, total: 3, percentage: 33, doneUnproven: 0 } }),
      new FeatureNode(feature()),
    );
    assert.ok(node.tooltip instanceof vscode.MarkdownString);
    assert.notEqual((node.tooltip as vscode.MarkdownString).isTrusted, true);
    const value = markdownTooltipValue(node.tooltip);
    assert.match(value, /^Acceptance criteria/);
    assert.match(value, /1\/3 tasks done/);
  });

  // --- SectionNode rollup colouring -----------------------------------------

  test('a section node with every item proven renders green with the pass icon, in place of the generic list glyph', () => {
    const node = new SectionNode(
      section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done' })] }),
      new FeatureNode(feature()),
    );
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'pass');
    const color = (node.iconPath as vscode.ThemeIcon).color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.equal(color!.id, 'testing.iconPassed');
  });

  test('a section node with an unproven item stays the warning colour, never green, even though every item is closed', () => {
    const node = new SectionNode(
      section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done-unproven' })] }),
      new FeatureNode(feature()),
    );
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'warning');
    const color = (node.iconPath as vscode.ThemeIcon).color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.equal(color!.id, 'problemsWarningIcon.foreground');
  });

  test('a section node with an open item keeps the plain list glyph and no theme colour override', () => {
    const node = new SectionNode(
      section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'open' })] }),
      new FeatureNode(feature()),
    );
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'list-unordered');
    assert.equal((node.iconPath as vscode.ThemeIcon).color, undefined);
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

  const iconCases: Array<[DerivedItemState, string, string | undefined]> = [
    ['open', 'circle-large-outline', undefined],
    ['done', 'pass', 'testing.iconPassed'],
    ['done-unproven', 'warning', 'problemsWarningIcon.foreground'],
    ['declined', 'circle-slash', 'disabledForeground'],
    ['unknown', 'question', 'problemsErrorIcon.foreground'],
  ];
  for (const [state, expectedIconId, expectedColorToken] of iconCases) {
    test(`a task node in state "${state}" uses the ${expectedIconId} theme icon, coloured ${expectedColorToken ?? 'with no override'}`, () => {
      const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
      const node = new TaskNode(item({ derivedState: state }), parent, '/x/f.md');
      assert.ok(node.iconPath instanceof vscode.ThemeIcon);
      const icon = node.iconPath as vscode.ThemeIcon;
      assert.equal(icon.id, expectedIconId);
      if (expectedColorToken === undefined) {
        assert.equal(icon.color, undefined);
      } else {
        assert.ok(icon.color instanceof vscode.ThemeColor, `expected state "${state}" to carry a ThemeColor`);
        assert.equal((icon.color as vscode.ThemeColor).id, expectedColorToken);
      }
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

  test("a task node's tooltip is a MarkdownString, and is never trusted (no command: links from untrusted document text)", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'open' }), parent, '/x/f.md');
    assert.ok(node.tooltip instanceof vscode.MarkdownString);
    assert.notEqual((node.tooltip as vscode.MarkdownString).isTrusted, true);
  });

  test("a task node's tooltip always leads with its full id and title, the part the sidebar label truncates", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const longTitle = 'All five real documents parse and render without throwing or losing a section';
    const node = new TaskNode(item({ id: 'AC3', title: longTitle, derivedState: 'open', evidence: '' }), parent, '/x/f.md');
    assert.match(markdownTooltipValue(node.tooltip), new RegExp(`^AC3 ${longTitle}`));
  });

  test("an open item with no evidence produces a tooltip that is its full title, never just the bare word \"open\"", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ id: 'T1', title: 'Do the thing', derivedState: 'open', evidence: '' }), parent, '/x/f.md');
    const value = markdownTooltipValue(node.tooltip);
    assert.notEqual(value, 'open', 'expected the icon-redundant state word to be dropped entirely');
    assert.match(value, /T1 Do the thing/);
  });

  test("a done item with no evidence produces a tooltip that is its full title, never just the bare word \"done\"", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    // evidence non-empty but a commit reference proves it without evidence
    // text: proven, not unproven, so no unproven sentence is expected.
    const node = new TaskNode(
      item({ id: 'T1', title: 'Do the thing', derivedState: 'done', evidence: '', commitReference: '4b7c1e9' }),
      parent,
      '/x/f.md',
    );
    const value = markdownTooltipValue(node.tooltip);
    assert.notEqual(value, 'done');
    assert.match(value, /T1 Do the thing/);
  });

  test("a declined item with no evidence produces a tooltip that is its full title, never just the bare word \"declined\"", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ id: 'T1', title: 'Do the thing', derivedState: 'declined', evidence: '' }), parent, '/x/f.md');
    const value = markdownTooltipValue(node.tooltip);
    assert.notEqual(value, 'declined');
    assert.match(value, /T1 Do the thing/);
  });

  test("a task node's tooltip includes its evidence, after the title, when it has any", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(
      item({ id: 'T1', title: 'Ship it', derivedState: 'done', evidence: 'Verified manually against staging.' }),
      parent,
      '/x/f.md',
    );
    const value = markdownTooltipValue(node.tooltip);
    const titleIndex = value.indexOf('T1 Ship it');
    const evidenceIndex = value.indexOf('Verified manually against staging.');
    assert.ok(titleIndex >= 0, 'expected the full title in the tooltip');
    assert.ok(evidenceIndex > titleIndex, 'expected the evidence to follow the title, not precede or replace it');
  });

  test("a done-unproven task node's tooltip states the shared unproven message, after the title", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ id: 'T1', title: 'Document the signing step', derivedState: 'done-unproven', evidence: '' }), parent, '/x/f.md');
    const value = markdownTooltipValue(node.tooltip);
    const titleIndex = value.indexOf('T1 Document the signing step');
    const messageIndex = value.indexOf('ODD treats a checkbox as no proof at all.');
    assert.ok(titleIndex >= 0);
    assert.ok(messageIndex > titleIndex);
  });

  test("an unknown-marker task node's tooltip states that its marker was not recognized, after the title", () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ id: 'T1', title: 'Mystery item', derivedState: 'unknown', evidence: '' }), parent, '/x/f.md');
    const value = markdownTooltipValue(node.tooltip);
    const titleIndex = value.indexOf('T1 Mystery item');
    const messageIndex = value.indexOf('was not recognized');
    assert.ok(titleIndex >= 0);
    assert.ok(messageIndex > titleIndex);
    assert.notEqual(value, 'unknown state', 'expected a full sentence, not the old bare label');
  });

  // --- feature-level rollup colouring (T9, extended) -----------------------

  test('an open feature node uses the plain checklist icon with no theme colour override', () => {
    const node = new FeatureNode(
      feature({
        progress: { done: 1, total: 2, percentage: 50, doneUnproven: 0 },
        sections: [section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'open' })] })],
      }),
    );
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'checklist');
    assert.equal((node.iconPath as vscode.ThemeIcon).color, undefined);
  });

  test('a fully-closed feature node with every item proven renders green with the pass icon', () => {
    const node = new FeatureNode(
      feature({
        progress: { done: 2, total: 2, percentage: 100, doneUnproven: 0 },
        sections: [section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done' })] })],
      }),
    );
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'pass');
    const color = (node.iconPath as vscode.ThemeIcon).color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.equal(color!.id, 'testing.iconPassed');
  });

  test('a fully-closed feature node with an unproven item renders the warning icon and colour, never green', () => {
    const node = new FeatureNode(
      feature({
        progress: { done: 2, total: 2, percentage: 100, doneUnproven: 1 },
        sections: [section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done-unproven' })] })],
      }),
    );
    assert.ok(node.iconPath instanceof vscode.ThemeIcon);
    assert.equal((node.iconPath as vscode.ThemeIcon).id, 'warning');
    const color = (node.iconPath as vscode.ThemeIcon).color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.equal(color!.id, 'problemsWarningIcon.foreground');
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

  // --- sort mode (feature-sort-modes) ---------------------------------------

  test('the provider defaults to the "created" sort mode', () => {
    const provider = new FeatureTreeDataProvider();
    assert.equal(provider.currentSortMode, 'created');
  });

  test('a constructor-supplied initialSortMode overrides the default', () => {
    const provider = new FeatureTreeDataProvider({ initialSortMode: 'name' });
    assert.equal(provider.currentSortMode, 'name');
  });

  test('setSortMode changes currentSortMode and fires the change event', () => {
    const provider = new FeatureTreeDataProvider();
    let fired = false;
    provider.onDidChangeTreeData(() => {
      fired = true;
    });
    provider.setSortMode('status');
    assert.equal(provider.currentSortMode, 'status');
    assert.equal(fired, true);
  });

  test('setSortMode calls the injected persistSortMode callback with the new mode', () => {
    const persisted: string[] = [];
    const provider = new FeatureTreeDataProvider({ persistSortMode: (mode) => persisted.push(mode) });
    provider.setSortMode('name');
    provider.setSortMode('status');
    assert.deepEqual(persisted, ['name', 'status']);
  });

  // --- clicking a task both reveals it and opens the detail panel (oddLedger.openTask) ---

  test("a task node's command runs oddLedger.openTask, passing itself as the sole argument", () => {
    const featureNode = new FeatureNode(feature());
    const parent = new SectionNode(section({ items: [] }), featureNode);
    const node = new TaskNode(item({ derivedState: 'open', startLine: 42 }), parent, '/x/f.md');

    assert.ok(node.command);
    assert.equal(node.command!.command, 'oddLedger.openTask');
    assert.deepEqual(node.command!.arguments, [node]);
  });

  // --- revealTaskArguments: the line-conversion oddLedger.openTask reuses ---

  test('revealTaskArguments points at the task\'s document and its line, converted from 1-based to 0-based', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'open', startLine: 42 }), parent, '/x/f.md');

    const [uri, options] = revealTaskArguments(node);
    assert.equal(uri.fsPath, '/x/f.md');
    assert.ok(options.selection instanceof vscode.Range);
    // startLine is 1-based (line 42 in the document); the reveal API is
    // 0-based, so the selection must land on line 41.
    assert.equal(options.selection.start.line, 41);
    assert.equal(options.selection.end.line, 41);
  });

  test('revealTaskArguments line conversion holds at the first line of a document (startLine 1 -> line 0)', () => {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    const node = new TaskNode(item({ derivedState: 'open', startLine: 1 }), parent, '/x/f.md');
    const [, options] = revealTaskArguments(node);
    assert.equal(options.selection.start.line, 0);
  });

  // --- NextStepNode ------------------------------------------------------

  test('a next-step node labels itself "Next: <line>", is a leaf, and carries the full line as a MarkdownString tooltip', () => {
    const parent = new FeatureNode(feature());
    const node = new NextStepNode(nextStep({ line: 'Ship the remaining task.' }), parent);
    assert.equal(node.label, 'Next: Ship the remaining task.');
    assert.ok(node.tooltip instanceof vscode.MarkdownString);
    assert.notEqual((node.tooltip as vscode.MarkdownString).isTrusted, true);
    assert.equal(markdownTooltipValue(node.tooltip), 'Ship the remaining task.');
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
