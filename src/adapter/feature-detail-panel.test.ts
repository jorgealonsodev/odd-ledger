import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FeatureDetailPanel } from './feature-detail-panel';
import type { FeatureModel } from '../domain/build-feature-model';
import { buildFeatureModel, EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';
import { UNPROVEN_TASK_MESSAGE } from '../domain/build-panel-body';
import { HISTORY_CHART_CAPTION, UNAVAILABLE_HISTORY } from '../domain/build-history';
import type { FeatureHistory } from '../domain/build-history';

/**
 * Runs in the default @vscode/test-cli configuration, which opens no
 * workspace folder — the panel only needs a FeatureModel and a
 * caller-supplied workspace root string, never the filesystem or a real
 * workspace folder, so it belongs in the unit profile alongside
 * feature-tree-provider.test.ts rather than in the *.workspace-test.ts
 * profile.
 */

const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };

/** The standard CSS named colour keywords (CSS Color Module Level 4),
 * used by the colour-audit test below to prove the panel never falls
 * back to a hardcoded colour where a `--vscode-*` variable belongs.
 * `transparent` and `currentColor` are deliberately excluded: neither
 * names a literal colour, so ruling them out would not test anything. */
const NAMED_CSS_COLOURS = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'grey', 'green',
  'greenyellow', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
];

function model(overrides: Partial<FeatureModel> = {}): FeatureModel {
  return {
    featureName: 'cache-warm-v2',
    documentPath: '/workspace/odd/tasks/cache-warm-v2.md',
    title: 'Some unrelated H1 wording',
    branch: null,
    progress: EMPTY_COUNTS,
    sections: [],
    nextStep: null,
    structure: EMPTY_DOCUMENT_STRUCTURE,
    ...overrides,
  };
}

/**
 * Builds a real FeatureModel (including its parsed DocumentStructure) from
 * an invented document's text, via buildFeatureModel, for the body-region
 * tests below — what is under test there is how the panel renders a real
 * parsed document, not just data plumbing over a hand-built model.
 */
function modelFromText(featureName: string, text: string): FeatureModel {
  return buildFeatureModel(featureName, `/workspace/odd/tasks/${featureName}.md`, text);
}

suite('FeatureDetailPanel', () => {
  let panel: FeatureDetailPanel;
  let extensionUri: vscode.Uri;

  suiteSetup(() => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension, 'extension jorgealonsodev.odd-ledger was not found by the test host');
    extensionUri = extension!.extensionUri;
  });

  teardown(() => {
    panel?.dispose();
  });

  test('renders a title, a subtitle and three tiles', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(
      model({
        featureName: 'cache-warm-v2',
        // Nested under the workspaceRoot passed to show() below, unlike an
        // earlier version of this fixture: an unrelated document path made
        // the subtitle assertion below pass no matter what relativePath
        // buildPanelHeader computed, because the substring it checked for
        // survives even a relative path prefixed with stray "../" segments.
        documentPath: '/home/dev/checkout-service/odd/tasks/cache-warm-v2.md',
        branch: 'feat/cache-warm-v2',
        progress: { done: 7, total: 10, percentage: 70, doneUnproven: 1 },
      }),
      '/home/dev/checkout-service',
    );

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /cache-warm-v2/);
    // Anchored to the exact subtitle content, not a loose substring: this
    // fails if relativePath is computed wrong in a way a looser match
    // would have missed (e.g. ignoring workspaceRoot and leaking the raw
    // absolute path, or dropping the branch text).
    assert.match(
      html,
      /<div class="subtitle">checkout-service · odd\/tasks\/cache-warm-v2\.md · feat\/cache-warm-v2<\/div>/,
    );
    assert.match(html, /PROGRESS/);
    assert.match(html, /7\/10 · 70%/);
    assert.match(html, /UNPROVEN/);
    assert.match(html, /1 task\b/);
    assert.match(html, /LAST WORK/);
    assert.match(html, /not recorded/);
  });

  test('opening a second feature reuses the same panel instead of creating a new one', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ featureName: 'cache-warm-v2' }), '/home/dev/checkout-service');
    const firstPanel = panel.webviewPanel;
    assert.ok(firstPanel);

    panel.show(model({ featureName: 'other-feature' }), '/home/dev/checkout-service');
    const secondPanel = panel.webviewPanel;

    assert.equal(secondPanel, firstPanel);
    assert.match(secondPanel!.webview.html, /other-feature/);
  });

  test('an empty title falls back to the same tab title on the reuse path as on the creation path', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ featureName: '' }), '/home/dev/checkout-service');
    const createdTitle = panel.webviewPanel?.title;
    assert.equal(createdTitle, 'ODD Ledger');

    // Same empty-title model, shown again: this hits the reuse branch
    // (an existing panel is revealed and re-rendered) rather than the
    // creation branch above.
    panel.show(model({ featureName: '' }), '/home/dev/checkout-service');
    assert.equal(panel.webviewPanel?.title, createdTitle);
  });

  test('a disposed panel is not reused: a later show() creates a fresh one', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ featureName: 'cache-warm-v2' }), '/home/dev/checkout-service');
    const firstPanel = panel.webviewPanel;
    assert.ok(firstPanel);

    firstPanel!.dispose();
    assert.equal(panel.webviewPanel, undefined);

    panel.show(model({ featureName: 'cache-warm-v2' }), '/home/dev/checkout-service');
    const secondPanel = panel.webviewPanel;
    assert.ok(secondPanel);
    assert.notEqual(secondPanel, firstPanel);
  });

  test('openDocumentPath is undefined until a panel has been shown', () => {
    panel = new FeatureDetailPanel(extensionUri);
    assert.equal(panel.openDocumentPath, undefined);
  });

  test('openDocumentPath tracks the document of whichever feature was shown most recently', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ featureName: 'cache-warm-v2', documentPath: '/workspace/odd/tasks/cache-warm-v2.md' }), '/workspace');
    assert.equal(panel.openDocumentPath, '/workspace/odd/tasks/cache-warm-v2.md');

    panel.show(model({ featureName: 'other-feature', documentPath: '/workspace/odd/tasks/other-feature.md' }), '/workspace');
    assert.equal(panel.openDocumentPath, '/workspace/odd/tasks/other-feature.md');
  });

  test('openDocumentPath is undefined again once the user closes the panel themselves', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ documentPath: '/workspace/odd/tasks/cache-warm-v2.md' }), '/workspace');
    panel.webviewPanel!.dispose();

    assert.equal(panel.openDocumentPath, undefined);
  });

  test('showRemoved replaces the panel content with a message stating the document is gone, and clears openDocumentPath', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ featureName: 'cache-warm-v2', documentPath: '/workspace/odd/tasks/cache-warm-v2.md' }), '/workspace');

    panel.showRemoved('cache-warm-v2');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /no longer on disk/i);
    assert.doesNotMatch(html, /PROGRESS/, 'expected the stale header/tiles render to be fully replaced, not left underneath');
    assert.equal(panel.openDocumentPath, undefined, 'expected the removed document to no longer be tracked as open');
  });

  test('showRemoved escapes the feature name it renders', () => {
    panel = new FeatureDetailPanel(extensionUri);
    const maliciousName = '<img src=x onerror=alert(1)>';
    panel.show(model({ featureName: maliciousName, documentPath: '/workspace/odd/tasks/x.md' }), '/workspace');

    panel.showRemoved(maliciousName);

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes(maliciousName));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  test('showRemoved is a no-op when no panel is open', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.showRemoved('cache-warm-v2');
    assert.equal(panel.webviewPanel, undefined);
  });

  test('showRefreshFailed replaces the panel content with a message stating the refresh failed, but keeps openDocumentPath', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ featureName: 'cache-warm-v2', documentPath: '/workspace/odd/tasks/cache-warm-v2.md' }), '/workspace');

    panel.showRefreshFailed('cache-warm-v2');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /could not be refreshed/i);
    assert.doesNotMatch(html, /PROGRESS/, 'expected the stale header/tiles render to be fully replaced, not left underneath');
    assert.equal(panel.openDocumentPath, '/workspace/odd/tasks/cache-warm-v2.md', 'a failed refresh must not rule the document out');
  });

  test('showRefreshFailed escapes the feature name it renders', () => {
    panel = new FeatureDetailPanel(extensionUri);
    const maliciousName = '<img src=x onerror=alert(1)>';
    panel.show(model({ featureName: maliciousName, documentPath: '/workspace/odd/tasks/x.md' }), '/workspace');

    panel.showRefreshFailed(maliciousName);

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes(maliciousName));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  test('showRefreshFailed is a no-op when no panel is open', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.showRefreshFailed('cache-warm-v2');
    assert.equal(panel.webviewPanel, undefined);
  });

  test('escapes a feature name containing markup: no unescaped angle bracket reaches the HTML', () => {
    panel = new FeatureDetailPanel(extensionUri);
    const maliciousName = '<img src=x onerror=alert(1)>';
    panel.show(model({ featureName: maliciousName }), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes(maliciousName));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  test('renders the next step block, escaped, when the document records one', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(
      model({ nextStep: { line: 'Ship the <remaining> task next.', headingLine: 40 } }),
      '/home/dev/checkout-service',
    );

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /NEXT STEP/);
    assert.ok(html.includes('Ship the &lt;remaining&gt; task next.'));
    assert.ok(!html.includes('Ship the <remaining> task next.'));
  });

  test('renders no next-step block at all when the document records none', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model({ nextStep: null }), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('NEXT STEP'));
  });

  test('declares a Content-Security-Policy and styles all three VS Code theme classes', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /body\.vscode-light/);
    assert.match(html, /body\.vscode-dark/);
    assert.match(html, /body\.vscode-high-contrast/);
  });

  // --- body: objective, tasks, other sections (T11) -----------------------

  test('renders the objective region from the Objective and Problem sections\' prose, as escaped preformatted text, not Markdown', () => {
    const text = [
      '# sample',
      '',
      '## Objective',
      '',
      'Ship the **cache** warmer.',
      '',
      '## Problem',
      '',
      'Reconciled *by hand* today.',
      '',
      '## Tasks',
      '',
      '- [ ] T1 Do it',
    ].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('cache-warm-v2', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Objective<\/h2>/);
    assert.ok(html.includes('Ship the **cache** warmer.'));
    assert.ok(html.includes('Reconciled *by hand* today.'));
    // Markdown is not rendered to HTML: the literal asterisks survive and
    // no <strong> or <em> tag is produced from them.
    assert.ok(!html.includes('<strong>'));
    assert.ok(!html.includes('<em>'));
  });

  test('renders no objective region when the document has neither Objective nor Problem', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('<h2>Objective</h2>'));
  });

  test('renders a task section with its items, IDs and evidence inline', () => {
    const text = [
      '# sample',
      '',
      '## Tasks',
      '',
      '- [x] T1 Ship it',
      '      DONE `4b7c1e9`',
      '- [ ] T2 Not started yet',
    ].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Tasks<\/h2>/);
    assert.ok(html.includes('T1'));
    assert.ok(html.includes('Ship it'));
    assert.ok(html.includes('DONE `4b7c1e9`'));
    assert.ok(html.includes('T2'));
    assert.ok(html.includes('Not started yet'));
  });

  test('a done-unproven task states the ODD unproven message inline, not a generic label', () => {
    const text = ['# sample', '', '## Tasks', '', '- [x] T6 Document the signing step'].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(html.includes(UNPROVEN_TASK_MESSAGE));
  });

  // --- focused task region --------------------------------------------------

  function focusedRegion(html: string): string {
    const match = /<div class="focused-task">[\s\S]*?<\/div>\s*<\/div>/.exec(html);
    return match ? match[0] : '';
  }

  test('renders the focused region for the clicked task, and not a different one, above the objective', () => {
    const text = [
      '# sample',
      '',
      '## Objective',
      '',
      'Ship it.',
      '',
      '## Tasks',
      '',
      '- [ ] T1 First task',
      '- [ ] T2 Second task',
    ].join('\n');
    const built = modelFromText('sample', text);
    const secondTask = built.sections[0].items[1];
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(built, '/workspace', null, UNAVAILABLE_HISTORY, secondTask.startLine);

    const html = panel.webviewPanel?.webview.html ?? '';
    const region = focusedRegion(html);
    assert.notEqual(region, '', 'expected a focused-task region to render');
    assert.ok(region.includes('Second task'), 'expected the focused region to show the clicked task');
    assert.ok(!region.includes('First task'), 'expected the focused region to show only the clicked task, not the other one');
    // Above the objective: the focused region's own marker must appear
    // before the Objective heading in the rendered document order.
    assert.ok(html.indexOf('class="focused-task"') < html.indexOf('<h2>Objective</h2>'));
  });

  test('the same task is marked focused in its section further down, and only that one', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 First task', '- [ ] T2 Second task'].join('\n');
    const built = modelFromText('sample', text);
    const secondTask = built.sections[0].items[1];
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(built, '/workspace', null, UNAVAILABLE_HISTORY, secondTask.startLine);

    const html = panel.webviewPanel?.webview.html ?? '';
    // Both the focused region and the Tasks section render Second task's
    // own wrapper with the focused class, so every such wrapper must
    // carry Second task's text — none of them may carry First task's.
    // `.` (not `[^]`) deliberately cannot cross this template's own line
    // breaks between elements, so the match cannot wander into a sibling
    // task-item's div the way an unbounded wildcard could.
    const focusedWrappers = [...html.matchAll(/<div class="task-item task-item-open task-item-focused">\s*<div class="task-title">.*?<\/div>/g)];
    assert.ok(focusedWrappers.length > 0, 'expected at least one focused task-item wrapper to render');
    for (const [wrapper] of focusedWrappers) {
      assert.ok(wrapper.includes('Second task'), `expected every focused wrapper to show Second task, got: ${wrapper}`);
      assert.ok(!wrapper.includes('First task'), `expected no focused wrapper to show First task, got: ${wrapper}`);
    }
    // And First task's own (unfocused) wrapper must exist, proving the
    // absence above is not just "First task never rendered at all".
    assert.match(html, /<div class="task-item task-item-open">\s*<div class="task-title">.*?First task<\/div>/);
  });

  test('renders no focused-task region at all when no focusedTaskStartLine is given (a feature node\'s own click, or a watcher refresh)', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 First task'].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('class="focused-task"'));
    // Anchored to the class actually applied to an element's `class="..."`
    // attribute, not a bare substring: the stylesheet's own
    // `.task-item-focused { ... }` rule legitimately contains this text
    // regardless of whether any element uses the class, so a bare
    // substring check would never be able to fail this assertion.
    assert.ok(!/class="task-item[^"]*\btask-item-focused\b/.test(html));
  });

  test('an unproven focused task states what is missing, using the shared constant', () => {
    const text = ['# sample', '', '## Tasks', '', '- [x] T1 Document the signing step'].join('\n');
    const built = modelFromText('sample', text);
    const task = built.sections[0].items[0];
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(built, '/workspace', null, UNAVAILABLE_HISTORY, task.startLine);

    const html = panel.webviewPanel?.webview.html ?? '';
    const region = focusedRegion(html);
    assert.ok(region.includes(UNPROVEN_TASK_MESSAGE), 'expected the focused region to state the unproven message');
  });

  test('the focused task shows its commit reference when it has one', () => {
    const text = ['# sample', '', '## Tasks', '', '- [x] T1 Ship it', '      DONE `4b7c1e9`'].join('\n');
    const built = modelFromText('sample', text);
    const task = built.sections[0].items[0];
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(built, '/workspace', null, UNAVAILABLE_HISTORY, task.startLine);

    const html = panel.webviewPanel?.webview.html ?? '';
    const region = focusedRegion(html);
    assert.ok(region.includes('4b7c1e9'), 'expected the focused region to show the commit reference');
  });

  test('renders the document\'s other recognized sections when present, escaped and unrendered as Markdown', () => {
    const text = [
      '# sample',
      '',
      '## Constraints',
      '',
      'Read-only, `never` writes.',
      '',
      '## Tasks',
      '',
      '- [ ] T1 Do it',
    ].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Constraints<\/h2>/);
    assert.ok(html.includes('Read-only, `never` writes.'));
  });

  test('omits an other-section region for a kind the document does not carry', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('<h2>Constraints</h2>'));
    assert.ok(!html.includes('<h2>Scope</h2>'));
  });

  test('the CSP style-src nonce matches the nonce on the <style> element, and is non-empty', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    const cspMatch = /style-src 'nonce-([^']+)'/.exec(html);
    const styleMatch = /<style nonce="([^"]+)">/.exec(html);

    assert.ok(cspMatch, 'expected a style-src nonce in the Content-Security-Policy');
    assert.ok(styleMatch, 'expected a nonce attribute on the <style> element');
    assert.ok(cspMatch![1].length > 0);
    assert.equal(cspMatch![1], styleMatch![1]);
  });

  // --- "Recorded by this document" table (T12) -----------------------------

  /** Pulls the table's label/value pairs out of the rendered HTML, in
   * document order, so assertions below can check row order and content
   * directly rather than just checking substrings appear somewhere in the
   * page — a substring check alone would not fail if the rows were
   * reordered or one row were duplicated in place of another. */
  function recordedRows(html: string): Array<{ label: string; value: string }> {
    const rowRe =
      /<td class="recorded-label">([^<]*)<\/td>\s*<td class="recorded-value">([^<]*)<\/td>/g;
    const rows: Array<{ label: string; value: string }> = [];
    for (const match of html.matchAll(rowRe)) {
      rows.push({ label: match[1], value: match[2] });
    }
    return rows;
  }

  test('renders the "Recorded by this document" table with all five rows, in order', () => {
    const text = [
      '# sample',
      '',
      '## TDD mode',
      '',
      'Strict, invented convention.',
      '',
      '## Delivery',
      '',
      'ask-on-risk (default). Forecast: roughly 400 authored changed lines.',
      '',
      '## Tasks',
      '',
      '- [x] T1 Ship it',
      '      Route: delegated writer.',
      '      Review: assess returned risk low, approved.',
    ].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Recorded by this document<\/h2>/);
    const rows = recordedRows(html);
    assert.deepEqual(
      rows.map((r) => r.label),
      ['TDD', 'Delivery', 'Route', 'Line budget', 'Review'],
    );
    assert.match(rows[0].value, /Strict, invented convention\.?/);
    assert.match(rows[2].value, /per task, 1 of 1 recorded/);
    assert.match(rows[3].value, /400/);
    assert.match(rows[4].value, /approved/);
  });

  test('a document recording none of the five fields still renders five rows, each reading "not recorded"', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    const rows = recordedRows(html);
    assert.deepEqual(
      rows.map((r) => r.label),
      ['TDD', 'Delivery', 'Route', 'Line budget', 'Review'],
    );
    assert.deepEqual(
      rows.map((r) => r.value),
      ['not recorded', 'not recorded', 'not recorded', 'not recorded', 'not recorded'],
    );
  });

  test('escapes markup in a recorded field\'s value: no unescaped angle bracket reaches the HTML', () => {
    const text = ['# sample', '', '## TDD mode', '', '<img src=x onerror=alert(1)>', '', '## Tasks', '', '- [ ] T1 Do it'].join(
      '\n',
    );
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    const rows = recordedRows(html);
    const tdd = rows.find((r) => r.label === 'TDD')!;
    assert.ok(!tdd.value.includes('<img'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  // --- History region (T13) ------------------------------------------------

  function pointsCount(n: number): FeatureHistory['points'] {
    const points: Array<{ hash: string; date: string; percentage: number }> = [];
    for (let i = 0; i < n; i++) {
      points.push({ hash: `${i}`.padStart(4, '0').repeat(10), date: `2026-09-${String(10 + i).padStart(2, '0')}`, percentage: i * 10 });
    }
    return points;
  }

  test('renders the history sentence, and no chart, below the threshold', () => {
    const history: FeatureHistory = {
      available: true,
      summary: '2 revisions in git, 2026-09-20 to 2026-09-21.',
      points: pointsCount(2),
      showChart: false,
    };
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service', null, history);

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>History<\/h2>/);
    assert.match(html, /2 revisions in git, 2026-09-20 to 2026-09-21\./);
    // The CSS rule for .history-chart is always present in the <style>
    // block; what must be absent is the <svg> element itself.
    assert.ok(!html.includes('<svg class="history-chart"'));
    assert.ok(!html.includes(HISTORY_CHART_CAPTION));
  });

  test('renders the history chart with its caption above the threshold', () => {
    const history: FeatureHistory = {
      available: true,
      summary: '3 revisions in git, 2026-09-10 to 2026-09-12.',
      points: pointsCount(3),
      showChart: true,
    };
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service', null, history);

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /3 revisions in git, 2026-09-10 to 2026-09-12\./);
    assert.match(html, /<svg class="history-chart"/);
    // Three points plotted, one <circle> per revision.
    assert.equal((html.match(/<circle /g) ?? []).length, 3);
    assert.ok(html.includes(HISTORY_CHART_CAPTION));
  });

  test('states unavailability, with no chart, when history has no usable revisions', () => {
    panel = new FeatureDetailPanel(extensionUri);
    // No history argument at all: exercises FeatureDetailPanel's own
    // default (UNAVAILABLE_HISTORY), not a hand-built stand-in for it.
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>History<\/h2>/);
    assert.match(html, /not available/i);
    assert.ok(!html.includes('<svg class="history-chart"'));
  });

  test('the LAST WORK tile shows the most recent revision date supplied alongside history', () => {
    const history: FeatureHistory = {
      available: true,
      summary: '2 revisions in git, 2026-09-20 to 2026-09-21.',
      points: pointsCount(2),
      showChart: false,
    };
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service', '2026-09-21', history);

    const html = panel.webviewPanel?.webview.html ?? '';
    // Anchored to the LAST WORK tile's own value cell, not a loose
    // substring: this fails if the date landed in the wrong tile, or if
    // the tile still read "not recorded" because lastWork was not wired
    // through.
    assert.match(html, /<div class="tile-label">LAST WORK<\/div>\s*<div class="tile-value">2026-09-21<\/div>/);
  });

  // --- Theming, codicons and chart geometry (T14) --------------------------

  test('renders a codicon glyph and its state modifier class for every derived task state, each paired with its own item', () => {
    const text = [
      '# sample',
      '',
      '## Tasks',
      '',
      '- [ ] T1 Open item',
      '- [x] T2 Done item',
      '      DONE `abc1234`',
      '- [x] T3 No evidence item',
      '- [~] T4 Declined item',
      '- [?] T5 Odd marker item',
    ].join('\n');
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    // One codicon span per state actually present, each with the same
    // glyph name the tree view's ThemeIcon uses for that state (see
    // STATE_ICON_ID in feature-tree-provider.ts).
    assert.match(html, /<span class="task-glyph codicon codicon-circle-large-outline" aria-hidden="true"><\/span>/);
    assert.match(html, /<span class="task-glyph codicon codicon-pass" aria-hidden="true"><\/span>/);
    assert.match(html, /<span class="task-glyph codicon codicon-warning" aria-hidden="true"><\/span>/);
    assert.match(html, /<span class="task-glyph codicon codicon-circle-slash" aria-hidden="true"><\/span>/);
    assert.match(html, /<span class="task-glyph codicon codicon-question" aria-hidden="true"><\/span>/);
    // The glyph spans are empty: the character comes from the codicon
    // font's ::before rule, not from Unicode content inside the tag. A
    // wrong implementation reverting to the old literal glyphs would
    // still match the assertions above on class name alone, so this pins
    // the actual old characters as gone too.
    assert.ok(!html.includes('☐'));
    assert.ok(!html.includes('☑'));
    assert.ok(!html.includes('⚠'));
    assert.ok(!html.includes('⊘'));
    // The five checks above only prove every glyph name and every item
    // appear somewhere in the page: a mapping that paired the wrong glyph
    // with the wrong state (or dropped the "task-item-<state>" modifier
    // class this panel also needs for its per-state styling) would still
    // pass them, because assert.match does not care where in the document
    // its pattern is found. Each block below ties one item's own wrapper
    // class, its own glyph class, and its own rendered text together, so a
    // swapped mapping or a missing modifier class fails its exact item.
    assert.match(
      html,
      /<div class="task-item task-item-open">\s*<div class="task-title"><span class="task-glyph codicon codicon-circle-large-outline" aria-hidden="true"><\/span> T1 {2}Open item<\/div>/,
    );
    assert.match(
      html,
      /<div class="task-item task-item-done">\s*<div class="task-title"><span class="task-glyph codicon codicon-pass" aria-hidden="true"><\/span> T2 {2}Done item<\/div>/,
    );
    assert.match(
      html,
      /<div class="task-item task-item-done-unproven">\s*<div class="task-title"><span class="task-glyph codicon codicon-warning" aria-hidden="true"><\/span> T3 {2}No evidence item<\/div>/,
    );
    assert.match(
      html,
      /<div class="task-item task-item-declined">\s*<div class="task-title"><span class="task-glyph codicon codicon-circle-slash" aria-hidden="true"><\/span> T4 {2}Declined item<\/div>/,
    );
    assert.match(
      html,
      /<div class="task-item task-item-unknown">\s*<div class="task-title"><span class="task-glyph codicon codicon-question" aria-hidden="true"><\/span> T5 {2}Odd marker item<\/div>/,
    );
  });

  test('colours each state\'s codicon to the same theme token the tree uses, and leaves "open" uncoloured', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    // Anchored to the exact colour rule for each glyph's own class, not a
    // loose substring: this fails if a state lost its colour or a
    // different state's token leaked onto the wrong glyph.
    assert.match(html, /\.codicon-pass\s*\{\s*color:\s*var\(--vscode-testing-iconPassed\);\s*\}/);
    assert.match(html, /\.codicon-warning\s*\{\s*color:\s*var\(--vscode-problemsWarningIcon-foreground\);\s*\}/);
    assert.match(html, /\.codicon-circle-slash\s*\{\s*color:\s*var\(--vscode-disabledForeground\);\s*\}/);
    assert.match(html, /\.codicon-question\s*\{\s*color:\s*var\(--vscode-problemsErrorIcon-foreground\);\s*\}/);
    // "open" carries no colour rule at all: it inherits the default
    // foreground rather than being styled to a token.
    assert.ok(!/\.codicon-circle-large-outline\s*\{\s*color:/.test(html));
  });

  test('loads the codicon font from this webview\'s own local-resource origin and grants it in the policy', () => {
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    const fontFaceMatch = /@font-face\s*{\s*font-family:\s*'codicon';\s*src:\s*url\('([^']+)'\)/.exec(html);
    assert.ok(fontFaceMatch, 'expected an @font-face rule loading the codicon font');
    const fontUri = fontFaceMatch![1];
    // Resolved through webview.asWebviewUri, so it is never the raw
    // file:// path, and it points at the exact font file this panel ships.
    assert.ok(!fontUri.startsWith('file:'));
    assert.ok(fontUri.endsWith('codicon.ttf'), `expected the font URI to point at codicon.ttf, got ${fontUri}`);
    assert.ok(fontUri.includes('codicons'), `expected the font URI to resolve inside @vscode/codicons, got ${fontUri}`);
    // font-src is the one addition to the otherwise-empty policy; without
    // it the @font-face load above would be refused by default-src 'none'.
    assert.match(html, /Content-Security-Policy" content="[^"]*font-src [^;"]+;?[^"]*"/);
  });

  test('the rendered HTML contains no hardcoded colour: no hex, no rgb(), no named CSS colour', () => {
    const text = [
      '# sample',
      '',
      '## Objective',
      '',
      'Ship the cache warmer.',
      '',
      '## Constraints',
      '',
      'No literal styling values anywhere.',
      '',
      '## Tasks',
      '',
      '- [ ] T1 Open item',
      '- [x] T2 Done item',
      '      DONE `abc1234`',
      '- [x] T3 No evidence item',
      '- [~] T4 Declined item',
      '- [?] T5 Odd marker item',
    ].join('\n');
    const history: FeatureHistory = {
      available: true,
      summary: '3 revisions in git, 2026-09-10 to 2026-09-12.',
      points: pointsCount(3),
      showChart: true,
    };
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(modelFromText('sample', text), '/workspace', '2026-09-12', history);

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, 'expected no hex colour literal anywhere in the page');
    assert.doesNotMatch(html, /\brgba?\(/i, 'expected no rgb()/rgba() colour literal anywhere in the page');
    // Bounded on both sides by "not a word character and not a hyphen",
    // not a plain \b: a bare \b treats "-" as a boundary too, so it would
    // misfire on a hyphenated CSS keyword that merely starts with a
    // colour's spelling, such as "white-space" (present in this page's
    // own stylesheet, in .prose and .task-evidence) starting with "white".
    const namedColourPattern = new RegExp(`(?<![\\w-])(${NAMED_CSS_COLOURS.join('|')})(?![\\w-])`, 'i');
    assert.doesNotMatch(html, namedColourPattern, 'expected no named CSS colour keyword anywhere in the page');
  });

  test('the history chart\'s viewBox is padded so no point is clipped at its own extremes', () => {
    // Percentages 0 and 100 are the y-axis extremes; two points also put
    // one at each x-axis extreme (index 0 and the last index), so this
    // fixture exercises all four edges the padding exists for.
    const history: FeatureHistory = {
      available: true,
      summary: '2 revisions in git, 2026-09-20 to 2026-09-21.',
      points: [
        { hash: 'a'.repeat(12), date: '2026-09-20', percentage: 0 },
        { hash: 'b'.repeat(12), date: '2026-09-21', percentage: 100 },
      ],
      showChart: true,
    };
    panel = new FeatureDetailPanel(extensionUri);
    panel.show(model(), '/home/dev/checkout-service', null, history);

    const html = panel.webviewPanel?.webview.html ?? '';
    const viewBoxMatch = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(html);
    assert.ok(viewBoxMatch, 'expected an SVG viewBox attribute');
    const [, minXStr, minYStr, widthStr, heightStr] = viewBoxMatch!;
    const minX = Number(minXStr);
    const minY = Number(minYStr);
    const maxX = minX + Number(widthStr);
    const maxY = minY + Number(heightStr);

    const circles = [...html.matchAll(/<circle class="history-point" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
    assert.equal(circles.length, 2);
    for (const [, cxStr, cyStr, rStr] of circles) {
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      const r = Number(rStr);
      assert.ok(cx - r >= minX, `circle at cx=${cx} r=${r} is clipped by the viewBox's left edge (minX=${minX})`);
      assert.ok(cx + r <= maxX, `circle at cx=${cx} r=${r} is clipped by the viewBox's right edge (maxX=${maxX})`);
      assert.ok(cy - r >= minY, `circle at cy=${cy} r=${r} is clipped by the viewBox's top edge (minY=${minY})`);
      assert.ok(cy + r <= maxY, `circle at cy=${cy} r=${r} is clipped by the viewBox's bottom edge (maxY=${maxY})`);
    }
  });
});
