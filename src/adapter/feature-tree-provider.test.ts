import * as assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import {
  FeatureNode,
  FeatureTreeDataProvider,
  NextStepNode,
  ProjectNode,
  revealTaskArguments,
  SectionNode,
  TaskNode,
} from './feature-tree-provider';
import type { FeatureModel, ItemModel, NextStepModel, SectionModel } from '../domain/build-feature-model';
import { EMPTY_DOCUMENT_STRUCTURE, buildFeatureModel } from '../domain/build-feature-model';
import { PROGRESS_LIST_DOCUMENT } from '../domain/fixtures/progress-list-documents';
import { PROGRESS_TABLE_DOCUMENT } from '../domain/fixtures/progress-table-documents';
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
    route: null,
    tableEvidence: [],
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
    unattachedEvidence: [],
    ambiguousEvidence: [],
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

  test('a feature node shows its name and done/total', () => {
    const node = new FeatureNode(feature({ featureName: 'sample-feature' }));
    assert.equal(node.label, 'sample-feature');
    assert.equal(node.description, '1/2');
    assert.equal(node.contextValue, 'oddLedger.feature');
  });

  // --- default expansion (collapsed-tree-default) ----------------------------

  test('a feature whose items are all finished renders collapsed, not as a leaf', () => {
    const node = new FeatureNode(
      feature({ sections: [section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done-unproven' })] })] }),
    );
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
  });

  test('a feature holding one open task among finished ones renders expanded', () => {
    const node = new FeatureNode(
      feature({
        sections: [
          section({ heading: 'Done', items: [item({ id: 'T1', derivedState: 'done' })] }),
          section({ heading: 'Tasks', items: [item({ id: 'T2', derivedState: 'done' }), item({ id: 'T3', derivedState: 'open' })] }),
        ],
      }),
    );
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
  });

  for (const state of ['declined', 'unknown'] as const) {
    test(`a feature whose only unfinished item is ${state} renders expanded, same as the Open filter admits it`, () => {
      const node = new FeatureNode(
        feature({ sections: [section({ items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: state })] })] }),
      );
      assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    });
  }

  test('a feature with no items at all renders collapsed rather than expanded', () => {
    const node = new FeatureNode(feature({ sections: [], nextStep: nextStep() }));
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
  });

  test('a finished section stays collapsed inside an expanded feature, while its open sibling expands', () => {
    const provider = new FeatureTreeDataProvider();
    const featureNode = new FeatureNode(
      feature({
        sections: [
          section({ heading: 'Done', items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done-unproven' })] }),
          section({ heading: 'Tasks', items: [item({ id: 'T3', derivedState: 'open' })] }),
        ],
      }),
    );
    assert.equal(featureNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);

    const [closedSection, openSection] = provider.getChildren(featureNode) as SectionNode[];
    assert.equal(closedSection.label, 'Done');
    assert.equal(closedSection.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    assert.equal(openSection.label, 'Tasks');
    assert.equal(openSection.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
  });

  test('a section with no items renders collapsed', () => {
    const node = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    assert.equal(node.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
  });

  test('an expanded branch still lists every task, finished ones included, and every section', () => {
    const provider = new FeatureTreeDataProvider();
    const featureNode = new FeatureNode(
      feature({
        sections: [
          section({ heading: 'Done', items: [item({ id: 'T1', derivedState: 'done' })] }),
          section({
            heading: 'Tasks',
            items: [
              item({ id: 'T2', derivedState: 'done' }),
              item({ id: 'T3', derivedState: 'open' }),
              item({ id: 'T4', derivedState: 'done-unproven' }),
            ],
          }),
        ],
        nextStep: nextStep(),
      }),
    );
    const children = provider.getChildren(featureNode);
    assert.deepEqual(children.map((c) => c.label), ['Done', 'Tasks', 'Next: Ship the remaining task.']);

    const openSection = children[1] as SectionNode;
    assert.equal(openSection.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.deepEqual(
      provider.getChildren(openSection).map((t) => t.label),
      ['T2 Do the thing', 'T3 Do the thing', 'T4 Do the thing'],
    );
    assert.deepEqual(
      provider.getChildren(children[0]).map((t) => t.label),
      ['T1 Do the thing'],
    );
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

  test('a section node shows its heading as written and its own done/total, expanded while it holds an open item', () => {
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

suite('TaskNode — progress-table evidence', () => {
  function tableTask(id: string): ItemModel {
    const model = buildFeatureModel('sample', '/x/sample.md', PROGRESS_TABLE_DOCUMENT);
    const found = model.sections.flatMap((s) => s.items).find((i) => i.id === id);
    assert.ok(found);
    return found!;
  }

  function nodeFor(model: ItemModel): TaskNode {
    const parent = new SectionNode(section({ items: [] }), new FeatureNode(feature()));
    return new TaskNode(model, parent, '/x/f.md');
  }

  test('a task proven by a table row shows its commit as the description, not the unproven text', () => {
    assert.equal(nodeFor(tableTask('E1-4')).description, '7020bc6');
  });

  test('the tooltip lists each table row under its source', () => {
    const value = markdownTooltipValue(nodeFor(tableTask('E5-5')).tooltip);
    assert.match(value, /table "Progress \/ evidence", row 6/);
    assert.match(value, /table "Progress \/ evidence", row 7/);
    assert.match(value, /\*\*Commit\*\*: f5fe161/);
  });

  test('the tooltip labels inline evidence as inline when table rows follow it', () => {
    const value = markdownTooltipValue(nodeFor(tableTask('E1-5')).tooltip);
    assert.match(value, /inline/);
    assert.ok(value.indexOf('An inline note') < value.indexOf('row 2'));
  });

  test('a task with no table rows has the same tooltip as before: no source labels', () => {
    const value = markdownTooltipValue(nodeFor(item({ derivedState: 'done', evidence: 'Checked by hand.' })).tooltip);
    assert.ok(!value.includes('inline'));
    assert.match(value, /Checked by hand\./);
  });

  test('a checked task whose row says nothing still reads unproven in the tree', () => {
    assert.equal(nodeFor(tableTask('E2-1')).description, 'checked, no evidence recorded');
  });

  function listTask(id: string): ItemModel {
    const model = buildFeatureModel('sample', '/x/sample.md', PROGRESS_LIST_DOCUMENT);
    const found = model.sections.flatMap((s) => s.items).find((i) => i.id === id);
    assert.ok(found);
    return found!;
  }

  test('a task proven by a list entry shows its commit as the description', () => {
    assert.equal(nodeFor(listTask('L1')).description, 'aaaa111');
  });

  test('the tooltip lists a list entry under its source', () => {
    const value = markdownTooltipValue(nodeFor(listTask('L1')).tooltip);
    assert.match(value, /list "Progress \/ evidence", item 1/);
    assert.match(value, /commit `aaaa111`/);
  });

  test('a checked task whose entry only echoes a status word reads unproven in the tree', () => {
    assert.equal(nodeFor(listTask('L3')).description, 'checked, no evidence recorded');
  });
});

/**
 * Multi-root grouping. The default test profile opens no workspace folder
 * and a real multi-root profile is not cheap to launch, so the provider
 * takes its folder list from an injected function here (the production
 * default reads `vscode.workspace.workspaceFolders`). Each folder is a real
 * temp directory holding real feature documents, so discovery, parsing,
 * filtering and ordering all run for real.
 */
suite('FeatureTreeDataProvider — multi-root workspace grouping', () => {
  const roots: string[] = [];
  /** Folders made so far, so each fixture gets its real position as `index`. */
  let madeFolders = 0;

  /** A feature document with `done` checked (proven) tasks out of `total`. */
  function documentText(name: string, done: number, total: number, unproven = 0): string {
    const lines = [`# ${name}`, '', '## Tasks', ''];
    for (let i = 1; i <= total; i++) {
      if (i <= done - unproven) {
        lines.push(`- [x] T${i} Task ${i}`, '      DONE `9f8e7d6`', '');
      } else if (i <= done) {
        lines.push(`- [x] T${i} Task ${i}`, '');
      } else {
        lines.push(`- [ ] T${i} Task ${i}`, '');
      }
    }
    return lines.join('\n');
  }

  function makeFolder(name: string, features: Record<string, string>): vscode.WorkspaceFolder {
    const root = mkdtempSync(join(tmpdir(), 'odd-ledger-multi-'));
    roots.push(root);
    const dir = join(root, 'odd', 'tasks');
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(features)) {
      writeFileSync(join(dir, `${file}.md`), text);
    }
    return { uri: vscode.Uri.file(root), name, index: madeFolders++ };
  }

  function providerFor(folders: vscode.WorkspaceFolder[], sortMode: 'status' | 'name' = 'name'): FeatureTreeDataProvider {
    return new FeatureTreeDataProvider({ initialSortMode: sortMode, workspaceFolders: () => folders });
  }

  teardown(() => {
    madeFolders = 0;
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('two folders yield two project nodes, in folder order, holding only their own features', () => {
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 1, 2), 'a-two': documentText('a-two', 0, 1) });
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 2, 2) });
    const provider = providerFor([a, b]);

    const rootNodes = provider.getChildren() as ProjectNode[];
    assert.deepEqual(rootNodes.map((r) => r.kind), ['project', 'project']);
    assert.deepEqual(rootNodes.map((r) => r.label), ['alpha-app', 'beta-api']);

    const namesOf = (project: ProjectNode) => (provider.getChildren(project) as FeatureNode[]).map((f) => f.model.featureName);
    assert.deepEqual(namesOf(rootNodes[0]), ['a-one', 'a-two']);
    assert.deepEqual(namesOf(rootNodes[1]), ['b-one']);
  });

  test('a project node shows the aggregate done/total of its features, plus unproven when any', () => {
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 2, 3, 1), 'a-two': documentText('a-two', 1, 1) });
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 1, 4) });
    const [projectA, projectB] = providerFor([a, b]).getChildren() as ProjectNode[];
    assert.equal(projectA.description, '3/4 · 1 unproven');
    assert.equal(projectB.description, '1/4');
  });

  test('a project node holding an open feature is expanded, uses the root-folder icon, has no command and a path tooltip', () => {
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 1, 2) });
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 1, 2) });
    const [project] = providerFor([a, b]).getChildren() as ProjectNode[];

    assert.equal(project.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.equal(project.contextValue, 'oddLedger.project');
    assert.equal((project.iconPath as vscode.ThemeIcon).id, 'root-folder');
    assert.equal(project.command, undefined);
    assert.equal(project.parent, undefined);
    const tooltip = project.tooltip as vscode.MarkdownString;
    assert.ok(tooltip instanceof vscode.MarkdownString);
    assert.equal(tooltip.isTrusted, false);
    assert.ok(tooltip.value.includes('odd-ledger-multi-'), `tooltip should carry the folder path: ${tooltip.value}`);
  });

  test('a project node expands only when at least one of its features still holds unfinished work', () => {
    const a = makeFolder('alpha-app', { 'a-closed': documentText('a-closed', 2, 2), 'a-open': documentText('a-open', 1, 2) });
    const b = makeFolder('beta-api', { 'b-closed': documentText('b-closed', 1, 1), 'b-unproven': documentText('b-unproven', 1, 1, 1) });
    const provider = providerFor([a, b]);
    const [projectA, projectB] = provider.getChildren() as ProjectNode[];

    assert.equal(projectA.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.equal(projectB.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

    // Collapsed is expansion state only: every feature is still a child.
    const stateByName = (project: ProjectNode) =>
      (provider.getChildren(project) as FeatureNode[]).map((f) => [f.model.featureName, f.collapsibleState]);
    assert.deepEqual(stateByName(projectA), [
      ['a-closed', vscode.TreeItemCollapsibleState.Collapsed],
      ['a-open', vscode.TreeItemCollapsibleState.Expanded],
    ]);
    assert.deepEqual(stateByName(projectB), [
      ['b-closed', vscode.TreeItemCollapsibleState.Collapsed],
      ['b-unproven', vscode.TreeItemCollapsibleState.Collapsed],
    ]);
  });

  test('a folder with no visible feature shows no project node', () => {
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 1, 2) });
    const empty = makeFolder('empty-project', {});
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 1, 2) });
    const rootNodes = providerFor([a, empty, b]).getChildren() as ProjectNode[];
    assert.deepEqual(rootNodes.map((r) => r.label), ['alpha-app', 'beta-api']);
  });

  test('the active filter applies per project and hides a project left with nothing', () => {
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 1, 2, 1) });
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 1, 2) });
    const provider = providerFor([a, b]);
    provider.setFilter('unproven');

    const rootNodes = provider.getChildren() as ProjectNode[];
    assert.deepEqual(rootNodes.map((r) => r.label), ['alpha-app']);
    assert.equal(rootNodes[0].description, '1/2 · 1 unproven');
  });

  test('sorting is per project, not global', () => {
    // Under "status", each project puts its own open feature first. A
    // global sort would interleave them; per-project order keeps each
    // project's closed feature last inside that project.
    const a = makeFolder('alpha-app', { 'a-closed': documentText('a-closed', 1, 1), 'a-open': documentText('a-open', 0, 1) });
    const b = makeFolder('beta-api', { 'b-closed': documentText('b-closed', 1, 1), 'b-open': documentText('b-open', 0, 1) });
    const provider = providerFor([a, b], 'status');
    const rootNodes = provider.getChildren() as ProjectNode[];
    const names = (p: ProjectNode) => (provider.getChildren(p) as FeatureNode[]).map((f) => f.model.featureName);
    assert.deepEqual(names(rootNodes[0]), ['a-open', 'a-closed']);
    assert.deepEqual(names(rootNodes[1]), ['b-open', 'b-closed']);
  });

  test('getParent of a feature is its project node; of a project node, undefined', () => {
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 1, 2) });
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 1, 2) });
    const provider = providerFor([a, b]);
    const [project] = provider.getChildren() as ProjectNode[];
    const [feature] = provider.getChildren(project) as FeatureNode[];
    assert.equal(provider.getParent(feature), project);
    assert.equal(provider.getParent(project), undefined);
  });

  test('task -> section -> feature -> project chain resolves for open-task', () => {
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 1, 2) });
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 1, 2) });
    const provider = providerFor([a, b]);
    const [project] = provider.getChildren() as ProjectNode[];
    const [featureNode] = provider.getChildren(project) as FeatureNode[];
    const [sectionNode] = provider.getChildren(featureNode) as SectionNode[];
    const [task] = provider.getChildren(sectionNode) as TaskNode[];
    assert.equal(task.parent.parent, featureNode);
    assert.equal(featureNode.parent, project);
  });

  test('a task resolves from the root down through getChildren and walks getParent back to its project', () => {
    // The chain a host reveal relies on: only getChildren going down from the
    // root, then only getParent going up, landing on the same project instance.
    const a = makeFolder('alpha-app', { 'a-one': documentText('a-one', 1, 2) });
    const b = makeFolder('beta-api', { 'b-one': documentText('b-one', 1, 2) });
    const provider = providerFor([a, b]);
    const [, project] = provider.getChildren() as ProjectNode[];
    const [feature] = provider.getChildren(project) as FeatureNode[];
    const [section] = provider.getChildren(feature) as SectionNode[];
    const [task] = provider.getChildren(section) as TaskNode[];

    const section2 = provider.getParent(task);
    const feature2 = section2 && provider.getParent(section2);
    const project2 = feature2 && provider.getParent(feature2);
    assert.equal(section2?.kind, 'section');
    assert.equal(feature2?.kind, 'feature');
    assert.equal(project2, project);
    assert.equal(provider.getParent(project2 as ProjectNode), undefined);
  });

  test('one folder keeps the flat feature list with no project node', () => {
    const only = makeFolder('solo', { 'a-one': documentText('a-one', 1, 2), 'b-one': documentText('b-one', 0, 1) });
    const provider = providerFor([only]);
    const rootNodes = provider.getChildren();
    assert.deepEqual(rootNodes.map((r) => r.kind), ['feature', 'feature']);
    assert.equal((rootNodes[0] as FeatureNode).parent, undefined);
    assert.equal(provider.getParent(rootNodes[0]), undefined);
  });

  test('zero folders yield an empty root', () => {
    assert.deepEqual(providerFor([]).getChildren(), []);
  });
});
