# newput handoff

For the next orchestrating agent, who works with the Coach interactively, with thread workers. Written 2026-11-04.

**The job:** make the whole `packages/safebyok/src/models/` tree "gallant", through thread workers, before a push to go end to end. Don't start a thread until the Coach says go on it: they want to discuss each change before it's assigned.

## Read first

1. `CLAUDE.md`, and `PROCESS.md` *A worktree per thread* and *Pull requests*.
2. `notes/gallant.md`, once: the catalogue of faults and fixes, with hashtags the Coach uses. It's for reviewers and for you. **Don't load it into workers writing code, and don't cut a digest of it:** agents learn it from gallant code.
3. `whiteboard/20261104-newput/newput-plan.md`: the rulings, and what's left (Threads 1b to 4).
4. `whiteboard/20261104-newput/resolutions.md`, *Rulings from the rework*: the later rulings. They're binding.
5. `whiteboard/20261104-newput/e2e-status.md`: what the demo still needs, and what the Coach has to decide before it.
6. `whiteboard/20261102-newdesign/garbage_pail.md`: the Coach's requests among their notes. **Not all of it is actionable.** Ask before acting on an item.

## `src/*.ts` is off limits

`packages/safebyok/src/` holds two designs side by side, and it's easy to edit the wrong one.

* **The old design** is the top-level `src/*.ts`: what `src/index.ts` exports today, and what `safebyok-react`, the adapters and the demo run on. The models replace it. **Don't edit it, fix it, or bring it into a thread's scope,** even where a search says its wording is now false.
* **The new design** is `src/models/` and `src/storage/`. Neither is exported, so a change there reaches no host and needs an empty changeset.
* **The names collide:** `bank`, `box`, `gate`, `gating`, `lease`, `proving`, `vault` and `wayin` are each in both, and so are `Bank`, `Vault`, `Box`, `VaultDB` and `DeviceDB`. Always give the full path, and read search hits by path. `src/vault.ts` is not `src/models/vault.ts`.
* **The top-level modules the models import are shared,** so take care: `consts`, `crypto`, `errors`, `helpers`, `logger`, `one-at-a-time`, `outcome`, `phrases`, `report-error`, `stable-jsonify`. Adding a phrase to `phrases.ts` is routine. Changing or removing one used by old code isn't. `src/checks/`, `src/shapes/` and `src/helpers/throwers.ts` are shared too.
* **Tests follow the same split:** `tests/models/` and `tests/storage/` are the new design.
* **Put this in every worker's brief.** Workers are especially likely to "tidy" an old file they find by search.

## Where things stand

The stack is open, unmerged, and each PR is filed against `main`. The Coach merges, bottom up.

| PR | Branch | Tip | |
|---|---|---|---|
| [#470](https://github.com/mrflip/safebyok/pull/470) | `20261104-newput` | `2fe3942f` | Straight chutes, the fix list, the Coach's markup. Its own CI is stale: see below |
| [#472](https://github.com/mrflip/safebyok/pull/472) | `20261104-shapes_home` | `bd3d8932` | Types to `models-shapes.ts`, refusal factories to `helpers/throwers.ts` |
| [#473](https://github.com/mrflip/safebyok/pull/473) | `20261104-lease_chain` | `178661d3` | The lease chain. CI green, covering everything below it |
| [#480](https://github.com/mrflip/safebyok/pull/480) | `20261104-del_damaged` | `37799242` | `delBox` and `tryDelDamagedBox`. Check that CI finished green |

* **The base checkout** `/workspace/byok` is on the local, unpushed branch `20261104-newdesign_plan`: #480's tip plus the whiteboard commits. **The plan lives only there,** so sweep it to a branch when the Coach asks.
* **`20261103-vaultdbnew`** is the base's old branch, kept at `dcd650ce`. Tags `20261104-base-before-move` and `20261104-base-wip-before-move` hold the old state.
* **`/workspace/byok-newput`** is #470's worktree. The Coach may merge #480 directly, which should mark the PRs below it merged. If they push a doc fix to #470 first (`storage/vault-db-new.ts`, which nothing above #470 touches), its tip leaves #480's history, so #470 stays open and #472 and up need `git rebase --onto` before merging.
* **Other tip-of-branch safety tags:** `20261104-newput-presquash`, `20261104-shapes_home-prerebase`.

## Getting the tree gallant

Suggested order, for the Coach to change. Check each thread against the code first, since the plan's threads predate #472 to #480.

1. **A review pass:** a Sonnet, read-only, against `notes/gallant.md` on `src/models/`, told to skip what's marked *Planned*. Sonnet did better than Haiku on this. **Check each finding against the code and the rulings before passing it on.** Reviewers follow the catalogue's wording and propose fixes that undo a ruling.
2. **Thread 1b, `plain_whisper`.**
3. **Thread 2, `newhello`:** `bank.hello`'s `valOf`, `vault.hello`'s bounce, the `device_id` default, the discarded parses in the constructors.
4. **Thread 3, `newdel`:** the tombstone built in `Listing.del`, and the damaged-row hole. Settle the open question there first: `tryDelDamagedBox` needs `damagedAt`.
5. **Thread 4, the listing's shape:** `fate`, `Settled.badnews`, the Coach's `deliver` doc block.
6. **The doc blocks:** `SLOPDOC` marks many, and a rough search found about 99 with "as", "so" and the like, many of them fine. It's a `documentarian` run, which only the Coach can call for.

## How to run a thread

* `scripts/cut-thread <label> <base branch>` from the base checkout. No "note" in a label: it makes `justify` red.
* Spawn a `thread-worker`. Sonnet has done well on these. Give the goal in the Coach's words, what's out of scope, and the `src/*.ts` caution. **Tell it to stop at `ready`, with nothing pushed.**
* **Read the source diff yourself, and run `pnpm justify`,** before filing. Workers' reports have been mostly right, but each has had something to catch.
* File against `main`, with "Stacked on #N" in the body and an empty changeset. `pnpm changeset --empty`, or a real one if an export changes. Then `git worktree remove`.
* A rebase of a stacked branch needs the old base named: `git rebase --onto <new> <old base> <branch>`. I lost time using a stale base. Force-push only with the Coach's say for that branch, with `--force-with-lease=<branch>:<sha>`.
* Push with `git -c credential.helper= -c credential.helper='!gh auth git-credential' push`. Retry on a server error: GitHub had a bad day, and pushes failed then succeeded.
* Never use `git rebase --exec` with `justify`, and never touch the shared stash stack. `git stash create` plus a tag is a safe way to keep uncommitted work.

## Working with the Coach

**Mistakes I made, so you can skip them:**

* **Relaying a worker's report without reading the code.** Say what you verified and what you didn't.
* **Stating a thing as ruled when the Coach only mentioned it** (`#a-fact-is-not-a-ruling`). And stretching a request beyond its size (`#dont-overstretch-a-request`).
* **Adding machinery for edge cases.** The Coach wants simple, readable and predictable, well above failsafe. A race gets a row, not a fix. Twice this session, the fix was deleting something.
* **Reverting an edit I took for a worker's.** It was the Coach's "active reading". Their uncommitted comments may be in any worktree, so check `git status` first, and commit around them through the index (`git hash-object` and `git update-index --cacheinfo`).
* **A claim from memory.** I told them a lock changes `exposed`; `Box` has no such override. A failing test caught it. Check before saying.
* **Omnibus commits.** The Coach likes logical commits, each its own change.

**How they work:**

* A question is a question: answer it on its merits, with a recommendation. An imperative is a directive: do it, or push back in a sentence.
* They may read code while you work, and message mid-turn. Take the newest message into account.
* They may answer by number and leave some unanswered. State how you read a terse reply, and don't assume a question you asked was answered.
* They read plans in the base checkout, so edit whiteboards there.
* Requests can get lost if they stay in chat or the pail: put what's agreed into the plan.
* Doc blocks are one or two 120-character lines of purpose. "As", "so", "once" and "since" usually mark process, not purpose.

## Open matters

* **`tryDelDamagedBox` against Thread 3:** the Coach ruled the listing keeps its damaged rows, replaced on any list refresh and not updated by that verb. `BoxListing.del`'s filter still updates it today, so that goes in Thread 3.
* **`delBox` over a damaged row with no readable revision** still tombstones it, so its doc block isn't true for that case. Thread 3 owns the fix, in the storage rule.
* **A component showing `box.whisper` must watch the vault,** or a live whisper stays on screen after a lock. Hosts need telling when the models are exported.
* **`e2e-status.md`'s decisions** are all still open.
