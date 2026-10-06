import type * as vscode from 'vscode';
import { PendingDocumentUpdates } from '../domain/pending-document-updates';

/** The parts of a window focus source needed to observe focus transitions. */
export interface WindowFocusSource {
  readonly focused: boolean;
  onDidChangeFocus(listener: (focused: boolean) => void): vscode.Disposable;
}

/** The parts of a view visibility source needed to observe visibility transitions. */
export interface ViewVisibilitySource {
  readonly visible: boolean;
  onDidChangeVisibility(listener: (visible: boolean) => void): vscode.Disposable;
}

/** Owns the native TreeView badge and the focus and visibility listeners that clear it once the user sees the view. */
export class UpdateBadge implements vscode.Disposable {
  private readonly pendingUpdates: PendingDocumentUpdates;
  private readonly focusListener: vscode.Disposable;
  private readonly visibilityListener: vscode.Disposable;

  constructor(
    private readonly view: Pick<vscode.TreeView<unknown>, 'badge'>,
    windowFocus: WindowFocusSource,
    viewVisibility: ViewVisibilitySource,
  ) {
    this.pendingUpdates = new PendingDocumentUpdates({
      focused: windowFocus.focused,
      viewVisible: viewVisibility.visible,
    });
    this.focusListener = windowFocus.onDidChangeFocus((focused) => {
      this.pendingUpdates.setFocused(focused);
      this.render();
    });
    this.visibilityListener = viewVisibility.onDidChangeVisibility((visible) => {
      this.pendingUpdates.setViewVisible(visible);
      this.render();
    });
    this.render();
  }

  /** Adds one automatic watcher flush to the pending distinct-path count. */
  recordBatch(touchedPaths: ReadonlySet<string>): void {
    this.pendingUpdates.recordBatch(touchedPaths);
    this.render();
  }

  private render(): void {
    const count = this.pendingUpdates.count;
    this.view.badge = count === 0
      ? undefined
      : {
          value: count,
          tooltip: `${count} task document${count === 1 ? '' : 's'} changed since you last saw this view`,
        };
  }

  dispose(): void {
    this.focusListener.dispose();
    this.visibilityListener.dispose();
  }
}
