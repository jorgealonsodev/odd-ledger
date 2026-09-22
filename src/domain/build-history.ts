/**
 * Builds the detail panel's History region (T13) from a feature document's
 * already-gathered git revisions: a sentence stating the revision count and
 * date range by default, and — only once there are enough revisions to plot
 * meaningfully — a chart of the completion ratio recomputed at each one.
 *
 * "This is the only history that exists" (docs/PRD.md): no document records
 * its own progress, and nothing outside `odd/` is consulted, so every point
 * here comes from parsing a past revision's text with the same three
 * parsers the rest of this extension already uses, never from a second,
 * bespoke reading of what "progress" meant at that commit.
 *
 * Pure data transformation over already-read revision text: no process, no
 * filesystem. fetch-git-revisions.ts is the separate, impure module that
 * runs git and turns its output into the HistoryRevisionInput[] this
 * function consumes — the injectable seam the brief asked for, so this
 * recomputation and formatting logic is unit-testable with hand-made
 * revisions and no repository at all.
 */

import { parseDocumentStructure } from './parse-document-structure';
import { parseChecklist } from './parse-checklist';
import { deriveChecklistState } from './derive-checklist-state';

/**
 * One already-fetched git revision of a feature document: enough to
 * recompute its completion ratio without re-reading anything from disk or
 * running git again. `date` is the committer date exactly as `git log`'s
 * `%cI` rendered it (ISO 8601 with an offset, e.g.
 * "2026-09-21T10:00:00+00:00"); only its date portion is displayed (see
 * dateOnly below), but the full instant is kept on the input type so a
 * future caller that needs precision is not the one throwing it away.
 */
export interface HistoryRevisionInput {
  readonly hash: string;
  readonly date: string;
  readonly text: string;
}

/** One point on the History chart: a revision's date (`YYYY-MM-DD`) and the
 * completion percentage its document text recomputes to. */
export interface HistoryPoint {
  readonly hash: string;
  readonly date: string;
  readonly percentage: number;
}

/** The detail panel's History region: always a summary sentence, and a
 * chart only once there are enough revisions to plot meaningfully. */
export interface FeatureHistory {
  readonly available: boolean;
  readonly summary: string;
  /** Chronological order, oldest first, regardless of the order `revisions`
   * arrived in — see buildHistory. Empty when history is unavailable. */
  readonly points: readonly HistoryPoint[];
  readonly showChart: boolean;
}

/**
 * The revision count a chart needs before it draws one, rather than the
 * plain sentence. Measured on the real five-document corpus (docs/PRD.md,
 * "History — what git can honestly show"): one document has 10 revisions,
 * one has 2, and three have 1. The PRD's own wireframe renders its
 * two-revision example as a sentence ("2 revisions in git, ..."), so the
 * threshold has to sit strictly above 2; 3 is the smallest value that keeps
 * that example a sentence while still drawing a chart for a genuinely
 * multi-revision document like the corpus's ten-revision one.
 */
export const CHART_THRESHOLD_REVISIONS = 3;

const UNAVAILABLE_SUMMARY = 'History is not available for this document.';

/**
 * The chart's caption (T13; PRD "History — what git can honestly show"):
 * each point is one commit, not one unit of elapsed time, so a document
 * revised four times in an hour and one revised four times over a month
 * plot identically, and a commit that closed several tasks at once is
 * still a single step.
 */
export const HISTORY_CHART_CAPTION =
  'Each point is one commit. The axis is revision time, not working time.';

/**
 * The History region for a document with no usable git revisions: no
 * repository, no commits yet, the document never committed, git not
 * installed, or any other state fetch-git-revisions.ts already reduced to
 * an empty list. Exported so every caller that needs "no history" — the
 * empty-input branch of buildHistory below, and the adapter's default
 * parameter for a call site with no workspace root to run git in at all —
 * shares this exact value instead of each constructing its own.
 */
export const UNAVAILABLE_HISTORY: FeatureHistory = {
  available: false,
  summary: UNAVAILABLE_SUMMARY,
  points: [],
  showChart: false,
};

/** Recomputes a revision's completion percentage by parsing its document
 * text with the same three parsers buildFeatureModel composes (T3, T4,
 * T5) — never a second, independent reading of "done". */
function completionPercentage(text: string): number {
  const structure = parseDocumentStructure(text);
  const checklist = parseChecklist(text, structure.sections);
  const derived = deriveChecklistState(checklist);
  return derived.progress.percentage;
}

/** The ISO 8601 date portion (`YYYY-MM-DD`) of a `%cI`-formatted committer
 * date. `%cI` always begins with the four-digit year, two-digit month and
 * two-digit day, so slicing the first ten characters is stable regardless
 * of the timezone offset git renders at the end of the string. */
function dateOnly(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

/** A degraded read, from FetchedRevisions; both default to "no degradation". */
export interface BuildHistoryOptions {
  readonly truncated?: boolean;
  readonly skippedCount?: number;
}

function formatSummary(points: readonly HistoryPoint[], truncated: boolean, skippedCount: number): string {
  const base =
    points.length === 1
      ? `1 revision in git, on ${points[0].date}.`
      : `${points.length} revisions in git, ${points[0].date} to ${points[points.length - 1].date}.`;

  const notes: string[] = [];
  if (truncated) {
    notes.push(`showing only the most recent ${points.length}`);
  }
  if (skippedCount > 0) {
    notes.push(`${skippedCount} revision${skippedCount === 1 ? '' : 's'} in range could not be read and ${skippedCount === 1 ? 'is' : 'are'} not included`);
  }
  return notes.length === 0 ? base : `${base} (${notes.join('; ')}.)`;
}

/**
 * Builds the History region from a feature document's git revisions.
 *
 * `revisions` is expected newest-first — the order `git log` itself
 * returns, and the order fetch-git-revisions.ts preserves — and is
 * reversed here so the sentence's date range and the chart's points both
 * read oldest to newest, left to right. `options` states a degraded read.
 */
export function buildHistory(revisions: readonly HistoryRevisionInput[], options: BuildHistoryOptions = {}): FeatureHistory {
  const { truncated = false, skippedCount = 0 } = options;
  if (revisions.length === 0) {
    return UNAVAILABLE_HISTORY;
  }

  const chronological = [...revisions].reverse();
  const points: HistoryPoint[] = chronological.map((revision) => ({
    hash: revision.hash,
    date: dateOnly(revision.date),
    percentage: completionPercentage(revision.text),
  }));

  return {
    available: true,
    summary: formatSummary(points, truncated, skippedCount),
    points,
    showChart: points.length >= CHART_THRESHOLD_REVISIONS,
  };
}

/** The most recent revision's date, for the detail panel's LAST WORK tile
 * (T10's seam, buildPanelHeader's `lastWork` parameter). `null` when
 * history is unavailable, so the tile keeps stating its own absence rather
 * than this function inventing a date. */
export function mostRecentWorkDate(history: FeatureHistory): string | null {
  if (!history.available || history.points.length === 0) {
    return null;
  }
  return history.points[history.points.length - 1].date;
}
