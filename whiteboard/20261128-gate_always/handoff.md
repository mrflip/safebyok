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

* **Before sign-in, a "need user" refusal** (the Coach, 2026-11-28). Built as the kind `need_user`, thrown by
  `needUser()`, in the core. safebyok-react's own no-user refusal still throws `absent_vault`: not ruled.
* **No gate when there is no user** (the Coach, 2026-11-28, "I don't feel strongly about it"). The boundary stays;
  eleven checks in the core's `src/` cover it, one of them about the gate (`areRootsLive`). No stand-in gate is built.
* **VOCABULARY forbids unlock as the name of an object, not as a noun** (the Coach, 2026-11-28): "code-wise it's an
  action, with adjectivally unlock events". Done. Prose such as "an unlock in another tab" stands.
* **Report a refusal that changes, never hold clean code back for it; back compat is out of bounds** (the Coach,
  2026-11-28): "not necessary, not wanted. There's been no public release."
* **An obvious Goofus pass** over `bank.ts` and `gate.ts` (the Coach, 2026-11-28). Done: nine commits, no contract changed.

## Open, awaiting the Coach

1. **`bank.life`**: read by nothing in any `src/`; VOCABULARY calls it "a view, bound into nothing by itself". The
   agent's recommendation, firm: delete it with `BankLife`, `BankChecks.life` and `StampChecks.bankLife`.
2. **safebyok-react's no-user refusal** throws `absent_vault` with its own `NobodySignedIn` phrase, in `react-giver.tsx`.
   The agent's lean, firm: make it `need_user` too, one name for one thing.
3. **`const unlock = bank.useUnlock()`**, three times in safebyok-react, breaks the softened rule. The agent's lean:
   `unlocking`, loosely.
4. **`bank.stats()` demands live roots it does not use.** The agent's lean, moderate: drop `demandRootsLive`.
5. **`Gate.make` repeats the bank-scope check `bank.makeThing` ran.** The agent's lean, loose: drop the gate's.
6. **#952 wants a `thread-reviewer`** (opus) before it leaves draft, once the rulings above are built.
