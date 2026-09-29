/**
 * Synthetic feature documents that record their evidence as a bullet list
 * under a progress heading. Neutral IDs and wording only: they reproduce the
 * shape of a log-style document (one entry per task, an ID first, a note
 * that names no task), never a real one.
 */

/** Eight tasks. L1, L2 and L4 are proven by a list entry (L4 through its
 * nested line); L3 is checked with an entry that only echoes a status word;
 * L5 is checked with no entry; L6 is open with an entry; L7 is proven by a
 * table row and a list entry that coexist in one section; L8 is checked
 * with one table row that says nothing and no list entry. */
export const PROGRESS_LIST_DOCUMENT = [
  '# Feature: list demo',
  '',
  '## Tasks',
  '',
  '- [x] L1 Loader',
  '- [x] L2 Parser',
  '      An inline note, commit dddd444.',
  '- [x] L3 Cache',
  '- [x] L4 Router',
  '- [x] L5 Docs',
  '- [ ] L6 Release',
  '- [x] L7 Wiring',
  '- [x] L8 Cleanup',
  '',
  '## Progress / evidence',
  '',
  '- L1 done: commit `aaaa111` (docs-only).',
  '- **L2**: `bbbb222` (RED 3/9 failing, GREEN 9/9).',
  '- L3 done',
  '- L4 done',
  '  - commit `cccc333`',
  '  - checks: 12 passed',
  '- L6 pending: `eeee555` started',
  '- 2026-09-29: toolchain installed.',
  '- H0 status: all tasks L1–L3 done; 91/91 tests.',
  '',
  '| Task | Commit |',
  '| --- | --- |',
  '| L7 | 7777777 |',
  '| L8 | — |',
  '',
  '- L7 done: wired, `8888888`',
  '',
  '## Next step',
  '',
  'L6.',
].join('\n');
