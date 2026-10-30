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


I rewrote `scenarios.md` against the sprint as finished (threads 1–8). The `code` column is now `plan`: it names the thread that produces each outcome, or `=` where today's code stands, or ✏️ where I corrected a plan defect. The seal is outside the plan, so rows that need it take the spec's outcome and are marked `seal`. It's still in the base checkout, not committed.

**Plan defects, each judged as fixed in the rows:**
- **P1, the trigger skips `'nil'`:** thread 3 has `hydrate` pass `ifAbsent: 'nil'`. But `hydrate` fetches through the trigger, which calls `tryFetch()` with no options. Left alone, hydrating a deleted box, or a draft with nothing stored, refuses `absent_box`.
- **P2, `del` and notices would refuse:** `ifAbsent` is checked where every answer passes, so `put`, `del` and watch notices meet it too. A `del`'s own answer is a tombstone, so under the default `'fail'` every successful delete would throw `absent_box`, and every deletion notice would arrive as bad news. Only `fetch` should check it.
- **P3, `ifPresent` almost never fires:** thread 8 checks it only when this device expects nothing stored. But `send` refreshes the box first. If another device already made it, that refresh adopts the stored box and drops the draft, and the `put` silently overwrites it. The fix I assumed: `send` notes that the box was never stored, refreshes, and applies `ifPresent` itself if the refresh found a record.
- **P4, the `LOCKED` marker:**
  - `Symbol.for('LOCKED')` can collide with any other library using that name.
  - The locked sidecar `{ [LOCKED]: true }` has a symbol key, which disappears when serialized. So the snapshot comparison sees a locke                                                                   d sidecar as equal to an empty one, and listeners aren't told when the lock comes down.
- **P5 and P6, small:** the plan's reading list still points to `src/utils/trigger.ts`, which moved to `src/helpers/`. And thread 4 removes `demandFull` "if nothing else calls them", but thread 4g's unseal guard calls it, so it stays, along with a message that still says "cannot be sent".

**Gaps the plan leaves:**
1. **Revision races:** a storage answer that lands mid-`edit` or between `edit` and `put` can stage a record at central's own revision number, or re-put storage's record and resolve with the patch lost. Three one-line checks would close these.
2. **The lock:** nothing re-renders the boxes when the lock changes, and an exposed whisper survives it.
3. **Lock checked after the fetch:** `edit`, `send` and `del` still fetch before refusing `vault_locked`.

The rest are smaller:
- a failed `del` keeps showing the box as deleted;
- a `stale_write` that carries no record loops;
- a dropped staged edit is invisible to the host;
- `vault_tok` drift is never checked;
- background refusals are lost;
- an older record still marks the box fresh;
- no code reports a damaged box;
- whether a staged edit reaches the cache is left to chance;
- `hello` and `goodbye` aren't safe to repeat.

Several earlier findings are resolved by the plan and gone from this list: the sparse-record cases, retrying a `del`, aborting when the lock comes down mid-verb, and the new revision on every edit.

Files are in this folder:
- [scenarios.md](whiteboard/20261028-storable_base/scenarios.md)