import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchFeatureCreationDate } from './fetch-feature-creation-date';

/**
 * Tests the impure git read behind sort mode `created` (feature-sort-modes)
 * against real, invented temporary git repositories — never against this
 * repository's own history, and never against any real project's `odd/`
 * folder, the same discipline fetch-git-revisions.test.ts already follows.
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

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'odd-ledger-creation-date-'));
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

test('a document committed once: its creation date is that commit\'s author date', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'sample-feature.md');
    writeFileSync(docPath, '# sample-feature\n');
    commit(root, 'add feature', '2026-09-10T10:00:00+00:00', 'odd/tasks/sample-feature.md');

    const date = await fetchFeatureCreationDate(root, docPath);

    assert.ok(date);
    assert.equal(date!.slice(0, 10), '2026-09-10');
  } finally {
    cleanup(root);
  }
});

test('a document committed, then edited again: creation date stays the first (add) commit\'s date, not the latest edit', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'sample-feature.md');

    writeFileSync(docPath, '# sample-feature\n\n- [ ] T1\n');
    commit(root, 'add feature', '2026-09-10T10:00:00+00:00', 'odd/tasks/sample-feature.md');

    writeFileSync(docPath, '# sample-feature\n\n- [x] T1\n');
    commit(root, 'close T1', '2026-09-15T10:00:00+00:00', 'odd/tasks/sample-feature.md');

    const date = await fetchFeatureCreationDate(root, docPath);

    assert.ok(date);
    assert.equal(date!.slice(0, 10), '2026-09-10');
  } finally {
    cleanup(root);
  }
});

test('a document renamed after its first commit: creation date still reaches back through the rename (--follow)', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const oldPath = join(root, 'odd', 'tasks', 'old-name.md');
    const newPath = join(root, 'odd', 'tasks', 'new-name.md');

    writeFileSync(oldPath, '# old-name\n');
    commit(root, 'add feature', '2026-09-10T10:00:00+00:00', 'odd/tasks/old-name.md');

    execFileSync('git', ['-C', root, 'mv', 'odd/tasks/old-name.md', 'odd/tasks/new-name.md']);
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'rename'], {
      env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-12T10:00:00+00:00', GIT_COMMITTER_DATE: '2026-09-12T10:00:00+00:00' },
    });

    const date = await fetchFeatureCreationDate(root, newPath);

    assert.ok(date);
    assert.equal(date!.slice(0, 10), '2026-09-10');
  } finally {
    cleanup(root);
  }
});

test('a file not yet committed: null, not an error', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, 'README.md'), 'placeholder\n');
    commit(root, 'unrelated', '2026-09-09T10:00:00+00:00', 'README.md');

    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'untracked-feature.md');
    writeFileSync(docPath, '# untracked-feature\n');

    const date = await fetchFeatureCreationDate(root, docPath);

    assert.equal(date, null);
  } finally {
    cleanup(root);
  }
});

test('a repository with no commits at all: null, not an error', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'sample-feature.md');
    writeFileSync(docPath, '# sample-feature\n');

    const date = await fetchFeatureCreationDate(root, docPath);

    assert.equal(date, null);
  } finally {
    cleanup(root);
  }
});

test('a directory that is not a git repository: null, not an error', { skip: !GIT_AVAILABLE && 'git is not installed on this machine' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'odd-ledger-creation-date-notrepo-'));
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });
    const docPath = join(root, 'odd', 'tasks', 'sample-feature.md');
    writeFileSync(docPath, '# sample-feature\n');

    const date = await fetchFeatureCreationDate(root, docPath);

    assert.equal(date, null);
  } finally {
    cleanup(root);
  }
});
