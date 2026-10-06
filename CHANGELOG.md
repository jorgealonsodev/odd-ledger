# Changelog

## 1.3.4

The Features tree now opens on what is left to do.

- A section, feature or project node starts expanded only while it still holds unfinished work: an item that is open, declined or unknown, the same items the `Open` filter shows. Everything else starts collapsed, including a feature with no checklist items at all, and can still be expanded by hand.
- This changes expansion only. An expanded branch still lists every task, finished ones included, and the `All` / `Open` / `Unproven` filters, sort modes and detail panel are unchanged.
- The computed state applies to nodes the view has not shown before. A refresh, manual or from a document change, keeps any node the view already knows in whatever state you left it.

## 1.3.3

The activity-bar badge now works without opening the Features view first.

- The extension now activates in the background once VS Code has finished starting (`onStartupFinished`). Previously it activated only when the Features view first became visible in a window, so until then nothing watched `odd/tasks/*.md` and no badge could appear.
- Startup is not delayed: activation waits until VS Code has finished starting. The badge counting and clearing rules from 1.3.2 are unchanged.

## 1.3.2

The activity-bar badge for automatic task-document changes now clears when you actually see the Features view, not when the window regains focus.

- The badge counts distinct task documents changed, created or deleted under `odd/tasks/*.md` while the window is unfocused, the Features view is hidden, or both. It clears only once the window is focused **and** the view is visible, so refocusing with the view hidden keeps the badge until you open the view.
- Changes that arrive while you can already see the view never create a badge. The 1.3.1 counting is unchanged: repeated saves of one document count once, and manual refreshes and workspace-folder-only refreshes do not count.
- The badge tooltip now reads "changed since you last saw this view".

## 1.3.1

Adds a native activity-bar badge for automatic task-document changes received while the VS Code window is unfocused.

- The badge counts distinct task documents changed, created or deleted under `odd/tasks/*.md` and clears when the window regains focus. VS Code's active theme controls its appearance.
- Manual refreshes and workspace-folder-only refreshes do not count. The multi-root project grouping introduced in 1.3.0 and all existing 1.3.0 behavior are preserved.

## 1.3.0

In a multi-root workspace the tree now tells projects apart.

- With two or more workspace folders, the root shows one **project node** per folder (in
  workspace order), labelled with the folder's name, with its path as the tooltip and the
  aggregate `done/total` (plus ` · N unproven`) of its visible features. Each project holds only
  its own features.
- Filter and sort apply within each project. A folder with no feature visible under the active
  filter shows no project node.
- A workspace with zero or one folder is unchanged: features stay at the root, with no project
  node.

## 1.2.2

An entry or a table row that names several tasks now counts for all of them.

- A progress list entry links to every task in its **leading ID group**: IDs joined by `,`,
  `/`, `&`, `+`, ` and ` or ` y ` (`- T1.3/T1.4 + follow-ups: \`9f1e2d3\``,
  `- T1, T2 done: \`abc1234\``, `- T1 y T2: ...`). The group ends at the first word that is not
  a known task ID or a joiner. A table row does the same with its first cell
  (`| T1, T2 | ... |`).
- A list entry also links to a known task ID that starts a **clause** after a `,` or `;`
  (`- T1.1 \`22deb08\` (RED ...), T1.2 \`7a87dcf\` (GREEN ...)` links T1.1 and T1.2, each showing
  the commit in its own clause). Commas inside parentheses, brackets or code spans do not open
  a clause; table rows use only their first cell.
- A clause-start ID proves its task only through its **own clause** (the text up to the next
  clause that starts another linked ID): `- T1 \`aaaa111\` done, T2 pending` proves T1 and links
  T2 unproven. `not started` counts as a status word, like `pending`.
- An ID mentioned mid-sentence (`fixes a regression introduced by T2.1`) never links.
  Ranges (`T0.1–T0.6b`, `T1 - T3`, `T1..T3`, `T1 to T3`) are never expanded; a leading range
  keeps the entry a note.
- Every linked task receives the whole entry or row as evidence, with the same source label,
  listed once per task. An entry proves a checked task only when something remains after the
  ID group and one status word, so `- T1, T2 done.` proves neither.
- A duplicated task ID stays ambiguous per ID: the entry links the other IDs it names and is
  named once as ambiguous for the duplicated one.
- Behaviour change: an entry such as `- T1, T2 done: ...` or `- T1/T2 ...`, and a table row
  such as `| T1, T2 | ... |`, used to be a note (list) or link to the first task only (table);
  they now link to every task named. A table ID cell such as `T1:` now links, and a spaced range
  in a table cell (`T1 - T3`) is now a note instead of linking `T1`.

## 1.2.1

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
- Fixed while hardening the list reader: a bare status word followed by punctuation
  (`- T1 done.`, `done!`, `done;`) no longer proves the task; thematic breaks (`* * *`,
  `- - -`, `---`) are not entries and end the current entry; checkbox items no longer consume
  an item number in the `list "<heading>", item N` labels.

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
