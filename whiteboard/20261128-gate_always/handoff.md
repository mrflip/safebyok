# gate_always: handoff, 2026-11-28

A workshop (`/workshop`): the Coach and the agent decide by consensus, and workers build each round.

## State

* **The stack, bottom first:** #949 (1 commit), #950 (4 commits by code area, with #951's `ante` to `prior` and
  `bankRows` to `bankRecords` renames moved in), #951 (1 commit), #952 (this thread, draft).
* **#950's first three commits are red on purpose**: the renames are split by area, and only its tip builds. Its tip is a
  tree that did not exist before the squash; CI proves it, not a local `pnpm justify`.
* **The pre-squash tips** are `6f2859b` (#949), `549c208` (#950) and `5d25b04` (#951). No tag for them is pushed.
* **#950's and #951's bodies** still describe the split as it was before the renames moved; their titles are corrected.
* **#952** has the bank's gate change (`d515f3f`), the hunt's eleven commits by rule family, four comment fixes in
  `bank.ts`, and a security.md entry. `pnpm justify` is green on its tip. It has had no `thread-reviewer`.

## How the Coach wants the work run

* Obvious corrections only in a hunt: no up-down calls brought back, bar one that recurs and needs a single ruling.
* Each subagent's model is chosen to suit its task, and named in the spawn.
* The bank does not check whether it has a gate or whether the gate is live: an operation that needs a live gate fails
  at its own existing check.

## Rulings

* **Squash #949 as it is; move #951's mechanical renames into #950; squash each, #950 by code area, with no justify
  run on each commit** (the Coach, 2026-11-28). Done.
* **A bank always has a gate, whatever its stage: at times the gate models the shell** (the Coach, 2026-11-28). Built
  in `d515f3f`, from sign-in on. Before sign-in there is no userid to make a gate under: `bank.gate` refuses
  `absent_vault` there, and `areRootsLive` answers false. The Coach has not ruled on that boundary.

## Open, awaiting the Coach

1. **"unlock" as a noun**, about 25 times in the core's comments and test titles, and in VOCABULARY.md's lease row. Which
   words replace it? The agent's lean: "the unlock gating", held loosely.
2. **`bank.life` over a gate's tombstone** answers the life that ended. Should it refuse? The agent's lean: leave it,
   held loosely; nothing in the core reads `bank.life`.
3. **The boundary before sign-in** (above): accept it, or give the bank a gate with no user?
4. **`models/gate.ts`** was not swept by the hunt.
5. **#952 wants a `thread-reviewer`** before it leaves draft.
