# Badge test package on 1.3.0 baseline

## Objective
Integrate verified released v1.3.0 with existing unfocused-update badge, generate and install local odd-ledger-1.3.1.vsix for user testing.

## Scope and constraints
Confirmed remote origin v1.3.0 peeled commit: 23a6f9d7f303f4b3b554e665819f9c0613e79f65. Current feature branch contains badge commits 4fbbfc2/f4e04da. Merge verified release without reset/rebase or overwriting untracked PRD.md/.vscode/settings.json. Version package.json and package-lock.json consistently; add changelog. No publication/push/PR. User explicitly authorized installation via available code CLI default profile.

## Tasks
- [x] T1 — Merge released 1.3.0 baseline and prepare verified 1.3.1 package metadata, preserving badge. Commit: d1699f4.
- [x] T2 — Build and install odd-ledger-1.3.1.vsix; verify archive/version and installed extension. Evidence committed with this document.

## Checks
T1: type checks, domain and extension suites; preserve 1.3.0 project grouping behavior; package tests and native review of integration candidate.
T2: production package, archive badge/version check, successful code --install-extension and code --list-extensions --show-versions. Manual UI behavior remains user check after reload.

## Progress
Remote baseline verified with git ls-remote and gh release list; tag fetched. code CLI 1.140.0 available, odd-ledger not listed in default profile. No-conflict merge and 1.3.1 metadata are staged. Writer checks: types passed; domain 495 passed, 3 optional skipped; extension 190 passed; staged/unstaged diff checks passed. User authorized generated out/, dist/extension.js and VSIX paths; npm run test:package explicitly deferred due to cleanup. Native consolidated review approved and exact acknowledgement burned authority for review-867549d516b4ab3f; one informational non-blocking advisory at package.json:6. Assessment unassessable due to untracked declaration, so independent verifier is running. No new RED for release-metadata/integration-only change. Independent verifier repeated types/domain/extension successfully; parent repeated types/diff checks. Integration committed as d1699f4. Initial 1.3.1 archive generated and CRC/version/code verified, but direct package tests had 17 pass / 1 fail: leftover dist/extension.js.map included. Rejected archive preserved as odd-ledger-1.3.1-with-map.vsix and leftover map preserved in out/extension.js.map.pre-package-backup. Regenerated archive: 155841 bytes, 10 entries, no map, no CRC error, manifest/package version 1.3.1 and badge/grouping markers verified. Direct package tests now 18 passed, 0 failed. code --install-extension ./odd-ledger-1.3.1.vsix succeeded; code --list-extensions --show-versions confirms jorgealonsodev.odd-ledger@1.3.1. CLI emitted a non-fatal Node deprecation warning.

## Next step
User reloads VS Code and manually tests focus loss, external task-document changes and refocus. Manual UI behavior remains unverified. Full npm run test:package cleanup wrapper was intentionally skipped, but its direct test suite passed after artifact repair. No publishing, push or PR performed.
