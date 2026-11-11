# A Closer Look

Read by the orchestrator when the Coach asks for one, or when offering one (*When*, below).

The Coach sees something worrying and has to guess backwards: was the guidance poorly conceived or
incomplete, is the solution not acceptable, or should the problem be redesigned away or not solved
at all? A Closer Look gives them the evidence from a reader with no stake in how the code got here,
"without relying on the accidents of history". It is **not a summary of your YOLO calls**: they
generally agree with those in the small, and a summary only has them "bouncing between tabs to
understand their context".

## When

Never run one unasked: it costs an `opus` context and a long read by the Coach. **Offer** it, in one
line of chat, when the third thread of a sprint files, if the sprint has six or more threads and
is building a new design rather than carrying out a settled one. Offer a second near two-thirds of
the way through, scoped to what the first didn't cover. Don't pause the threads while it runs.

## Run it

1. **Say what you gathered**, in a few lines, and fold in whatever the Coach adds: their words at
   the time outrank the brief below.
2. **Pick a SHA:** the top of what has filed. Cut a clean, detached worktree there; a thread still
   building is out of scope, and the tab says so.
3. **Spawn one `opus` agent** in the background with the brief below. Quote the rulings it should
   not report as discoveries, and, on a second look, list what the first reported and how the Coach
   answered, so it isn't reported again.
4. **Birth a *Closer Look* tab** with the report as its text, eyebrows first, because their top items
   matter most. Open with what the reader saw and what it did not, the SHA, and the flavours.

## The brief

```
You are writing the raw material for a tab called "Closer Look", read by the Coach. It helps them
tell whether something worrying means the guidance was off, the solution was off, or the problem
wants redesign. You are giving evidence, not a verdict.

Read cold: judge the code as if it arrived in one piece. Do not read thread files, PR text, the
sprint doc, or commit messages beyond what you need to find something. "A reviewer accepted this"
counts for nothing. Do not read notes/security.md or anything named `secret`.

Where: read-only, at <worktree>, detached at <sha>. The sprint began at <base>:
`git diff <base>...<sha> -- <paths>`. Use `git show <base>:<path>` to tell whether a thing is new.
What was contemplated: <the design draft's files>; search them by name. Already ruled, so not
discoveries unless the code goes past them: <rulings>. The bar: <the Coach's standing rules>.

Report, in this order:

1. Eyebrows, ranked by how much each should change what the Coach thinks: code fighting the draft,
   the draft looking wrong given the code, a concept that exists only to serve a workaround,
   surprising weight, things that exist twice, tests asserting less than their titles, a module a
   security reviewer would find hard to follow. Most valuable: a sign the guidance is incomplete,
   or that a problem would dissolve under a small redesign. Where you can, probe with a throwaway
   script outside the repo and report what it did.

2. Undergrowth, found by searching rather than by reading through:
   - Control primitives: queue, counter, generation, unique token, join, lock, a flag gating a
     path, timer, abort controller, retry, a promise stored in a field.
   - New mechanisms: classes, files, or a nexus of related methods the design doesn't contemplate.
   - Non-standard JavaScript: a method's whole body in a functional wrapper, method names passed
     for later calling, parameterized helpers that could be inlined, anything more like code golf
     than plain code.
   Say plainly if something feared is in fact drawn by the draft, or if there is little here.

3. New names outside the draft: extract them mechanically; a `sonnet` subagent may be worth it.
   State the count, then format by volume. Large: names only. Medium: grouped by concern, a name
   alone where it is patently obvious, otherwise one line.

For each item in 1 and 2, give:
- path:line, and a sentence a reader can follow without opening the file;
- its origin: drawn by the draft, carried from the old code, or new in this sprint;
- what it costs: how many paths must now be reasoned about;
- its flavour: guidance gap, guidance wrong, solution off, or redesign?, or that you can't tell;
- what would settle it. No fix beyond a clause.

Each item stands alone, so the Coach need not look anywhere else to decide.
```

## The Coach's replies

They type replies in the tab, as highlighted text beside an item; never ask for comments, which
wake the session. Read the tab only when they say they've replied. A read costs far more than the
visible text: pull the highlighted runs out with a script, or hand it to a subagent.

**Nothing is scheduled until triage.** A reply is a reaction, not yet a plan, and may rest on a
wrong premise. When they have finished, add a *Draft for triage* section near the top, sorting
every reply: what they are looking into themselves; what they said to do later; plain instructions,
ready when they say; and questions still open. Quote their words. Start work only on what they
single out as urgent, and take later threads out of the running order only when they say so.

* **Correct a premise in the same section.** In the unrace sprint, a reply took new code for old.
  The item's origin should have said so, and the triage had to.
* **Say what you took each reply to mean,** and ask where you stretched one. A remark that a thing
  was never contemplated is not yet an instruction to remove it.
* **Answer their questions in the tab,** under a heading of their own, from a subagent that reads
  the code. Name what they asked; don't bury the answer in the item.
* **Don't put a question on *Open Matters* as well** unless it needs a ruling of its own.

## At the end

The tab is otherwise lost with the doc, and the replies are half its value. At wrap-up:

* Export it to `<sprint_name>-closerlook.md` in the sprint directory. The export drops the
  highlighting, so say at its top that a reply runs on after each item's last `path:line`.
* Put what triage held in the next sprint's seed, with the Coach's words, and what they want to
  keep watching in the design docs, one brief bullet each.
* Point the next sprint's planner at the export.
