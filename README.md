# ODD Ledger

ODD Ledger is a read-only view of Organic Driven Development (ODD) work,
inside the editor.

Open a project that keeps its ODD state under `odd/tasks/*.md`, and the
extension renders every feature document as a tree in the activity bar,
plus a detail panel per feature: objective, tasks, the evidence that closed
each one, and what to do next.

## What it reads

The project's `odd/` folder, and the git history of the files in it.
Nothing else. It does not read source code, other configuration, or
anything outside that folder.

## What it does not do

- It never writes to a feature document. Documents stay hand-editable; the
  extension only reads them.
- It never creates a commit, a branch, or a pull request.
- It never runs, orchestrates, or automates the ODD workflow.
- It never enables, disables, or evaluates receipt-driven development.
- It never enforces the ODD contract. A document missing fields the
  contract asks for still renders, as it is, never flagged non-compliant.

## Honesty rules

A `- [x]` in a feature document only means the author checked a box. ODD's
own rule is that a checkbox proves nothing by itself, and the view is built
around that:

- A checked task with no evidence text and no commit reference renders as
  **done-unproven**: still counted as done, but visibly flagged, and
  counted separately in the tree's `UNPROVEN` indicator and the panel's
  `UNPROVEN` tile.
- Anything the document does not record — a missing heading, an absent
  branch name, a field the contract asks for and the document never
  filled in — is shown stating that it was not recorded. It is never
  rendered as a zero, a blank, or guessed at.

## Using it

1. Open a repository that contains `odd/tasks/`.
2. Click the **ODD Ledger** icon in the activity bar.
3. The tree shows each feature, the sections of its document that hold
   tasks, and the tasks themselves, with state icons, `done/total`
   counts, and the commit reference for a task when its evidence names
   one.
4. Click a task to jump to its line in the document.
5. Click a feature to open its detail panel: a header with the project,
   path and branch; the document's next step; tiles for progress,
   unproven tasks and the date of the last recorded change; the
   objective and task list with evidence inline; the document's other
   recognized sections; a table of the rarer fields the ODD contract asks
   documents to record (TDD mode, delivery strategy, route, line budget,
   review outcome), each shown as recorded or as not recorded; and a
   summary of the document's git history, with a chart once there are
   enough revisions to plot.

A repository with no `odd/tasks/` folder shows welcome content in the
view rather than an error or an empty tree.

## Commands

All commands live under the **ODD Ledger** category and are also
available as toolbar buttons on the view.

| Command | What it does |
|---------|--------------|
| `ODD Ledger: Refresh` | Re-reads `odd/tasks/` and any open detail panel from disk. The view also refreshes on its own when a document changes, is created, or is deleted; this command forces the same refresh on demand. |
| `ODD Ledger: Open Feature` | Opens the detail panel for a feature. Used internally when a feature node in the tree is clicked. |
| `ODD Ledger: Show All` | Shows every task in the tree, regardless of state. |
| `ODD Ledger: Show Open` | Narrows the tree to tasks that are not done. Feature and task counts still reflect the full document; only what is visible is filtered. |
| `ODD Ledger: Show Unproven` | Narrows the tree to done-unproven tasks. |

## Settings

None. The extension contributes commands and one view, but no
configurable settings; there is nothing to look up under **Settings** for
it.

## Architecture

`src/` is split along a hard boundary:

- **`src/domain/`** — discovery, parsing and derivation. Plain TypeScript
  over strings and paths. Imports nothing from `vscode`. Unit-tested with
  `node --test` against compiled output; no editor is launched.
- **`src/adapter/`** — providers, panel, commands and `src/extension.ts`.
  The only code allowed to import `vscode`. Tested with `@vscode/test-cli`
  inside a real (headless-capable) extension host.

## Build

```sh
npm install
npm run check-types   # tsc --noEmit
npm run compile       # tsc -> out/
npm run bundle        # esbuild -> dist/extension.js (vscode external)
```

`npm run watch` runs the esbuild bundler in watch mode.

## Test

Two independent suites, one per layer:

```sh
npm run test:domain     # node --test over compiled src/domain/**/*.test.ts
npm run test:extension  # @vscode/test-cli over compiled src/adapter/**/*.test.ts
```

`test:extension` downloads a VS Code build on first run and launches a real
extension host, so it needs network access and a display (or headless X
server) available.

### Fixtures

`src/domain/full-pipeline.test.ts` runs the three domain parsers together
(structure, then checklist, then derived state) over a small synthetic
corpus in `src/domain/fixtures/synthetic-documents.ts`. The fixtures are
invented feature documents, not files, so that the compiled `node --test`
run under `out/domain` never has to resolve a non-`.ts` asset path back
into `src/`; see that file's header comment for the full reasoning.

### Real-corpus check (opt-in, local only)

`src/domain/real-corpus.optional.test.ts` additionally parses the real ODD
documents this extension was designed from, when they are available. Their
location is never recorded in this repository, in any form: set the
`ODD_LEDGER_REAL_CORPUS_DIR` environment variable to a local directory of
`*.md` documents before running `npm run test:domain`. The test asserts
only that each document parses without throwing and yields a plausible
shape (an H1 and at least one section) — never anything about what a
document actually says, since that content is private. When the variable
is unset, or points at a missing directory, the test skips with a clear
message and the suite stays green.

## Package

```sh
npm run package       # npm run clean, then vsce package -> odd-ledger-<version>.vsix
```

Packaging is governed by `.vscodeignore`. The one runtime dependency,
`@vscode/codicons`, ships as a single file: the detail panel loads
`node_modules/@vscode/codicons/dist/codicon.ttf` directly at activation
time, so an ignore rule broad enough to drop `node_modules` wholesale
would silently remove the panel's icons without failing anything. That
constraint is checked by a script, not by inspection:

```sh
npm run test:package  # builds a production bundle, then asserts what
                       # `vsce` would actually package: the font and the
                       # bundle are present; sources, tests, fixtures,
                       # compiled test output, the CodeGraph index, the
                       # ODD ledger folder, and a stray source map are not
```

## Debug

Open this folder in VS Code and use the **Run Extension** launch
configuration to start a development instance, or **Extension Tests** to run
the adapter suite under the debugger.
