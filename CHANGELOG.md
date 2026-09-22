# Changelog

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
