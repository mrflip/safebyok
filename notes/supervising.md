# Supervising thread-workers

For an agent that hands work to `thread-worker`s outside a sprint: a workshop, a one-off thread, a rework.
`/sprint` runs the same machinery at scale, with its own documents and YOLO, which these notes leave out.

## Sizing a thread

A `thread-worker` is compacted at about 170k tokens, a `thread-worker-400k` at about 400k. Size a thread to reach its
readiness check in one context. A thread that builds two features, carries more than about four items that touch
different code, or plainly runs long, is two threads or more, or goes to the 400k worker. Signature passes and renames
across a package count by the code they touch, not by how small each change is.

## The handoff

The prompt is the whole handoff, and is re-sent on each of the worker's turns. Quote what the thread needs from the plan
and the rulings rather than sending the worker to read them: a section it reads stays in its context for the rest of the
build. Name what is out of scope as plainly as what is in it. Name the model in every spawn, and the effort where it
should differ from the agent's own.

## Compactions

Every compaction is logged with its best guess at the agent, in `"$(git rev-parse --git-common-dir)/ohai.log"`. Read
its tail when a report comes in.

* **One:** expected. Tell the reviewer, and look harder at the work done after it.
* **Two:** the thread outgrew one context. Split threads of the same shape from now on.
* **Three, or two close together:** the worker is thrashing. Resume it to commit what is sound, bring its thread file up
  to date, and report `blocked` with what remains. A fresh worker continues from the thread file.

A decision made after a compaction rests on a summary, not on what the worker read. Weigh it that way.

## When a report comes in

1. **Verify cheaply.** The commits are in the worktree, the tree is clean, the PR carries `ci` and is pushed, and CI ran
   on that head. Trust the report for the rest.
2. **Review before ready.** Spawn a `thread-reviewer` with `isolation: "worktree"`, telling it the range and the
   compactions, unless the diff has no code. A PR leaves draft only after review.
3. **Read each deviation as a contract question first.** Ask what the code promised its callers before, as a comment or
   a test stated it, and what it promises now. If that changed without being directed, the change is held for the
   Coach, with the old promise quoted, whatever the worker recommends.
4. **Relay to the Coach,** one item per open matter, never rolled up, each with its question, the worker's reading and
   how firm it is. Put first what blocks other work or changes a contract.

## Resuming and rework

Resume the builder only to answer its blocking question. Rework after a review, or after the builder is done, goes to a
fresh worker with the thread file and the finding as a directive. Before resuming any agent after an interruption, check
whether it already resumed on its own: two agents in one worktree corrupt each other.

## After your own compaction

The summary is a sketch, and can be wrong with confidence: git, `gh`, the plan and the thread files are the record. A
ruling settles the question it answered, as firmly as it was given; read it beside that question.
