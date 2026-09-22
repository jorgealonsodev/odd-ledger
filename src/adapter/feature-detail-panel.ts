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
 * The "Recorded by this document" table (T12) is not implemented yet;
 * RECORDED_BY_DOCUMENT_PLACEHOLDER below marks exactly where it is
 * inserted. Git-derived history (T13) and theming/layout polish (T14) are
 * also later work.
 */

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { FeatureModel } from '../domain/build-feature-model';
import type { PanelHeader } from '../domain/build-panel-header';
import { buildPanelHeader } from '../domain/build-panel-header';
import { buildPanelBody } from '../domain/build-panel-body';
import type { PanelBody, PanelBodyDocumentSection } from '../domain/build-panel-body';
import { UNPROVEN_TASK_MESSAGE } from '../domain/build-panel-body';
import type { DerivedItemState } from '../domain/derive-checklist-state';
import type { ItemModel, SectionModel } from '../domain/build-feature-model';
import { escapeHtml } from '../domain/escape-html';

const VIEW_TYPE = 'oddLedger.featureDetail';
const VIEW_TITLE_FALLBACK = 'ODD Ledger';

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
 * sections' prose (already joined by buildPanelBody). Markdown is not
 * rendered to HTML here — a Markdown renderer is a dependency this
 * extension does not carry, and a partial hand-rolled one would misrender
 * the real corpus in ways worse than showing it as plain text — so the
 * text is escaped and kept in a `<pre>` to preserve the document's own
 * line breaks and whitespace.
 */
function renderObjective(body: PanelBody): string {
  if (body.objective === null) {
    return '';
  }
  return `
    <h2>Objective</h2>
    <pre class="prose">${escapeHtml(body.objective)}</pre>`;
}

const STATE_GLYPH: Record<DerivedItemState, string> = {
  open: '☐',
  done: '☑',
  'done-unproven': '⚠',
  declined: '⊘',
  unknown: '?',
};

function formatTaskLine(item: ItemModel): string {
  return item.id ? `${item.id}  ${item.title}` : item.title;
}

/**
 * A task's evidence line: the ODD unproven statement for a done-unproven
 * item (the item itself, by construction, records no evidence and no
 * commit reference — see deriveChecklistState), the item's own evidence
 * text when it recorded any, or nothing at all otherwise. Never Markdown-
 * rendered, for the same reason renderObjective is not.
 */
function renderTaskEvidence(item: ItemModel): string {
  if (item.derivedState === 'done-unproven') {
    return `<pre class="task-evidence task-unproven">${escapeHtml(UNPROVEN_TASK_MESSAGE)}</pre>`;
  }
  if (item.evidence.trim().length > 0) {
    return `<pre class="task-evidence">${escapeHtml(item.evidence)}</pre>`;
  }
  return '';
}

function renderTaskItem(item: ItemModel): string {
  const glyph = STATE_GLYPH[item.derivedState];
  return `
      <div class="task-item task-item-${item.derivedState}">
        <div class="task-title"><span class="task-glyph">${glyph}</span> ${escapeHtml(formatTaskLine(item))}</div>
        ${renderTaskEvidence(item)}
      </div>`;
}

function renderTaskSection(section: SectionModel): string {
  const items = section.items.map(renderTaskItem).join('');
  return `
    <h2>${escapeHtml(section.heading)}</h2>
    <div class="task-list">${items}</div>`;
}

/** The body's Tasks regions: every section buildFeatureModel already
 * found to hold at least one checklist item, with its items and their
 * evidence, in the same order the tree view renders them. */
function renderTaskSections(body: PanelBody): string {
  return body.taskSections.map(renderTaskSection).join('');
}

function renderOtherSection(section: PanelBodyDocumentSection): string {
  return `
    <h2>${escapeHtml(section.heading)}</h2>
    <pre class="prose">${escapeHtml(section.body)}</pre>`;
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
  return `${renderObjective(body)}${renderTaskSections(body)}${renderOtherSections(body)}`;
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
 */
function renderHtml(header: PanelHeader, body: PanelBody): string {
  const nonce = createNonce();
  const csp = `default-src 'none'; style-src 'nonce-${nonce}';`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(header.title)}</title>
<style nonce="${nonce}">
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
  h2 {
    font-size: 1em;
    margin: 20px 0 8px;
    color: var(--vscode-foreground);
  }
  .prose {
    font-family: inherit;
    white-space: pre-wrap;
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
  .task-glyph {
    display: inline-block;
    width: 1.2em;
  }
  .task-evidence {
    font-family: inherit;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 2px 0 0 1.6em;
    color: var(--vscode-descriptionForeground);
  }
  .task-unproven {
    color: var(--vscode-editorWarning-foreground);
  }
  body.vscode-high-contrast .task-item {
    border-left-width: 3px;
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
  <!-- T12 inserts the "Recorded by this document" table here: TDD,
       delivery, route, line budget and review, each its value or "not
       recorded". -->
  <div id="recorded-by-document"></div>
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

  /** The currently open panel, or `undefined` when none is open. Exposed
   * read-only for callers (and tests) that need to inspect the live
   * webview without this class handing out write access to its lifecycle. */
  get webviewPanel(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  /**
   * Opens the detail panel for `model`, or reveals and re-renders the
   * already-open one. `workspaceRoot` is the folder the document was
   * discovered under (see discoverFeatureDocuments), used to compute the
   * subtitle's project name and repo-relative path. `lastWork` is T13's
   * seam for a git-derived date; omitted, the LAST WORK tile states its
   * absence.
   */
  show(model: FeatureModel, workspaceRoot: string, lastWork: string | null = null): void {
    const header = buildPanelHeader(model, workspaceRoot, lastWork);
    const body = buildPanelBody(model);

    if (this.panel) {
      this.panel.title = header.title || VIEW_TITLE_FALLBACK;
      this.panel.webview.html = renderHtml(header, body);
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      header.title || VIEW_TITLE_FALLBACK,
      vscode.ViewColumn.One,
      // No scripts: a static header/tiles/body render has nothing to
      // script, so enableScripts stays off entirely rather than
      // defaulting it on.
      {},
    );
    this.panel.webview.html = renderHtml(header, body);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  /** Disposes the open panel, if any. Safe to call when none is open. */
  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}
