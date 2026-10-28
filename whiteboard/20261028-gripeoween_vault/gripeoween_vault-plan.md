# Sprint gripeoween_vault: vault.ts reads one method at a time

* **Date:** 2026-10-28. **Mode:** YOLO. **Review level:** medium. **Threads at once:** 3 (the
  four threads stack in one line, so one runs at a time).
* **Issued by:** the Coach (flip), `/sprint gripeoween-vault YOLO /turbochat`, with: *"your job is
  to modify interfaces there have been no public releases, do not include back-compat"*.
* **Status:** thread 1 filed (#336); thread 2 next. Sprint doc: https://claude.ai/artifact/EunK4WYVspRmtVNmnStttk

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
changeset beyond a patch). **Depends on** thread 1: cut from its tip once filed. **Look-ahead:**
thread 3 has gating reject raw and the vault's one catch convert, so `#onRefused(err)` must take
any throw, gating's included. **Size:** large; the preplan's split point falls after it.

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
change. **Depends on** thread 2. **Size:** medium.

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

## For the Coach

* The preplan's four *Open for the Coach, not blocking* items are rows in *Open Matters*, each
  with a call the threads will follow unless you rule otherwise.
* `whiteboard/20261028-gripeoween/` is untracked in the main checkout; this sprint carries only
  its two vault files.
