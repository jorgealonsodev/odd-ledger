import * as assert from 'node:assert/strict';
import { FeatureDetailPanel } from './feature-detail-panel';
import type { FeatureModel } from '../domain/build-feature-model';
import { buildFeatureModel, EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';
import { UNPROVEN_TASK_MESSAGE } from '../domain/build-panel-body';
import { HISTORY_CHART_CAPTION } from '../domain/build-history';
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

  teardown(() => {
    panel?.dispose();
  });

  test('renders a title, a subtitle and three tiles', () => {
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
    panel.show(model({ featureName: 'cache-warm-v2' }), '/home/dev/checkout-service');
    const firstPanel = panel.webviewPanel;
    assert.ok(firstPanel);

    panel.show(model({ featureName: 'other-feature' }), '/home/dev/checkout-service');
    const secondPanel = panel.webviewPanel;

    assert.equal(secondPanel, firstPanel);
    assert.match(secondPanel!.webview.html, /other-feature/);
  });

  test('an empty title falls back to the same tab title on the reuse path as on the creation path', () => {
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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

  test('escapes a feature name containing markup: no unescaped angle bracket reaches the HTML', () => {
    panel = new FeatureDetailPanel();
    const maliciousName = '<img src=x onerror=alert(1)>';
    panel.show(model({ featureName: maliciousName }), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes(maliciousName));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  test('renders the next step block, escaped, when the document records one', () => {
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
    panel.show(model({ nextStep: null }), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('NEXT STEP'));
  });

  test('declares a Content-Security-Policy and styles all three VS Code theme classes', () => {
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(html.includes(UNPROVEN_TASK_MESSAGE));
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
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Constraints<\/h2>/);
    assert.ok(html.includes('Read-only, `never` writes.'));
  });

  test('omits an other-section region for a kind the document does not carry', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('<h2>Constraints</h2>'));
    assert.ok(!html.includes('<h2>Scope</h2>'));
  });

  test('the CSP style-src nonce matches the nonce on the <style> element, and is non-empty', () => {
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
    panel.show(model(), '/home/dev/checkout-service', null, history);

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /3 revisions in git, 2026-09-10 to 2026-09-12\./);
    assert.match(html, /<svg class="history-chart"/);
    // Three points plotted, one <circle> per revision.
    assert.equal((html.match(/<circle /g) ?? []).length, 3);
    assert.ok(html.includes(HISTORY_CHART_CAPTION));
  });

  test('states unavailability, with no chart, when history has no usable revisions', () => {
    panel = new FeatureDetailPanel();
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
    panel = new FeatureDetailPanel();
    panel.show(model(), '/home/dev/checkout-service', '2026-09-21', history);

    const html = panel.webviewPanel?.webview.html ?? '';
    // Anchored to the LAST WORK tile's own value cell, not a loose
    // substring: this fails if the date landed in the wrong tile, or if
    // the tile still read "not recorded" because lastWork was not wired
    // through.
    assert.match(html, /<div class="tile-label">LAST WORK<\/div>\s*<div class="tile-value">2026-09-21<\/div>/);
  });
});
