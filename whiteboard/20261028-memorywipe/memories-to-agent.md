# Memory to the sprint skill and agent definitions

My auto-memory's rulings on how sprints, plans and handoffs run, written as they would land. Each
names its file and place. For the Coach to review: none of these is applied.

## 1. `.claude/skills/sprint/SKILL.md`, §4, after the **YOLO** paragraph

From the Coach's ruling of 2026-10-22 (streamline sprint): "Leave the current contract. Don't make
YOLO calls that alter contract at this level."

> **A Rec that changes the contract waits, even in YOLO.** Split the open matters a thread meets.
> A Rec on mechanism (a name, where code lives, a test) may be taken provisionally and recorded.
> A Rec that changes what a caller is promised (a refusal, an ordering guarantee, a state word,
> what `lock()` does to a call in flight) is the Coach's: the thread keeps today's contract and
> lists the question. The looseness of an export, or how strict a validator is, is not such a
> promise: before 1.0 tightening those is the point (CLAUDE.md, *Until 1.0.0*).

## 2. `.claude/skills/sprint/SKILL.md`, §1, the *Ground rules* bullet

From the Coach, 2026-10-22 (primitives sprint), as standing notes.

> * *Ground rules*: only what is particular to this sprint. Two hold for every sprint and need no
>   line there. More refusals from simple primitives are expected, and purposeful: higher
>   coordination is built on them, so a new refusal is named plainly, not escalated as a blocker
>   or avoided with a mechanism. And a guarantee may loosen between threads when a later thread
>   closes it, with no design change to carry it through every step: name the loosening and the
>   thread that closes it in the PR's open questions. The final guarantee still holds by the
>   sprint's end.

## 3. `.claude/skills/sprint/SKILL.md`, §1, beside the thread glosses

From the Coach, 2026-10-19 and 2026-10-22.

> **Placement is a guess while the design is fluid.** Which class a method lives on, which end of
> a relationship owns a constructor, whether a gate is its own class: write the choice as a
> *first guess*, with the other guess and the arguments each way beside it, never as a verdict
> (the Coach: "The whole purpose of that phase is to improve the guesses before I come in to do
> coin flips"). A late pass re-does the table from the built code, moves code only where every
> argument points one way, and files the rest as Open Matters rows.
>
> **A plan's "remove X, Y, Z" is an aspiration**, the residue of a design that no longer needs
> them, not a directive (the Coach). A kept helper the new design still wants is no failure to
> follow the plan.

## 4. `.claude/agents/thread-reviewer.md`, *The job*, step 2, after the list

From 2026-10-26: a restyle reviewer briefed to flag "breaking changes" came back with format
bumps, table-clearing changesets and no-release-between-phases rules, all struck by the Coach.

> Before 1.0.0, breaking an interface or a stored shape is not a finding (CLAUDE.md, *Until
> 1.0.0*): no format bump, migration, compatibility shim or clean-up changeset is proposed. Only
> *losing a guarantee* is: what is bound into the cryptography, what reaches a log or a host, what
> is checked at a boundary.

The same sentence, shortened, for `.claude/agents/thread-worker.md`, *The thread*.

## 5. `.claude/skills/turbochat/SKILL.md`, *Writing a matter*, closing sentence

From 2026-10-21, when the Coach asked "what is handle?" on two rows (two explain round trips). A
row is born from worker and reviewer reports, so the rule applies to the session writing it.

> Spell internal shorthand out the first time it appears in a row (S2, D8, a nickname for an
> object): say "the Vault object in this tab", not "the handle".
