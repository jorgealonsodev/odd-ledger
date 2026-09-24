# git-spawn-hardening — close three non-blocking review follow-ups on git spawning

**Feature**: `git-spawn-hardening`
**Started**: 2026-09-24
**Branch**: `fix/git-spawn-hardening`
**Route**: Organic Driven Development (ODD). Not an SDD change — no proposal/spec/design/tasks artifacts.
**Engram mirror**: topic `odd/git-spawn-hardening/tasks`, project `odd-ledger`
**Locator**: `odd/tasks/git-spawn-hardening.md`

## Objective

Close three non-blocking WARNING findings from native review lineage `review-a02553d0e2e9bf37`:

1. **R1-git-log-auto-spawn-untrusted-config** (risk) — neutralise every repo-local git
   config key proven to let a malicious repository run an arbitrary program during the
   automatic, workspace-open-time `git log` calls in `created` sort mode and in the
   existing History region fetch; declare `capabilities.untrustedWorkspaces` explicitly so
   that spawning never happens in Restricted Mode.
2. **R2-duplicated-git-safety-constants** (readability) — stop duplicating the git safety
   constants between `fetch-feature-creation-date.ts` and `fetch-git-revisions.ts`, so R1's
   fix lives in one place both callers share.
3. **R4-unbounded-concurrent-git-spawns** (resilience) — cap how many `git` processes
   `FeatureCreationDateCache` starts at once, queuing the rest, instead of spawning one per
   undated document simultaneously.

## Problem

`fetch-feature-creation-date.ts` (sort mode `created`, the tree's default) and
`fetch-git-revisions.ts` (History region) each spawn `git log`/`git show` against whatever
repository a workspace folder happens to be, using that repository's own local config. Both
files duplicate the same `GIT_CONFIG_OVERRIDES`/`GIT_LOCATION_ENV_VARS`/`gitEnv`/timeout
constants, and neither declares whether the extension is safe to activate in an untrusted
(Restricted Mode) workspace. `FeatureTreeDataProvider.getChildren` also calls
`creationDateCache.ensure` once per undated document with no concurrency limit, so a project
with many undated features spawns that many simultaneous git processes on every workspace
open.

## Why

User-authorized closure of three specific review follow-ups; no further product research
needed. Investigation (below) established which of the hinted config keys are real, current
vulnerabilities against this codebase's *actual* invocations — not every plausible-sounding
git config key turned out to apply once tested empirically.

## Investigation: which repo-local git config keys can run a program here

All tests below were run with git 2.54.0 against real temporary repositories, replicating
the exact `execFile` argument arrays this codebase passes today, never against this
repository's own history.

**Real, currently exploitable vector — `log.showSignature` + `gpg.program` (or
`gpg.ssh.program`/`gpg.x509.program`).** A repository whose local config sets
`log.showSignature = true` and `gpg.program = <path>` makes `git log` invoke that program to
verify every commit's signature it displays — **even when the `--format`/`--pretty=format:`
string requests no signature field at all** (no `%G?`/`%GK`/etc.), as long as the *displayed*
commit actually carries a `gpgsig` header. This does not require a real, verifiable
signature — a syntactically present but bogus `gpgsig` trailer is enough to trigger the
verification program.

Proven against the exact current invocations:
- `fetch-feature-creation-date.ts`'s `git -C <root> -c core.quotePath=false -c
  core.fsmonitor=false -c core.sshCommand= -c diff.external= log --follow --diff-filter=A
  --format=%aI -- <path>` **does** run the configured program today when the commit that
  *adds* the document (the one `--diff-filter=A` selects) carries a `gpgsig` header.
- `fetch-git-revisions.ts`'s equivalent `git log --follow --name-only
  --pretty=format:%H%x09%cI --max-count=<n> -- <path>` call **does** run it too, for the
  same reason (same displayed-commit/signature-header condition, independent of
  `--diff-filter`).
- `fetch-git-revisions.ts`'s `git show <hash>:<path>` blob read does **not**: blob display
  via `<rev>:<path>` never applies signature verification, and never applies a `textconv`
  filter unless `--textconv` is explicitly passed (it never is here) — confirmed empirically.

Fix: add `-c log.showSignature=false` to the shared config overrides. A command-line `-c`
always wins over repo-local config, so this closes the vector regardless of what
`gpg.program`/`gpg.ssh.program`/`gpg.x509.program` a malicious repository sets; overriding
those programs individually is unnecessary once verification itself is disabled.

**Investigated and ruled out (no override added, with the reason):**
- `diff.external` — already overridden (pre-existing).
- `core.fsmonitor`, `core.sshCommand` — already overridden (pre-existing).
- `--no-textconv` / textconv filters — `git show <rev>:<path>` never applies `textconv`
  unless `--textconv` is explicitly requested, which this codebase never does; confirmed
  empirically with a `.gitattributes` diff driver pointing at a marker script.
- `core.hooksPath` — no git hook fires for `log` or `show`; confirmed empirically by pointing
  `core.hooksPath` at a directory with every plausible hook name populated and observing none
  of them ran.
- `alias.log` — git refuses to let a config-defined alias shadow an existing built-in
  command name; confirmed empirically that `alias.log` is silently ignored for the literal
  `log` subcommand.
- `log.decorate` and related display-only keys — control output formatting only, never
  invoke an external program.

## Scope

In scope:
- `src/domain/git-process.ts` (new): the single shared module for `GIT_TIMEOUT_MS`,
  `GIT_MAX_BUFFER_BYTES`, `GIT_CONFIG_OVERRIDES` (now including `log.showSignature=false`),
  `GIT_LOCATION_ENV_VARS`, `gitEnv()`.
- `src/domain/fetch-feature-creation-date.ts` and `src/domain/fetch-git-revisions.ts`:
  import from `git-process.ts` instead of duplicating the constants.
- `src/domain/feature-creation-date-cache.ts`: a small concurrency cap (max 4 in-flight
  fetches, the rest queued) inside `FeatureCreationDateCache`, preserving its existing
  contract (settled-null remembered as unresolved, `onResolved` only on a real date,
  `invalidateUnresolved()` clears unresolved paths — the queue itself is drained
  independently of that contract).
- `package.json`: `capabilities.untrustedWorkspaces: { supported: false, description: ... }`.
- `scripts/verify-package.test.js`: assert the manifest declares that capability.
- `README.md`: update the git-behaviour notes ("About what it reads" / "Limits worth
  knowing") to mention the Restricted Mode / signature-verification hardening and the
  concurrency cap.
- Version bump to 1.1.1 and a `CHANGELOG.md` entry, as the final commit.

Out of scope: any change to what data is fetched or how sort/history results render;
`feature-tree-provider.ts`'s call site itself (it stays a plain per-document `ensure()` call
— the cap is entirely `FeatureCreationDateCache`'s own responsibility, so the call site needs
no change); adding `gpg.program`/`gpg.ssh.program`/`gpg.x509.program` overrides (redundant
once `log.showSignature=false` is set, per the investigation above).

## Constraints

- Decision logic stays in `src/domain/`, pure or with an injected async dependency, tested
  with `node --test`. Only `package.json` touches the manifest.
- Git is still invoked the same way: `execFile`, never a shell string, every argument its
  own array element.
- `FeatureCreationDateCache`'s existing external contract (documented in its own file)
  is preserved exactly; the concurrency cap is additive internal behaviour, not a contract
  change — `get()` stays synchronous, `ensure()` stays idempotent per path, `onResolved`
  still fires only on a real date.

## TDD mode

**Strict TDD: enabled.** Source: global operator configuration (`Strict TDD Mode: enabled`
in `~/.claude/CLAUDE.md`).
**Runner**: `npm run test:domain` (compiles then `node --test` under `out/domain`) for every
domain-layer task; `npm run test:extension` (`@vscode/test-cli` over two profiles, real
VS Code via Xvfb) confirmed available; `npm run test:package` for the manifest/packaging
check. Baseline before this feature: `test:domain` 309/309 (308 pass + 1 opt-in skip),
`test:extension` 126 passing (adapter-unit) + 27 passing (adapter-workspace).

## Route

Delegated direct per the general routing rules; this session's explicit instruction
designates the acting agent as the single bounded writer executing directly (no further
sub-delegation) for this feature.

## Delivery strategy

`ask-on-risk` (default). Forecast: roughly 350–500 authored changed lines including tests,
across five source files, the manifest, README and CHANGELOG — tracked here per the
~400-line planning heuristic rather than as a hard cap. No push, no PR (explicit instruction).

## Tasks

- [x] G1 Create the feature branch and this tracking document, with the git-config
      investigation recorded above.
      Evidence: branch `fix/git-spawn-hardening`, this file (no commit yet — first source
      commit follows in G2).

- [x] G2 R1+R2: shared `src/domain/git-process.ts`, `log.showSignature=false` fix, both
      callers refactored to import it, regression tests proving the vulnerability is closed
      for both `git log` call sites.
      Evidence: `df165c8` — see Progress.

- [x] G3 Manifest: declare `capabilities.untrustedWorkspaces: { supported: false }` in
      `package.json`; assert it in `scripts/verify-package.test.js`.
      Evidence: `eed0499` — see Progress.

- [x] G4 R4: concurrency cap (max 4 in-flight) inside `FeatureCreationDateCache`, with a
      deferred fake fetcher test proving the cap holds and queued items eventually run.
      Evidence: `b277b78` — see Progress.

- [x] G5 README + CHANGELOG update, version bump to 1.1.1, final release commit.
      Evidence: `a56938e` — see Progress.

## Acceptance criteria

- A temporary repository whose local config sets `log.showSignature=true` and
  `gpg.program`/`gpg.ssh.program` to a marker script, with a signed (even if bogus) commit
  reachable by either fetch, never runs that marker through either
  `fetchFeatureCreationDate` or `fetchDocumentRevisions`.
- `fetch-feature-creation-date.ts` and `fetch-git-revisions.ts` no longer duplicate the git
  safety constants; both import them from `src/domain/git-process.ts`.
- `package.json` declares `capabilities.untrustedWorkspaces.supported === false`, and a test
  asserts it.
- `FeatureCreationDateCache` never has more than 4 fetches in flight at once; queued paths
  still eventually resolve once a slot frees up; the existing cache contract (get/ensure/
  onResolved/invalidateUnresolved) is unchanged from the outside.
- `npm run compile`, `npm run test:domain`, `npm run test:extension`, `npm run test:package`
  all pass.

## Progress / Evidence

- **G1** DONE. Branch `fix/git-spawn-hardening` created; this file created with the
  git-config investigation findings above (empirical, against git 2.54.0, real temporary
  repositories — see "Investigation" section).

- **G2** DONE `df165c8`. Investigation (above) found `log.showSignature=true` +
  `gpg.program` a real, currently exploitable vector against both callers' `git log`
  invocations — proven empirically against real temporary repositories with a bogus-signed
  commit (a syntactically present but never-verified `gpgsig` header is enough) and a marker
  `gpg.program`, independent of the `--format`/`--pretty=format:` string in use.
  RED: added a regression test to `fetch-feature-creation-date.test.ts` and
  `fetch-git-revisions.test.ts`, each building a temp repo with a bogus-signed add commit and
  a marker `gpg.program` + `log.showSignature=true`, asserting the marker never runs.
  `npm run compile` then `node --test out/domain --test-name-pattern="log.showSignature"` →
  both new tests failed (`true !== false`, marker ran) against the pre-fix code.
  GREEN: created `src/domain/git-process.ts` (shared `GIT_TIMEOUT_MS`, `GIT_MAX_BUFFER_BYTES`,
  `gitConfigOverrides()` — now including `-c log.showSignature=false` — and `gitEnv()`);
  refactored both `fetch-feature-creation-date.ts` and `fetch-git-revisions.ts` to import
  from it instead of duplicating the constants (R2). Re-ran the same test-name-pattern: both
  pass. `npm run test:domain`: 311/311 (310 pass + 1 opt-in skip; 309 baseline + 2 new
  regression tests).

- **G3** DONE `eed0499`. RED: added a `verify-package.test.js` test asserting
  `pkg.capabilities.untrustedWorkspaces.supported === false` with a non-empty description;
  ran it directly (`node --test --test-name-pattern="Restricted Mode"
  scripts/verify-package.test.js`) against the not-yet-changed manifest → failed
  (`expected "capabilities.untrustedWorkspaces" in package.json`).
  GREEN: added `capabilities.untrustedWorkspaces: { supported: false, description: ... }` to
  `package.json`. Re-ran: passes. `npm run test:package`: 18/18 passing (17 baseline + 1 new).
  `npm run compile`: clean.

- **G4** DONE `b277b78`. RED: 3 new tests in `feature-creation-date-cache.test.ts` — at most
  4 fetches start immediately from 6 simultaneous `ensure()` calls; a queued path starts once
  an in-flight one settles and its `onResolved` still fires; a second `ensure()` for an
  already-queued path does not double-fetch. `npm run compile` then `node --test
  out/domain --test-name-pattern="git-spawn-hardening R4|queued path|concurrency cap"` → all
  3 failed against the uncapped implementation (6 started instead of 4; queued path never
  started; 5 calls instead of 4).
  GREEN: added `MAX_CONCURRENT_FETCHES = 4`, a per-path `queuedPaths`/`queue`, `startFetch`
  and `drainQueue` helpers to `FeatureCreationDateCache`; `ensure()` queues instead of
  starting once the cap is reached, and every settle (`.finally`) drains one queued fetch
  into the freed slot. Re-ran: all 3 pass. `npm run test:domain`: 314/314 (313 pass + 1
  opt-in skip; 311 baseline + 3 new). `npm run test:extension`: 126 passing (adapter-unit) +
  27 passing (adapter-workspace), unaffected (no existing test drives more than 4 undated
  documents at once).

- **G5** DONE `a56938e`. README: "Limits worth knowing" gained a bullet on the 4-in-flight
  cap; "About what it reads" gained a paragraph on the git config hardening and the
  Restricted Mode declaration. CHANGELOG.md: new `## 1.1.1` entry at the top, prose style
  matching existing entries. `npm version 1.1.1 --no-git-tag-version` bumped
  `package.json`/`package-lock.json`. Final verification (below) all green before this
  commit.

## Verification

- `npm run compile`: clean (no errors), at every task's GREEN step and again on the final
  release commit.
- `npm run test:domain`: 314/314 (313 pass + 1 opt-in skip — the real-corpus test, expected
  on any machine without `ODD_LEDGER_REAL_CORPUS_DIR` set). Baseline was 309/309
  (308 pass + 1 skip); +5 new tests (2 signature-verification regressions, 3 concurrency-cap
  tests), 0 removed, 0 rewritten.
- `npm run test:extension`: 126 passing (adapter-unit) + 27 passing (adapter-workspace), 0
  failing — identical to baseline; this feature added no adapter-layer behaviour.
- `npm run test:package`: 18/18 passing (17 baseline + 1 new manifest test).

`git diff --shortstat main...HEAD`: 12 files changed, 425 insertions(+), 60 deletions(-).

## Gaps

- No workspace-level (`@vscode/test-cli`) test exercises the signature-verification fix or
  the concurrency cap directly; both are covered at the domain layer only (real temporary
  git repositories for R1, a fake injected fetcher for R4), consistent with this codebase's
  existing convention that git-behaviour correctness lives in `src/domain/` tests and the
  adapter layer is tested for wiring, not for git's own behaviour.
- `gpg.ssh.program` and `gpg.x509.program` were not independently reproduced with their own
  marker scripts (only plain `gpg.program`, GPG-style signatures); `log.showSignature=false`
  disables verification before git would ever consult any of the three, so this is treated
  as sufficiently covered by the investigation's reasoning rather than by three separate
  empirical reproductions.

## Status: done

## Review

Native review lineage `review-9c7eaeca11cc86af` (tier high, 757 changed lines, consent
granted by the user) approved on the first pass with no correction, and was acknowledged on
2026-09-24. The risk lens returned no findings. Non-blocking follow-ups, left for a later
cleanup pass:

- `R3-signature-regression-vacuous-pass-creation-date` / `-revisions` (WARNING): the
  signature regression tests assert only that the marker never ran, not that the result was
  read from the signed commit. The RED run against pre-fix code did observe the marker
  running, so they are not vacuous today, but a future change could make them so.
- `R2-duplicated-bogus-signature-test-helpers` (WARNING), `R2-misleading-per-instance-test-name`
  (WARNING), `R2-quotepath-rationale-dropped`, `R3-queue-drain-after-rejection-untested`,
  `R3-drain-sync-throw-leaks-slot`, `R4-restricted-mode-full-disable` (SUGGESTION).

## Next step

Push `fix/git-spawn-hardening`, open the PR, merge with a merge commit after CI, and publish
release `v1.1.1` with the packaged `.vsix`.
