/**
 * Synthetic ODD feature documents used as an integration corpus for the
 * three domain parsers (parseDocumentStructure, parseChecklist,
 * deriveChecklistState).
 *
 * PRIVACY: every project name, feature name, task title, commit hash, file
 * path and identifier below is invented for this repository. None of it is
 * traceable to any real project. The five real ODD documents this codebase
 * was designed from belong to private projects and never enter this
 * repository in any form — see src/domain/fixtures/real-corpus.optional.test.ts
 * for the local-only, opt-in check that runs against them.
 *
 * Why fixtures live here as exported TypeScript string constants rather
 * than as `.md` files on disk: `npm run test:domain` runs `tsc -p ./` and
 * then `node --test` from inside `out/domain`. Only `.ts` sources under
 * `src/` are compiled; a `.md` file next to them would not be copied into
 * `out/` by anything in this project's build, so a test reading it by
 * relative path would break the moment the compiled test runs from
 * `out/domain` instead of `src/domain`. A `.ts` fixture module compiles
 * and is discovered exactly like the parsers it feeds, is covered by
 * `npm run check-types`, and needs no asset-copy step.
 *
 * Each document below states, in its own `variants` field, which grammar
 * variants from the survey it exists to cover, so a future reader does not
 * have to reverse-engineer the intent from the text.
 */

export interface SyntheticDocument {
  /** Short identifier for referring to this fixture in test names. */
  readonly id: string;
  /** The feature name this document would live under at
   * odd/tasks/<featureName>.md, used only for readability in tests. */
  readonly featureName: string;
  /** One line describing the fictional feature, for context in failures. */
  readonly summary: string;
  /** The grammar variants (from the T6 brief's survey) this document was
   * built to demonstrate. Not exhaustive of everything the document
   * contains — just the variants it exists for. */
  readonly variants: readonly string[];
  /** The full document text, exactly as a parser would receive it. */
  readonly text: string;
}

/**
 * A fictional cache-warming feature.
 *
 * Covers:
 * - A bold metadata block (`**Feature**`, `**Started**`, `**Route**`)
 *   directly after the H1 — present here, absent from every other fixture.
 * - The `Why` optional heading.
 * - A fenced code block, inside `## Scope`, whose contents look like a
 *   heading (`## Not a real heading`) and a checklist item
 *   (`- [ ] Not a real task either`); neither must be parsed as real.
 * - A bold-wrapped ID and title (C1), with evidence on an indented
 *   continuation line naming a commit.
 * - A title containing an inline code span (C2, `` `cache.get` ``), with
 *   evidence but no commit reference.
 * - A done item with neither evidence nor a commit reference (C3): the
 *   `done-unproven` case.
 * - Two items with neither a bold wrapper nor an em-dash separator (C3, C4).
 * - The `declined` state (`[~]`, C5) and an unrecognized marker (`[?]`, C6).
 * - The `## Progress` spelling of the progress heading (as opposed to
 *   `## Progress notes`, covered in cli-flow-audit).
 */
export const CACHE_WARM_V2: SyntheticDocument = {
  id: 'cache-warm-v2',
  featureName: 'cache-warm-v2',
  summary: 'Warm the read-through cache for top keys before traffic ramps.',
  variants: [
    'bold-metadata-block-present',
    'why-heading',
    'fenced-code-block-with-fake-heading-and-item',
    'bold-wrapped-id-and-title',
    'title-with-code-span',
    'done-unproven-no-evidence-no-commit',
    'evidence-no-commit',
    'evidence-and-commit',
    'item-with-neither-bold-nor-dash',
    'declined-state',
    'unrecognized-marker',
    'progress-heading-short-form',
  ],
  text: [
    '# cache-warm-v2',
    '',
    '**Feature**: `cache-warm-v2`',
    '**Started**: 2026-05-04',
    '**Route**: Organic Driven Development (ODD).',
    '',
    '## Objective',
    '',
    'Warm the read-through cache for the top N keys before traffic ramps, instead',
    'of absorbing the stampede on cold start.',
    '',
    '## Problem',
    '',
    'Every deploy currently pays for the first wave of misses, one request at a',
    'time, which is exactly the load pattern the cache exists to avoid.',
    '',
    '## Why',
    '',
    'Two cold starts last quarter each produced a latency spike large enough to',
    'page on-call, and both traced back to the same empty cache.',
    '',
    '## Constraints',
    '',
    '- Read the warm-set from a static manifest; never infer it from live traffic.',
    '- No blocking startup path: warming runs in the background.',
    '',
    '## Scope',
    '',
    'The manifest format looks like this:',
    '',
    '```',
    '## Not a real heading',
    '- [ ] Not a real task either',
    '```',
    '',
    'Out of scope: eviction policy, the manifest generator itself.',
    '',
    '## Tasks',
    '',
    '- [x] **C1 — Load the warm-set manifest at startup.**',
    '      DONE `4a1c9e3`.',
    '',
    '- [x] C2 Warm each key through the existing `cache.get` path',
    '      Evidence: exercised the production code path rather than writing to',
    '      the cache directly, so a warmed entry is indistinguishable from a',
    '      real hit.',
    '',
    '- [x] C3 Emit a metric for warm-set coverage',
    '',
    '- [ ] C4 Add a manifest size limit',
    '',
    '- [~] C5 Warm secondary regions on the same schedule',
    '      Declined for this iteration: the secondary regions run their own',
    '      warming job already.',
    '',
    '- [?] C6 Investigate a smaller manifest format',
    '',
    '## Progress',
    '',
    'Branch `feat/cache-warm-v2`, five commits. 3 of 6 tasks closed.',
    '',
    '## Next step',
    '',
    'C4: add the manifest size limit, then reopen C6 once the format question',
    'is answered.',
  ].join('\n'),
};

/**
 * A fictional CLI flag-parsing feature.
 *
 * Covers:
 * - No bold metadata block (contrast with cache-warm-v2).
 * - The `## Progress notes` spelling (alias of `## Progress`).
 * - `## Checks`, a heading distinct from `## Constraints` — both appear in
 *   this corpus but are different optional headings, never aliases of one
 *   another.
 * - A decision-narrative heading carrying a trailing parenthetical
 *   (`## Decision taken (2026-08-02)`), stripped before alias lookup.
 * - Two independent ID namespaces under two different headings: `## Tasks`
 *   (`F<n>`) and `## Backlog` (`BK<n>`), the latter an unrecognized
 *   heading whose null kind still counts toward progress.
 * - An em-dash separator without a bold wrapper (F2).
 * - An unrecognized heading carrying genuine document-specific prose with
 *   no checklist at all (`## Risk notes`).
 */
export const CLI_FLOW_AUDIT: SyntheticDocument = {
  id: 'cli-flow-audit',
  featureName: 'cli-flow-audit',
  summary: 'Warn instead of silently ignoring renamed CLI flags.',
  variants: [
    'no-bold-metadata-block',
    'progress-notes-heading-alias',
    'checks-heading-distinct-from-constraints',
    'decision-narrative-with-trailing-parenthetical',
    'two-independent-id-namespaces-under-two-headings',
    'unrecognized-heading-counts-toward-progress',
    'em-dash-separator-without-bold',
    'unrecognized-heading-with-prose-only',
  ],
  text: [
    '# cli-flow-audit',
    '',
    '## Objective',
    '',
    'Rebuild flag parsing so a renamed flag warns instead of failing silently.',
    '',
    '## Problem',
    '',
    'Two flags were renamed last release and every script that still used the',
    'old name kept running, just ignoring the new behaviour entirely.',
    '',
    '## Constraints',
    '',
    '- Existing scripts must keep working during the deprecation window.',
    '',
    '## Scope',
    '',
    "In scope: the flag parser and its warning path. Out of scope: the flags",
    "subcommand's help text generator.",
    '',
    '## Tasks',
    '',
    '- [ ] F1 Parse the legacy flag manifest into the new schema',
    '',
    '- [x] F2 — Validate flag parsing against the golden fixture',
    '      DONE, verified against commit `b7e2f10`.',
    '',
    '- [x] F3 Emit a deprecation warning for renamed flags',
    '',
    '- [~] F4 Support the old positional-argument form',
    '      Declined: nobody has used positional flags in over a year.',
    '',
    '## Backlog',
    '',
    '- [ ] BK1 Consider a JSON schema for the flag manifest',
    '',
    '- [ ] BK2 Investigate flag aliasing for renamed options',
    '',
    '## Risk notes',
    '',
    'The deprecation warning path has not been exercised against a real CI run',
    'outside this repository yet; that is tracked informally, not as a task.',
    '',
    '## Checks',
    '',
    'Verified with the existing integration suite; no new automation was added',
    'for this change.',
    '',
    '## Progress notes',
    '',
    'Four of six tracked items are done across Tasks and Backlog combined.',
    '',
    '## Decision taken (2026-08-02)',
    '',
    'Keeping the old positional form for one more release was considered and',
    'rejected: nobody exercised it in the last twelve months of telemetry.',
    '',
    '## Next step',
    '',
    'F1: parse the legacy manifest, the remaining step before the warning path',
    'can be exercised end to end.',
  ].join('\n'),
};

/**
 * A fictional mobile onboarding feature.
 *
 * Covers:
 * - A single section (`## Tasks`) carrying two different ID prefixes at
 *   once (`M<n>` and `R<n>`), with a gap in the numbering (`M3` never
 *   appears) — the real corpus's document-C quirk, reproduced with
 *   invented content.
 * - A bold-wrapped ID and title whose bold span closes mid-line, leaving
 *   evidence naming a commit as trailing text on the same line (M1),
 *   rather than on an indented continuation line.
 * - A checklist under `## Acceptance criteria` with no identifier-shaped
 *   tokens at all, which must not count toward the feature's progress
 *   roll-up even though one of its items is checked.
 * - A second decision-narrative spelling with no parenthetical
 *   (`## Decisions`, bare).
 * - A second unrecognized heading with document-specific prose
 *   (`## Open questions`).
 */
export const MOBILE_ONBOARDING_REVAMP: SyntheticDocument = {
  id: 'mobile-onboarding-revamp',
  featureName: 'mobile-onboarding-revamp',
  summary: 'Replace the five-screen onboarding flow with one welcome carousel.',
  variants: [
    'single-section-two-id-prefixes-with-gap',
    'bold-wrapped-id-with-same-line-trailing-evidence',
    'acceptance-criteria-no-ids-excluded-from-progress',
    'decision-narrative-bare-plural',
    'unrecognized-heading-with-prose-only',
  ],
  text: [
    '# mobile-onboarding-revamp',
    '',
    '## Objective',
    '',
    'Replace the five-screen onboarding flow with a single welcome carousel',
    'that returning users never see again.',
    '',
    '## Problem',
    '',
    'New-user drop-off during onboarding is the single largest funnel loss in',
    'the app, and returning users still sit through the same five screens on',
    'every reinstall.',
    '',
    '## Constraints',
    '',
    '- Ship behind a remote flag; no forced rollout.',
    '- The carousel must render offline, since onboarding often happens before',
    '  the first successful network call.',
    '',
    '## Tasks',
    '',
    '- [x] **M1 — Ship the redesigned welcome carousel.** DONE, verified against commit `c88e4aa`.',
    '',
    '- [ ] M2 Add the skip button to the welcome carousel',
    '',
    '- [x] M4 Track first-session completion rate',
    '',
    '- [~] R1 Support the legacy tablet layout',
    '      Declined: tablet share has dropped below the support threshold.',
    '',
    '- [ ] R2 Investigate a lighter-weight animation library',
    '',
    '## Acceptance criteria',
    '',
    '- [ ] All onboarding screens render without a console error.',
    '- [ ] Returning users skip the welcome carousel.',
    '- [x] New users see the permissions primer exactly once.',
    '',
    '## Open questions',
    '',
    'Whether the permissions primer belongs inside the carousel or after it is',
    'still unresolved and depends on a design review that has not happened yet.',
    '',
    '## Decisions',
    '',
    'The carousel ships behind a remote flag rather than a staged app-store',
    'rollout, because the flag can be reverted without a new build.',
  ].join('\n'),
};

/**
 * A fictional storefront signage feature: the deliberately sparse
 * document.
 *
 * Covers:
 * - No `## Scope`, no `## Progress`, no `## Next step`, no
 *   `## Acceptance criteria` — only the four headings every real document
 *   carries (Objective, Problem, Constraints, Tasks).
 * - No bold metadata block.
 * - A plain, minimal `## Tasks` checklist: one open item, one proven done
 *   item, one done-unproven item — enough to exercise every derived count
 *   without any of the optional machinery.
 */
export const SIGNAGE_DISPLAY_DRIVER: SyntheticDocument = {
  id: 'signage-display-driver-v1',
  featureName: 'signage-display-driver-v1',
  summary: 'Render storefront signage from the same feed the kiosk app uses.',
  variants: ['sparse-document-core-headings-only'],
  text: [
    '# signage-display-driver-v1',
    '',
    '## Objective',
    '',
    'Get the storefront signage app rendering the daily schedule from the same',
    'feed the kiosk app already uses, instead of a separately maintained copy.',
    '',
    '## Problem',
    '',
    'The signage feed and the kiosk feed drift apart every time a promotion is',
    'added late, because someone has to remember to update both.',
    '',
    '## Constraints',
    '',
    '- No new backend endpoint: read the existing kiosk feed as is.',
    '- Must keep rendering the last good feed if a fetch fails.',
    '',
    '## Tasks',
    '',
    '- [ ] S1 Point the signage renderer at the kiosk feed URL',
    '',
    '- [x] S2 Cache the last successfully fetched feed on disk',
    '      DONE `f3a9c21`.',
    '',
    '- [x] S3 Fall back to the cached feed when a fetch fails',
  ].join('\n'),
};

/**
 * A fictional warehouse relabeling feature: the deliberately malformed
 * document.
 *
 * Covers:
 * - An unterminated code fence under `## Constraints`: never closed before
 *   the document ends. Everything after it — the `## Tasks` heading and
 *   its item — must still parse as real structure, not be swallowed into
 *   `Constraints`.
 * - A second H1 (`# Superseded plan, kept for reference`) appearing after
 *   the first section, which must be preserved as its own section rather
 *   than folded into whatever section precedes it.
 * - No trailing newline (`.join('\n')` never appends one), matching the
 *   grammar variety this corpus otherwise leaves implicit.
 */
export const WAREHOUSE_RELABEL_V1: SyntheticDocument = {
  id: 'warehouse-relabel-v1',
  featureName: 'warehouse-relabel-v1',
  summary: 'Relabel warehouse bins from the new SKU map instead of the retired one.',
  variants: ['unterminated-code-fence', 'h1-after-first-section', 'no-trailing-newline'],
  text: [
    '# warehouse-relabel-v1',
    '',
    '## Objective',
    '',
    'Relabel every warehouse bin from the new SKU map before the old one is',
    'retired, instead of leaving pickers to reconcile two conflicting labels.',
    '',
    '## Constraints',
    '',
    'The old label format looked like this:',
    '',
    '```',
    'BIN-042 :: SKU 88213 (legacy format, never closed below on purpose)',
    '',
    '# Superseded plan, kept for reference',
    '',
    'An earlier plan relabeled bins by hand, one aisle at a time. It was',
    'abandoned once the SKU map export became available.',
    '',
    '## Tasks',
    '',
    '- [ ] W1 Generate the relabel batch from the new SKU map',
    '',
    '- [x] W2 Print and apply the first aisle as a pilot',
    '      DONE `2b6f0a1`.',
  ].join('\n'),
};

/** Every synthetic document, for corpus-wide smoke checks. */
export const SYNTHETIC_DOCUMENTS: readonly SyntheticDocument[] = [
  CACHE_WARM_V2,
  CLI_FLOW_AUDIT,
  MOBILE_ONBOARDING_REVAMP,
  SIGNAGE_DISPLAY_DRIVER,
  WAREHOUSE_RELABEL_V1,
];
