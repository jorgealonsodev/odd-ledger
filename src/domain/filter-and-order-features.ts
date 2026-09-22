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
 * A feature is closed when every countable item across its sections is
 * done, and it has at least one countable item. A feature with zero items
 * is not closed: `deriveChecklistState` already refuses to call zero items
 * 100% (it reports 0%, not NaN and not 100%), and this function keeps that
 * same honesty — there is no measured progress to have finished.
 */
export function isFeatureClosed(model: FeatureModel): boolean {
  const { done, total } = model.progress;
  return total > 0 && done === total;
}

/**
 * Orders features for the tree: every open feature first, every closed
 * feature last, and within each group by feature name.
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
export function compareFeatures(a: FeatureModel, b: FeatureModel): number {
  const aClosed = isFeatureClosed(a);
  const bClosed = isFeatureClosed(b);
  if (aClosed !== bClosed) {
    return aClosed ? 1 : -1;
  }
  return a.featureName.localeCompare(b.featureName, 'en', { sensitivity: 'base', numeric: true });
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
