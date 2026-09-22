import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { createOpenTask } from './open-task';
import type { OpenTaskPanel, OpenTextDocument, ShowTextDocument } from './open-task';
import { FeatureNode, SectionNode, TaskNode } from './feature-tree-provider';
import type { FeatureModel, ItemModel, SectionModel } from '../domain/build-feature-model';
import { EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';
import type { FetchedRevisions } from '../domain/fetch-git-revisions';

/**
 * createOpenTask (oddLedger.openTask) both reveals a task's line in its
 * Markdown source and shows the detail panel focused on it, from one
 * click. Every dependency here is faked, so these tests exercise the
 * race-guard and independence logic directly and fast, without a real
 * editor or webview — the live wiring itself is covered by
 * extension-activation.test.ts.
 */

const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };
const NO_REVISIONS: FetchedRevisions = { revisions: [], truncated: false, skippedCount: 0 };

function featureModel(featureName: string, documentPath: string): FeatureModel {
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

function taskNode(featureName: string, documentPath: string, startLine: number): TaskNode {
  const featureNode = new FeatureNode(featureModel(featureName, documentPath));
  const sectionModel: SectionModel = {
    heading: 'Tasks',
    kind: 'tasks',
    counts: EMPTY_COUNTS,
    countsTowardProgress: true,
    headingLine: 3,
    items: [],
  };
  const sectionNode = new SectionNode(sectionModel, featureNode);
  const itemModel: ItemModel = {
    id: 'T1',
    title: 'Do the thing',
    derivedState: 'open',
    commitReference: null,
    startLine,
    endLine: startLine,
    evidence: '',
  };
  return new TaskNode(itemModel, sectionNode, documentPath);
}

/** A fake panel recording every show() call, and a fake fetchRevisions
 * that resolves through a caller-controlled deferred promise per call, so
 * a test can dictate exactly which of two overlapping invocations
 * resolves first. */
function fakes() {
  const panelCalls: Array<{ featureName: string; focusedTaskStartLine: number | undefined; preserveFocus: boolean | undefined }> = [];
  const panel: OpenTaskPanel = {
    show: (model, _root, _lastWork, _history, focusedTaskStartLine, preserveFocus) => {
      panelCalls.push({ featureName: model.featureName, focusedTaskStartLine, preserveFocus });
    },
  };

  const fetchDeferred = new Map<string, { resolve: () => void; promise: Promise<FetchedRevisions> }>();
  const fetchRevisions = (_repoRoot: string, documentPath: string): Promise<FetchedRevisions> => {
    let resolveFn!: () => void;
    const promise = new Promise<FetchedRevisions>((resolve) => {
      resolveFn = () => resolve(NO_REVISIONS);
    });
    fetchDeferred.set(documentPath, { resolve: resolveFn, promise });
    return promise;
  };

  const openCalls: string[] = [];
  const openDeferred = new Map<string, { resolve: () => void; promise: Promise<vscode.TextDocument> }>();
  const openTextDocument: OpenTextDocument = (uri) => {
    openCalls.push(uri.fsPath);
    let resolveFn!: () => void;
    const promise = new Promise<vscode.TextDocument>((resolve) => {
      resolveFn = () => resolve({ uri } as vscode.TextDocument);
    });
    openDeferred.set(uri.fsPath, { resolve: resolveFn, promise });
    return promise;
  };

  const showCalls: Array<{ documentPath: string; options: vscode.TextDocumentShowOptions }> = [];
  const showTextDocument: ShowTextDocument = (document, options) => {
    showCalls.push({ documentPath: document.uri.fsPath, options });
    return Promise.resolve({} as vscode.TextEditor);
  };

  return { panel, panelCalls, fetchRevisions, fetchDeferred, openTextDocument, openDeferred, openCalls, showTextDocument, showCalls };
}

suite('createOpenTask (oddLedger.openTask)', () => {
// --- basic single-click behaviour -------------------------------------------

test('opens the task\'s document with the right layout, preview and focus options', async () => {
  const f = fakes();
  const openTask = createOpenTask(f.panel, f.fetchRevisions, f.openTextDocument, f.showTextDocument);
  const node = taskNode('sample', '/workspace/odd/tasks/sample.md', 6);

  const done = openTask(node);
  f.openDeferred.get('/workspace/odd/tasks/sample.md')!.resolve();
  f.fetchDeferred.get('/workspace/odd/tasks/sample.md')!.resolve();
  await done;

  assert.equal(f.showCalls.length, 1);
  const { documentPath, options } = f.showCalls[0];
  assert.equal(documentPath, '/workspace/odd/tasks/sample.md');
  assert.equal(options.viewColumn, vscode.ViewColumn.One, 'expected the document in the main editor column');
  assert.equal(options.preview, true, 'expected a preview tab, not a pinned one');
  assert.equal(options.preserveFocus, true, 'expected focus to stay on the tree');
  // startLine 6 is 1-based; the reveal API is 0-based.
  assert.equal((options.selection as vscode.Range).start.line, 5);
});

test('shows the panel focused on the clicked task, with preserveFocus true', async () => {
  const f = fakes();
  const openTask = createOpenTask(f.panel, f.fetchRevisions, f.openTextDocument, f.showTextDocument);
  const node = taskNode('sample', '/workspace/odd/tasks/sample.md', 6);

  const done = openTask(node);
  f.openDeferred.get('/workspace/odd/tasks/sample.md')!.resolve();
  f.fetchDeferred.get('/workspace/odd/tasks/sample.md')!.resolve();
  await done;

  assert.equal(f.panelCalls.length, 1);
  assert.deepEqual(f.panelCalls[0], { featureName: 'sample', focusedTaskStartLine: 6, preserveFocus: true });
});

// --- the race guard: two rapid clicks on different tasks --------------------

test('when a second click finishes first, the panel ends up showing only the second task, never the first', async () => {
  const f = fakes();
  const openTask = createOpenTask(f.panel, f.fetchRevisions, f.openTextDocument, f.showTextDocument);
  const nodeA = taskNode('feature-a', '/workspace/odd/tasks/feature-a.md', 5);
  const nodeB = taskNode('feature-b', '/workspace/odd/tasks/feature-b.md', 5);

  const doneA = openTask(nodeA);
  const doneB = openTask(nodeB);

  // B resolves first (both halves), fully finishing before A's fetch or
  // open ever resolves — the scenario a naive "last write wins without a
  // guard" implementation gets wrong.
  f.openDeferred.get('/workspace/odd/tasks/feature-b.md')!.resolve();
  f.fetchDeferred.get('/workspace/odd/tasks/feature-b.md')!.resolve();
  await doneB;

  // Now let A's (stale) work resolve.
  f.openDeferred.get('/workspace/odd/tasks/feature-a.md')!.resolve();
  f.fetchDeferred.get('/workspace/odd/tasks/feature-a.md')!.resolve();
  await doneA;

  assert.equal(f.panelCalls.length, 1, 'expected the stale click\'s panel render to be suppressed, not appended');
  assert.equal(f.panelCalls[0].featureName, 'feature-b');
  assert.equal(f.showCalls.length, 1, 'expected the stale click\'s reveal to be suppressed, not appended');
  assert.equal(f.showCalls[0].documentPath, '/workspace/odd/tasks/feature-b.md');
});

test('the second click still wins even when its own fetch is the slower half of the pair', async () => {
  // Mirrors the case above but with the two async legs (open vs fetch)
  // interleaved in the opposite order, so the guard is proven regardless
  // of which of a click's two promises happens to settle last.
  const f = fakes();
  const openTask = createOpenTask(f.panel, f.fetchRevisions, f.openTextDocument, f.showTextDocument);
  const nodeA = taskNode('feature-a', '/workspace/odd/tasks/feature-a.md', 5);
  const nodeB = taskNode('feature-b', '/workspace/odd/tasks/feature-b.md', 5);

  const doneA = openTask(nodeA);
  const doneB = openTask(nodeB);

  f.fetchDeferred.get('/workspace/odd/tasks/feature-b.md')!.resolve();
  f.openDeferred.get('/workspace/odd/tasks/feature-b.md')!.resolve();
  await doneB;

  f.fetchDeferred.get('/workspace/odd/tasks/feature-a.md')!.resolve();
  f.openDeferred.get('/workspace/odd/tasks/feature-a.md')!.resolve();
  await doneA;

  assert.equal(f.panelCalls.length, 1);
  assert.equal(f.panelCalls[0].featureName, 'feature-b');
  assert.equal(f.showCalls.length, 1);
  assert.equal(f.showCalls[0].documentPath, '/workspace/odd/tasks/feature-b.md');
});

// --- independence: one half failing must not take down the other -----------

test('a failed document open still lets the panel render', async () => {
  const f = fakes();
  const failingOpen: OpenTextDocument = () => Promise.reject(new Error('cannot open'));
  const openTask = createOpenTask(f.panel, f.fetchRevisions, failingOpen, f.showTextDocument);
  const node = taskNode('sample', '/workspace/odd/tasks/sample.md', 1);

  const done = openTask(node);
  f.fetchDeferred.get('/workspace/odd/tasks/sample.md')!.resolve();
  await done;

  assert.equal(f.panelCalls.length, 1, 'expected the panel to still render despite the reveal failing');
  assert.equal(f.showCalls.length, 0);
});

test('a failed panel fetch still lets the document open', async () => {
  const f = fakes();
  const failingFetch = (): Promise<FetchedRevisions> => Promise.reject(new Error('git failed'));
  const openTask = createOpenTask(f.panel, failingFetch, f.openTextDocument, f.showTextDocument);
  const node = taskNode('sample', '/workspace/odd/tasks/sample.md', 1);

  const done = openTask(node);
  f.openDeferred.get('/workspace/odd/tasks/sample.md')!.resolve();
  await done;

  assert.equal(f.showCalls.length, 1, 'expected the document to still open despite the panel fetch failing');
  assert.equal(f.panelCalls.length, 0);
});
});
