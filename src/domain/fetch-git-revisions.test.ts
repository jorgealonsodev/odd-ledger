import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchDocumentRevisions } from './fetch-git-revisions';

/**
 * Tests the impure half of T13's history pipeline against real, invented
 * temporary git repositories — never against this repository's own
 * history, and never against any real project's `odd/` folder — exactly
 * as discover-feature-documents.test.ts already does for the filesystem.
 */

function isGitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const GIT_AVAILABLE = isGitAvailable();

/** Pins the settings these tests depend on rather than the machine's global
 * config: an explicit initial branch, signing off, and an unset hooks path
 * (nonexistent, so nothing globally configured ever runs). */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'odd-ledger-git-history-'));
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.invalid']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false']);
  execFileSync('git', ['-C', root, 'config', 'core.hooksPath', join(root, '.empty-hooks')]);
  return root;
}

function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

function commit(repoRoot: string, message: string, isoDate: string, ...relativePaths: string[]): void {
  execFileSync('git', ['-C', repoRoot, 'add', ...relativePaths]);
  execFileSync('git', ['-C', repoRoot, 'commit', '-q', '-m', message], {
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
    },
  });
}

test('a document with several commits: one revision per commit, newest first, each with its own text and date', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'sample-feature.md');

    writeFileSync(docPath, '# sample-feature\n\n## Tasks\n\n- [ ] T1 first\n');
    commit(root, 'first', '2026-09-10T10:00:00+00:00', 'odd/tasks/sample-feature.md');

    writeFileSync(docPath, '# sample-feature\n\n## Tasks\n\n- [x] T1 first\n');
    commit(root, 'second', '2026-09-11T10:00:00+00:00', 'odd/tasks/sample-feature.md');

    writeFileSync(docPath, '# sample-feature\n\n## Tasks\n\n- [x] T1 first\n- [ ] T2 second\n');
    commit(root, 'third', '2026-09-12T10:00:00+00:00', 'odd/tasks/sample-feature.md');

    const { revisions } = await fetchDocumentRevisions(root, docPath);

    assert.equal(revisions.length, 3);
    // Newest first, the same order git log itself returns.
    assert.equal(revisions[0].date.slice(0, 10), '2026-09-12');
    assert.equal(revisions[1].date.slice(0, 10), '2026-09-11');
    assert.equal(revisions[2].date.slice(0, 10), '2026-09-10');
    assert.match(revisions[0].text, /T2 second/);
    assert.doesNotMatch(revisions[2].text, /T2 second/);
    assert.match(revisions[2].text, /\[ \] T1 first/);
    assert.match(revisions[1].text, /\[x\] T1 first/);
    assert.notEqual(revisions[0].hash, revisions[1].hash);
    assert.notEqual(revisions[1].hash, revisions[2].hash);
  } finally {
    cleanup(root);
  }
});

test('a document that follows a rename: the revision before the rename reads back under its old name', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const oldPath = join(root, 'odd', 'tasks', 'old-name.md');
    const newPath = join(root, 'odd', 'tasks', 'new-name.md');

    writeFileSync(oldPath, '# old-name\n\n## Tasks\n\n- [ ] T1 before the rename\n');
    commit(root, 'first', '2026-09-10T10:00:00+00:00', 'odd/tasks/old-name.md');

    execFileSync('git', ['-C', root, 'mv', 'odd/tasks/old-name.md', 'odd/tasks/new-name.md']);
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'rename'], {
      env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-11T10:00:00+00:00', GIT_COMMITTER_DATE: '2026-09-11T10:00:00+00:00' },
    });

    writeFileSync(newPath, '# new-name\n\n## Tasks\n\n- [x] T1 before the rename\n');
    commit(root, 'after the rename', '2026-09-12T10:00:00+00:00', 'odd/tasks/new-name.md');

    // Queried under its current (post-rename) path, --follow reaches back
    // to the commit recorded under the old name.
    const { revisions } = await fetchDocumentRevisions(root, newPath);

    assert.equal(revisions.length, 3);
    const oldestText = revisions[revisions.length - 1].text;
    assert.match(oldestText, /before the rename/);
    assert.match(oldestText, /old-name/);
  } finally {
    cleanup(root);
  }
});

test('a document with a non-ASCII filename: history is still found although core.quotePath would otherwise C-quote the path', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'café-feature.md');

    writeFileSync(docPath, '# café-feature\n\n## Tasks\n\n- [ ] T1 first\n');
    commit(root, 'first', '2026-09-10T10:00:00+00:00', 'odd/tasks/café-feature.md');

    const { revisions } = await fetchDocumentRevisions(root, docPath);

    assert.equal(revisions.length, 1);
    assert.match(revisions[0].text, /café-feature/);
  } finally {
    cleanup(root);
  }
});

test('a file not yet committed: no revisions, not an error', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    // At least one unrelated commit so the repository has a HEAD; log on
    // an untracked path must still come back empty rather than failing
    // for the unrelated reason of "no commits yet" (covered separately
    // below).
    writeFileSync(join(root, 'README.md'), 'placeholder\n');
    commit(root, 'unrelated', '2026-09-09T10:00:00+00:00', 'README.md');

    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'untracked-feature.md');
    writeFileSync(docPath, '# untracked-feature\n');

    const { revisions } = await fetchDocumentRevisions(root, docPath);

    assert.deepEqual(revisions, []);
  } finally {
    cleanup(root);
  }
});

test('a repository with no commits at all: no revisions, not an error', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'sample-feature.md');
    writeFileSync(docPath, '# sample-feature\n');

    const { revisions } = await fetchDocumentRevisions(root, docPath);

    assert.deepEqual(revisions, []);
  } finally {
    cleanup(root);
  }
});

test('a directory that is not a git repository: no revisions, not an error', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'odd-ledger-git-history-notrepo-'));
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'sample-feature.md');
    writeFileSync(docPath, '# sample-feature\n');

    const { revisions } = await fetchDocumentRevisions(root, docPath);

    assert.deepEqual(revisions, []);
  } finally {
    cleanup(root);
  }
});
