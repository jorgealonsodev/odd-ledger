import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistory, mostRecentWorkDate, CHART_THRESHOLD_REVISIONS } from './build-history';
import type { HistoryRevisionInput, FeatureHistory } from './build-history';

const TEXT_ZERO_OF_TWO = ['# sample', '', '## Tasks', '', '- [ ] T1 one', '- [ ] T2 two'].join('\n');
const TEXT_ONE_OF_TWO = ['# sample', '', '## Tasks', '', '- [x] T1 one', '- [ ] T2 two'].join('\n');
const TEXT_TWO_OF_TWO = ['# sample', '', '## Tasks', '', '- [x] T1 one', '- [x] T2 two'].join('\n');

function revision(overrides: Partial<HistoryRevisionInput> = {}): HistoryRevisionInput {
  return {
    hash: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
    date: '2026-09-10T10:00:00+00:00',
    text: TEXT_ZERO_OF_TWO,
    ...overrides,
  };
}

// --- the unavailable case ---------------------------------------------------

test('an empty revision list is unavailable, with no points and no chart', () => {
  const history = buildHistory([]);
  assert.equal(history.available, false);
  assert.deepEqual(history.points, []);
  assert.equal(history.showChart, false);
  assert.match(history.summary, /not available/i);
});

// --- the ratio recomputed per revision --------------------------------------

test('recomputes the completion percentage per revision by parsing its own text, not a shared value', () => {
  const older = revision({
    hash: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
    date: '2026-09-10T10:00:00+00:00',
    text: TEXT_ZERO_OF_TWO,
  });
  const newer = revision({
    hash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
    date: '2026-09-11T10:00:00+00:00',
    text: TEXT_ONE_OF_TWO,
  });
  // Newest first, matching the order git log (and fetch-git-revisions.ts)
  // itself returns.
  const history = buildHistory([newer, older]);

  assert.equal(history.points.length, 2);
  // Reversed to chronological order: the older, less-complete revision is
  // first.
  assert.equal(history.points[0].percentage, 0);
  assert.equal(history.points[1].percentage, 50);
});

test('a revision whose document had fewer tasks closed recomputes a lower percentage than a later one', () => {
  const revisions: HistoryRevisionInput[] = [
    revision({ hash: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3', date: '2026-09-12T10:00:00+00:00', text: TEXT_TWO_OF_TWO }),
    revision({ hash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', date: '2026-09-11T10:00:00+00:00', text: TEXT_ONE_OF_TWO }),
    revision({ hash: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', date: '2026-09-10T10:00:00+00:00', text: TEXT_ZERO_OF_TWO }),
  ];
  const history = buildHistory(revisions);

  assert.deepEqual(
    history.points.map((p) => p.percentage),
    [0, 50, 100],
  );
});

// --- the sentence: one revision, several, and the date range ---------------

test('states the singular sentence for exactly one revision', () => {
  const history = buildHistory([revision({ date: '2026-09-21T09:00:00+00:00' })]);
  assert.equal(history.summary, '1 revision in git, on 2026-09-21.');
});

test('states the plural sentence with the date range for several revisions', () => {
  const revisions: HistoryRevisionInput[] = [
    revision({ hash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', date: '2026-09-21T09:00:00+00:00' }),
    revision({ hash: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', date: '2026-09-20T09:00:00+00:00' }),
  ];
  const history = buildHistory(revisions);
  assert.equal(history.summary, '2 revisions in git, 2026-09-20 to 2026-09-21.');
});

test('the date range spans the earliest and latest revision, not just the first and last array entries by hash', () => {
  const revisions: HistoryRevisionInput[] = [
    revision({ hash: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3', date: '2026-09-13T09:00:00+00:00' }),
    revision({ hash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', date: '2026-09-11T09:00:00+00:00' }),
    revision({ hash: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', date: '2026-09-10T09:00:00+00:00' }),
  ];
  const history = buildHistory(revisions);
  assert.equal(history.summary, '3 revisions in git, 2026-09-10 to 2026-09-13.');
});

// --- the chart threshold, in both directions --------------------------------

function revisionsCount(n: number): HistoryRevisionInput[] {
  const list: HistoryRevisionInput[] = [];
  for (let i = 0; i < n; i++) {
    list.push(
      revision({
        hash: `${i}`.padStart(4, '0').repeat(10),
        date: `2026-09-${String(10 + i).padStart(2, '0')}T09:00:00+00:00`,
      }),
    );
  }
  return list;
}

test('stays below the chart threshold with one revision fewer than the threshold: no chart', () => {
  const history = buildHistory(revisionsCount(CHART_THRESHOLD_REVISIONS - 1));
  assert.equal(history.showChart, false);
});

test('reaches the chart threshold exactly: a chart is drawn', () => {
  const history = buildHistory(revisionsCount(CHART_THRESHOLD_REVISIONS));
  assert.equal(history.showChart, true);
});

test('the PRD\'s own two-revision example stays a sentence, never a chart', () => {
  const revisions: HistoryRevisionInput[] = [
    revision({ hash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', date: '2026-09-21T09:00:00+00:00' }),
    revision({ hash: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', date: '2026-09-20T09:00:00+00:00' }),
  ];
  const history = buildHistory(revisions);
  assert.equal(history.showChart, false);
});

// --- a degraded read is stated as degraded, not presented as complete ------

test('a truncated fetch states it is showing only the most recent N, not the whole history', () => {
  const revisions: HistoryRevisionInput[] = [revision({ date: '2026-09-21T09:00:00+00:00' })];
  const history = buildHistory(revisions, { truncated: true });
  assert.match(history.summary, /^1 revision in git, on 2026-09-21\. \(showing only the most recent 1\.\)$/);
});

test('skipped revisions are counted in the summary rather than silently shrinking the total', () => {
  const revisions: HistoryRevisionInput[] = [revision({ date: '2026-09-21T09:00:00+00:00' })];
  const history = buildHistory(revisions, { skippedCount: 2 });
  assert.match(history.summary, /^1 revision in git, on 2026-09-21\. \(2 revisions in range could not be read and are not included\.\)$/);
});

// --- mostRecentWorkDate ------------------------------------------------------

test('mostRecentWorkDate is the newest revision\'s date', () => {
  const revisions: HistoryRevisionInput[] = [
    revision({ hash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', date: '2026-09-21T09:00:00+00:00' }),
    revision({ hash: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', date: '2026-09-20T09:00:00+00:00' }),
  ];
  const history = buildHistory(revisions);
  assert.equal(mostRecentWorkDate(history), '2026-09-21');
});

test('mostRecentWorkDate is null when history is unavailable', () => {
  const unavailable: FeatureHistory = buildHistory([]);
  assert.equal(mostRecentWorkDate(unavailable), null);
});
