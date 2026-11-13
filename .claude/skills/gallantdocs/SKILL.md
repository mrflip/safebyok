---
name: gallantdocs
description: Housekeeping pass that rewrites a target's comments, doc blocks, SQL comments, schema descriptions and READMEs in plain English, as one PR, and reports names that jar with their doc blocks. It harvests a Goofus/Gallant pair for each new kind of slop into notes/gallant-docblocks.md for the Coach to edit, then applies the Coach's edits back to the code. Use when the Coach invokes /gallantdocs, or says to apply their edits to the harvested pairs.
disable-model-invocation: true
argument-hint: "<target: files, folders, packages, a branch or a PR> [clarifications]"
---

# Gallant docs

The Coach's words after the command: `$ARGUMENTS`. They name the target and may narrow the pass. Where they conflict
with this file, they win.

This is housekeeping, not a review stage: it improves prose the code already has. It has two rounds. **Round one**
rewrites the target, reports names, and harvests pairs. **Round two** starts when the Coach says they have edited the
pairs, and applies their edits to the code. The `documentarian` agent rewrites one file's doc blocks; this skill
covers every kind of comment and README across a whole target, and feeds the bestiary.

## 1. Read the rules

Read STYLE.md *Naming* and *Comments and doc blocks*, `notes/gallant-docblocks.md` (its *Slop tropes* tail has the
Coach's latest pairs, and wins where older guidance differs), `notes/gallant.md` *Words*, and VOCABULARY.md *Verbs,
by how precise they are* and *Words safebyok does not use*.

Two word rules are not written down there yet:

* "answers" only where a call returns an `Answer` (a bankDB verb). Elsewhere, "returns".
* "gate" only for `Gate`, `vault.gate` and the gate verbs. A sign-in check is a sign-in check.

## 2. Size and split

Work in a worktree stacked on the target's branch when the target is unmerged work. Size the target before reading
it: `rg -c` each tell over it, and `wc -c` the files. In a code file, list the comment lines
(`rg -n '^\s*(/\*\*|\*|//|--)'`) and read a range of the body only where you need a fact.

Split a large target into parts that share no files, such as one per adapter package or folder. Keep one part
yourself and give the others to subagents: `fork` for a few parts (it inherits the rules you read), or fresh Opus
agents with a written brief for many, which keeps the cost down. Tell each its files, the tells, the word rules, not
to commit, and to report each notable rewrite as before and after, what it left alone and why, and each place the old
prose and the code disagree.

## 3. The pass

The tells to hunt are the ones the rules above name, chiefly: "What a foo verbs" openings, "the one X", facts
joined by semicolons, gapped lists, participial absolutes, "where it is" and "as a" hedges, and invented figures
("the policy that speaks", "refusals that cross"). Hunt them in doc blocks, `//` and SQL `--` comments, GraphQL
descriptions and READMEs.

Follow a refusal through its table before naming it: an act and the refusal kind it becomes have different names
(`vault_gone` refuses `absent_vault` from a box request).

**Leave alone:** behaviour, names, test titles, and message strings that reach users (`phrases.ts`, error text). For
lines that read in the Coach's register, report any changes you make.

## 4. Names that jar

Read each name against its doc block's first line and its body, and report, without renaming, the names that jar.
A rename changes the exported surface or a lot of call sites, so it is the Coach's call. Kinds to look for:

* **A vacuous or off-vocabulary word where a specific term exists:** "kept" or "held" where the thing is *listed*,
  *stowed* or *attached*, or "found" where it is *fetched*.
* **A name that hides the notable thing the function does:** a helper named for a trivial part of its job when its
  real job is, say, classifying a stored row (`classifyStoredRow`).
* **A `fooOf` that does more than derive.** `demandBox` returning a checked `Box` is the convention. A `boxOf()` that
  also makes an instance and enlists it in a listing is not.
* **Suspect shapes:** `fooOver`, `heldFoo`, `keptFoo`, `fooGate` where nothing is a gating or the `Gate`, a `try*`
  that does not return an `Outcome`, an `ensure*` that is not idempotent.
* **A doc block that names a different act than the name.**

Give each finding as a row: `file:line` with a short snippet to search on, the name, the doc block's first line, the
proposed name, the reason, and whether you are sure. Skip a name that is merely long or a matter of taste. The table
goes in the PR's open questions.

## 5. Check and file

* Review each subagent's work as a diff of changed lines (`git diff -U0 | rg '^[-+]'`), and READMEs as
  `git diff --word-diff=plain`. Check by script that no quotation and no Goofus or Gallant specimen changed. Scan the
  whole diff once more for the tells and banned words.
* A failing test you did not cause: show it fails on the base too, and report it.
* Commit by area. Add a changeset when an exported string changes (a SQL or SDL constant) or a published README does.
  The PR lists what changed, the facts corrected, what was left alone, the names table, and the open questions.

## 6. Harvest the pairs

Append to the fenced block at the end of `notes/gallant-docblocks.md` *Slop tropes*, in the base checkout
(`/workspace/byok`), where the Coach edits it. Add a pair for each kind of slop the pass found that the bestiary
does not already show, as many as are useful: the Coach cuts back. Use the compact form already there:

```
Goofus: "<the tell, quoted>": <why it is unclear, and what to use instead>
    <the old line, verbatim>
Gallant:
    <your replacement, as committed>
```

Report the PR link, the facts corrected, the names table, the open questions, and how many pairs you harvested.

## 7. Round two: apply the Coach's edits

When the Coach says they have edited the pairs:

* Diff their copy against your harvest, and check each edited Gallant against the code and the rules: true facts,
  `{@link}`s in scope in their file, `- ` markers on a jsdoc list, siblings consistent in mood. Fix a trivial defect
  in the base copy, and tell the Coach each fix and each larger disagreement, with its reason.
* Apply each Gallant to its site in the code, and bring its siblings into line (all the request types, both forms of
  a verb).
* `git status` in the base checkout: other uncommitted edits there are the Coach's. Keep their intent, and fix only
  what breaks behaviour or states a wrong fact, saying so. A renamed field or key that other code reads is the usual
  way such an edit breaks behaviour.
* Copy the base's `notes/gallant-docblocks.md` into the worktree, commit it with the code, and push to the same PR
  once you have checked it has not merged.
* Restore the swept files in the base, then fast-forward the base to the PR branch where it can (a restack since
  will prevent it: say so). Leave any base edit you have not swept in place.
