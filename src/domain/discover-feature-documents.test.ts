import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverFeatureDocuments } from './discover-feature-documents';

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'odd-ledger-discover-'));
}

function cleanup(root: string): void {
  // Restore permissions before removal in case a test locked a directory down.
  try {
    chmodSync(root, 0o700);
  } catch {
    // Best effort; rmSync below still reports any real failure.
  }
  rmSync(root, { recursive: true, force: true });
}

test('returns one document for a root with a single feature document', () => {
  const root = makeWorkspace();
  try {
    const tasksDir = join(root, 'odd', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    const filePath = join(tasksDir, 'ledger-view-v1.md');
    writeFileSync(filePath, '# ledger-view-v1\n');

    const result = discoverFeatureDocuments(root);

    assert.equal(result.length, 1);
    assert.equal(result[0].path, filePath);
    assert.equal(result[0].featureName, 'ledger-view-v1');
  } finally {
    cleanup(root);
  }
});

test('returns both documents for a root with two feature documents', () => {
  const root = makeWorkspace();
  try {
    const tasksDir = join(root, 'odd', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'zeta-feature.md'), '# zeta-feature\n');
    writeFileSync(join(tasksDir, 'alpha-feature.md'), '# alpha-feature\n');

    const result = discoverFeatureDocuments(root);

    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((doc) => doc.featureName),
      ['alpha-feature', 'zeta-feature'],
    );
  } finally {
    cleanup(root);
  }
});

test('returns an empty array when the root has no odd/ directory at all', () => {
  const root = makeWorkspace();
  try {
    const result = discoverFeatureDocuments(root);
    assert.deepEqual(result, []);
  } finally {
    cleanup(root);
  }
});

test('returns an empty array when odd/ exists but tasks/ does not', () => {
  const root = makeWorkspace();
  try {
    mkdirSync(join(root, 'odd'), { recursive: true });

    const result = discoverFeatureDocuments(root);

    assert.deepEqual(result, []);
  } finally {
    cleanup(root);
  }
});

test('returns an empty array when odd/tasks/ is empty', () => {
  const root = makeWorkspace();
  try {
    mkdirSync(join(root, 'odd', 'tasks'), { recursive: true });

    const result = discoverFeatureDocuments(root);

    assert.deepEqual(result, []);
  } finally {
    cleanup(root);
  }
});

test('ignores non-.md files inside odd/tasks/', () => {
  const root = makeWorkspace();
  try {
    const tasksDir = join(root, 'odd', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'notes.txt'), 'not a feature document\n');
    writeFileSync(join(tasksDir, 'real-feature.md'), '# real-feature\n');

    const result = discoverFeatureDocuments(root);

    assert.equal(result.length, 1);
    assert.equal(result[0].featureName, 'real-feature');
  } finally {
    cleanup(root);
  }
});

test('ignores a file nested in a subdirectory of odd/tasks/', () => {
  const root = makeWorkspace();
  try {
    const tasksDir = join(root, 'odd', 'tasks');
    mkdirSync(join(tasksDir, 'archive'), { recursive: true });
    writeFileSync(join(tasksDir, 'archive', 'nested-feature.md'), '# nested-feature\n');
    writeFileSync(join(tasksDir, 'flat-feature.md'), '# flat-feature\n');

    const result = discoverFeatureDocuments(root);

    assert.equal(result.length, 1);
    assert.equal(result[0].featureName, 'flat-feature');
  } finally {
    cleanup(root);
  }
});

test('returns an empty array for a root that does not exist', () => {
  const root = join(tmpdir(), 'odd-ledger-discover-does-not-exist-xyz');
  const result = discoverFeatureDocuments(root);
  assert.deepEqual(result, []);
});

test('returns an empty array for a tasks directory that is not readable', () => {
  const root = makeWorkspace();
  try {
    const tasksDir = join(root, 'odd', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'unreachable.md'), '# unreachable\n');
    chmodSync(tasksDir, 0o000);

    const result = discoverFeatureDocuments(root);

    // Restore permissions before cleanup can recurse into this directory.
    chmodSync(tasksDir, 0o700);

    assert.deepEqual(result, []);
  } finally {
    cleanup(root);
  }
});

test('orders results deterministically by feature name regardless of creation order', () => {
  const root = makeWorkspace();
  try {
    const tasksDir = join(root, 'odd', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'mango.md'), '# mango\n');
    writeFileSync(join(tasksDir, 'apple.md'), '# apple\n');
    writeFileSync(join(tasksDir, 'banana.md'), '# banana\n');

    const result = discoverFeatureDocuments(root);

    assert.deepEqual(
      result.map((doc) => doc.featureName),
      ['apple', 'banana', 'mango'],
    );
  } finally {
    cleanup(root);
  }
});

test('orders results the same way whatever locale the host process is configured for', () => {
  const root = makeWorkspace();
  try {
    const tasksDir = join(root, 'odd', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    // 'a' before 'z' before 'ä' is Swedish collation; 'a' before 'ä' before
    // 'z' is English. A host-resolved comparison returns whichever of the
    // two the process happens to be configured for, so asserting the
    // English order here fails on a Swedish host unless the locale is
    // pinned in the implementation.
    //
    // The 'ä' below is written in its NFD (decomposed) form — 'a' plus a
    // combining diaeresis — rather than the single precomposed character a
    // text editor normally produces. That is exactly the byte sequence a
    // filesystem that normalizes filenames to their decomposed form (APFS,
    // HFS+) hands back from a directory read even when the caller wrote the
    // precomposed form, so pinning it here reproduces that class of
    // filesystem deterministically instead of only on a machine that
    // happens to have one. A comparison against the precomposed literal
    // would then fail for a byte-representation reason that has nothing to
    // do with collation, which is what this test exists to check — both
    // sides are normalized before comparing so it keeps testing collation.
    const decomposedArende = `${'ärende-queue'.normalize('NFD')}.md`;
    writeFileSync(join(tasksDir, 'zebra-cache.md'), '# zebra-cache\n');
    writeFileSync(join(tasksDir, 'anchor-store.md'), '# anchor-store\n');
    writeFileSync(join(tasksDir, decomposedArende), '# arende-queue\n');

    const result = discoverFeatureDocuments(root);

    assert.deepEqual(
      result.map((doc) => doc.featureName.normalize('NFC')),
      ['anchor-store', 'ärende-queue', 'zebra-cache'].map((name) => name.normalize('NFC')),
    );
  } finally {
    cleanup(root);
  }
});
