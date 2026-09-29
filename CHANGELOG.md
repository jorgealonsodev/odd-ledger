# Changelog

## Unreleased

Reads evidence recorded as a **progress list**, so a document that logs one bullet per task
under its progress heading no longer shows those closed tasks as done but unproven.

- A progress list is the top-level bullets or numbered items under a heading starting with
  `progress` or `evidence` (the same scope as a progress table; the document title never
  opens one, and a table and a list can share a section). An entry includes its indented
  and nested lines, up to the next top-level item, heading, table or fenced block.
- An entry links to a task when its first word, without emphasis or backticks and without a
  trailing `:`, `,`, `—` or `–`, is exactly the task ID. A range (`T0.1–T0.6b`) or an ID
  list (`T1, T2`) is never expanded. An entry that names no task is shown at document level
  as a note and counted toward no task; a duplicated ID is named as ambiguous and linked to
  none.
- An entry proves a checked task only when something remains after the ID and one leading
  status word (`done`, `closed`, `complete`, `finished`, `pending`, `in progress`, `wip`,
  `todo`, `blocked`): `- T0.1 done` alone stays unproven, `- T0.1 done: commit \`a9526b1\``
  proves. An entry for an open task never changes its state. The commit shown is the first
  commit-like token in the entry.
- Evidence reads inline first, then table rows, then list entries, each naming its source
  (`list "<heading>", item N`). Entries render through the same hardened Markdown path as
  every other evidence: raw HTML escaped, images off, same link allow-list.
- A document without a progress list reads exactly as in 1.2.0.

## 1.2.0

Reads evidence recorded in a **progress table**, so a document that keeps one row per task
no longer shows every closed task as done but unproven, and needs no second copy of the
evidence under each checkbox.

- A progress table is a pipe table whose first column is `Task`, `ID`, `Task ID` or `Tarea`,
  under a heading starting with `progress` or `evidence` (`## Progress / evidence`,
  `## Evidence`, `### Evidence log`). A table anywhere else is never read as evidence.
- Rows link to a task by ID: the whole first cell, else its first token (`E5-5 cleanup`
  links to `E5-5`). A task can have several rows. A row matching no task is shown at
  document level and counted toward no task; a row matching several (duplicate IDs) is
  named as ambiguous and linked to none.
- A row proves a checked task only when a cell other than the ID and the `Route` column holds
  something that is not empty, a dash, or a bare `pending` / `n/a` / `tbd`. An empty row leaves the task unproven; a row for an open task never
  changes its state.
- The commit shown comes from a `Commit` column (else the first commit-like token in the
  row); a `Route` column supplies the task's route. Inline evidence still counts and is
  shown first, then the table rows, each naming its source (`inline`, or
  `table "<heading>", row N`).
- The reader tolerates hand-written tables: with or without outer pipes, alignment colons,
  `\|` escapes, pipes inside code spans, ragged rows, several tables in one document.
  A table inside a fenced code block is an example, not evidence.
- Table cells are rendered like any other document text: raw HTML escaped, images off, same
  link allow-list. A document with no progress table reads exactly as before.

## 1.1.2

Marketplace metadata only: the extension now lists the `Visualization` category and a set of
search keywords, so it can be found in the Visual Studio Code Marketplace and Open VSX. No
behaviour changes.

## 1.1.1

Hardens the git reads behind the History region and `Created` sort mode:

- Neutralises a repo-local git config combination (`log.showSignature` plus a `gpg.program`)
  that could make `git log` run an arbitrary program while reading a workspace's own
  repository, on ordinary workspace open.
- Declares the extension unsupported in Restricted Mode (untrusted workspaces), so none of
  its git reads run until you trust the workspace.
- Caps creation-date lookups at 4 git processes running at once; a project with many undated
  features queues the rest instead of spawning one per document simultaneously.

No user-visible behaviour changes otherwise.

## 1.1.0

The features tree can now be sorted three ways, picked from a new `Sort By…` button on
the view's toolbar, and the choice is remembered across sessions:

- `Created`, the new default: oldest feature first, dated by the first commit that added
  its document. A document git cannot date (no repository, git missing, or not committed
  yet) sorts after every dated one, by name, and is checked again on the next refresh.
- `Status`: the 1.0 order, open features first and closed ones last, each group by name.
- `Name`: plain name order.

Tasks inside a feature keep the order their document gives them. Creation dates are read
from git in the background and cached, so the tree never waits on git to render.

## 1.0.1

The project is now published under the MIT licence, and the licence text ships inside the
installable artifact itself rather than only living in the repository. The 1.0.0 artifact
went out with no licence file at all: GitHub reports an unlicensed public repository as all
rights reserved, so strictly nobody could have legally used that release. `package.json`
now also declares `license`, `bugs` and `homepage`, which the Marketplace listing surfaces
but which 1.0.0 left unset.

## 1.0.0

First release. ODD Ledger reads the feature documents under a project's `odd/` folder and
renders their state in the editor: the features, their sections, every task, the evidence
that closed each one, and the next step. It also reconstructs how progress moved over time
from the git history of those documents.

It is a reader. It never writes to a document, never commits, and never runs any workflow.

### What it shows

| Region | What you get |
|--------|--------------|
| Sidebar tree | Every feature, its sections and its tasks, with a state icon, the task's identifier as written, and the commit its evidence names |
| Filters | `All`, `Open` and `Unproven`, from the view's toolbar |
| Detail panel | The next step first, then progress, unproven and last-work tiles, the objective, every task with its evidence, the fields the document records, and the history chart |
| History | A sentence with the revision count and date range, and a chart once there are enough revisions to plot |

### The idea worth knowing before you install

A ticked checkbox proves nothing on its own. A task closed while recording neither evidence
nor a commit is shown as done **but unproven**, counted honestly and marked in amber rather
than folded into a reassuring percentage. A section or a feature turns green only when
everything under it is closed *and* proven.

The same rule governs absence. A field a document does not record is stated as not
recorded, never drawn as a zero or left blank, because a blank and a zero both read as
answers when the truth is that nobody said.

### Known limits

- Reads `odd/tasks/*.md` and the git history of those files. Nothing else, by design.
- Contributes no configuration settings. There is nothing to tune.
- The history region needs git. A project without it, or a document not yet committed,
  reports that history is unavailable rather than guessing.
- History is capped at the fifty most recent revisions, and the summary says so when it
  truncates.
- An image inside a task's evidence renders as a stray `!` followed by a link. Images are
  deliberately not loaded into the panel; the fallback is untidy rather than harmful.

### Security

Everything rendered comes from files in a repository you may merely have cloned, so it is
treated as data and never as instruction. The detail panel runs with scripts disabled under
a content policy that denies everything except one stylesheet and the icon font. Markdown
is rendered with raw HTML escaped, images off, and links restricted to an allowlist of
`http`, `https` and `mailto`. Tooltips are untrusted, so a document cannot smuggle a command
link into a hover.
