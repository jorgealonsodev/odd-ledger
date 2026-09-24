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
 * document, a missing repository, or a failed/rejected fetch) is
 * remembered as "unresolved" so it is *not* refetched on the very next
 * `getChildren` pass — without this, a document that can never be dated
 * (no repo, git missing, a timeout) would spawn a fresh git process on
 * every tree redraw, and each settle would re-fire the change event that
 * triggered that redraw, spinning forever. `onResolved` is only called
 * when a fetch actually finds a date, for the same reason: firing it for
 * a null/rejected settle is exactly the redraw-refetch-redraw loop this
 * cache exists to prevent. The one thing that turns a "no creation date"
 * answer into a real one is the document eventually being committed, so
 * `invalidateUnresolved` clears every remembered "unresolved" path — the
 * caller (FeatureTreeDataProvider) calls it on an explicit refresh or a
 * watched document change, the two moments a newly committed document
 * could plausibly have a date now. A resolved date, once known, never
 * changes (a document's first commit does not move), so it is cached for
 * good and untouched by `invalidateUnresolved`.
 *
 * `fetchCreationDate` is injected (the same seam run-open-feature-fetch.ts
 * uses for fetchRevisions), so this class is testable with node --test and
 * a fake async function — no real git process, no vscode.
 */

export type FetchCreationDate = (repoRoot: string, documentPath: string) => Promise<string | null>;

export class FeatureCreationDateCache {
  private readonly known = new Map<string, string>();
  private readonly unresolved = new Set<string>();
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
   * already known, the path already settled "unresolved", or a fetch for
   * it is already running (never more than one outstanding request per
   * path). Calls `onResolved` only when the fetch actually finds a date —
   * see the class doc for why a null/rejected settle must stay silent.
   */
  ensure(repoRoot: string, documentPath: string, onResolved: () => void): void {
    if (this.known.has(documentPath) || this.unresolved.has(documentPath) || this.inFlight.has(documentPath)) {
      return;
    }
    this.inFlight.add(documentPath);
    void this.fetchCreationDate(repoRoot, documentPath)
      .then((date) => {
        this.inFlight.delete(documentPath);
        if (date !== null) {
          this.known.set(documentPath, date);
          onResolved();
        } else {
          this.unresolved.add(documentPath);
        }
      })
      .catch(() => {
        // Treated the same as "no commit found yet" — see the class doc.
        this.inFlight.delete(documentPath);
        this.unresolved.add(documentPath);
      });
  }

  /** Clears every remembered "unresolved" path so the next `ensure` call
   * for it fetches again. Called by FeatureTreeDataProvider on an
   * explicit refresh and on a watched document change — see the class
   * doc for why those are the moments a date could newly exist. Known
   * (resolved) dates are untouched: they never need re-fetching. */
  invalidateUnresolved(): void {
    this.unresolved.clear();
  }
}
