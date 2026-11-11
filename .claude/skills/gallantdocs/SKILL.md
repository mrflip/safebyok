---
name: gallantdocs
description: Housekeeping pass that rewrites a target's comments, doc blocks, SQL comments, schema descriptions and READMEs in plain English, as one PR, then harvests a Goofus/Gallant pair for each new kind of slop into notes/gallant-docblocks.md for the Coach to edit, and applies the Coach's edits back to the code. Use only when the Coach invokes /gallantdocs, or says to apply their edits to the harvested pairs.
disable-model-invocation: true
argument-hint: "<target: files, folders, packages, a branch or a PR> [clarifications]"
---

# Gallant docs

The Coach's words after the command: `$ARGUMENTS`. They name the target and may narrow the pass. Where they conflict
with this file, they win.

This is housekeeping, not a review stage: it improves prose the code already has, and never blocks a PR. It has two
rounds. **Round one** rewrites the target and harvests pairs. **Round two** starts when the Coach says they have edited
the pairs: it applies their edits to the code. The `documentarian` agent rewrites doc blocks alone, one file per
spawn. This skill covers every kind of comment and README across a whole target, and feeds the bestiary.

## 1. Read the rules

Read these whole: STYLE.md *Naming* and *Comments and doc blocks*, `notes/gallant-docblocks.md` (its *Slop tropes*
tail holds the Coach's latest pairs and outranks older guidance), `notes/gallant.md` *Words*, and VOCABULARY.md
*Verbs, by how precise they are* and *Words safebyok does not use*. Read the rest of VOCABULARY.md by heading.

## 2. Cut and size

Cut a worktree: `scripts/cut-thread gallantdocs_<short label> [<base>]`, stacked on the target's branch when the
target is unmerged work. Size the target before reading it: run `rg -c` over it for each tell in section 3, and
`wc -c` the files. Read a file whole only when you will rewrite it line by line. For the rest, list the comment lines
(`rg -n '^\s*(/\*\*|\*|//|--)'`) and read a short `sed -n` range of the body only where you need a fact.

Split a large target into parts that do not share files: one part per adapter package, or per folder. Keep the core
part yourself, and give each other part to a `fork` subagent (it inherits the rules you read). Tell each fork: its
files, the tells, the word rules, not to commit or touch git state, to lint its packages, and to report each notable
rewrite as before and after, what it left alone and why, and each place the old prose and the code disagree.

## 3. The pass

Hunt these tells, in doc blocks, `//` and SQL `--` comments, GraphQL descriptions and READMEs:

* "What a foo verbs" and "How a foo verbs" openings. Lead with the verb, or with what the thing is.
* "the one X" where "a X" or "the X" is meant.
* Fragments joined by semicolons, lists with the verb gapped out, participial absolutes ("its expiry armed").
* "where it is", "as a", "as it comes": imprecise hedges. Use "if", "when", or the specific term.
* Invented figures: "the policy that speaks", "the vault's room", "refusals that cross", "a wayin laid on", "rides
  along in a spread", "the front door". Say the plain thing, with the code's own term where it has one.
* Refusal catalogs, the mechanism read aloud, and history (`#no-refusal-catalog`, `#purpose-not-machinery`,
  `#purpose-not-path`).

Apply the word rules everywhere in the target:

* "answers" only where a call returns an `Answer` (a vaultDB verb). Otherwise "returns".
* "gate" only for `Gate`, `vault.gate` and the gate verbs. A sign-in check is a sign-in check.
* Never "hold", "held" or "raise". A write is "written", never "lands". "Storage" or "datastore", never "store" as a
  noun. "Unencrypted", never "plain", of a stored field. A key is unwrapped and a whisper deciphered, never "opened".
* Imperative first lines, as the gallant pairs have them: "Classify ...", "Store ...", "Return ...".
* Option values and fields as a list, `- \`name\` -- meaning`, one a line, the default marked.

**Facts come from the code.** Read the body before rewording. Follow a refusal through its table: an act and the
refusal kind it becomes are different names (`vault_gone` refuses `absent_vault` from a box request). Where the old
prose and the code disagree, write what the code does and list it.

**Leave alone:** behaviour, names, test titles, and message strings that reach users (`phrases.ts`, error text).
Leave lines from commits titled "by the Coach's hand" (check `git blame`), and wording that is itself a Gallant in
the bestiary. Propose a rename in the open questions instead of making it.

## 4. Check and file

* Review each fork's work as a diff of changed lines (`git diff -U0 | rg '^[-+]'`), and READMEs as
  `git diff --word-diff=plain`. Scan the whole diff for the banned words and tells once more.
* Lint each touched package, then `pnpm justify`. A failing test you did not cause: show it fails on the base too,
  and report it.
* Commit by area, a few commits, with PROCESS.md's prefixes. Add a changeset when an exported string changes (a SQL
  or SDL constant). File one PR, as PROCESS.md says, with: what changed, the facts corrected, what was left alone, the
  **Tests:** line, and the open questions.

## 5. Harvest the pairs

Append to the fenced block at the end of `notes/gallant-docblocks.md` *Slop tropes*, **in the base checkout**
(`/workspace/byok`), where the Coach edits it. Add one pair for each kind of slop the pass found that the bestiary
does not already show, as many as are useful: the Coach cuts back. Use the compact form already there:

```
Goofus: "<the tell, quoted>": <why it is unclear, and what to use instead>
    <the old line, verbatim>
Gallant:
    <your replacement, as committed>
```

Report the PR link, the facts corrected, the open questions, and how many pairs you harvested.

## 6. Round two: apply the Coach's edits

When the Coach says they have edited the pairs:

* Diff their copy against your harvest. Check each edited Gallant against the code and the rules: is every fact
  true, is every `{@link}` in scope in its file, does a jsdoc list use `- ` markers, are sibling blocks consistent in
  mood, are there no semicolons joining facts. Fix a trivial defect in the base copy, and tell the Coach each fix
  and each larger disagreement, with its reason.
* Apply each Gallant to its site in the code, and bring its siblings into line (all six request types, both forms
  of a verb).
* Run `git status` in the base checkout. Other uncommitted edits there are the Coach's hand edits: read them, keep
  their intent, and fix only what breaks behaviour or states a wrong fact, saying so. Never drop a renamed field or
  key that other code reads.
* Copy the base's `notes/gallant-docblocks.md` into the worktree, commit it and the code, lint, test, and push to the
  same PR (check first that it has not merged: `gh pr view --json state`).
* Restore the swept files in the base (`git checkout -- <files>`), then fast-forward the base to the PR branch
  (`git merge --ff-only <branch>`). Never discard a base edit you have not swept.
