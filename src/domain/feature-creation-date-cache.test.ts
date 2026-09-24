import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureCreationDateCache } from './feature-creation-date-cache';

/**
 * Tests the non-blocking caching/retry policy behind sort mode `created`
 * (feature-sort-modes) against a fake, controllable fetchCreationDate —
 * no real git process, no vscode. See that module's own doc comment for
 * the policy this exercises: get() is always synchronous, ensure() starts
 * at most one in-flight fetch per path, a resolved date is cached for
 * good, a null/rejected settle is remembered as "unresolved" (no refetch,
 * no onResolved) until invalidateUnresolved() clears it.
 */

/** Waits one macrotask turn — long enough for every microtask the cache's
 * internal fetch .then()/.catch() chain queues to have already run, so a
 * settle that deliberately does not call onResolved can still be awaited. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

test('a null result does not call onResolved, and is not cached as a date', async () => {
  let calls = 0;
  const cache = new FeatureCreationDateCache(async () => {
    calls += 1;
    return null;
  });

  cache.ensure('/repo', '/x/f.md', () => {
    throw new Error('onResolved must not fire for a null result');
  });
  await tick();

  assert.equal(calls, 1);
  assert.equal(cache.get('/x/f.md'), undefined);
});

test('after a null result, a second ensure() call for the same path does not fetch again', async () => {
  let calls = 0;
  const cache = new FeatureCreationDateCache(async () => {
    calls += 1;
    return null;
  });

  cache.ensure('/repo', '/x/f.md', () => {});
  await tick();
  assert.equal(calls, 1);

  cache.ensure('/repo', '/x/f.md', () => {});
  await tick();
  assert.equal(calls, 1);
});

test('invalidateUnresolved() lets a previously-null path fetch again on the next ensure() call', async () => {
  let calls = 0;
  const cache = new FeatureCreationDateCache(async () => {
    calls += 1;
    return null;
  });

  cache.ensure('/repo', '/x/f.md', () => {});
  await tick();
  assert.equal(calls, 1);

  cache.invalidateUnresolved();

  cache.ensure('/repo', '/x/f.md', () => {});
  await tick();
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

test('a rejected fetch does not call onResolved, and is not cached as a date', async () => {
  const cache = new FeatureCreationDateCache(async () => {
    throw new Error('boom');
  });

  cache.ensure('/repo', '/x/f.md', () => {
    throw new Error('onResolved must not fire for a rejected fetch');
  });
  await tick();

  assert.equal(cache.get('/x/f.md'), undefined);
});

test('ensure() never runs more than 4 fetches at once (git-spawn-hardening R4): the rest queue instead of spawning immediately', () => {
  const started: string[] = [];
  const cache = new FeatureCreationDateCache(async (_repoRoot: string, documentPath: string) => {
    started.push(documentPath);
    return new Promise<string | null>(() => {
      // Deliberately never settles: this test only checks how many fetches
      // are allowed to start, not what happens once one finishes.
    });
  });

  const paths = ['/x/a.md', '/x/b.md', '/x/c.md', '/x/d.md', '/x/e.md', '/x/f.md'];
  for (const path of paths) {
    cache.ensure('/repo', path, () => {});
  }

  assert.deepEqual(started, ['/x/a.md', '/x/b.md', '/x/c.md', '/x/d.md']);
});

test('a queued path eventually fetches once an in-flight slot frees up, and its onResolved still fires', async () => {
  const started: string[] = [];
  const gates = new Map<string, { resolve: (value: string | null) => void }>();
  const cache = new FeatureCreationDateCache(async (_repoRoot: string, documentPath: string) => {
    started.push(documentPath);
    return new Promise<string | null>((resolve) => {
      gates.set(documentPath, { resolve });
    });
  });

  const paths = ['/x/a.md', '/x/b.md', '/x/c.md', '/x/d.md', '/x/e.md'];
  const resolvedPaths: string[] = [];
  for (const path of paths) {
    cache.ensure('/repo', path, () => resolvedPaths.push(path));
  }

  assert.deepEqual(started, ['/x/a.md', '/x/b.md', '/x/c.md', '/x/d.md']);
  assert.equal(started.includes('/x/e.md'), false, '/x/e.md must stay queued while 4 fetches are already in flight');

  gates.get('/x/a.md')!.resolve('2026-09-10T10:00:00+00:00');
  await tick();

  assert.ok(started.includes('/x/e.md'), 'the queued path must start once a slot frees up');
  assert.equal(cache.get('/x/a.md'), '2026-09-10T10:00:00+00:00');
  assert.deepEqual(resolvedPaths, ['/x/a.md']);

  gates.get('/x/e.md')!.resolve('2026-09-12T10:00:00+00:00');
  await tick();

  assert.equal(cache.get('/x/e.md'), '2026-09-12T10:00:00+00:00');
  assert.deepEqual(resolvedPaths, ['/x/a.md', '/x/e.md']);
});

test('the concurrency cap is per cache instance, not global: ensure() still respects existing known/unresolved/in-flight rules once queued', async () => {
  let calls = 0;
  const gates: Array<{ resolve: (value: string | null) => void }> = [];
  const cache = new FeatureCreationDateCache(async () => {
    calls += 1;
    return new Promise<string | null>((resolve) => gates.push({ resolve }));
  });

  const paths = ['/x/a.md', '/x/b.md', '/x/c.md', '/x/d.md', '/x/e.md'];
  for (const path of paths) {
    cache.ensure('/repo', path, () => {});
  }
  // A second ensure() for the already-queued path must not double-queue it.
  cache.ensure('/repo', '/x/e.md', () => {
    throw new Error('onResolved must not fire twice for one still-unsettled fetch');
  });

  assert.equal(calls, 4);

  gates[0].resolve(null);
  await tick();

  assert.equal(calls, 5);
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
