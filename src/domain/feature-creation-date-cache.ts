/**
 * Caches feature-document creation dates for sort mode `created`
 * (feature-sort-modes) so the tree never blocks a render on a git spawn.
 *
 * `get` is a synchronous read of whatever is already known — always safe
 * to call from FeatureTreeDataProvider.getChildren, which must stay
 * synchronous. `ensure` starts (at most one in-flight) fetch per path when
 * nothing usable is cached yet, and reports back through `onResolved` once
 * that fetch settles, so the caller can trigger a re-render with the
 * now-known date.
 *
 * A `null` result (no commit found — an untracked or not-yet-committed
 * document) is deliberately never cached as final: it is refetched on the
 * next `ensure` call for that path, because the one thing that turns a "no
 * creation date" answer into a real one is the document eventually being
 * committed, and there is no filesystem or git event this cache otherwise
 * listens for. A resolved date, once known, never changes (a document's
 * first commit does not move), so it is cached for good — this is what
 * keeps a project with many already-committed features from re-spawning
 * git on every tree refresh.
 *
 * `fetchCreationDate` is injected (the same seam run-open-feature-fetch.ts
 * uses for fetchRevisions), so this class is testable with node --test and
 * a fake async function — no real git process, no vscode.
 */

export type FetchCreationDate = (repoRoot: string, documentPath: string) => Promise<string | null>;

export class FeatureCreationDateCache {
  private readonly known = new Map<string, string>();
  private readonly inFlight = new Set<string>();

  constructor(private readonly fetchCreationDate: FetchCreationDate) {}

  /** Whatever is already cached for `documentPath`: an ISO date once
   * known, or `undefined` when nothing usable has resolved yet — never
   * fetched, still in flight, or the last attempt found no commit. */
  get(documentPath: string): string | undefined {
    return this.known.get(documentPath);
  }

  /**
   * Starts a fetch for `documentPath` under `repoRoot` unless a date is
   * already known or a fetch for it is already running (never more than
   * one outstanding request per path); calls `onResolved` once that fetch
   * settles, whether or not it found a date, so the caller can trigger a
   * re-render. A no-op — `onResolved` is not called — when a date is
   * already cached.
   */
  ensure(repoRoot: string, documentPath: string, onResolved: () => void): void {
    if (this.known.has(documentPath) || this.inFlight.has(documentPath)) {
      return;
    }
    this.inFlight.add(documentPath);
    void this.fetchCreationDate(repoRoot, documentPath)
      .then((date) => {
        if (date !== null) {
          this.known.set(documentPath, date);
        }
      })
      .catch(() => {
        // Treated the same as "no commit found yet" — see the class doc.
      })
      .finally(() => {
        this.inFlight.delete(documentPath);
        onResolved();
      });
  }
}
