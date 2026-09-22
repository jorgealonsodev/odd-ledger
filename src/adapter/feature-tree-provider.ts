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
import { buildFeatureModel } from '../domain/build-feature-model';
import type { ChecklistCounts, DerivedItemState } from '../domain/derive-checklist-state';
import { discoverFeatureDocuments } from '../domain/discover-feature-documents';
import type { DiscoveredFeatureDocument } from '../domain/discover-feature-documents';
import { compareFeatures, filterFeature, isFeatureClosed } from '../domain/filter-and-order-features';
import type { LedgerFilter } from '../domain/filter-and-order-features';

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

function formatFeatureTooltip(model: FeatureModel): string {
  const counts = model.progress;
  const branchText = model.branch ? `branch ${model.branch}` : 'no branch recorded';
  let tooltip = `${model.featureName} — ${counts.done}/${counts.total} tasks done, ${branchText}`;
  if (counts.doneUnproven > 0) {
    tooltip += `, ${counts.doneUnproven} unproven`;
  }
  return tooltip;
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
    // A feature whose tasks are all closed renders muted (PRD: "as close to
    // archived as ODD gets, and it is derived, not stored") via the theme's
    // own disabled-foreground colour, never a hardcoded one.
    this.iconPath = isFeatureClosed(model)
      ? new vscode.ThemeIcon('checklist', new vscode.ThemeColor('disabledForeground'))
      : new vscode.ThemeIcon('checklist');
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
    this.iconPath = new vscode.ThemeIcon('list-unordered');
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

/** A short, human-readable description of a derived state, used as a
 * task's tooltip only when it records no evidence text of its own. */
const STATE_TOOLTIP_TEXT: Record<DerivedItemState, string> = {
  open: 'open',
  done: 'done',
  'done-unproven': 'checked, no evidence recorded',
  declined: 'declined',
  unknown: 'unknown state',
};

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

function formatTaskTooltip(model: ItemModel): string {
  return model.evidence.trim().length > 0 ? model.evidence : STATE_TOOLTIP_TEXT[model.derivedState];
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
    this.iconPath = new vscode.ThemeIcon(STATE_ICON_ID[model.derivedState]);
    this.description = formatTaskDescription(model);
    this.tooltip = formatTaskTooltip(model);
    this.contextValue = 'oddLedger.task';
    // Clicking a task reveals it in the Markdown at its line (PRD). The
    // model's line numbers are 1-based (as written in the document); the
    // Range/Position API is 0-based, so the conversion happens once, here.
    const line = model.startLine - 1;
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(documentPath), { selection: new vscode.Range(line, 0, line, 0) }],
    };
  }
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
    this.tooltip = model.line;
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
