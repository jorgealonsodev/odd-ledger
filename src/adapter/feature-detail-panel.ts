/**
 * The detail panel's webview: header, subtitle, next step, the three
 * summary tiles (T10), and the body — objective, tasks with inline
 * evidence, and the document's other optional sections (T11). A thin
 * translation layer only — it asks the domain layer (buildPanelHeader,
 * buildPanelBody) for already-formatted display data and renders it into
 * HTML. Any decision worth testing without an editor (title choice, tile
 * wording, path formatting, region order and omission, escaping) stays in
 * src/domain/, not here.
 *
 * The "Recorded by this document" table (T12) renders the rare contract
 * fields (TDD, delivery, route, line budget, review), each its value or
 * "not recorded". The History region (T13) renders last: a sentence
 * stating the git revision count and date range by default, and an inline
 * SVG chart of the completion ratio recomputed per revision once there are
 * enough revisions to plot meaningfully. Theming/layout polish (T14) is
 * still later work.
 */

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { FeatureModel } from '../domain/build-feature-model';
import type { PanelHeader } from '../domain/build-panel-header';
import { buildPanelHeader } from '../domain/build-panel-header';
import { buildPanelBody } from '../domain/build-panel-body';
import type { PanelBody, PanelBodyDocumentSection } from '../domain/build-panel-body';
import { UNPROVEN_TASK_MESSAGE } from '../domain/build-panel-body';
import { buildRecordedFields } from '../domain/build-recorded-fields';
import type { RecordedField } from '../domain/build-recorded-fields';
import { UNAVAILABLE_HISTORY, HISTORY_CHART_CAPTION } from '../domain/build-history';
import type { FeatureHistory, HistoryPoint } from '../domain/build-history';
import type { DerivedItemState } from '../domain/derive-checklist-state';
import type { ItemModel, SectionModel } from '../domain/build-feature-model';
import { escapeHtml } from '../domain/escape-html';
import { STATE_COLOR_TOKEN, themeColorCssVar } from '../domain/state-colors';
import { prepareEvidenceMarkdown } from '../domain/prepare-evidence-markdown';
import { renderMarkdown } from '../domain/render-markdown';

/** Prepares and renders a document-authored Markdown string (evidence, or
 * an Objective/Problem/other-section body) for embedding directly in the
 * page — dedented and rejoined first (prepareEvidenceMarkdown), then
 * rendered through render-markdown.ts's hardened renderer. The result is
 * already-safe HTML, meant to be interpolated as-is, never passed through
 * escapeHtml again. */
function renderProseMarkdown(text: string): string {
  return renderMarkdown(prepareEvidenceMarkdown(text));
}

const VIEW_TYPE = 'oddLedger.featureDetail';
const VIEW_TITLE_FALLBACK = 'ODD Ledger';

/** The panel's one fixed home: the leftmost editor column, attached to the
 * sidebar the tree lives in, as a tab beside whatever else is already open
 * there. `vscode.ViewColumn.Beside` was tried first and rejected: it means
 * "the column after whichever one is active right now", so the panel's
 * landing column depended on what the user happened to have focused at
 * click time — the tree, an editor in column one, an editor in column two
 * — and could even manufacture a third column in a layout that already had
 * two. A literal column has no such dependency: every show() call lands
 * here, regardless of what was active, and this class never opens or
 * creates any other column. The document a task click opens shares this
 * same column (see open-task.ts) — both end up as tabs the user switches
 * between or splits themselves, rather than the extension choosing a split
 * for them. */
const PANEL_VIEW_COLUMN = vscode.ViewColumn.One;

/** A fresh per-render nonce for the Content-Security-Policy's `style-src`,
 * so the CSP can stay `default-src 'none'` plus one nonce-scoped exception
 * instead of the much looser `'unsafe-inline'`. Drawn from `node:crypto`
 * rather than `Math.random`: a value used as a policy token should not
 * come from a predictable, non-cryptographic source, even though nothing
 * in this read-only, script-free panel currently exploits a predictable
 * nonce. */
function createNonce(): string {
  return randomBytes(16).toString('hex');
}

function formatSubtitle(header: PanelHeader): string {
  const branchText = header.branch ? escapeHtml(header.branch) : 'no branch recorded';
  return `${escapeHtml(header.project)} · ${escapeHtml(header.relativePath)} · ${branchText}`;
}

/**
 * The `## Next step` block, rendered first per the PRD ("ODD's resume
 * protocol turns on this line"). Mirrors the tree's own established rule
 * for this same field (see NextStepNode in feature-tree-provider.ts): a
 * document that records no next step grows no next-step region at all,
 * rather than an empty placeholder block — the absence is the region not
 * existing, not a blank value inside one that does.
 */
function renderNextStep(header: PanelHeader): string {
  if (!header.nextStep) {
    return '';
  }
  return `
    <div class="next-step">
      <div class="next-step-label">→ NEXT STEP</div>
      <div class="next-step-text">${escapeHtml(header.nextStep.line)}</div>
    </div>`;
}

function renderTiles(header: PanelHeader): string {
  const tiles = header.tiles
    .map(
      (tile) => `
      <div class="tile">
        <div class="tile-label">${escapeHtml(tile.label)}</div>
        <div class="tile-value">${escapeHtml(tile.value)}</div>
      </div>`,
    )
    .join('');
  return `<div class="tiles">${tiles}</div>`;
}

/**
 * The body's Objective region: the document's Objective and Problem
 * sections' prose (already joined by buildPanelBody), rendered as
 * Markdown (see renderProseMarkdown) rather than kept as escaped plain
 * text — the document's own headings, lists, code spans and emphasis now
 * render as the elements they name, instead of surviving as literal
 * source punctuation.
 */
function renderObjective(body: PanelBody): string {
  if (body.objective === null) {
    return '';
  }
  return `
    <h2>Objective</h2>
    <div class="prose">${renderProseMarkdown(body.objective)}</div>`;
}

/** Maps a derived task state to the codicon glyph name the tree view
 * already uses for the same state (STATE_ICON_ID in
 * feature-tree-provider.ts, via `vscode.ThemeIcon`), so the tree and this
 * panel read as the same icon set rather than two different vocabularies
 * for one meaning. The tree gets codicons for free from `ThemeIcon`; this
 * webview has no such API and renders the font itself (see CODICON_GLYPH
 * and the @font-face rule in renderHtml). */
const STATE_CODICON: Record<DerivedItemState, string> = {
  open: 'circle-large-outline',
  done: 'pass',
  'done-unproven': 'warning',
  declined: 'circle-slash',
  unknown: 'question',
};

/** The codepoint, inside the codicon font, for each of the five glyph
 * names this panel actually renders (read from
 * node_modules/@vscode/codicons/dist/codicon.css). The whole codicon
 * stylesheet is not imported — it defines several hundred names this
 * panel never uses, and importing it as a second stylesheet would need a
 * second style-src origin alongside the nonce-scoped inline one. Adding a
 * state to STATE_CODICON above needs a matching entry here, or that
 * glyph's ::before rule renders no content. */
const CODICON_GLYPH: Record<string, string> = {
  'circle-large-outline': '\\ebb5',
  pass: '\\eba4',
  warning: '\\ea6c',
  'circle-slash': '\\eabd',
  question: '\\eb32',
};

/**
 * The CSS colour rule for each state's codicon glyph class, generated from
 * STATE_COLOR_TOKEN and STATE_CODICON so this panel and the tree (which
 * colours the very same states via vscode.ThemeColor, reading the same
 * STATE_COLOR_TOKEN map) never carry two copies of this mapping. A state
 * with no token (`open`) gets no rule at all, so its glyph inherits the
 * default foreground rather than being pinned to a colour.
 */
function renderCodiconColorRules(): string {
  return (Object.keys(STATE_CODICON) as DerivedItemState[])
    .map((state) => {
      const token = STATE_COLOR_TOKEN[state];
      return token ? `.codicon-${STATE_CODICON[state]} { color: ${themeColorCssVar(token)}; }` : '';
    })
    .filter((rule) => rule.length > 0)
    .join('\n  ');
}

function formatTaskLine(item: ItemModel): string {
  return item.id ? `${item.id}  ${item.title}` : item.title;
}

/**
 * A task's evidence line: the ODD unproven statement for a done-unproven
 * item (the item itself, by construction, records no evidence and no
 * commit reference — see deriveChecklistState), the item's own evidence
 * text when it recorded any, or nothing at all otherwise. The unproven
 * message is this extension's own static text, not document content, so
 * it stays escaped plain text; the item's own evidence is document
 * content and is rendered as Markdown (see renderProseMarkdown), the same
 * way the tree's own tooltip already renders it.
 */
function renderTaskEvidence(item: ItemModel): string {
  if (item.derivedState === 'done-unproven') {
    return `<pre class="task-evidence task-unproven">${escapeHtml(UNPROVEN_TASK_MESSAGE)}</pre>`;
  }
  if (item.evidence.trim().length > 0) {
    return `<div class="task-evidence">${renderProseMarkdown(item.evidence)}</div>`;
  }
  return '';
}

/** Renders one task item. `focusedStartLine` is the currently focused
 * task's own startLine (or `null` when nothing is focused): when it
 * matches `item.startLine`, this item's wrapper carries the additional
 * `task-item-focused` class and nothing else changes — marking the
 * already-rendered task, per PRD, is "a class and a style, not a
 * duplicate rendering decision". Shared verbatim by the focused-task
 * region above the objective (see renderFocusedTaskRegion) and by this
 * item's own place in its section list, so the two never drift apart. */
function renderTaskItem(item: ItemModel, focusedStartLine: number | null): string {
  const codiconName = STATE_CODICON[item.derivedState];
  const focusedClass = item.startLine === focusedStartLine ? ' task-item-focused' : '';
  return `
      <div class="task-item task-item-${item.derivedState}${focusedClass}">
        <div class="task-title"><span class="task-glyph codicon codicon-${codiconName}" aria-hidden="true"></span> ${escapeHtml(formatTaskLine(item))}</div>
        ${renderTaskEvidence(item)}
      </div>`;
}

function renderTaskSection(section: SectionModel, focusedStartLine: number | null): string {
  const items = section.items.map((item) => renderTaskItem(item, focusedStartLine)).join('');
  return `
    <h2>${escapeHtml(section.heading)}</h2>
    <div class="task-list">${items}</div>`;
}

/** The body's Tasks regions: every section buildFeatureModel already
 * found to hold at least one checklist item, with its items and their
 * evidence, in the same order the tree view renders them. */
function renderTaskSections(body: PanelBody): string {
  const focusedStartLine = body.focusedTask?.startLine ?? null;
  return body.taskSections.map((section) => renderTaskSection(section, focusedStartLine)).join('');
}

/**
 * The focused-task region (T-focused-task): a distinct block near the top
 * of the body, above the objective, showing the one task a task node's own
 * click named in full — its state, its id as written, its title, its
 * evidence (or the shared unproven statement), and its commit reference
 * when it has one. Reuses renderTaskItem for the state/title/evidence
 * markup rather than re-deriving it, so the two renderings of the same
 * task never disagree.
 *
 * Renders nothing at all when `body.focusedTask` is `null` — a feature
 * node's own click and a watcher-driven refresh both carry no focused
 * task, and per this feature's absence convention that means the region
 * does not exist, never a blank placeholder.
 */
function renderFocusedTaskRegion(focusedTask: ItemModel | null): string {
  if (!focusedTask) {
    return '';
  }
  const commit = focusedTask.commitReference
    ? `<div class="focused-task-commit">Commit: ${escapeHtml(focusedTask.commitReference)}</div>`
    : '';
  return `
    <div class="focused-task">
      <div class="focused-task-label">→ FOCUSED TASK</div>
      ${renderTaskItem(focusedTask, focusedTask.startLine)}
      ${commit}
    </div>`;
}

function renderOtherSection(section: PanelBodyDocumentSection): string {
  return `
    <h2>${escapeHtml(section.heading)}</h2>
    <div class="prose">${renderProseMarkdown(section.body)}</div>`;
}

/** The body's remaining regions: the document's other recognized sections
 * (constraints, scope, acceptance criteria, checks, a decision narrative,
 * why, delivery, TDD mode, progress notes), each rendered only when the
 * document has it. Next step is deliberately excluded: the panel header
 * already shows it (see renderNextStep). */
function renderOtherSections(body: PanelBody): string {
  return body.otherSections.map(renderOtherSection).join('');
}

function renderPanelBody(body: PanelBody): string {
  return `${renderFocusedTaskRegion(body.focusedTask)}${renderObjective(body)}${renderTaskSections(body)}${renderOtherSections(body)}`;
}

/**
 * The "Recorded by this document" table (T12): the five rare contract
 * fields buildRecordedFields already resolved, each its value or "not
 * recorded". Every row always renders, per the PRD's own reasoning for
 * this region — one honest table instead of six empty regions — so there
 * is no empty-state branch here the way there is for the objective or
 * other-sections regions above.
 */
function renderRecordedByDocument(fields: readonly RecordedField[]): string {
  const rows = fields
    .map(
      (field) => `
      <tr>
        <td class="recorded-label">${escapeHtml(field.label)}</td>
        <td class="recorded-value">${escapeHtml(field.value)}</td>
      </tr>`,
    )
    .join('');
  return `
    <h2>Recorded by this document</h2>
    <table class="recorded-table"><tbody>${rows}</tbody></table>`;
}

/** The chart's internal coordinate space (an SVG `viewBox`, not pixels):
 * points are laid out in relative units and the CSS below sizes the
 * rendered element, so nothing here fixes an actual pixel width or
 * height. */
const CHART_VIEWBOX_WIDTH = 100;
const CHART_VIEWBOX_HEIGHT = 40;

/** Radius, in viewBox units, of every plotted point's `<circle>`. */
const CHART_POINT_RADIUS = 1.6;

/** Padding, in viewBox units, added on every side of the plotted area
 * before it becomes the SVG `viewBox`. A point at the very first or last
 * index sits exactly on the plotted area's edge (x = 0 or
 * CHART_VIEWBOX_WIDTH; y = 0 or CHART_VIEWBOX_HEIGHT for 100% or 0%), so
 * its circle extends CHART_POINT_RADIUS past that edge in every
 * direction. `preserveAspectRatio="none"` also means the x and y margins
 * are never scaled by the same factor, so a shared, unscaled margin is
 * what keeps both axes' extremes uniformly unclipped.
 *
 * Invariant: CHART_MARGIN must stay >= CHART_POINT_RADIUS. Keep the two
 * in step — if the radius passed to the `<circle r>` below ever changes,
 * this margin has to grow with it or the extremes clip again. */
const CHART_MARGIN = CHART_POINT_RADIUS;

/** One point's position inside the chart's viewBox: evenly spaced along
 * the x axis by revision order (T13's chosen axis is revision time, not
 * elapsed calendar time — see HISTORY_CHART_CAPTION), and the completion
 * percentage along the y axis, inverted because SVG y grows downward. */
function chartCoordinates(points: readonly HistoryPoint[]): Array<{ x: number; y: number }> {
  const stepX = points.length > 1 ? CHART_VIEWBOX_WIDTH / (points.length - 1) : 0;
  return points.map((point, index) => ({
    x: points.length > 1 ? index * stepX : CHART_VIEWBOX_WIDTH / 2,
    y: CHART_VIEWBOX_HEIGHT - (point.percentage / 100) * CHART_VIEWBOX_HEIGHT,
  }));
}

/**
 * The History region's chart (T13): inline SVG, no script and no external
 * asset, sized in relative units by the `.history-chart` CSS rule below
 * rather than a fixed pixel width or height here, and coloured only with
 * `--vscode-*` variables so it reads correctly in light, dark and
 * high-contrast themes. Each point carries a native SVG `<title>` (a
 * static element, not a script) so hovering a point shows its exact date
 * and percentage.
 */
function renderHistoryChart(points: readonly HistoryPoint[]): string {
  const coordinates = chartCoordinates(points);
  const polylinePoints = coordinates.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  const circles = points
    .map((point, index) => {
      const { x, y } = coordinates[index];
      const label = escapeHtml(`${point.date} · ${point.percentage}%`);
      return `<circle class="history-point" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${CHART_POINT_RADIUS}"><title>${label}</title></circle>`;
    })
    .join('');
  const ariaLabel = escapeHtml(`Completion percentage across ${points.length} git revisions`);
  const viewBoxMinX = -CHART_MARGIN;
  const viewBoxMinY = -CHART_MARGIN;
  const viewBoxWidth = CHART_VIEWBOX_WIDTH + 2 * CHART_MARGIN;
  const viewBoxHeight = CHART_VIEWBOX_HEIGHT + 2 * CHART_MARGIN;
  return `
    <svg class="history-chart" viewBox="${viewBoxMinX} ${viewBoxMinY} ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="none" role="img" aria-label="${ariaLabel}">
      <polyline class="history-line" points="${polylinePoints}" />
      ${circles}
    </svg>`;
}

/**
 * The History region (T13): a sentence stating the revision count and
 * date range by default (buildHistory's summary, already stating
 * unavailability in words when there is no usable git history), and a
 * chart — with its own caption naming what the axis means — only once
 * buildHistory decided there are enough revisions to plot meaningfully.
 */
function renderHistory(history: FeatureHistory): string {
  const chart = history.showChart
    ? `${renderHistoryChart(history.points)}<p class="history-caption">${escapeHtml(HISTORY_CHART_CAPTION)}</p>`
    : '';
  return `
    <h2>History</h2>
    <p class="history-summary">${escapeHtml(history.summary)}</p>
    ${chart}`;
}

/**
 * The panel's content when the document behind it no longer exists on
 * disk (T15: a file-watcher delete event for the document currently
 * open). Follows the same "say what happened" absence convention as
 * every other region in this panel, rather than leaving the last
 * successful render in place or clearing it to a blank page. Its own
 * minimal Content-Security-Policy mirrors renderHtml's — no scripts, one
 * nonce-scoped inline stylesheet — but needs no font-src exception: this
 * page loads no codicon glyphs.
 */
function renderRemovedHtml(featureName: string): string {
  const nonce = createNonce();
  const csp = `default-src 'none'; style-src 'nonce-${nonce}';`;
  const title = escapeHtml(featureName || VIEW_TITLE_FALLBACK);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style nonce="${nonce}">
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    padding: 16px;
  }
  .removed-message {
    color: var(--vscode-descriptionForeground);
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="removed-message">This feature document is no longer on disk. It may have been deleted, moved, or renamed.</p>
</body>
</html>`;
}

/**
 * The panel's content when a watcher-triggered refresh could not complete
 * (refresh-open-panel.ts: the document existed a moment ago, but reading
 * or re-fetching it then failed). Deliberately distinct wording from
 * renderRemovedHtml — not a confirmed deletion, so it must not claim the
 * document is gone, only that the current view may be stale. Same
 * minimal, script-free CSP as renderRemovedHtml.
 */
function renderRefreshFailedHtml(featureName: string): string {
  const nonce = createNonce();
  const csp = `default-src 'none'; style-src 'nonce-${nonce}';`;
  const title = escapeHtml(featureName || VIEW_TITLE_FALLBACK);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style nonce="${nonce}">
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    padding: 16px;
  }
  .refresh-failed-message {
    color: var(--vscode-descriptionForeground);
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="refresh-failed-message">This view could not be refreshed and may be out of date. It will be retried automatically the next time this document changes.</p>
</body>
</html>`;
}

/**
 * Renders the panel's full HTML document. Styles only against VS Code's
 * injected `--vscode-*` CSS variables and the `body.vscode-light`,
 * `body.vscode-dark` and `body.vscode-high-contrast` classes VS Code sets
 * automatically on the webview's `<body>` — never a hardcoded colour.
 *
 * `enableScripts` is left off in `show()` below: this is a static,
 * read-only render with nothing to script, so the CSP has no `script-src`
 * exception at all and `default-src 'none'` blocks scripts outright.
 *
 * `font-src` is the one addition to that otherwise maximally strict
 * policy. `default-src 'none'` denies every resource type with no
 * exception, and `style-src`'s nonce only vouches for the inline
 * stylesheet element itself, not for a remote resource one of its rules
 * loads — the @font-face rule inside that stylesheet still needs its own
 * grant to fetch the codicon font file. The value is `webview.cspSource`,
 * this webview's own local-resource origin (never a wildcard and never a
 * remote host), matching `asWebviewUri` below and the `localResourceRoots`
 * scoped to exactly the codicon directory in `show()`.
 */
function renderHtml(
  header: PanelHeader,
  body: PanelBody,
  recordedFields: readonly RecordedField[],
  history: FeatureHistory,
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const nonce = createNonce();
  const codiconFontUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.ttf'),
  );
  const csp = `default-src 'none'; style-src 'nonce-${nonce}'; font-src ${webview.cspSource};`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(header.title)}</title>
<style nonce="${nonce}">
  @font-face {
    font-family: 'codicon';
    src: url('${codiconFontUri}') format('truetype');
  }
  .codicon {
    font-family: 'codicon';
    font-size: 16px;
    line-height: 1;
    display: inline-block;
    text-align: center;
    text-rendering: auto;
    -webkit-font-smoothing: antialiased;
    vertical-align: middle;
  }
  .codicon-circle-large-outline::before { content: '${CODICON_GLYPH['circle-large-outline']}'; }
  .codicon-pass::before { content: '${CODICON_GLYPH.pass}'; }
  .codicon-warning::before { content: '${CODICON_GLYPH.warning}'; }
  .codicon-circle-slash::before { content: '${CODICON_GLYPH['circle-slash']}'; }
  .codicon-question::before { content: '${CODICON_GLYPH.question}'; }
  ${renderCodiconColorRules()}
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    padding: 16px;
  }
  h1 {
    margin: 0;
    font-size: 1.4em;
  }
  .subtitle {
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
  }
  .next-step {
    border-left: 3px solid var(--vscode-textLink-foreground);
    background-color: var(--vscode-textBlockQuote-background);
    padding: 8px 12px;
    margin: 16px 0;
  }
  .next-step-label {
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0;
  }
  .tile {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px 12px;
    min-width: 120px;
    flex: 1 1 120px;
  }
  .tile-label {
    font-size: 0.75em;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
  }
  .tile-value {
    margin-top: 4px;
    font-size: 1.05em;
  }
  /* All three VS Code theme categories, not just light and dark: a plain
     border reads fine in light/dark, but high-contrast themes expect a
     visibly heavier boundary between regions. */
  body.vscode-light .tile,
  body.vscode-dark .tile {
    box-shadow: none;
  }
  body.vscode-high-contrast .tile,
  body.vscode-high-contrast .next-step {
    border-width: 2px;
  }
  .focused-task {
    border: 1px solid var(--vscode-focusBorder);
    background-color: var(--vscode-editor-inactiveSelectionBackground);
    padding: 8px 12px;
    margin: 16px 0;
  }
  .focused-task-label {
    font-weight: bold;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }
  .focused-task-commit {
    margin-top: 4px;
    color: var(--vscode-descriptionForeground);
  }
  body.vscode-high-contrast .focused-task {
    border-width: 2px;
  }
  h2 {
    font-size: 1em;
    margin: 20px 0 8px;
    color: var(--vscode-foreground);
  }
  .prose {
    font-family: inherit;
    word-break: break-word;
    margin: 0;
  }
  .task-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .task-item {
    border-left: 2px solid var(--vscode-panel-border);
    padding: 2px 8px;
  }
  .task-item-focused {
    border-left-color: var(--vscode-focusBorder);
    background-color: var(--vscode-editor-inactiveSelectionBackground);
  }
  .task-glyph {
    display: inline-block;
    width: 1.2em;
  }
  .task-evidence {
    font-family: inherit;
    word-break: break-word;
    margin: 2px 0 0 1.6em;
    color: var(--vscode-descriptionForeground);
  }
  .task-unproven {
    white-space: pre-wrap;
    color: var(--vscode-editorWarning-foreground);
  }
  body.vscode-high-contrast .task-item {
    border-left-width: 3px;
  }
  /* Markdown-rendered elements inside .prose (Objective/Problem and the
     other document sections) and .task-evidence (a checklist item's own
     evidence, rendered the same way the tree's tooltip already renders
     it). Shared between the two so an evidence line and a prose section
     never read as two different typographic systems. */
  .prose > :first-child, .task-evidence > :first-child {
    margin-top: 0;
  }
  .prose > :last-child, .task-evidence > :last-child {
    margin-bottom: 0;
  }
  .prose p, .task-evidence p {
    margin: 0 0 8px;
  }
  .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6,
  .task-evidence h1, .task-evidence h2, .task-evidence h3, .task-evidence h4, .task-evidence h5, .task-evidence h6 {
    font-size: 1em;
    font-weight: bold;
    margin: 10px 0 4px;
    color: var(--vscode-foreground);
  }
  .prose strong, .task-evidence strong {
    font-weight: bold;
  }
  .prose em, .task-evidence em {
    font-style: italic;
  }
  .prose code, .task-evidence code {
    font-family: var(--vscode-editor-font-family);
    background-color: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
  }
  .prose pre, .task-evidence pre {
    font-family: var(--vscode-editor-font-family);
    background-color: var(--vscode-textCodeBlock-background);
    padding: 8px 10px;
    border-radius: 3px;
    overflow-x: auto;
    white-space: pre;
    margin: 0 0 8px;
  }
  .prose pre code, .task-evidence pre code {
    background-color: transparent;
    padding: 0;
    border-radius: 0;
  }
  .prose ul, .prose ol, .task-evidence ul, .task-evidence ol {
    margin: 0 0 8px;
    padding-left: 1.4em;
  }
  .prose li, .task-evidence li {
    margin: 2px 0;
  }
  .prose blockquote, .task-evidence blockquote {
    border-left: 3px solid var(--vscode-panel-border);
    background-color: var(--vscode-textBlockQuote-background);
    margin: 0 0 8px;
    padding: 4px 10px;
    color: var(--vscode-descriptionForeground);
  }
  .prose a, .task-evidence a {
    color: var(--vscode-textLink-foreground);
  }
  body.vscode-high-contrast .prose blockquote,
  body.vscode-high-contrast .task-evidence blockquote,
  body.vscode-high-contrast .prose pre,
  body.vscode-high-contrast .task-evidence pre {
    border: 1px solid var(--vscode-panel-border);
  }
  .recorded-table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0;
  }
  .recorded-table td {
    padding: 3px 12px 3px 0;
    vertical-align: top;
  }
  .recorded-label {
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    font-weight: bold;
  }
  .recorded-value {
    word-break: break-word;
  }
  body.vscode-high-contrast .recorded-table td {
    border-top: 1px solid var(--vscode-panel-border);
  }
  .history-summary {
    margin: 0;
  }
  .history-chart {
    display: block;
    width: 100%;
    height: 6em;
    margin: 12px 0 4px;
  }
  .history-line {
    fill: none;
    stroke: var(--vscode-textLink-foreground);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }
  .history-point {
    fill: var(--vscode-textLink-foreground);
  }
  .history-caption {
    margin: 0;
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
  }
  /* The chart otherwise has no boundary at all: it is a bare polyline and
     circles floating on the page background, distinguished from the rest
     of the panel by nothing but where the strokes happen to be. High
     contrast themes are built around visible borders standing in for the
     background fills other themes use to separate regions, so the chart
     gets an explicit one here and its own stroke bumps join the tile and
     task-item ones above. */
  body.vscode-high-contrast .history-line {
    stroke-width: 2;
  }
  body.vscode-high-contrast .history-chart {
    border: 1px solid var(--vscode-panel-border);
  }
  body.vscode-high-contrast .history-point {
    stroke: var(--vscode-editor-background);
    stroke-width: 0.6;
  }
</style>
</head>
<body>
  <h1>${escapeHtml(header.title)}</h1>
  <div class="subtitle">${formatSubtitle(header)}</div>
  ${renderNextStep(header)}
  ${renderTiles(header)}
  <hr>
  <div id="panel-body">${renderPanelBody(body)}</div>
  <div id="recorded-by-document">${renderRecordedByDocument(recordedFields)}</div>
  <div id="history">${renderHistory(history)}</div>
</body>
</html>`;
}

/**
 * Owns the ODD Ledger detail panel: a single `vscode.WebviewPanel` reused
 * across every feature the user opens, rather than one panel per feature.
 * `show()` reveals and re-renders the existing panel when there is one;
 * `webviewPanel` returns `undefined` once the panel has been disposed
 * (by the user closing its tab, or by this manager's own `dispose()`), so
 * a later `show()` always knows to create a fresh panel instead of writing
 * into a disposed one.
 */
export class FeatureDetailPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  /** The document path of the feature currently rendered in the panel, or
   * `undefined` when no panel is open. Lets the file watcher (T15) decide
   * whether a changed or deleted document is the one currently on screen
   * without this class handing out anything more than that one path. */
  private currentDocumentPath: string | undefined;

  /** `extensionUri` locates the extension's own install directory, needed
   * to resolve the codicon font file (see show() and renderHtml) through
   * `webview.asWebviewUri` — a webview cannot load a `file://` path
   * directly, only one rewritten through its own local-resource scheme. */
  constructor(private readonly extensionUri: vscode.Uri) {}

  /** The currently open panel, or `undefined` when none is open. Exposed
   * read-only for callers (and tests) that need to inspect the live
   * webview without this class handing out write access to its lifecycle. */
  get webviewPanel(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  /** See currentDocumentPath. */
  get openDocumentPath(): string | undefined {
    return this.currentDocumentPath;
  }

  /**
   * Opens the detail panel for `model`, or reveals and re-renders the
   * already-open one. `workspaceRoot` is the folder the document was
   * discovered under (see discoverFeatureDocuments), used to compute the
   * subtitle's project name and repo-relative path. `lastWork` is T10's
   * seam for a git-derived date, and `history` is the History region's
   * data; both default to "not available" so a caller with no git
   * revisions to hand (or none gathered at all) still renders correctly.
   * extension.ts is what actually runs git (fetchDocumentRevisions) and
   * derives both from the result before calling show().
   */
  /**
   * `preserveFocus` defaults to `false`, unchanged from this method's
   * original behaviour: a feature node's own click (extension.ts's
   * oddLedger.openFeature) and a watcher-driven refresh both still let
   * the panel take focus as before. oddLedger.openTask (adapter/
   * open-task.ts) is the one caller that passes `true`, because that
   * click also reveals a document and must leave keyboard focus on the
   * tree for it to still be usable afterwards.
   */
  show(
    model: FeatureModel,
    workspaceRoot: string,
    lastWork: string | null = null,
    history: FeatureHistory = UNAVAILABLE_HISTORY,
    focusedTaskStartLine?: number,
    preserveFocus = false,
  ): void {
    const header = buildPanelHeader(model, workspaceRoot, lastWork);
    const body = buildPanelBody(model, focusedTaskStartLine);
    const recordedFields = buildRecordedFields(model);
    this.currentDocumentPath = model.documentPath;

    if (this.panel) {
      this.panel.title = header.title || VIEW_TITLE_FALLBACK;
      this.panel.webview.html = renderHtml(header, body, recordedFields, history, this.panel.webview, this.extensionUri);
      // PANEL_VIEW_COLUMN, not undefined: the panel is already at its one
      // fixed home, so this is a no-op today, but naming the column here
      // makes that guarantee explicit instead of resting on reveal()'s
      // "stay put" default — a future change to this method can't silently
      // start moving the panel just by passing a column through.
      this.panel.reveal(PANEL_VIEW_COLUMN, preserveFocus);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      header.title || VIEW_TITLE_FALLBACK,
      // PANEL_VIEW_COLUMN: a task click (oddLedger.openTask) also opens its
      // document in the same column (ViewColumn.One), so both land as
      // separate tabs in the same group instead of the extension carving
      // out a second column for either of them. Kept the same for a
      // feature click too, so the panel never has two different column
      // strategies to reason about.
      { viewColumn: PANEL_VIEW_COLUMN, preserveFocus },
      {
        // No scripts: a static header/tiles/body render has nothing to
        // script, so enableScripts stays off entirely rather than
        // defaulting it on. The one local resource this panel loads is
        // the codicon font, so localResourceRoots is scoped to exactly
        // that directory rather than the whole extension install.
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode/codicons', 'dist')],
      },
    );
    this.panel.webview.html = renderHtml(header, body, recordedFields, history, this.panel.webview, this.extensionUri);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.currentDocumentPath = undefined;
    });
  }

  /**
   * Re-renders the open panel to state that its document no longer
   * exists on disk (T15: a file-watcher delete event for the document
   * currently shown). Follows this feature's absence convention — say
   * what happened, never leave a blank or a stale view — rather than
   * leaving the last successful render in place. A no-op when no panel
   * is open, e.g. the user already closed it before the delete event
   * arrived.
   */
  showRemoved(featureName: string): void {
    if (!this.panel) {
      return;
    }
    this.panel.title = featureName || VIEW_TITLE_FALLBACK;
    this.panel.webview.html = renderRemovedHtml(featureName);
    this.currentDocumentPath = undefined;
  }

  /**
   * Re-renders the open panel to state that a watcher-triggered refresh
   * failed (refresh-open-panel.ts) without the document being confirmed
   * gone. Unlike showRemoved, currentDocumentPath is left untouched so
   * the next watcher-reported touch of the same path still retries,
   * rather than being silently ignored. A no-op when no panel is open.
   */
  showRefreshFailed(featureName: string): void {
    if (!this.panel) {
      return;
    }
    this.panel.title = featureName || VIEW_TITLE_FALLBACK;
    this.panel.webview.html = renderRefreshFailedHtml(featureName);
  }

  /** Disposes the open panel, if any. Safe to call when none is open. */
  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.currentDocumentPath = undefined;
  }
}
