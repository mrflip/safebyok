# Sprint gripeoween_vault: vault.ts reads one method at a time

* **Date:** 2026-10-28. **Mode:** YOLO. **Review level:** medium. **Threads at once:** 3 (the
  four threads stack in one line, so one runs at a time).
* **Issued by:** the Coach (flip), `/sprint gripeoween-vault YOLO /turbochat`, with: *"your job is
  to modify interfaces there have been no public releases, do not include back-compat"*.
* **Status:** thread 1 filed (#336); thread 2 (#340) filing; thread 2b next. Sprint doc: https://claude.ai/artifact/EunK4WYVspRmtVNmnStttk

The Coach's request is the preplan beside this file, `gripeoween-vault-preplan.md` (copied from
the untracked `whiteboard/20261028-gripeoween/` in the main checkout), with its raw material
`gripeoween-vault-smells.md`. The preplan calls it one thread with a split point after step 4;
seven steps over a 1,975-line file, `device-db.ts`, `bank.ts` and `gating.ts` is plainly long for
one worker, so it is four threads, split where the preplan's steps fall apart.

## Read first

* `gripeoween-vault-preplan.md` whole: *The ruling* governs every thread; your steps; *Open for
  the Coach* and *Out of scope*.
* `gripeoween-vault-smells.md`: the sections your steps cite. Its line numbers are main's at
  `f84d61bb`, before #334; search by name.
* #334's thread file, on its branch: `whiteboard/20261028-heed_inline/heed_inline-thread.md`
  (`#onStorageRefusal`, the six storage sites, the latch tests).
* STYLE.md *Naming*, *Control flow and refusals*, *Comments and doc blocks*, *Tests*; *Stateful
  objects and snapshots* for threads 1 and 4.
* VOCABULARY.md for gating, lease, wayin, pantry, take up, raise a gating: those names stay.
* `packages/safebyok/src/vault.ts` by its banners (`grep -n '// == '`), never read through.

## Ground rules

* **Interfaces change outright.** No public release yet: a renamed or reshaped export, `DeviceDB`
  included, gets no alias, no deprecated twin, no shim. The changeset says what a host sees.
* **Behaviour stays.** This is a readability sprint: a test changes only where it names a private
  that moved, or a public shape this sprint changed. A behaviour change found on the way is a
  matter for the thread file's open questions, not a fix folded in.
* **Each preplan step is a commit, `pnpm justify` green.**
* **Names for privates in this sprint are the preplan's.** A thread that uses a name a later
  step was to give (`#becomeGone`, say) gives it then, and its thread file says so.
* **Size budgets.** `everything` and `Bank` hold vault.ts. Folding helpers should move them a
  little down, likely not across a rule line; run `pnpm size:budget` before filing and write only
  if the rule moves a line.

## The threads

### 1. `vault_refresh`: the refresh ladder and the device-record seam

> Preplan steps 1 and 2, verbatim in `gripeoween-vault-preplan.md`: *1. The refresh ladder
> (smells §1, §3; answers GW-21)* and *2. The device-record seam (smells §4; GW-27's rule)*.

*Gloss.* Touches `vault.ts` (`hello`, `refresh`, `#helloWithin`, `#refresh`, `#refreshOnce`,
`#takeStorage`, `#judgeStored`, `#takePicture`, `#raiseRecordAfter`, `#freshen`), `device-db.ts`
(`getDeviceRecord`, `raiseDeviceRecord`, `deviceRecordFor`), and `bank.ts`'s two sites. Do step 2
first: then `#loadFromStorage` is written once, its first await already
`this.#deviceDB.getDeviceRecord(this.#scope)`. `DeviceDB` is exported: its throwing forms now
validate, a patch changeset says so. Step 1 names `#becomeGone`, `#applyVault`, `#noteEpochSeen`:
give all three here, including the `#letGo` → `#becomeGone(refusal)` rename (struck from thread
4), `[letGo]` calling it with null. **Depends on** #334 (`20261028-heed_inline`), filed:
cut from its tip, PR "Stacked on #334". **Look-ahead:** thread 2's `#onRefused` will be every
public catch; `#doRefresh`'s fat catch should already read as a dispatch thread 2 can rename
without restructuring. **Size:** medium.

*Review:* fixed (#336). It dropped a caller-naming sentence from `deviceRecordFor`'s doc block.
Left: `#doRefresh`'s and `#loadFromStorage`'s doc blocks recite steps (to thread 4);
`raiseDeviceRecord` resolves null for a failing record where it could refuse at entry (later,
when `DeviceDB`'s entry checks are next touched); `notes/security.md`'s rollback-check entry
names a stale order (to thread 4, through the note's subagent).

### 2. `vault_boxes`: the box ladders and the failure plans

> Preplan steps 3 and 4, verbatim in `gripeoween-vault-preplan.md`: *3. The box ladders (smells
> §2, §3, §4)* and *4. Failure plans named for the act (smells §1, §2)*.

*Gloss.* `vault.ts` only, but most of it: `getBox`, `getWhisper`, `putBox`, `delBox`, the
`#listed*` family, `#ensureUnlocked`'s `shouldAsk`, `#demandAfterWait`'s four sites, the
`#heardRefusal` and bad-news families, `VaultCall`'s `'untrustedStorage'` (not exported: no
changeset beyond a patch). *Orchestrator:* the Coach ruled `useWhisper` uniform (2026-10-28: "no,
make it uniform"): the gone-check and the one catch like every other public method; sent to the
live worker as a directive. **Depends on** thread 1: cut from its tip once filed. **Look-ahead:**
thread 3 has gating reject raw and the vault's one catch convert, so `#onRefused(err)` must take
any throw, gating's included. **Size:** large; the preplan's split point falls after it.

*Review:* flagged (#340). Fixed: `#ensureUnlocked`'s doc block; the release note's "moved on"
line. **Significant:** put then delete a box and the snapshot lists the deleted box (a ring that
arrives mid-refresh shares the stale refresh; an old race the faster `putBox` made the usual
outcome), with three delBox tests re-timed to hide it. Sent back (YOLO, two-way): a ring
mid-refresh runs one more refresh after it, the tests un-retimed, a put-then-delete snapshot test;
a fresh worker, the first being near its context's end. Left: `#storedBase` → `#fillFromStored`
(to thread 4); `#told` kept ("told to onBadNews" is the host's wording); `ProvingTools.heardRefusal`
(thread 3 removes the tool); one overlong doc line.
*Orchestrator:* the rework (d53be040, a follow-up refresh after a ring mid-refresh and a ledger of
landed box writes) broke STYLE.md's "add no retry, refresh, re-read" and CLAUDE.md's "never a
check added to catch it earlier"; the directive was the orchestrator's mistake. Reverted in
2982245e (the force-push was refused, so history keeps both), and the Coach's design is thread 2b.
Thread 2 files with the three delBox tests still waiting on the watch.

### 2b. `vault_watch`: the VaultDB's callback carries the vault

> The Coach, in chat, 2026-10-28, on the deleted box that came back (thread 2's review): "why
> doesn't vaultDB call back with the correct information, killing any refresh in motion and
> asserting the correct state?" Then: "I wouldn't yet make it stop any refresh, but it shouldn't
> need to trigger one".

*Gloss.* Today `VaultDB.subscribe(scope, onChange: () => void)` is a doorbell, and the vault's
`#watchRefresh` answers each ring with a refresh through `oneAtATime`, so a ring during a refresh
joins it and is lost (thread 2's put-then-delete: the deleted box stays listed). After: `onChange`
receives the vault as stored (the checked `StoredVault` `getVault` resolves, or the refusal met
reading it), and the vault applies it through the same judgements a refresh makes (gone,
remade, behind, `isOlderPicture`, `#applyVault`), starting no refresh. A refresh in flight is
not stopped. Where the read happens: an adapter whose push is a doorbell (Postgres `NOTIFY`,
GraphQL's scope-only `safebyokVaultChanged`, IndexedDB's and local's bell, Convex's
`watchVault`, which answers a signature, not the vault) needs the base `VaultDB` to read
`getVault` on the ring and deliver that; each ring is delivered in order, an earlier read's answer
never applied after a later one's. Propose the shape in the thread file, then build it (the
Coach asked for interfaces to change; `VaultDB` is exported, so a changeset says what an
adapter author and a host see). Settle in the thread file: the device-record behind check and
the kept-lease read that `#loadFromStorage` makes beside `getVault` (the `DeviceDB` stays the
vault's to read); the watch-trouble path (a failed watch today rings so the vault meets the
trouble); STYLE.md's "no refresh or re-read in the core" (the read moves to the storage layer,
which is what the Coach asked). Then the three delBox tests go back to their unawaited form, and a
put-then-delete snapshot test pins the outcome. **Not** a counter of box writes in the stored
vault: a stored-format change, raised with the Coach, not ruled. **Depends on** thread 2.
**Touches** `vault-db.ts`, `vault.ts`'s watch section, every adapter's `doSubscribe` and their
conformance tests. **Size:** large. Thread 4's renames of `#watchStorage` and `#watchRefresh`
are struck: this thread names them.

### 3. `vault_tools`: one locking, and the gating and proving tools

> Preplan steps 5 and 6, verbatim in `gripeoween-vault-preplan.md`: *5. One locking (smells §2;
> Coach-gated)* and *6. The gating and proving tools (smells §4; interface change)*.

*Gloss.* `vault.ts`'s constructor and lockings, `gating.ts`'s tools interface, `proving.ts`'s
`[provingTools]` as the model. **Read `notes/guarantees.md` *The guarantees* before touching
`gating.ts` or the lockings.** YOLO calls, recorded as Open Matters: step 5's "if a flag is
needed, stop and ask" becomes *if one locking needs a flag, keep the lockings apart, share what
they share without one, and say why in the thread file*; step 6's "propose the shape before
cutting it" becomes *write the proposed shape in the thread file, then build it*: the tools are
internal (not exported from `index.ts`), and the Coach's invocation asks for interfaces to
change. **Depends on** thread 2b (was 2). **Size:** medium.
*Orchestrator:* the Coach took both YOLO calls above (2026-10-28, *Resolved*): they are rulings now.

### 4. `vault_residue`: the residue

> Preplan step 7, verbatim in `gripeoween-vault-preplan.md`: *7. Residue, one commit*, less
> `#letGo` → `#becomeGone`, done in thread 1.

*Gloss.* Renames, `#takeUp`'s merge, `#checkedBoxlabel`, and "picture" out of the doc blocks.
GW-02 (in the gripeoween todo shelf): `#picture` → `#snapshotAt`, ruled, not yet done: do its
`vault.ts` part here and say so in the PR, leaving GW-02's other renames (`RefusalPolicy.decide`,
`Proving.wrongProof`, Convex's `written`, `OutsideGating`) to their own PR.
*Orchestrator:* from thread 1's review, also: `#doRefresh`'s doc block states its contract (which
refusals it raises; a refused refresh leaves the snapshot as it stood but for its freshness), not
its steps; `#loadFromStorage`'s first line stops restating the return; `deviceDBShape`'s doc
(`shapes/bank-opts.ts`) names the throwing forms the bank now calls; and `notes/security.md`'s
rollback-check entry, which says the refresh judges "older than the picture" before the behind
check, gets an amendment through a `sonnet` subagent (the note's header says how). **Model:** `sonnet`,
small and mechanical. **Depends on** thread 3. **Size:** small.
*Orchestrator:* two rulings of 2026-10-28 land here too: `#goneBy` keeps its factory, with a
comment saying why; and `#replaceSnapshot` stops deciding "changed" by `stableJsonify` of the
whole snapshot, comparing with es-toolkit's `isEqual` instead (the Coach: "this seems weird and
hand-rolled. Can you use something from es-toolkit?"; es-toolkit is already a core dependency).
That is a behaviour-bearing change to the snapshot, so the model is no longer `sonnet`: the
worker inherits the orchestrator's. Struck: `#watchStorage`/`#watchRefresh` → `#subscribeToStorage`/`#refreshOnRing` (thread 2b
names the watch). Also `#storedBase` → `#fillFromStored` (GW-02's
`vault.ts` part, STYLE.md's own example), from thread 2's review.

## For the Coach

* The preplan's four *Open for the Coach, not blocking* items are rows in *Open Matters*, each
  with a call the threads will follow unless you rule otherwise.
* `whiteboard/20261028-gripeoween/` is untracked in the main checkout; this sprint carries only
  its two vault files.
