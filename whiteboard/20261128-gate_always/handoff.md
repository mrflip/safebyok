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

* **`bank.life` is removed, "as other unneeded code is too"** (the Coach, 2026-11-28). Done, with `BankLife`.
* **`Bank.makeThing` dispatches by modelkind to the right `make`, "which actually knows what to validate"** (the Coach).
  Done: `Box.make` now checks its bank's scope, as `Gate.make` does.
* **`bank.stats` "should not look for trouble it doesn't need"** (the Coach). Done: it demands no live roots.
* **`need_user` only where it is honest** (the Coach): "if a natural condition check is clearly due to the absence of a
  user, that will be a better refusal name than the second order consequence of it... But I don't want code with more
  branching, or claiming a reason which is a guess. For react, same thing." It replaces the earlier ruling above.
* **Callers pass the gate and the callee picks; `gate.life` and the nested `ProvableGate` go; `GateLife` names the six
  bound fields** (the Coach: "Go for it"). The places that use the shape "can slice down if needed; chances are decent
  they don't need to: consistency checks only insist on overlapping fields being equal."
* **The bank hands the gating's friend what it needs of the device; `gate.device` goes** (the Coach: "That sounds right").
* **The bank trusts its stage** (the Coach: "Perfectly put"): "The bank learns what it has at its lifecycle verbs, once.
  Code that runs inside a stage trusts that stage." The test: "if the false branch can be reached only by a mis-built
  bank, or by a stage the caller cannot be in, delete the check." Without `as` casts: "Throwing accessors or stub mimics
  help." It does not remove a branch whose two answers are both normal, a public entrypoint's one guard, or validation of
  what storage or a host hands in.
* **`areRootsLive` is the VaultMinder's, and the bank forwards** (the Coach: "Go ahead on your proposals").
* **Unread public members go**: the gate's forwarders to the bank, its unread record getters, and the bank's `banktok`,
  `tryStats`, `tellBadNews`, `leaseLoggable`. The gate's form verbs and `Bank.birth` stay (the same go-ahead).
* **"Leave react react-y"** (the Coach): `const unlock = bank.useUnlock()` stands, and VOCABULARY says so.

## Open, awaiting the Coach

1. **#952 wants a `thread-reviewer`** (opus) before it leaves draft, once the two rounds under way are in.
