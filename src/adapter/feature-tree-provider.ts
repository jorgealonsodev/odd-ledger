/**
 * The tree view's data provider: the first adapter-layer module, and the
 * first allowed to import `vscode`. It is a thin translation layer only —
 * it asks the domain layer (discovery, structure parsing, checklist
 * parsing, derived state) for data and turns the result into `TreeItem`s.
 * Any logic worth testing without an editor stays in src/domain/, not
 * here.
 *
 * T7 renders one flat level: a node per discovered feature document,
 * showing its name and its done/total counts. Sections and task nodes
 * nest under a feature starting in T8.
 */

import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { deriveChecklistState } from '../domain/derive-checklist-state';
import type { ChecklistCounts } from '../domain/derive-checklist-state';
import { discoverFeatureDocuments } from '../domain/discover-feature-documents';
import type { DiscoveredFeatureDocument } from '../domain/discover-feature-documents';
import { parseChecklist } from '../domain/parse-checklist';
import { parseDocumentStructure } from '../domain/parse-document-structure';

/** Counts reported when a document cannot be read or parsed: the same
 * "nothing found" shape production code already understands, rather than
 * inventing a distinct error state a tree item is not equipped to render. */
const EMPTY_COUNTS: ChecklistCounts = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };

/**
 * One feature document rendered as a tree node. Today it is always a
 * leaf: sections and tasks are T8's job, and adding a real child level
 * later is what turns `collapsibleState` from `None` into `Collapsed`.
 */
export class FeatureTreeItem extends vscode.TreeItem {
  constructor(
    public readonly featureName: string,
    public readonly documentPath: string,
    public readonly counts: ChecklistCounts,
  ) {
    super(featureName, vscode.TreeItemCollapsibleState.None);
    this.description = `${counts.done}/${counts.total}`;
    this.tooltip = `${featureName} — ${counts.done}/${counts.total} tasks done`;
    this.contextValue = 'oddLedger.feature';
  }
}

/**
 * Supplies the ODD Ledger tree: one node per feature document discovered
 * under every open workspace folder's `odd/tasks/`.
 *
 * Multi-root decision: a feature is not scoped to "its" folder in this
 * view. Every open workspace folder is scanned with the same domain-layer
 * discovery function, and every feature document found in any of them
 * becomes a node in one flat, alphabetically sorted list — there is no
 * per-folder grouping level, because nothing in the interface calls for
 * one and a typical project has one or two features total, not per
 * folder.
 *
 * No-workspace decision: a window with no workspace folder at all
 * (`vscode.workspace.workspaceFolders` is `undefined`) produces the same
 * empty root list as a workspace folder with no `odd/tasks/`. Both are
 * "nothing to show", and both fall through to the same
 * `contributes.viewsWelcome` content — the view does not try to explain
 * *why* nothing was found, only that nothing was.
 */
export class FeatureTreeDataProvider implements vscode.TreeDataProvider<FeatureTreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<
    void | FeatureTreeItem | FeatureTreeItem[] | null | undefined
  >();

  readonly onDidChangeTreeData = this.changeEmitter.event;

  /** Re-renders the tree. Bound to the refresh command in extension.ts. */
  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: FeatureTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FeatureTreeItem): FeatureTreeItem[] {
    if (element) {
      // Flat list today: sections and tasks are T8.
      return [];
    }
    return this.discoverFeatures();
  }

  getParent(_element: FeatureTreeItem): undefined {
    // Every node currently rendered is a root-level feature: there is no
    // deeper level until T8 introduces sections and tasks. Implemented
    // (rather than left undefined) because the reveal API T9 needs
    // requires a real getParent, even one that always answers "no parent".
    return undefined;
  }

  private discoverFeatures(): FeatureTreeItem[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const items: FeatureTreeItem[] = [];

    for (const folder of folders) {
      for (const document of discoverFeatureDocuments(folder.uri.fsPath)) {
        items.push(this.toTreeItem(document));
      }
    }

    items.sort((a, b) => a.featureName.localeCompare(b.featureName));
    return items;
  }

  private toTreeItem(document: DiscoveredFeatureDocument): FeatureTreeItem {
    return new FeatureTreeItem(document.featureName, document.path, this.readCounts(document.path));
  }

  /**
   * Reads and runs a feature document through the domain pipeline
   * (structure, checklist, derived state) to get its progress counts.
   * A document that cannot be read (deleted between discovery and render,
   * permissions, and so on) reports empty counts rather than throwing:
   * the tree must keep rendering the rest of the project.
   */
  private readCounts(path: string): ChecklistCounts {
    try {
      const text = readFileSync(path, 'utf-8');
      const structure = parseDocumentStructure(text);
      const checklist = parseChecklist(text, structure.sections);
      return deriveChecklistState(checklist).progress;
    } catch {
      return EMPTY_COUNTS;
    }
  }
}
