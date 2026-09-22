/**
 * The tree view's data provider: the first adapter-layer module, and the
 * first allowed to import `vscode`. It is a thin translation layer only —
 * it asks the domain layer (discovery, and now buildFeatureModel, which
 * itself composes structure parsing, checklist parsing and derived state)
 * for data and turns the result into `TreeItem`s. Any logic worth testing
 * without an editor stays in src/domain/, not here.
 *
 * T8 introduces the real hierarchy: feature -> section -> task, plus a
 * next-step leaf pinned as the feature's last child. Filter, ordering of
 * closed features, and reveal-on-click are T9's job; the detail panel is
 * T10-T12; the file watcher is T15.
 */

import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import type { FeatureModel, ItemModel, NextStepModel, SectionModel } from '../domain/build-feature-model';
import { buildFeatureModel, EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';
import { UNPROVEN_TASK_MESSAGE } from '../domain/build-panel-body';
import type { ChecklistCounts, DerivedItemState } from '../domain/derive-checklist-state';
import { prepareEvidenceMarkdown } from '../domain/prepare-evidence-markdown';
import { discoverFeatureDocuments } from '../domain/discover-feature-documents';
import type { DiscoveredFeatureDocument } from '../domain/discover-feature-documents';
import {
  compareFeatures,
  deriveFeatureRollupState,
  deriveSectionRollupState,
  filterFeature,
} from '../domain/filter-and-order-features';
import type { LedgerFilter, RollupState } from '../domain/filter-and-order-features';
import { ROLLUP_COLOR_TOKEN, ROLLUP_ICON_ID, STATE_COLOR_TOKEN } from '../domain/state-colors';

/** Counts reported when a document cannot be read or parsed: the same
 * "nothing found" shape production code already understands, rather than
 * inventing a distinct error state a tree item is not equipped to render. */
const EMPTY_COUNTS: ChecklistCounts = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };

/**
 * A FeatureModel standing in for a document that could not be read or
 * parsed (deleted between discovery and render, permissions, and so on).
 * The tree keeps rendering the rest of the project rather than throwing;
 * this is the same absence-shaped fallback T7's EMPTY_COUNTS was, widened
 * to the full model T8 now needs.
 */
function emptyFeatureModel(featureName: string, documentPath: string): FeatureModel {
  return {
    featureName,
    documentPath,
    title: null,
    branch: null,
    progress: EMPTY_COUNTS,
    sections: [],
    nextStep: null,
    structure: EMPTY_DOCUMENT_STRUCTURE,
  };
}

/** The union of every node kind the tree can show. `getParent` and
 * `getChildren` both switch on `kind` rather than `instanceof`, so the
 * discriminant is explicit and does not rely on prototype identity. */
export type LedgerTreeNode = FeatureNode | SectionNode | TaskNode | NextStepNode;

function formatFeatureDescription(model: FeatureModel): string {
  const counts = model.progress;
  let description = `${counts.done}/${counts.total}`;
  if (counts.doneUnproven > 0) {
    description += ` · ${counts.doneUnproven} unproven`;
  }
  if (model.branch) {
    description += ` · ${model.branch}`;
  }
  return description;
}

/**
 * A feature node's tooltip: the full feature name (never truncated the
 * way the sidebar label can be) followed by what this node adds beyond
 * its own label — done/total, branch, and the unproven count. `appendText`
 * escapes the feature name and the branch name, both document-controlled
 * identifiers this extension does not author, before they reach a
 * MarkdownString; the connective wording is this extension's own and has
 * no Markdown-special characters, so it is appended directly.
 * `isTrusted` is left off (default false): a `command:` link in a
 * MarkdownString reaches this only if a caller opts in, and no tooltip in
 * this tree ever does.
 */
function formatFeatureTooltip(model: FeatureModel): vscode.MarkdownString {
  const counts = model.progress;
  const markdown = new vscode.MarkdownString();
  markdown.appendText(model.featureName);
  markdown.appendMarkdown(` — ${counts.done}/${counts.total} tasks done, `);
  if (model.branch) {
    markdown.appendMarkdown('branch ');
    markdown.appendText(model.branch);
  } else {
    markdown.appendMarkdown('no branch recorded');
  }
  if (counts.doneUnproven > 0) {
    markdown.appendMarkdown(`, ${counts.doneUnproven} unproven`);
  }
  markdown.isTrusted = false;
  return markdown;
}

/**
 * The theme icon a section or feature node renders once its own rollup
 * state (deriveSectionRollupState/deriveFeatureRollupState) is known: the
 * matching task-state glyph and colour once every item underneath is
 * closed (see ROLLUP_ICON_ID/ROLLUP_COLOR_TOKEN in state-colors.ts), or
 * `fallbackIconId` with no colour override while anything is still open —
 * the same "closed reads with the checklist's own vocabulary, open stays
 * neutral" rule for both node kinds, so this is written once and shared
 * rather than duplicated per class.
 */
function rollupThemeIcon(rollup: RollupState, fallbackIconId: string): vscode.ThemeIcon {
  const iconId = ROLLUP_ICON_ID[rollup];
  const colorToken = ROLLUP_COLOR_TOKEN[rollup];
  if (iconId && colorToken) {
    return new vscode.ThemeIcon(iconId, new vscode.ThemeColor(colorToken));
  }
  return new vscode.ThemeIcon(fallbackIconId);
}

/**
 * One feature document rendered as the tree's root node for that feature.
 * Its children are its item-bearing sections, plus a trailing next-step
 * node when the document records one (see FeatureTreeDataProvider).
 */
export class FeatureNode extends vscode.TreeItem {
  readonly kind = 'feature' as const;
  /** A feature is always a root node: there is nothing above it in this
   * tree. Kept as an explicit field (rather than left off the type) so
   * every LedgerTreeNode has a uniform `.parent`, which is exactly what
   * getParent needs to stay a one-line lookup. */
  readonly parent: undefined = undefined;

  constructor(public readonly model: FeatureModel) {
    super(model.featureName, vscode.TreeItemCollapsibleState.Expanded);
    this.description = formatFeatureDescription(model);
    this.tooltip = formatFeatureTooltip(model);
    // A feature whose items are all closed and all proven reads green,
    // the same "pass" glyph its leaves earned; closed but hiding a
    // done-unproven item reads the warning glyph and colour instead, never
    // green — see deriveFeatureRollupState's own reasoning for why. An
    // open feature keeps the plain checklist icon with no colour override.
    this.iconPath = rollupThemeIcon(deriveFeatureRollupState(model), 'checklist');
    this.contextValue = 'oddLedger.feature';
    // Clicking a feature opens the detail panel (PRD). Passing `this`
    // works even though the constructor is still running: the command
    // only fires later, once the tree item is fully constructed, and by
    // then every field above is set.
    this.command = {
      command: 'oddLedger.openFeature',
      title: 'Open Feature',
      arguments: [this],
    };
  }
}

/**
 * A section node's tooltip: its full heading as written (`appendText`,
 * escaped — a document-authored heading, not this extension's own prose)
 * followed by its own done/total, the same reasoning as
 * formatFeatureTooltip above, one level down.
 */
function formatSectionTooltip(model: SectionModel): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.appendText(model.heading);
  markdown.appendMarkdown(`\n\n${model.counts.done}/${model.counts.total} tasks done`);
  markdown.isTrusted = false;
  return markdown;
}

/**
 * One `##` section that holds at least one checklist item (see
 * buildFeatureModel's section filter — a prose-only section never reaches
 * this layer at all). Its children are its task nodes.
 */
export class SectionNode extends vscode.TreeItem {
  readonly kind = 'section' as const;

  constructor(
    public readonly model: SectionModel,
    public readonly parent: FeatureNode,
  ) {
    super(model.heading, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${model.counts.done}/${model.counts.total}`;
    this.tooltip = formatSectionTooltip(model);
    // Same rollup rule as FeatureNode, one level down: a section whose
    // items are all closed and all proven reads green with the pass
    // glyph; closed but hiding a done-unproven item reads the warning
    // glyph and colour instead, never green; anything still open keeps
    // the generic list glyph with no colour override.
    this.iconPath = rollupThemeIcon(deriveSectionRollupState(model), 'list-unordered');
    this.contextValue = 'oddLedger.section';
  }
}

const STATE_ICON_ID: Record<DerivedItemState, string> = {
  open: 'circle-large-outline',
  done: 'pass',
  'done-unproven': 'warning',
  declined: 'circle-slash',
  unknown: 'question',
};

/** The sentence a task with an unrecognized checkbox marker states in its
 * tooltip (see formatTaskTooltip) — the one bare-state case still worth
 * naming. Every other state (open, done, declined) is dropped from the
 * tooltip entirely: the icon already shows it, and repeating it as a
 * single word would crowd out what the tooltip could not otherwise show. */
const UNKNOWN_MARKER_MESSAGE = "This item's checkbox marker was not recognized, so its state could not be determined.";

function formatTaskLabel(model: ItemModel): string {
  return model.id ? `${model.id} ${model.title}` : model.title;
}

/** The commit reference when present; the honest "unproven" text for a
 * done-unproven item; otherwise no description at all (`undefined`, not an
 * empty string, so VS Code renders nothing rather than a stray space). */
function formatTaskDescription(model: ItemModel): string | undefined {
  if (model.derivedState === 'done-unproven') {
    return 'checked, no evidence recorded';
  }
  return model.commitReference ?? undefined;
}

/**
 * A task's tooltip, composed in a fixed order: its full text always (the
 * part the tree's own truncated label had to cut, so it is the part a
 * tooltip exists to restore — this alone earns a tooltip's place on an
 * item with nothing else to say); its evidence, when it recorded any,
 * rendered as Markdown so a commit hash in backticks or bold prose reads
 * the way it does in the document; then, only when it applies, one
 * sentence naming what the icon alone cannot show — the shared unproven
 * statement for a done-unproven item, or UNKNOWN_MARKER_MESSAGE for an
 * unrecognized marker. open, done and declined add nothing here: the icon
 * already says exactly that, and a bare state word would only repeat it.
 *
 * `appendText` escapes the item's own id/title (a label this extension
 * derives, not free document prose); `appendMarkdown` is used for the
 * evidence block, which is exactly the free-form prose this conversion
 * exists to render as Markdown. `isTrusted` is left off (default false):
 * evidence comes from a Markdown file this extension does not control,
 * and an untrusted MarkdownString cannot carry a `command:` link.
 */
function formatTaskTooltip(model: ItemModel): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.appendText(formatTaskLabel(model));

  if (model.evidence.trim().length > 0) {
    markdown.appendMarkdown('\n\n');
    // Dedented and rejoined first (prepareEvidenceMarkdown): the raw
    // source carries this document's own checklist-continuation indent
    // and hard wrap, neither of which Markdown should be handed as-is —
    // see that function's own doc comment for why.
    markdown.appendMarkdown(prepareEvidenceMarkdown(model.evidence));
  }

  if (model.derivedState === 'done-unproven') {
    markdown.appendMarkdown('\n\n');
    markdown.appendText(UNPROVEN_TASK_MESSAGE);
  } else if (model.derivedState === 'unknown') {
    markdown.appendMarkdown('\n\n');
    markdown.appendText(UNKNOWN_MARKER_MESSAGE);
  }

  markdown.isTrusted = false;
  return markdown;
}

/** The task-state theme icon: STATE_ICON_ID's glyph, coloured per
 * STATE_COLOR_TOKEN when that state carries a colour, so the tree and the
 * detail panel (which reads the same STATE_COLOR_TOKEN map) always agree
 * on what a state looks like. */
function taskThemeIcon(state: DerivedItemState): vscode.ThemeIcon {
  const colorToken = STATE_COLOR_TOKEN[state];
  return colorToken
    ? new vscode.ThemeIcon(STATE_ICON_ID[state], new vscode.ThemeColor(colorToken))
    : new vscode.ThemeIcon(STATE_ICON_ID[state]);
}

/**
 * One checklist item rendered as a leaf. VS Code's TreeItem has only one
 * description line, not a second one of its own: `description` here is the
 * honest equivalent of the PRD's "commit reference on a second line" for
 * this API, not a literal second line.
 */
export class TaskNode extends vscode.TreeItem {
  readonly kind = 'task' as const;
  readonly documentPath: string;
  readonly startLine: number;

  constructor(
    public readonly model: ItemModel,
    public readonly parent: SectionNode,
    documentPath: string,
  ) {
    super(formatTaskLabel(model), vscode.TreeItemCollapsibleState.None);
    this.documentPath = documentPath;
    this.startLine = model.startLine;
    this.iconPath = taskThemeIcon(model.derivedState);
    this.description = formatTaskDescription(model);
    this.tooltip = formatTaskTooltip(model);
    this.contextValue = 'oddLedger.task';
    // Clicking a task both reveals it in the Markdown at its line and
    // opens the detail panel for its feature, focused on this task (PRD).
    // A TreeItem carries only one command, so both actions run through
    // oddLedger.openTask (adapter/open-task.ts), which reads the node's
    // own documentPath/startLine and its parent chain up to the feature.
    this.command = {
      command: 'oddLedger.openTask',
      title: 'Open Task',
      arguments: [this],
    };
  }
}

/**
 * The `vscode.open`-shaped arguments that reveal `node`'s task at its
 * line in the Markdown source: the document's own file, and a zero-width
 * selection on its line. `startLine` is 1-based (as written in the
 * document); the Range/Position API is 0-based, so the conversion happens
 * once, here. Used by oddLedger.openTask (adapter/open-task.ts) to build
 * the options it passes to `vscode.window.showTextDocument`.
 */
export function revealTaskArguments(node: TaskNode): [vscode.Uri, { selection: vscode.Range }] {
  const line = node.startLine - 1;
  return [vscode.Uri.file(node.documentPath), { selection: new vscode.Range(line, 0, line, 0) }];
}

/**
 * The document's `## Next step` line, pinned as the last child of its
 * feature node (see FeatureTreeDataProvider.getChildren). Always a leaf.
 */
export class NextStepNode extends vscode.TreeItem {
  readonly kind = 'nextStep' as const;

  constructor(
    public readonly model: NextStepModel,
    public readonly parent: FeatureNode,
  ) {
    super(`Next: ${model.line}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('arrow-right');
    // The full next-step sentence, rendered as Markdown (like a task's
    // evidence): it is the same kind of free-form document prose, and the
    // label above already truncates it. isTrusted is left off (default
    // false), same reasoning as formatTaskTooltip.
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(model.line);
    tooltip.isTrusted = false;
    this.tooltip = tooltip;
    this.contextValue = 'oddLedger.nextStep';
  }
}

/**
 * Supplies the ODD Ledger tree: one FeatureNode per feature document
 * discovered under every open workspace folder's `odd/tasks/`, each
 * expanding into its item-bearing sections and, last, its next-step node.
 *
 * Multi-root decision: a feature is not scoped to "its" folder in this
 * view. Every open workspace folder is scanned with the same domain-layer
 * discovery function, and every feature document found in any of them
 * becomes a root node in one flat list — there is no per-folder grouping
 * level, because nothing in the interface calls for one and a typical
 * project has one or two features total, not per folder. The list is
 * ordered by compareFeatures: open features first, closed ones last, by
 * name within each group.
 *
 * No-workspace decision: a window with no workspace folder at all
 * (`vscode.workspace.workspaceFolders` is `undefined`) produces the same
 * empty root list as a workspace folder with no `odd/tasks/`. Both are
 * "nothing to show", and both fall through to the same
 * `contributes.viewsWelcome` content — the view does not try to explain
 * *why* nothing was found, only that nothing was.
 */
export class FeatureTreeDataProvider implements vscode.TreeDataProvider<LedgerTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<
    void | LedgerTreeNode | LedgerTreeNode[] | null | undefined
  >();

  readonly onDidChangeTreeData = this.changeEmitter.event;

  /** The active filter (PRD: `All` / `Open` / `Unproven`). `all` by
   * default, so an unfiltered tree is what a fresh view shows. */
  private filter: LedgerFilter = 'all';

  /** Re-renders the tree. Bound to the refresh command in extension.ts. */
  refresh(): void {
    this.changeEmitter.fire();
  }

  /** Changes the active filter and re-renders. Bound to the three filter
   * commands (`oddLedger.filterAll` / `filterOpen` / `filterUnproven`) in
   * extension.ts. */
  setFilter(filter: LedgerFilter): void {
    this.filter = filter;
    this.changeEmitter.fire();
  }

  getTreeItem(element: LedgerTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LedgerTreeNode): LedgerTreeNode[] {
    if (!element) {
      return this.discoverFeatures();
    }
    if (element.kind === 'feature') {
      return this.childrenOfFeature(element);
    }
    if (element.kind === 'section') {
      return element.model.items.map((item) => new TaskNode(item, element, element.parent.model.documentPath));
    }
    // Task and next-step nodes are leaves.
    return [];
  }

  getParent(element: LedgerTreeNode): LedgerTreeNode | undefined {
    return element.parent;
  }

  private childrenOfFeature(feature: FeatureNode): LedgerTreeNode[] {
    const children: LedgerTreeNode[] = feature.model.sections.map((section) => new SectionNode(section, feature));
    if (feature.model.nextStep) {
      // Pinned last, per the PRD: "the single most useful line for
      // resuming, so it is visible without opening anything" reads best
      // as the final thing in the list, not the first.
      children.push(new NextStepNode(feature.model.nextStep, feature));
    }
    return children;
  }

  private discoverFeatures(): FeatureNode[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const models: FeatureModel[] = [];

    for (const folder of folders) {
      for (const document of discoverFeatureDocuments(folder.uri.fsPath)) {
        const model = this.readModel(document);
        const filtered = filterFeature(model, this.filter);
        // A feature with nothing left under the active filter (e.g. no
        // done-unproven items under "Unproven") is not shown at all,
        // rather than rendering an empty shell.
        if (filtered) {
          models.push(filtered);
        }
      }
    }

    models.sort(compareFeatures);
    return models.map((model) => new FeatureNode(model));
  }

  /**
   * Reads a feature document and composes it into a FeatureModel via the
   * domain layer's buildFeatureModel. A document that cannot be read
   * reports the empty model rather than throwing: the tree must keep
   * rendering the rest of the project.
   */
  private readModel(document: DiscoveredFeatureDocument): FeatureModel {
    try {
      const text = readFileSync(document.path, 'utf-8');
      return buildFeatureModel(document.featureName, document.path, text);
    } catch {
      return emptyFeatureModel(document.featureName, document.path);
    }
  }
}
