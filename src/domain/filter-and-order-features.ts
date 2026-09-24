/**
 * Filtering and ordering decisions for the tree (T9): which items a filter
 * admits, whether a feature counts as closed, and the order features render
 * in. These are decisions, not rendering, so they live here and are
 * exercised with `node --test` rather than through an editor.
 *
 * Plain data transformation over the FeatureModel shape buildFeatureModel
 * (T8) already produces — no dependency on the editor API or the
 * filesystem, same boundary as the rest of src/domain/.
 */

import type { FeatureModel, ItemModel, SectionModel } from './build-feature-model';
import type { DerivedItemState } from './derive-checklist-state';

/** The three filters the PRD names for the tree's toolbar: `All`, `Open`
 * and `Unproven` (never `Current`/`Archive` — ODD has no archive). */
export type LedgerFilter = 'all' | 'open' | 'unproven';

/**
 * A feature is closed when it has at least one countable item and none of
 * them — across every rendered section, not only the ones that count
 * toward `progress` — is still open, declined, or unknown.
 *
 * `model.progress` was the original source for this decision, and it is
 * deliberately narrower: T5 chose to compute the progress ratio over only
 * the sections a document treats as its task list (`tasks`, or an
 * unrecognized heading), because folding every section into that ratio
 * made a document's own "Pending" section look complete while it still had
 * open work. That choice is about what percentage to report and is not
 * revisited here.
 *
 * Closedness answers a different question than the ratio does — "is there
 * anything left to do anywhere in this document" — and the `Open` filter
 * (see `admits` below) already answers exactly that question, per item,
 * over every section it renders. Reading only `model.progress` here made
 * the two disagree: a feature whose progress-bearing sections were all
 * done rendered muted and sorted last while `Open` still had an
 * acceptance-criteria item left to show, telling the user two different
 * things in the same tree. Reusing the `Open` filter's own admission rule
 * is what keeps them from drifting apart again — a feature the tree calls
 * finished is now exactly a feature `Open` has nothing left to show.
 */
/** The shared "closed" primitive isFeatureClosed and isSectionClosed both
 * delegate to, so there is exactly one definition of what "closed" means
 * — one item list read with the Open filter's own admission rule — rather
 * than a second one written per level. */
function isClosed(items: readonly ItemModel[]): boolean {
  let total = 0;
  for (const item of items) {
    total += 1;
    if (admits('open', item.derivedState)) {
      return false;
    }
  }
  return total > 0;
}

export function isFeatureClosed(model: FeatureModel): boolean {
  return isClosed(model.sections.flatMap((section) => section.items));
}

/** The section-level sibling of isFeatureClosed: true when every item in
 * `section` is closed (done, including done-unproven) by the same
 * admission rule, false for a section with zero items — there is no
 * measured progress to close, same as isFeatureClosed's own zero-item
 * case. */
export function isSectionClosed(section: SectionModel): boolean {
  return isClosed(section.items);
}

/**
 * The three-way summary a group of items rolls up to, for the tree's and
 * detail panel's icon colouring (see src/domain/state-colors.ts):
 *
 *  - `'proven'`   every item is closed and none of them is done-unproven —
 *                 the group is genuinely finished.
 *  - `'unproven'` every item is closed, but at least one is done-unproven.
 *                 A checked box with no evidence and no commit is not
 *                 proof — that gap is the reason this product exists — so
 *                 a group that hides one behind an otherwise-green summary
 *                 would repeat exactly the lie the checkbox itself tells.
 *                 This must never resolve to `'proven'`.
 *  - `'open'`     at least one item is still open, declined, or unknown
 *                 (the same admission rule isFeatureClosed and the Open
 *                 filter already use), so there is still work left and the
 *                 group stays neutral.
 */
export type RollupState = 'proven' | 'unproven' | 'open';

function rollupState(items: readonly ItemModel[], closed: boolean): RollupState {
  if (!closed) {
    return 'open';
  }
  return items.some((item) => item.derivedState === 'done-unproven') ? 'unproven' : 'proven';
}

/** Rolls up one section's items into the three-way summary state. */
export function deriveSectionRollupState(section: SectionModel): RollupState {
  return rollupState(section.items, isSectionClosed(section));
}

/** Rolls up an entire feature's items into the same three-way summary,
 * reusing isFeatureClosed rather than re-deriving what "closed" means at
 * this level. */
export function deriveFeatureRollupState(model: FeatureModel): RollupState {
  return rollupState(model.sections.flatMap((section) => section.items), isFeatureClosed(model));
}

/**
 * Orders two features purely by name, with the pinned collation every
 * other comparator here falls back to.
 *
 * `String.prototype.localeCompare` called with no locale or options
 * resolves its collation from the host process's ICU build and its
 * environment locale (`LANG`/`LC_ALL`), so the very same two feature names
 * can sort in a different order on two machines, or even on the same
 * machine across two CI runners with different locale environments. Here
 * the locale (`'en'`) and the options (`sensitivity: 'base'` — case- and
 * accent-insensitive; `numeric: true` — "feature-2" before "feature-10")
 * are passed explicitly, so the collation itself is pinned and the
 * rendered order is the same everywhere this extension runs, independent
 * of the host's configured locale.
 */
export function compareFeaturesByName(a: FeatureModel, b: FeatureModel): number {
  return a.featureName.localeCompare(b.featureName, 'en', { sensitivity: 'base', numeric: true });
}

/**
 * Orders features for sort mode `status` (feature-sort-modes): every open
 * feature first, every closed feature last, then compareFeaturesByName
 * within each group. This is the tree's original, and until
 * feature-sort-modes its only, ordering.
 */
export function compareFeaturesByStatus(a: FeatureModel, b: FeatureModel): number {
  const aClosed = isFeatureClosed(a);
  const bClosed = isFeatureClosed(b);
  if (aClosed !== bClosed) {
    return aClosed ? 1 : -1;
  }
  return compareFeaturesByName(a, b);
}

/**
 * Retained under its original name as an exact alias of
 * compareFeaturesByStatus: every existing call site and test that imports
 * `compareFeatures` keeps working unchanged, and there is exactly one
 * definition of "status" ordering, not two that could drift apart.
 */
export const compareFeatures = compareFeaturesByStatus;

/**
 * Looks up a document's known creation date for sort mode `created`
 * (feature-sort-modes); `undefined` means "not known (yet)" — see
 * FeatureCreationDateCache, whose own `.get` is the caller most callers
 * pass here. Kept as an injected function rather than a Map so a caller
 * can hand over a live cache without copying it on every sort.
 */
export type CreatedDateLookup = (documentPath: string) => string | undefined;

/**
 * Orders features for sort mode `created` (feature-sort-modes): the
 * earlier of the two documents' creation dates (as `createdDateFor`
 * reports them) sorts first. A document `createdDateFor` has no answer
 * for yet (untracked, not yet committed, or simply not fetched at the
 * time this comparator ran) sorts after every document with a known date,
 * which is what makes an unresolved git lookup degrade to "goes last"
 * rather than blocking or throwing. Two equal or two unknown dates fall
 * back to compareFeaturesByName, same as every other mode here.
 */
export function compareFeaturesByCreatedDate(a: FeatureModel, b: FeatureModel, createdDateFor: CreatedDateLookup): number {
  const aDate = createdDateFor(a.documentPath);
  const bDate = createdDateFor(b.documentPath);
  if (aDate === undefined && bDate === undefined) {
    return compareFeaturesByName(a, b);
  }
  if (aDate === undefined) {
    return 1;
  }
  if (bDate === undefined) {
    return -1;
  }
  const aTime = Date.parse(aDate);
  const bTime = Date.parse(bDate);
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return compareFeaturesByName(a, b);
}

/** The three sort modes the tree's toolbar offers (feature-sort-modes):
 * `created` (oldest feature first, the default), `status` (today's
 * original open-first-then-closed order), and `name` (pure alphabetical). */
export type LedgerSortMode = 'created' | 'status' | 'name';

/** Narrows an unknown value (e.g. a persisted globalState read) to
 * LedgerSortMode, so a corrupted or stale stored value never reaches
 * orderFeatures as if it were one of the three known modes. */
export function isLedgerSortMode(value: unknown): value is LedgerSortMode {
  return value === 'created' || value === 'status' || value === 'name';
}

/**
 * Orders `models` per `mode`, returning a new array — the input is never
 * mutated, so a caller holding onto the original list (or passing the
 * same array to more than one caller) is never surprised by an in-place
 * sort. `createdDateFor` is only consulted for `created`; every other
 * mode ignores it, so callers that never render `created` need not
 * provide one — it defaults to "nothing known", which alone degrades
 * `created` to alphabetical (see compareFeaturesByCreatedDate).
 */
export function orderFeatures(models: readonly FeatureModel[], mode: LedgerSortMode, createdDateFor: CreatedDateLookup = () => undefined): FeatureModel[] {
  const ordered = [...models];
  switch (mode) {
    case 'name':
      ordered.sort(compareFeaturesByName);
      break;
    case 'status':
      ordered.sort(compareFeaturesByStatus);
      break;
    case 'created':
      ordered.sort((a, b) => compareFeaturesByCreatedDate(a, b, createdDateFor));
      break;
  }
  return ordered;
}

/** Whether `state` counts as "not claiming completion" for the `open`
 * filter, or is the one state the `unproven` filter admits. */
function admits(filter: LedgerFilter, state: DerivedItemState): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return state === 'open' || state === 'declined' || state === 'unknown';
    case 'unproven':
      return state === 'done-unproven';
  }
}

/** Narrows one section's items to what `filter` admits, or `null` when
 * nothing in it survives — a section that renders no items is not a
 * section the tree has anything to show. */
function filterSection(section: SectionModel, filter: LedgerFilter): SectionModel | null {
  const items: ItemModel[] = section.items.filter((item) => admits(filter, item.derivedState));
  if (items.length === 0) {
    return null;
  }
  return { ...section, items };
}

/**
 * Narrows a feature's sections and items to what `filter` admits, or
 * returns `null` when nothing in it survives the filter at all. `all`
 * keeps the feature exactly as it was: the identity check callers can rely
 * on is that filtering with `all` is a no-op, not a reconstruction of an
 * equal-looking model.
 *
 * `progress` is deliberately never rewritten here: it keeps reporting the
 * document's real done/total ratio regardless of `filter`, because the
 * tree must not invent progress the document does not record just because
 * a filter is hiding some of the items that make it up. A feature's header
 * counts stay the whole truth even while `Open` or `Unproven` narrows what
 * is visible underneath it.
 */
export function filterFeature(model: FeatureModel, filter: LedgerFilter): FeatureModel | null {
  if (filter === 'all') {
    return model;
  }

  const sections: SectionModel[] = [];
  for (const section of model.sections) {
    const filtered = filterSection(section, filter);
    if (filtered) {
      sections.push(filtered);
    }
  }

  if (sections.length === 0) {
    return null;
  }

  return { ...model, sections };
}
