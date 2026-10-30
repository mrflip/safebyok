---
name: tighten-guidance
description: Tighten the agent guidance files -- CLAUDE.md first, then STYLE.md, PROCESS.md, VOCABULARY.md and the agents and skills under .claude/ -- so each line pays for its place in every agent's context. Relocates what a reviewer can fix, cuts what training, the linter or another file already says, and checks that each pointer's condition is specific. Use only when the Coach invokes /tighten-guidance.
disable-model-invocation: true
argument-hint: "[files to focus on, or clarifications]"
---

# Tighten the guidance files

The Coach's words after the command: `$ARGUMENTS`. They narrow the target or clarify; where they
conflict with this file, they win.

CLAUDE.md is in every agent's context on every turn. STYLE.md, PROCESS.md and VOCABULARY.md are
read by section when a pointer says to. An agent or skill file is read by the one session that
runs it. A line is weighed by who pays for it and how often, against what it prevents.

## 1. Measure

`wc -l -w` the four documents and the files under `.claude/agents` and `.claude/skills`, and
`git log --oneline -5 -- CLAUDE.md` for the last pass. Read CLAUDE.md whole. Read the other
files by heading (`rg -n '^#' <file>`), then only the sections a CLAUDE.md line points at or repeats.

## 2. Sort every line of CLAUDE.md

For each rule, ask what going wrong costs and who would catch it:

* **Stays** when getting it wrong is a security bug, a contract change, or a decision a reviewer
  would have to re-litigate (crypto, secrets through a side door, back-compat, ground truth,
  library first); or when it shapes code so deeply that catching it late means a rewrite (the
  cast's names, stored-field spelling, times).
* **Moves to STYLE.md** when a reviewer or the `style-reviewer` agent fixes it cheaply after the
  fact: braces, quotes, assertion spellings, doc-block shape, test shape. Check first whether
  STYLE.md already says it; most do, and then the line is simply cut.
* **Moves to PROCESS.md** when it is a git, PR, packaging or dependency habit.
* **Moves into a file's own comments or README** when it explains one file (a tsconfig, the e2e
  layout) that can carry the explanation itself.
* **Cut** when the linter enforces it (`rg` the rule in `packages/safebyok/eslint.config.mjs`),
  training knows it, or another line in CLAUDE.md says it. A rule said three ways in three
  sections becomes one.
* **A list becomes its rule** when the rule reproduces the list and will not go stale: a list of
  long files becomes "a file past about 800 lines is searched". Check with `wc -l` that the rule
  still picks the same files.

## 3. Check every pointer

For each "read X before Y" in CLAUDE.md: can an agent recognize the condition from its seat, and
does it fire rarely enough to be worth stating? One that fires on nearly every task becomes an
unconditional "read X once". One an agent cannot recognize ("a term you do not recognize") stays
only when the text it points at is too long to inline. A pointer names a section as its file
spells the heading: check with `rg -n '^#' <file>`.

## 4. Tighten the words

Say each remaining line with fewer tokens, keeping its rule and its one best example. Keep the
house voice: plain sentences, the cast's names, no hedges.

## 5. Finish each move

A move is complete only when the destination says it: add the line there, in that file's voice,
under its right heading, and fix every reference to the old place (`rg -n` the old section's
title over `.`). A rule cut from CLAUDE.md that nothing
else says is a decision for the Coach, not a silent loss: list it.

## 6. Report, then wait

Report counts before and after; what moved where; what was cut and why; and the proposals you
did not act on, each with its risk (wrong and uncaught, or wrong but caught by a reviewer)
against its cost to every run. The Coach decides on the proposals and asks for the commit.
