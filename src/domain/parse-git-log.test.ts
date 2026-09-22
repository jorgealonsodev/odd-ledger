import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLogOutput } from './parse-git-log';

const HASH_A = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
const HASH_B = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';
const HASH_C = 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3';

test('returns an empty array for an empty result', () => {
  assert.deepEqual(parseGitLogOutput(''), []);
});

test('returns an empty array for whitespace-only output', () => {
  assert.deepEqual(parseGitLogOutput('\n\n  \n'), []);
});

test('parses a single record: hash, date and path', () => {
  const stdout = `${HASH_A}\t2026-09-13T10:00:00+00:00\nodd/tasks/sample.md\n`;
  assert.deepEqual(parseGitLogOutput(stdout), [
    { hash: HASH_A, date: '2026-09-13T10:00:00+00:00', path: 'odd/tasks/sample.md' },
  ]);
});

test('parses several records, newest first, in the order git log itself returns them', () => {
  const stdout = [
    `${HASH_C}\t2026-09-13T10:00:00+00:00`,
    'odd/tasks/sample.md',
    '',
    `${HASH_B}\t2026-09-12T10:00:00+00:00`,
    'odd/tasks/sample.md',
    '',
    `${HASH_A}\t2026-09-10T10:00:00+00:00`,
    'odd/tasks/sample.md',
    '',
  ].join('\n');

  assert.deepEqual(parseGitLogOutput(stdout), [
    { hash: HASH_C, date: '2026-09-13T10:00:00+00:00', path: 'odd/tasks/sample.md' },
    { hash: HASH_B, date: '2026-09-12T10:00:00+00:00', path: 'odd/tasks/sample.md' },
    { hash: HASH_A, date: '2026-09-10T10:00:00+00:00', path: 'odd/tasks/sample.md' },
  ]);
});

test('carries a different path per record across a rename, exactly as --follow reports it', () => {
  const stdout = [
    `${HASH_B}\t2026-09-12T10:00:00+00:00`,
    'odd/tasks/new-name.md',
    '',
    `${HASH_A}\t2026-09-10T10:00:00+00:00`,
    'odd/tasks/old-name.md',
    '',
  ].join('\n');

  const records = parseGitLogOutput(stdout);
  assert.equal(records[0].path, 'odd/tasks/new-name.md');
  assert.equal(records[1].path, 'odd/tasks/old-name.md');
});

test('a header with no following filename line produces no record for that commit', () => {
  const stdout = [
    `${HASH_B}\t2026-09-12T10:00:00+00:00`,
    '',
    `${HASH_A}\t2026-09-10T10:00:00+00:00`,
    'odd/tasks/sample.md',
    '',
  ].join('\n');

  assert.deepEqual(parseGitLogOutput(stdout), [
    { hash: HASH_A, date: '2026-09-10T10:00:00+00:00', path: 'odd/tasks/sample.md' },
  ]);
});

test('ignores a second filename line beyond the first for one record', () => {
  const stdout = [`${HASH_A}\t2026-09-10T10:00:00+00:00`, 'odd/tasks/sample.md', 'odd/tasks/unexpected-extra.md', ''].join(
    '\n',
  );

  const records = parseGitLogOutput(stdout);
  assert.equal(records.length, 1);
  assert.equal(records[0].path, 'odd/tasks/sample.md');
});
