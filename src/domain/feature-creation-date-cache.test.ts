import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureCreationDateCache } from './feature-creation-date-cache';

/**
 * Tests the non-blocking caching/retry policy behind sort mode `created`
 * (feature-sort-modes) against a fake, controllable fetchCreationDate —
 * no real git process, no vscode. See that module's own doc comment for
 * the policy this exercises: get() is always synchronous, ensure() starts
 * at most one in-flight fetch per path, a resolved date is cached for
 * good, and null is retried on the next call.
 */

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('get() returns undefined for a path nothing has been fetched for yet', () => {
  const cache = new FeatureCreationDateCache(async () => null);
  assert.equal(cache.get('/x/f.md'), undefined);
});

test('ensure() does not block: get() still returns undefined while the fetch is in flight', () => {
  const pending = deferred<string | null>();
  const cache = new FeatureCreationDateCache(async () => pending.promise);

  cache.ensure('/repo', '/x/f.md', () => {});

  assert.equal(cache.get('/x/f.md'), undefined);
});

test('once the fetch resolves with a date, get() returns it and onResolved fires', async () => {
  const cache = new FeatureCreationDateCache(async () => '2026-09-10T10:00:00+00:00');
  let resolved = false;

  await new Promise<void>((done) => {
    cache.ensure('/repo', '/x/f.md', () => {
      resolved = true;
      done();
    });
  });

  assert.equal(resolved, true);
  assert.equal(cache.get('/x/f.md'), '2026-09-10T10:00:00+00:00');
});

test('a resolved date is cached for good: a second ensure() call does not fetch again', async () => {
  let calls = 0;
  const cache = new FeatureCreationDateCache(async () => {
    calls += 1;
    return '2026-09-10T10:00:00+00:00';
  });

  await new Promise<void>((done) => cache.ensure('/repo', '/x/f.md', done));
  assert.equal(calls, 1);

  cache.ensure('/repo', '/x/f.md', () => {
    throw new Error('onResolved must not fire when nothing needed fetching again');
  });

  assert.equal(calls, 1);
  assert.equal(cache.get('/x/f.md'), '2026-09-10T10:00:00+00:00');
});

test('a null result (no commit found yet) is retried on the next ensure() call, not cached', async () => {
  let calls = 0;
  const cache = new FeatureCreationDateCache(async () => {
    calls += 1;
    return null;
  });

  await new Promise<void>((done) => cache.ensure('/repo', '/x/f.md', done));
  assert.equal(calls, 1);
  assert.equal(cache.get('/x/f.md'), undefined);

  await new Promise<void>((done) => cache.ensure('/repo', '/x/f.md', done));
  assert.equal(calls, 2);
});

test('two ensure() calls for the same path while one fetch is already in flight only fetch once', () => {
  let calls = 0;
  const pending = deferred<string | null>();
  const cache = new FeatureCreationDateCache(async () => {
    calls += 1;
    return pending.promise;
  });

  cache.ensure('/repo', '/x/f.md', () => {});
  cache.ensure('/repo', '/x/f.md', () => {});

  assert.equal(calls, 1);
});

test('a rejected fetch is treated the same as "no commit found yet": no throw, get() stays undefined, onResolved still fires', async () => {
  const cache = new FeatureCreationDateCache(async () => {
    throw new Error('boom');
  });
  let resolved = false;

  await new Promise<void>((done) => {
    cache.ensure('/repo', '/x/f.md', () => {
      resolved = true;
      done();
    });
  });

  assert.equal(resolved, true);
  assert.equal(cache.get('/x/f.md'), undefined);
});

test('different document paths are cached independently', async () => {
  const cache = new FeatureCreationDateCache(async (_repoRoot: string, documentPath: string) =>
    documentPath === '/x/a.md' ? '2026-09-10T10:00:00+00:00' : '2026-09-12T10:00:00+00:00',
  );

  await Promise.all([
    new Promise<void>((done) => cache.ensure('/repo', '/x/a.md', done)),
    new Promise<void>((done) => cache.ensure('/repo', '/x/b.md', done)),
  ]);

  assert.equal(cache.get('/x/a.md'), '2026-09-10T10:00:00+00:00');
  assert.equal(cache.get('/x/b.md'), '2026-09-12T10:00:00+00:00');
});
