/**
 * Watches every workspace folder's odd/tasks/*.md documents (T15) and
 * rebuilds its watchers when the folder set itself changes. Reports a
 * debounced, coalesced batch of touched documents; deciding what a
 * touched document means for the tree or the open panel is not this
 * module's job (see extension.ts and refresh-open-panel.ts).
 */

import * as vscode from 'vscode';
import { DebouncedAction, type DebounceTimer } from '../domain/debounce-refresh';

/** Wraps the real setTimeout/clearTimeout as a DebounceTimer. The domain
 * layer's DebouncedAction never touches the global scope itself (see
 * debounce-refresh.ts); this is where the real one is supplied. */
const REAL_TIMER: DebounceTimer = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** What a debounced batch of watcher events reports: every odd/tasks/*.md
 * path (across every watched workspace folder) that fired at least one
 * change, create, or delete event since the previous flush. Callers that
 * care what actually happened to a specific path (e.g. whether it still
 * exists) check the filesystem themselves — flushing does not attach a
 * per-path event kind, because a burst can carry more than one kind for
 * the same path and only the file's current state on disk is trustworthy
 * by the time the debounce fires. */
export interface FeatureDocumentFlush {
  readonly touchedPaths: ReadonlySet<string>;
}

/**
 * Owns one vscode.FileSystemWatcher per open workspace folder, scoped to
 * that folder's odd/tasks/*.md documents via a RelativePattern (never one
 * absolute glob), so a multi-root workspace is covered and a folder added
 * later is too. Also listens for the workspace folder set itself
 * changing, rebuilding every watcher when it does.
 *
 * Every raw event is coalesced through a single DebouncedAction so a
 * burst of change events (one editor save, or a git operation touching
 * many files) reaches `onFlush` exactly once.
 */
export class FeatureDocumentWatcher implements vscode.Disposable {
  private readonly debounced: DebouncedAction;
  private touchedPaths = new Set<string>();
  private folderWatchers: vscode.Disposable[] = [];
  private readonly folderChangeListener: vscode.Disposable;

  constructor(onFlush: (flush: FeatureDocumentFlush) => void, timer: DebounceTimer = REAL_TIMER) {
    this.debounced = new DebouncedAction(timer, () => {
      const flush: FeatureDocumentFlush = { touchedPaths: this.touchedPaths };
      this.touchedPaths = new Set();
      onFlush(flush);
    });

    this.rebuildFolderWatchers();
    this.folderChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.rebuildFolderWatchers();
      // The folder set changing is itself a reason to refresh (a folder
      // gained or lost its whole odd/tasks/ contents at once), even when
      // no individual document fired its own event.
      this.debounced.trigger();
    });
  }

  /** Disposes every current per-folder watcher and creates a fresh one
   * for each currently open workspace folder. Called on construction and
   * whenever the workspace folder set changes, so a removed folder's
   * watcher is never left running and a newly added folder is covered
   * immediately. */
  private rebuildFolderWatchers(): void {
    for (const watcher of this.folderWatchers) {
      watcher.dispose();
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    this.folderWatchers = folders.map((folder) => {
      // A RelativePattern per workspace folder, not one absolute glob
      // built from workspaceFolders[0]: that is what makes a multi-root
      // workspace watched in full rather than just its first folder.
      const pattern = new vscode.RelativePattern(folder, 'odd/tasks/*.md');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const record = (uri: vscode.Uri) => {
        this.touchedPaths.add(uri.fsPath);
        this.debounced.trigger();
      };
      watcher.onDidChange(record);
      watcher.onDidCreate(record);
      watcher.onDidDelete(record);
      return watcher;
    });
  }

  /** Disposes the debounce, the workspace-folder-change listener, and
   * every current per-folder watcher. Safe to call once; nothing here
   * fires after this returns. */
  dispose(): void {
    this.debounced.dispose();
    this.folderChangeListener.dispose();
    for (const watcher of this.folderWatchers) {
      watcher.dispose();
    }
    this.folderWatchers = [];
  }
}
