# storeable_base: seed (2026-10-28)

The Coach, in chat, 2026-10-28, after cancelling `gripeoween_vault`: a sprint to implement a
client-side `Storeable` base class, built independently of box and vault against its own contract
and tests, and matched to them only once that contract is tight.

## Read first

* `whiteboard/20261028-gripeoween_vault/gripeoween_vault-consistency.md` (untracked in the base
  checkout; committed on branch `20261028-gripeoween_vault`): the consensus, the six lanes, the
  versioning rules, the session guarantees and the tests that pin them, and **section 9**, which
  is this sprint's brief.
* `whiteboard/20261028-gripeoween_vault/gripeoween_vault-plan.md`, thread 4's *Orchestrator*
  paragraphs: the horizon names (`maxMinutesSinceRefresh`, `minMinutesToAutolock`, and their
  millis forms), `#ensureUnlocked` → `#doEnsureUnlocked` under one shape with its public verb,
  the salt (512 B) and `credential_id` (1023 B) bounds. These rulings stand.
* `whiteboard/20261028-gripeoween/gripeoween-todo.md`: the rows that point here.

## Open for the Coach at seed time

* Whether *autolock* enters VOCABULARY.md (the plan assumes it does).
* Whether `gate_epoch` stays beside `vault_revseq` (the orchestrator's call: it stays).
* Names for the split box write (`putBox`, `putSidecar`, `putWhisper` proposed).
* Section 10 of the consistency note is a TODO, deliberately.

## Skeletons, 2026-10-28

Written in the base checkout for discussion, no doc blocks, each step of a verb a named call:

* `packages/safebyok/src/models/storeable.ts` -- the `Storeable` base class: `get`/`put`/`del` as
  try pairs, `ensureTimely`, snapshot and `subscribe`, `settleOwnOp` as the one hooked policy for
  what an own operation's answer does to the cache, and the abstract `do*` hooks.
* `packages/safebyok/src/utils/timed-launcher.ts` -- `TimedLauncher`: `launchAt` and the three
  `last*At` times (read as one `timing`), `isTimely`, `snapshot`, `ensure`, `launch`/`tryLaunch`
  (a call made during a run joins it), `scheduleLaunchAt`, a timer.

Both typecheck and lint clean. Questions the skeletons raise, for the Coach:

1. Spelling: the dictionary has *storable*; the sprint and §9 say *storeable*. Pick before any
   import names it.
2. `world` is not in VOCABULARY.md. The consistency doc said "circle" for vault+core.
3. The base class takes no vaultDB: the subclass's constructor does, and its `doGet`/`doPut`/`doDel`
   close over it (STYLE.md, a collaborator gets what it needs when it is made).
4. Uniform version fields on every stored thing: `revision_tok` (today's name) and `revision_seq`,
   or the per-thing `box_revseq` the consistency doc wrote. The base wants one spelling.
5. `takeAnswerWhileLocked` is the same as unlocked for now: the lock-landed-mid-operation policy is
   the one open branch of `settleOwnOp`.
6. `oneAtATime` returns `Promise<void>`; the launcher keeps its own `running` to hand the outcome
   back. Either `oneAtATime` grows a valued form or the launcher stays as written.
7. The launcher's timer fires `tryLaunch` at `launchAt` on its own. Whether a library should make a
   storage read from a timer in an idle tab is policy, not mechanism.
8. `get sparse` and `toJSON` read through the snapshot, as STYLE.md asks; `get()` is the purposeful
   read, `ensureTimely()` the lazy one, and there is no `refresh()` beside them yet.

## Second pass, 2026-10-28

Rulings taken into the files: `Storable` and `storable.ts`; `Trigger` in `utils/trigger.ts`;
`revision_tok` and `revision_seq` on every stored thing; the timer stays, a mechanism; no `ckey`,
no listing in the base, no clock of its own (the world's); `vaultDBGetSelf` / `vaultDBPutSelf` /
`vaultDBDelSelf` as the compromise facade until the vaultDB verbs are renamed (`fetch`, `replace`,
`retire` or the like) and `get`/`put`/`del` go to the customer; public verbs return the instance;
one precondition (`ensureTimelyStorability`) and one drift check (`demandStorability`) after every
await, both defined by the subclass; the throwing form is written and the try form wraps it.

`get()` holds the lifecycle undried: listed version, stored record sought now, consequences for the
world then self, the live instance (`this`), the snapshot. `cachedRecord`, `fetchRecord` and
`timelyRecord` stand as named primitives for the call-chain discussion, not yet called by `get`.

Still open: the lock-landed-mid-operation policy; `world` in VOCABULARY.md; a null `record` in an
answer reads as absent, so a conditional "unchanged" answer needs its own shape when it comes.
