# ODD Ledger

If you keep your work in Markdown task documents inside the repository, this puts their
state in the editor: every feature, every task, the evidence that closed each one, and the
line that says what to do next. It reads those documents and the git history of them, and
nothing else.

It is a reader. It never writes to your documents, never commits, and never runs anything.

![The sidebar tree and the detail panel, reading a feature document](https://raw.githubusercontent.com/jorgealonsodev/odd-ledger/main/images/overview.png)

*The tree on the left, one feature with its tasks and the commit each one names. The panel
on the right: what to do next, the progress tiles, the objective, and every task with its
evidence. This document's tasks are all closed and proven, so nothing here is amber.*

## The idea that makes it different

**A ticked checkbox proves nothing.** Anyone can type `[x]`.

So a task closed while recording neither evidence nor a commit is shown as **done but
unproven**: counted honestly in the total, marked in amber, and named as what it is. A
section or a feature turns green only when everything under it is closed *and* proven. One
unproven task withholds the green from its whole group, because going green there would
repeat the very claim the document failed to back up.

The same rule governs silence. A field your document does not record is stated as **not
recorded**, never drawn as a zero and never left blank, because a blank and a zero both
read as answers when the truth is that nobody said.

## What you get

| Where | What it shows |
|-------|---------------|
| Sidebar tree | Each feature, its sections and its tasks. A state icon, the identifier exactly as written, and the commit the evidence names |
| Filters | `All`, `Open`, `Unproven`, from the view's toolbar |
| Detail panel | The next step first, then progress, unproven and last-work tiles, the objective, every task with its evidence, the fields the document records, and the history |
| History | Reconstructed from git: a sentence with the revision count and date range, and a chart once there are enough revisions to be worth plotting |

Click a feature to open the panel. Click a task to open the panel focused on that task and
jump to its line in the document. Hover anything to read it in full.

## Quick path

1. Install the extension.
2. Open a project that has feature documents at `odd/tasks/*.md`.
3. Click the ODD Ledger icon in the activity bar.

There is nothing to configure. The extension contributes no settings.

## What it deliberately does not do

- **Never writes to your documents.** Not a checkbox, not a normalisation, not a commit.
- **Never runs your workflow.** It reports what happened; it does not make it happen.
- **Reads nothing outside** `odd/tasks/*.md` and the git history of those files.
- **Enforces nothing.** A document that ignores every convention still renders; the
  parser tolerates variety rather than demanding a template.

## Commands

| Command | What it does |
|---------|--------------|
| ODD Ledger: Refresh | Re-reads the documents now. The view also refreshes on its own when they change |
| ODD Ledger: Open Feature | Opens the detail panel for a feature |
| ODD Ledger: Show All | Removes the filter |
| ODD Ledger: Show Open | Shows only what is not yet claimed as done |
| ODD Ledger: Show Unproven | Shows only tasks ticked without evidence |

## Limits worth knowing

- The history region needs git. A project without it, or a document not yet committed,
  says history is unavailable rather than guessing.
- History reads the fifty most recent revisions, and says so when it truncates.
- Markdown in your evidence is rendered, but images are not loaded and appear as a stray
  marker. Nothing else is affected.

## About what it reads

Everything on screen comes from files in a repository you may merely have cloned, so it is
treated as data and never as instruction. The panel runs with scripts disabled under a
policy that denies everything except one stylesheet and the icon font. Markdown is rendered
with raw HTML escaped, images off, and links restricted to `http`, `https` and `mailto`.
Hovers are untrusted, so a document cannot hide a command behind one.

## Licence

ODD Ledger is released under the MIT licence, which permits using, copying, modifying and
redistributing it, including for commercial purposes, as long as the copyright notice is
kept. See [LICENSE](LICENSE) for the full text.

Requires VS Code 1.85 or later.
