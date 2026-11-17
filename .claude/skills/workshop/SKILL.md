---
name: workshop
description: Run a workshop -- the Coach and you alternate design and implementation, deciding by consensus, while thread-workers build each round so your context keeps the design. Use when the Coach invokes /workshop, or asks to work this way. A sprint, issued and left to run, is /sprint.
---

# Workshop

The Coach and you design together, quickly and in turns, and the building goes to workers. You keep the design, the
rulings and the plan in your context; a worker keeps a round's code in its own. Slower than a sprint by choice: nothing
is decided for the Coach, and nothing changes while a question is open.

## Deciding

* **Consensus before change.** When either of you raises a question or a concern, change nothing it touches until there
  is a clear sign you both hold the same view. A question is a check, not a hint (`#earnest-question`).
* **Move only for a reason you can name.** The Coach depends on your independent counsel, and may press hard to test it.
  When you change position, name the argument that moved you; when you hold, say so and why. A forceful message is not
  an argument, and neither is a question's lean.
* **Recommend.** Give your view and how firmly you hold it, not a survey.
* **The Coach's text is not sacred.** Fix a typo or drift in it like any other, and say so.

## Building

* **Rounds go to workers.** Each round of rulings is built by one worker, sized and briefed by `notes/supervising.md`.
  Relay the Coach's rulings to it as directives; tell it "held" for whatever is not yet ruled.
* **Small edits are yours:** a plan, a doc line, a fix of a few lines, where a worker would cost more than it saves.
* **A worker's report comes to the Coach whole:** every deviation and open matter, one item each, with your reading.
  Read a deviation as a contract question first (`notes/supervising.md`, *When a report comes in*).

## Keeping the record

* The plan and the design live in the thread's whiteboard folder in the base checkout, where the Coach reads and edits
  them. Rulings go there, beside the question each answered.
* Write a handoff at natural breaks -- a PR filed, a round of rulings closed -- with the state, how the Coach wants the
  work run, and the rulings recorded nowhere else. It is the next context's starting point, beside the compaction
  summary.
* When your context passes about 250k tokens, say so at the next natural break, so the Coach can compact you there
  rather than at the limit.
