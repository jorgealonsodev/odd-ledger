/**
 * Synthetic feature documents whose progress entries and table rows name
 * several tasks at once. Neutral IDs and wording only: they reproduce the
 * shapes of a log-style document (ID groups joined by `/`, `,`, `and`;
 * clause-start IDs; an ID mentioned mid-sentence; a leading range), never
 * a real one.
 *
 * Expected outcome, all tasks being checked except M4.3:
 *  - M1.1 and M1.2 are proven by one entry (clause-start ID), M1.1 shows the
 *    entry's first commit, M1.2 the commit inside its own clause.
 *  - M1.3 and M1.4 are proven by one `M1.3/M1.4 + follow-ups` entry.
 *  - M2.3 is proven by its own entry; M2.1 is only mentioned in it
 *    mid-sentence, so it stays unproven.
 *  - M0.1 and M0.6b are only named by a range in a note: unproven.
 *  - M3.1 and M3.2 share an entry that is only a status echo: unproven.
 *  - M4.1 and M4.2 share one table row and are proven; M4.3 is open.
 *  - M5.1 is duplicated: its entries are ambiguous for it, while the other
 *    ID of the same entry (M5.2) still links.
 */
export const PROGRESS_MULTI_ID_DOCUMENT = [
  '# Feature: multi demo',
  '',
  '## Tasks',
  '',
  '- [x] M0.1 Bootstrap',
  '- [x] M0.6b Tooling',
  '- [x] M1.1 Reader',
  '- [x] M1.2 Writer',
  '- [x] M1.3 Router',
  '- [x] M1.4 Cache',
  '- [x] M2.1 Loader',
  '- [x] M2.3 Parser',
  '- [x] M3.1 Docs',
  '- [x] M3.2 Notes',
  '- [x] M4.1 Wiring',
  '- [x] M4.2 Cleanup',
  '- [ ] M4.3 Release',
  '- [x] M5.1 First twin',
  '- [x] M5.1 Second twin',
  '- [x] M5.2 Single',
  '',
  '## Progress / evidence',
  '',
  '- M1.1 `22deb08` (RED 4/9 failing), M1.2 `7a87dcf` (GREEN 12/12)',
  '- M1.3/M1.4 + follow-ups: `9f1e2d3` wired both.',
  '- H0 code status: all tasks M0.1–M0.6b done; 91/91 tests.',
  '- M2.3 done: `abc1234` fixes a regression introduced by M2.1.',
  '- M3.1 and M3.2 done.',
  '- M5.1 y M5.2: `5151515` shared work',
  '',
  '| Task | Commit | Notes |',
  '| --- | --- | --- |',
  '| M4.1, M4.2 | `4444444` | both landed |',
  '| M4.3 & M4.1 | `4343434` | prep |',
].join('\n');
