*Exported from the sprint doc's Closer Look tab. The Coach's replies were highlighted there; the export dropped the highlighting, so each reply runs on as plain text after the item's last `path:line`.*

# Closer Look

A cold read of the sprint's code by an `opus` agent, for the question of whether something worrying means the guidance was off, the solution was off, or the problem wants redesign. It read `src/models/` and `src/storage/` at `28829114` (threads 1 to 11; the bank is out) and searched the design draft. It did not read thread files, PR text, the YOLO calls or `notes/security.md`. Where an item says "probe", it ran a throwaway test against a scratch copy. This is its evidence, not a verdict, and I haven't checked its claims against the code.

Flavours: *guidance gap*, the draft is silent or incomplete; *guidance wrong*, following the draft produced this; *solution off*, the draft is fine and what was built isn't; *redesign?*, the problem may dissolve or may not need solving. Eyebrows come first because their top items matter most. Undergrowth is mostly what the draft drew.

## Draft for triage

A first sorting of all your replies, for us to go through. **Nothing here is scheduled**: threads 18, 19 and 20 below are held until we've triaged, as you asked. Doc strip (17) is done apart from its restack. "Later thread" means whatever shape we pick.

**You're looking into it; I'll leave it alone:**

- `fateOver` and `SlotFate` (*"the fate code is going to get out of control"*). Start at `models/listing.ts:231`, `models/vault-listing.ts:185` and `models/storable.ts:317`, and `whiteboard/20261103-unrace/thread-8-vault_slot.md` on `20261103-vault_slot`, which says why it came to be.
- Reflective property installs: `tattoo`, `adorn`, `decorate` (*"only part of that is purposeful"*).
- Reach-ins against the host's objects, in `spendClears` and `checkedClears` (*"I assumed that the buffer exhaustion was best practice"*).

**Your word was "after the sprint" or "after e2e":**

- Fire-and-forget (*"invesrigate after sprint not good"*).
- `ProveForGatingkind` and the gating family (*"repair after e2e if we can"*); e2e is now met, so this could come sooner if you like.
- The answer frame (*"redesign as we decommission the old code"*). See the correction below: it isn't old code.

**Plain instructions, ready when you say:**

- Remove damage (*"We need to remove this"*): waits on your answer about what a bad row does.
- Box listing asked for directly, `getVault` answers the row alone; `#isGreeted` and first-box vivification go, and `vault.hello` gets its listing.
- No Zod in a store's atomic step; `doCacheDeviceRecord`'s closure goes.
- Refusal factories select what goes on the error and its `meta`.
- Sparse vault finished, and the weak tests.
- `demandEnabled` called only from the `demandReadyToFoo` guards.
- The friend-identity check goes (and with it `_cheat_leaseFriend`, if you flip that row).
- Outcome round trips fixed; `try*` and throw forms trade bodies where a `try*` wraps a body, and `valOf` the same way.
- Callback parameters that select a branch; *"don't use null as a sentinel"*.
- Types, refusals and checks into dedicated files. That overlaps thread 14, which is going ahead with what it already had.

**Questions of yours still open:** the residue and new-names lists, and my suggested `undergrowth` thread; bad news in `deliver`.

**Going ahead meanwhile, as they predate Closer Look:** the restack of 13, 15 and 17; thread 16, `method_ends`; thread 14, `shapes_sweep`, last.

## Where your replies went

Eyebrow numbers are the list below. Say if I've misread any.

- **12, doc blocks:** thread 17, doc\_strip, building now. 55 of 449 blocks are over two lines. Each gets a purpose line opening `SLOPDOC:`, and methods that can't be described that way go on a smell list.
- **1, the `do*` seam:** thread 18, plain\_seam: no Zod in a store's atomic step, only conditions on fields, and `doCacheDeviceRecord` loses its closure.
- **2, a refusal's row:** thread 18: `world` and `dbhas` stay on the answer, and refusal factories choose by selection what goes on the error and its `meta`.
- **3, sparse vault:** thread 19, world\_whole: `Vault.takeWorld` takes the whole row, and what the sparse state paid for goes.
- **5, box lists:** thread 19: one code path populates a box listing, and `vault.hello` only triggers it.
- **10, weak tests:** thread 20, test\_teeth.
- **4, `ensureUnlocked`:** the code stands, and thread 14 makes the tree say why it asks `ensureTimely` first.
- **7, rebirth:** both stay, as you said. Thread 19 looks at the box's machinery you called a little sus while it's in `listing`, and says what could go.
- **6, bad news:** your question is with a `sonnet` agent; its answer comes back here.
- **9 and 11, residue and new names:** your two questions are with an `opus` agent; its answer comes back here.

Threads 18, 19 and 20 are held until we've triaged; see *Draft for triage* above.

## Your question on bad news

*"Do those code paths (including build) have bad news they're unable to report ?"* Almost nothing is lost where a caller is present, because a throw reaches it. What's lost is on the paths with no caller, mainly the watch, plus a few drops by design. The `badnews` return value serves none of these, as `settle` and `receive` never produce any; a direct `tellBadNews` at each site would do. Nothing here is built on yet, as you said you don't know the right thing. From a `sonnet` agent's reading of `bc37d226`, unchecked by me.

**What goes unheard:**

- The watch's `safeParse` of a damaged or newer-format row, or of its world row, returns silently, with no caller. `storage/vault-db-new.ts:313,319`
- `fateOver` answers `lose` for an older vault record, and it's dropped silently: a caller on fetch, put or del gets no refusal, and on a notice there's no caller. `models/listing.ts:231`
- An older box record goes to `receive`, where `reconcileCentral` answers policy `older`, and it's dropped silently. `models/storable.ts:392`
- `Vault.takeWorld` ignores a world of another `vault_tok`, and discards `receive`'s result. `models/vault.ts:87-90`
- `#onNotice` returns silently for a disabled listing, and for a row failing `isOwnRow`. By design. `models/listing.ts:277`
- `fetchBank`'s `Promise.all(vaults.map(build))` throws the first rejection and drops the rest. `models/vault-listing.ts:218`
- Damaged box rows are only set aside in `damaged_records`, never told, where `fetchBank` does tell damaged vault rows. `models/vault-listing.ts:177`, `models/box-listing.ts:51-56`
- `ensureVault` with `ifPresent: 'get'`: another vault in the slot is a success, and the typed birth is discarded, so the caller must compare `vault_tok`. `models/vault-listing.ts:73`
- `held?.vacate()` on `replace`: the replaced vault goes silently, and a failed lease erase goes to `onPanic`, not `onBadNews`. `models/listing.ts:239`

**What does reach `tellBadNews` today:** the record a `stale_write` or `camped` carries, when delivering it throws (`listing.ts:217`); any throw met in `#onNotice` (`listing.ts:282`); `tellIfRevoked` (`listing.ts:337`); damaged vault rows in `fetchBank` (`vault-listing.ts:103`); box news routed up (`vault-listing.ts:180`); a device record rewritten and a lease scan refused (`bank.ts:155,200`); a lease peek, cache and vacate, and an erase after a tombstone (`vault.ts:204,257,288,428`). And `thing.receive(record).badnews`, always `[]` (`listing.ts:235`). `tellBadNews` doesn't filter by family, so `record_conflict`, a condition, is told too.

**My read:** the `badnews` return and `policy` can go, in thread 19. A watch dropping a damaged row silently looks like the one real gap, as nothing else will ever say so. The rest can wait for your design. Say if you want either.

## Your question on residue of the spec

*"Is there residue of agents trying to satisfy those over common sense and good practice?"* Yes. An `opus` agent read `bc37d226` cold, before threads 13 and 15, and I haven't checked it. Spec files: MI `models-invariants.md`, UG `unrace-gating.md`, VI `vaultdb-invariants.md`.

1. **`gate_issue`: a checker loosened so a table row can fire.** `vault-db-shapes.ts:88-92` admits the other wayin as `unk.optional()`, by its comment so the vaultDB can refuse it `gate_issue`. The branches are at `vault-db-new.ts:208,219,231`. `vault.ts:120,135,142` never send it, so only a storage test reaches them. `:246` compares `registered_at` after `isRowAt` matched the revision, and only a forged param reaches it. Mirrors VI:130. Plain: `.strict()` refuses, with no branch.
2. **`lease.attach` to `friend.attachLease` to `vault.#attachLease`.** `lease.ts:76`, `vault.ts:241`; mirrors UG:159-161. All four callers of `lease.attach()` already hold the vault, and the hop then needs policing: `leaseOfOtherHolder` (`vault.ts:242`) and `leaseNotInForce` (`:243`) can't fire through `attach`. Plain: the vault attaches its own lease.
3. **Lock chained to boxes, doing nothing.** `vault.ts:310`, `Listing.lock`, `Storable.lock`, which only settles; at that commit `BoxSnapshot` had no lock field, so no listener heard. Mirrors MI:3,91,284. Thread 13 has since made a box's snapshot show the lock, so this one may now earn its place.
4. **A late attach erases what a sweep promised to keep.** `vault.ts:244-249` calls `#vacateUnattached`, erasing by scope and `vault_tok`; mirrors UG:162,191-192. `vault-unlock.test.ts:148` pins "the row the sweep left erased", against `bank.ts:188`'s "cached lease left". `vault.ts:265` also vacates a lease never cached. Plain: `lease.evict()`.
5. **Refusal kinds taken from a table's word.** `declineAtDiscard` (`gating.ts:145`) answers `locked_while_asking` to a sweep or vacate with no lock involved, even on a `del_vault`, which ignores a lock; the word comes from MI:215, and plain is `disabled`. `gating.ts:260`, kind `gating_landed` (MI:295), fires after a decline or lock where nothing landed.
6. **`ifAbsent: 'fail'` exists twice.** `vault-db-new.ts:124,128,144` carry VI:100-110. The models always ask `'nil'` and do `fail` themselves (`listing.ts:211`), so these branches are reached only from storage tests. Of the vaultDB's acts (VI:59), models read only `void`.
7. **`leasesProvedBefore(cutoff)` copied without a scope** (UG:206,512). The bank fetches every bank's rows and filters (`bank.ts:203,207`), and passes `FarFuture` to mean "all mine". Plain: pass the bank scope.
8. **The seal's end checked twice.** `lease.ts:122` refuses at the seal's end; `box.ts:146` and `box-listing.ts:87` re-check a few microtasks later. `vault.ts:357` checks at `getBox`'s end, though it hands back only ciphertext. Echoes UG:229-231.
9. **Named for a tree's line.** `#renewLease` (`vault.ts:261`), `demandReadyToAttach` (`vault.ts:238`), `gate.demandPasskeyAddable` (`gate.ts:42`), each one caller. `Gate.make` (`vault-listing.ts:70`) builds a Gate only to pickle it. `vaultListing.ensureVault` is one line over `putDraft`, and MI calls it "the only seam" that replaces, though any notice replaces through `fateOver`.
10. **Tests: little.** Going by the titles of six model files and the vaultDB's, they mostly name behaviour. Exceptions: `bank.test.ts:252`, and items 2 and 4.

## Your question on the new names

*"a lot of these method names are nowhere contemplated in the design docs, investigate?"* The old pool explains less than you hoped: of the cold reader's six duplicates, only `leaseNotInForce` predates the rewrite. `vaultRowOf` does three jobs under one name; `adapted`'s difference looks earned; `Awaitable` and `ckeyOf` are harmless one-liners.

**Fine:** vault verbs (`#call`, `answerOf`, `#moveGate`, `#landVault`, the `do*` calls); adapter predicates (`isRowAt`, `isLiveRow`, sentinels, `damaged*Of`); the gating's provers (`ProveForGatingkind`, `timelyAnte`, `checkedClears`, `spendClears`), as they carry G1, G2 and G8; listing plumbing (`fateOver`, `priorOf`, `recordOfAnswer`, `recordOfRefusal`, `delOver`, `putDraft`, `#deliverStored`); `try*` one-liners. This agent and the cold reader disagree on some of these, such as `#call` and `fateOver`.

**New thinking, undergrowth:**

1. **Erasing a lease: two primitives, nine names.** The primitives are `lease.evict` and `deviceDB.tryVacate`, and the design has three names. Added: `#dropLease`, `Vault.#vacateLease` (taking `onRefused`), `#vacateUnattached`, `lease.vacate`, `lease.tryVacate`, `uncacheForgotten`, `Bank.#vacateLease`, `#vacateLeasesProvedBefore`. A refusal gets one of three policies: panic, bad news or a logger warning. `Bank.#panic` and `Vault.#panic` differ only in the vacate.
2. **Outcome round trips.** `lease.tryCache` to `cache` to `valOf(friend.tryCacheLease)` to `deviceDB.tryCache` to `cache` (`lease.ts:81,84`); `lease.ts:93,96` does the same, and `vault.ts:279` is `outcomeOf(valOf(...))`. Plain would pass the Outcome through.
3. **The gating relay.** The lock path is `vault.lock`, `listing.declineGatingAtLock`, `gating.declineAtLock`, `declineAtDiscard`, `#endAsking`, `#settleOnce`. `holdGating` and `releaseGating` wrap small bodies, and `bank.ts:181` reaches in through `openGating`. The design names only `declineAtLock`; `openGating` plus one decline with a refusal argument could likely carry it.
4. **The vault's get, handled twice.** VI's boxes-on-`getVault` row forces `fetchListed`, `vaultRowOf`, `NothingListed` and `boxListing.hello(listed?)`. The design causes this one, not the agents. Thread 19 takes it.
5. **One-caller wrappers over a line or two.** `#demandBirthSlot`, `#makeFriend`, `stageOf`, `demandNotHeld`, `damagedAt`, `fullRecord`. `#runReplacePassphrase`, `#runAddPasskey` and `#runDelVault` have one caller each while revoke is inline, so no rule decides it.
6. **Renames and coinages.** `#bringUp` for MI's `bank.#hello`, `fetchBank` for `bank.getBank`, `#cacheDeviceRecord` for `#keepDeviceRecord`. No design word: `SlotFate`/`lose`, `#isGreeted`, `sweepContents`/`vacateContents`, whose two hooks have identical bodies (`box.ts:179,181`).

**Harmless copying, to go when the old pool goes:** `passphraseKeyOf`, `deriveKeyBytes`, `isAllZero`, `isSharedMemory`, `parseJsonOrNull`, `isCorrectable`, `checkSecureContext`, `jsonBytes` from root `src/`; `lockState`, `ensureTimelyWorld`, `vaultTokOfWorld`, `stampDna`, `becomeNotifiable`, `tombstoneFor`, `ensureReadyToDel`, `demandReadyToDel`, `demandFull`, `goodbye`, `evict`, `isForgotten`, `isInForce` from the old models.

**My read:** a thread 21, `undergrowth`, could take items 1, 2, 4, 5, 6 and 7 of the residue, and 1, 2 and 3 of the new names, after thread 20 and before the end-of-method checks, so the checks land on less code. I haven't planned it: your call.

## Smells from the doc strip

Thread 17 stripped all 55 long blocks to one line each, every one opening `SLOPDOC:` (`rg SLOPDOC packages/safebyok/src`). These 13 are the methods that wouldn't honestly go in a line, worst first, from the worker's own list. Line numbers are at `20261103-doc_strip`; the methods are unchanged, and the review is running.

1. `models/storable.ts:339`, `reconcileCentral`: its job is a table of life by age by shape, some 15 rows. "Judges" hides all of it, and the rows are the behaviour.
2. `models/listing.ts:189`, `deliver`: takes the world, delivers the record, picks which of two refusals to throw, tells the other as bad news, and applies an absent rule true only of a fetch. Five jobs called a pipeline.
3. `models/models-shapes.ts:142`, `boxDna`, `boxPatch`, `boxPut`: three contracts whose required, stripped and refused fields read only against each other.
4. `models/box.ts:133`, `send`: an edit, a rebirth over a tombstone, and under `ifPresent: 'get'` a call that discards its patch and answers what is stored. Three jobs under one verb.
5. `models/vault.ts:366`, `putBox`: `send` where a box is held, a fetch first where the whisper is left out, a birth where none is stored, with its own opts split for each.
6. `models/listing.ts:210`, `#buildOrReceive`: builds, or receives, or replaces and vacates the old one, snapshots after, and refuses a late answer. The name itself says "or".
7. `models/box.ts:91`, `whisper` get and set: the setter exposes, or forgets by null, or forgets by `LOCKED`, seals nothing, and demands unlocked on only one branch. A property that doesn't act like one.
8. `models/storable.ts:95`, `assign`: `registered_at` is judged against the central `adopt` has yet to replace, so the method is right only by its caller's order.
9. `models/lease.ts:45`, `peek`: named as a look, and it erases a lease of another epoch or stamp on the way, while a damaged row and a row of another `vault_tok` stand.
10. `models/vault-listing.ts:80`, `ensureVault`: one line calling `putDraft`; it shares a name with `bank.ensureVault`, which does far more, and succeeds with another's vault, told only by `vault_tok`.
11. `models/vault-listing.ts:58`, `buildVault`: asks, stores, holds and unlocks, or answers another's vault locked; a lease refused past the put leaves it stored and held, locked. Two results and a half-way state.
12. `models/listing.ts:169` and `models/vault-listing.ts:134`, `del`: the base goes over the revision held unless a damaged entry names its own, and the override goes over `ante`'s own always. The revision is the point, and the two disagree.
13. `models/listing.ts:235`, `#makeThingOf`: born of the record's sparse form over a central never stored, a move that makes sense only by way of what `receive` then does with it.

The review adds two, and found the other 13 honest. `storage/vault-db-new.ts`, `doDelVault` and `VaultDB.delVault`: abstract, so its line is a store author's whole contract, and a row off `prior`, an unnamed damaged row and a repeat all act differently. `models/storable.ts`, `receive`: beside judging, adopting and settling, it stamps `#refreshedAt` under its own rule and reads a null as a tombstone at the revision held.

## Answers to your Undergrowth questions

From a search of the line at `bc37d226` and the reports. I've read your replies down to "Outcome to throw to Outcome", and am planning nothing from them until you say you've finished.

- **"Is the damage contained to here (vault db new touching old adapters)?"** Contained, yes, but it isn't old code. `#call` and `adapted` aren't on `main`: thread 2 wrote them this sprint in `vault-db-new.ts`, and `device-db-new.ts` copies the shape. Nothing touches an old adapter: nothing outside `safebyok`'s `src/` and `tests/` imports either file, and the convex, graphql, indexeddb and postgres adapters still extend the old `VaultDB`. So "that is why we are moving away from the old code" doesn't cover these, as they're where we're moving to. You may want to reread those two replies with that in mind.
- **"I hope none of that makes its way to vaultdb's outer interface?"** Part of it does. `#call`, `Said` and the thunks are private. But the answer's frame is exported: `GoodAnswer`, `BadAnswer` and `AnswerFacts` give every `try*` answer `meta.call`, `req_params`, `act`, `world` and `dbhas`, and a thrown refusal carries the same on `err.meta`. Eyebrow 2 is that route.
- **"I don't think anything uses get vault except for its listing?"** Close. `tryGetVault` has two callers: `fetchListed` (`vault-listing.ts:188`), which wants the list, and `tryGetRow` (`:226`), behind `vault.fetch`, which wants the row and throws the list away. So a `getVault` that answers the row alone, and a separate verb for the box list, fits both.
- **"This is in a private method with one or two callers?"** `Vault.#attachLease`, one caller: the friend's `attachLease`, reached only by `lease.attach()`, whose callers already hold the vault. The check can't fail by that route: only `_cheat_leaseFriend` reaches it. So your reply and the `_cheat_leaseFriend` row point the same way.
- **"is that brilliant or cope-ium"**, of `queueMicrotask`: closer to the second. It doesn't emulate a real store's fuzz: it fixes one order, so a notice always lands before its answer, and the other order runs only where a test forces it. Thread 20 can run both orders.
- **"i have never heard of fate of where did this come from?"** Thread 8 coined it, for your ruling "routes each record by scope and vault\_tok". No spec uses the word.
- **"damage is an agent obsession I thought I'd ruled out"**: the record says otherwise, so please check. `noted.md:41` has "A damaged record is set aside, and nothing acts on it (the Coach, 2026-11-02)", with `damaged_records` as a side channel of tombstones with sentinel values, and threads 2, 6 and 8 built that. About 95 lines in `models/` and `storage/` mention it. Removing it needs one answer: what does a row failing its check do? My suggestion is CLAUDE.md's own rule, it fails safe by refusing `damaged_record` at the verb that met it, with no sentinels, no `am: 'd'` and no side channel. But `getBank` then has a choice to make when one row of many is bad: refuse the whole `hello`, or skip the row and tell the host as bad news. I'd skip and tell, so one bad row can't lock a user out of every other vault.

Still open from that thread: 57 short blocks under the bound still name a `Refuses`, and some lines point at a block that no longer says it (`as {@link replacePassphrase} does`). There's a row for them.

## Anything else that might raise an eyebrow (ranked)

1. **The vaultDB's `do*` seam has invariants a remote store may be unable to run.** The pre-plan says "the base holds the invariants, and a subclass writes only generic calls, each atomic on `revision_tok`". But `doPutBox` must write only where the vault row, "passing its checks", is live, and `doDelVault` must decide across three kinds of row and tombstone every box, all in one transaction. The memory store does this with a three-way `isStopped`, Zod `safeParse` and `VS.isDamagedVaultAt` inside the atomic step. A conditional update in GraphQL/Postgres cannot run those predicates unless the package's validators live on the server. Nothing has been written against this seam except a store where "one JavaScript step is one transaction". What would settle it: writing the `do*` set for the demo's real backend on paper.
2. Nothing has been contemplated that involved running zod inside a transaction, I think the "its checks" may have been loose language.
3. &#32;*Guidance gap, perhaps redesign?* `storage/vault-db-new.ts:88`, `storage/memory-vault-db.ts:67`
4. **A refusal carries the whole stored row, gate included, on an enumerable `meta`.** `stale_write`, `camped` and `vault_gone` put `world` and `dbhas` on the `VaultError`, and `listing.deliver` throws that same error to the host. Probe: `JSON.stringify(err)` on a `stale_write` contains `vault_key_wayin_wrapped` and the salt, so a host's error logger gets exactly what an offline passphrase guess needs. The class doc says `meta` holds no secret material, and `gate.test.ts:67` insists a gate refusal quotes "no ciphertext", so the code disagrees with itself on whether this counts. The draft puts `world` and `dbhas` on the return value and is silent on the error object. What would settle it: a security reviewer's call on whether a wrapped key may reach logs. *Guidance gap.* `storage/vault-db-refusals.ts:15`, `storage/vault-db-new.ts:334`` `world and dbhas have the  full record by design. Refusals should use error factories that determine by selection what goes into the error and its meta
5. **A vault can become sparse, though the draft says "no sparse vault exists".** `Vault.takeWorld` strips the gate from the full vault row that every box answer carries, then receives what is left. Probe: when another device moved the gate, one `vault.fetchBox` leaves the vault `isFull: false`, still unlocked, and `vault.gate` refuses `bad_option`, the family that tells a host it has a bug. The stripping seems to exist because sentinel world rows have no gate. This state then pays for `vault.ts:184`'s `if (! this.isFull)`, for `fullRecord`'s and `gate`'s sparse refusals, and for `vault-unlock.test.ts:84` pinning "unlocks a vault held sparse" as supported. What would settle it: passing the whole row through and seeing what falls. *Solution off.* `models/vault.ts:87`, draft `models-invariants.md:136`this sounds like someone worked around the typechecker by eviscerating the code. fix&#32;
6. **`ensureUnlocked` asks storage before it looks at the lease.** The draft's tree starts "a lease in force → done"; the code runs `ensureTimely()` first. Probe: past the refresh horizon with the store failing, a vault in force refuses `storage_error` while `isUnlocked` stays true. `replacePassphrase` and `delVault` likewise fetch before the dialog where the draft draws none, and `new Gating` reads `vault.gate` for `passkeyHeader`, which needs a full vault. Can't tell whether this is deliberate, to catch a gone vault, or a side effect of item 3. *Solution off, or guidance gap.* `models/vault.ts:182`, `models/vault.ts:111`, `models/gating.ts:66`` `ensure timely is to make sure the vault is recent enough to know if it deserves a lease, the tree would be better off to say so
7. **Every vault fetch reads the box list and throws it away.** `doGetVault` returns all box rows on each `vault.fetch`, `ensureTimely` miss and gate verb, and `tryGetRow` strips them. The listing learns boxes only from `vault.hello`, once, per `#isGreeted`, and from the watch, whose own doc says "nothing may count on a notice arriving". With no watch, a box added or deleted on another device never changes the snapshot unless the host re-runs `hello`; `damaged_records` goes stale the same way. The draft is silent on list freshness after hello. *Guidance gap, redesign?* `models/vault-listing.ts:213`, `models/vault.ts:405`vault hello should not be involved in populating box listings by anything more than triggering the one code path that does
8. **`badnews` and `policy` are computed and never read.** `settle` and `receive` always answer `{ badnews: [] }`, with no override anywhere, so `tellBadNews(thing.receive(record).badnews)` does nothing. `policy` is set on every row of the `reconcileCentral` table, and only a test's `SpiedBox` reads it, so that 13-row table is asserted through a field `src` ignores. Both came from the old code and survive the "remove anything obsoleted" rule; they also carry a `sonarjs/cognitive-complexity` disable. Lint exceptions in this tree, for the record: 7 `eslint-disable-line` (2 `require-await`, 1 cognitive complexity, 4 `prefer-private` on `_cheat_*`) and no `@ts-expect-error`. *Solution off.* `models/storable.ts:334`, `models/listing.ts:234`, `tests/models/storable.test.ts:208`the bad news and other reporting during deliver is poorly conceived, but I don't know yet what the right thing is. Do those code paths (including build) have bad news they're unable to report ?
9. **A vault and a box are reborn in opposite ways.** A reborn vault is a new instance, by `fateOver` 'replace'. A reborn box is the same instance taking a new life. The box's way costs `lifeTokPathOf`, `#sameLife`, the conditional `registered_at` in `assign`, the `OneRevisionTwoLives` row and `isBirthday`. The draft draws both. What would settle it: whether anything needs a `Box` reference to survive its own deletion. *Redesign?* `models/storable.ts:313`, `models/box.ts:155`, `models/vault-listing.ts:185`box being durable is useful and important for the non react user. Replacing a vault is epochal in a way that replacing a box is not,. Still, some of that machinery is a little sus
10. **The host's dialog holds more than the draft's public table lists.** That table gives a gating `attempt`, `decline`, `whenSettled`, `isOpen`, `kind`, `passkeyHeader`, `toJSON` and `checkStrength`. The object also exposes `declineAtLock`, `declineAtDiscard` and `gating.vault`, which reaches `receive`, `settle` and `takeWorld`. `listing.releaseGating()` is public with no identity check. `declineAtDiscard` also answers `locked_while_asking` on a sweep where nothing locked. JavaScript has no package-private, and the draft doesn't say what to do about that. *Guidance gap.* `models/gating.ts:65`, `models/gating.ts:145`, `models/vault-listing.ts:140`
11. **The draft has rows the code shows to be wrong, harmlessly.** Each attempt tree says "a lock since launch → `locked_while_asking`, checked here once", but a lock with no attempt under way already settles the gating, so that check could never fire; the code rightly omits it. The `declineAtLock` row says an attempt under way leaves the gating "open", while the code settles with the attempt's outcome, even a correctable one (`gating.test.ts:457`). The draft's `request_cleartext_threw` is `unexpected_error` in code, and `kind` is `gatingkind`. *Guidance wrong, minor.* `unrace-gating.md:303`, `models/gating.ts:90`yes it was wrong of me to state that those code paths were "authoritative", they are pseudo code as a design artifact. Is there residue of agents trying to satisfy those over common sense and good practice?
12. **Some tests assert less than their titles suggest.** The "a lock() landing during a send" crossings flip a stub world's `setLockState`; no real `vault.lock()` runs in them. Every `takeWorld` test uses a stub world, and a word search found no test of a real Vault hearing a newer row from a box answer, which is item 3's path. `MemoryVaultDB` tells watchers by microtask, so a notice always beats its answer, and the other order runs only where a test forces it. `_cheat_boxRowsOf` is also the store's own accessor, and it creates a row on a read, so a `doGetBox` under any `vault_tok` adds an empty life. No skipped or `.only` tests. *Solution off.* Fix the weak tests great catch `tests/models/halpimonfire.test.ts:14`, `storage/memory-vault-db.ts:118`
13. **Several things exist twice.** `vaultRowOf` means three things: parse a raw row, strip boxes off an answer, and look up a row by scope. `adapted` exists twice with different signatures; `Awaitable`, `ckeyOf` and `leaseNotInForce` are each copied; `vaultGone` exists twice with different messages. `storage_error` (keeps `cause`) and `storage_unavailable` (strips it) are the two stores' name for one failure. `Revision`, `Times`, `VaultRecord` and `BoxRecord` are typed in both shapes files, and one schema refuses `invalid_input` at the vaultDB but `bad_record` in the models. Thread 14 is planned for what's left of the shapes. *Solution off.* `models/vault-listing.ts:232`, `storage/vault-db-new.ts:349`, `storage/device-db-new.ts:86`some of this sounds harmless coming from not touching code in the old pool. However a lot of these method names are nowhere contemplated in the design docs, investigate?&#32;
14. **Doc blocks are still long where methods branch most.** Doc blocks are 30% of the characters in `models/` and `storage/`: 431 blocks, 41 over 300 characters, the longest about 3,400. That is below the old models' 36%, but not "rarely longer than a couple lines". The long ones mostly list refusals method by method, which may say more about the methods than the docs. *Solution off, mild.* `models/box.ts:137`, `models/listing.ts:223`, `models/storable.ts:385`100% agree with "says more about the method than the docs" listing every refusal possible is foolish, wastes tokens and metastasizes. Strip every doc block that is longer than one or two 120-character lines and have an agent replace it with a line that describe the purpose of the function WITHOUT sacrificing readability. A method that can't easily be described thusly is a big smell. Flag all methods with logorrheic  "SLOPDOC" in the replacement&#32;

## Undergrowth

### Control primitives

A grep of `models/` and `storage/` found no timer, abort controller, retry, queue, control counter or generation. `gate_epoch` and `revision_seq` are data, not control. There is one join, and it is drawn. What follows is little beyond what the draft drew; the only control primitive not drawn at all is `queueMicrotask`, in the memory store.

- **`#oneFetchAtATime`:** overlapping `vault.fetch` or `box.fetch` calls share one run. Old code, drawn by the 1️⃣ rows. It adds two paths per caller, starter and joiner. A joiner can be served by a get begun before it asked, and `fetchListed` and `listing.fetch` skip it, so "one at a time" holds only for `storable.fetch`. *As drawn.* `models/storable.ts:62`` `lets have a convention to tag items eg (codetag:CoordinatorApproved) to say "this is great don't flag", add to its doc lock
- **Gating's state:** `#settled` and `#settle` are a promise and its resolver held in fields; `#outcome`, `#isAttempting` and `#isLastAttempt` are flags. Drawn by `whenSettled`, `attempt_in_flight` and "sets the variable". The cost is four states times five inputs (attempt, decline, declineAtLock, declineAtDiscard, dialog returning): about twenty cells to reason through. *As drawn.* `models/gating.ts:57` this has been bugging me, esp because settle is the useful word we use for "complete your housekeeping". Needs a later design pass.&#32;
- **`#openGating`:** one gating per bank, refusing `already_asking` with no join. The rule is drawn; the five methods on `VaultListing` are new. Five discard sites (vault lock, vault sweep, vault vacate, listing sweep, listing vacate) must each remember to tell it. *As drawn, placement a guidance gap.* `models/vault-listing.ts:49`, `models/vault-listing.ts:134` agree&#32;
- **`heldLease.isForgotten`:** the test for "a lock crossed the gate change", which leaves the lease object acting as the generation. Drawn, with no new state; a reader must know that's what the check means. *As drawn.* `models/vault.ts:264` needa later investigation
- **Call order as a contract:** `lease.tryCache()` is called before the settle, and the erase before the first await, so a later erase lands after an earlier cache. Drawn ("calls land in the order they were made"). It places an ordering rule on every deviceDB adapter, and only the memory store exists to test it. *As drawn; a real store would settle it.* `models/vault.ts:251`, `models/vault.ts:279`, `storage/device-db-new.ts:16` what is caching and the erasing in the same control oath that sounds dangerous -- is something trying to abort and clean up state? We don't do that.
- **`#isDisabled`, on both storable and listing:** drawn as 🫥. There are 25 `demandEnabled()` sites, re-checked across awaits. *As drawn.* `models/storable.ts:51`, `models/listing.ts:51` does this mean places are calling it explicitly? Its supposed to be part of the six or seven guards placed at the entrypoints like demandReadyToFoo, called only by them. Fix
- **Small flags:** `#isGreeted` makes every box verb run `hello` once, implied by "runs on the first box call"; two first calls both run it, harmlessly. `#isPeeked` skips re-caching and is drawn. *As drawn.* `models/vault.ts:64`, `models/lease.ts:31` signing off on first box call was foolish by me, vault hello should get its box listing, remove other vivfication&#32;
- **Friend identity as a token:** `lease.friend !== this.leaseFriend()` refuses a lease made for another instance of the same vault. The draft draws a friend "fixed for the vault's life" but not this check. It adds one branch and one refusal. *Can't tell.* `models/vault.ts:242` the existence of that check sounds weird enough, and that is definitely not the way to do it. This is in a private method with one or two callers?
- **`queueMicrotask` in `#tell`:** the memory store's notices arrive on a later tick. New, not drawn, confined to the memory store. It fixes one delivery order, as eyebrow 10 says. *Guidance gap, small.* `storage/memory-vault-db.ts:152` i don't object to the machinery as this is a testing/demo helper but is that brilliant or cope-ium -- is it making the facade better emulate a read db's timing fuzz, or making non deterministic tests artificially deterministic?

### New mechanisms

- **The vaultDB's answer frame (`#call`, `answerOf`, `Said`, `err.meta`):** makes a thrown refusal and a `try*` answer read the same. The draft draws the answer's fields but not this route: `Object.assign` writes onto a `readonly meta`, and `answerOf` unpacks it back into an answer. If `try*` built the answer and the throwing verb were `valOf` of it, the meta route, and eyebrow 2, might go. *Redesign?* `storage/vault-db-new.ts:35`, `storage/vault-db-new.ts:328`, `storage/vault-db-new.ts:334`` ` yes redesign as we decommission the old code. I hope none of that makes its way to vaultdb's outer interface?
- **The box-list channel (`fetchListed`, `vaultRowOf`, `NothingListed`, `boxesListed`, `BoxListing.hello(listed?)`):** a second vault get beside `vault.fetch`, kept so the listed boxes can be taken apart from the row. The draft says only that `vault.hello` "calls vault.get". If `vault.fetch` always delivered its list, one get would do. *Redesign?* `models/vault-listing.ts:171`, `models/box-listing.ts:51` yes that was a design artifact and coming from my enthusiasm for graphql's api vernacular, where one could ask for boxes directly from a vault\_boxes interface call, or have the vault call provider boxes, etc. Tbh asking for the box listing directly seems a better fit, the vault is already in the world and it's just confusing to have it there that many times. I don't think anything uses get vault except for its listing?
- **`fateOver` and `SlotFate`:** one (record, held) pair is judged in three layers. `fateOver` picks lose, replace or receive; `reconcileCentral` picks a policy; `receive` then calls `cmpRevisions` again, for three comparisons in all. `lose` exists because an older record under another `vault_tok` would otherwise hit `reconcileCentral`'s first row and throw `unexpected_error`. The draft's ruling draws the job ("routes each record by scope and vault\_tok"), not these. On the same theme, inbound `vault_tok` is checked at five sites: `takeWorld`, `isOwnRow`, `#makeThingOf`, `fateOver`, `reconcileCentral`. *Redesign?* `models/listing.ts:230`, `models/vault-listing.ts:185`, `models/storable.ts:317` i have never heard of fate of where did this come from? Does not smell good.
- **`ProveForGatingkind` and the kind-keyed type maps:** a table of six async lambdas, plus `ProvingsForGatingkind`, `VaultForGatingkind`, `ClearsForGatingkind`, `Asked` and `Prove`. The draft draws the per-kind steps as trees, not a table. The generic is what forces `as unknown as AnyGating` twice and a `passkeyClear!`. A `switch` or six private methods would do the same job. *Solution off.* `models/gating.ts:177`, `models/gating.ts:80`, `models/gating.ts:189` same family of design smells around gating, do not like, repair after e2e if we can
- **The damage nexus (`am: 'd'`, sentinels, `damagedVaultOf`, `damagedBoxOf`, `isDamagedVaultAt`, `isDamagedBoxAt`, `damagekindOf`, `isNewerFormat`):** the ruling draws it, so it isn't a stray. New detail: `damagekind` says `format_mismatch` where the refusal says `newer_format`. *As drawn.* `storage/vault-db-shapes.ts:211` damage is an agent obsession I thought I'd ruled out. We need to remove this.

### Non-standard JavaScript

Nothing dispatches on a method name: `this[` has no hits, and the kind-keyed lookup is the table above.

- **Whole method bodies inside a wrapper:** all 11 public vaultDB verbs are `return this.#call<...>('getBox', args, async () => { ...the method... })`, with the method's own name passed as a string for `meta.call`. Plain alternative: a `try`/`catch` in each verb, or a frame around the `try*` form. *Solution off.* `storage/vault-db-new.ts:137`, `storage/vault-db-new.ts:168`, `storage/vault-db-new.ts:279` that is why we are moving away from the old code.
- **Thunks around every store call:** `adapted(() => this.doX())` appears 14 times across two differently shaped copies. It only relabels a foreign throw, and `#call` already has a catch that could do it. *Solution off.* `storage/vault-db-new.ts:343`, `storage/device-db-new.ts:86` same. Is the damage contained to here (vault db new touching old adapters)?
- **`try*` one-liners by closure:** about 40 lines of `outcomeOf(() => this.x())` or `answerOf(...)`. Drawn (🛡️), and regular. *As drawn.* `models/vault.ts:116`, `storage/vault-db-new.ts:149` these are used well when they are one liners wrapping the throw form. They are not when they're wrapping a body -- evaluate whether the try and throw forms should trade bodies. Same with valOf the other direction,
- **Outcome to throw to Outcome:** `valOf` unwraps an Outcome inside a method whose `try*` twin wraps it again. Worst is `outcomeOf(async () => { valOf(await friend.tryUncacheLease()) })`, whose visible job is what `tryUncacheLease` already does; it may only be catching a throw from `leaseFriend()`. Five of the seven `valOf` sites go through an `outcomeOf` this way. *Solution off.* `models/vault.ts:279`, `models/lease.ts:81`, `models/lease.ts:93`, `models/proving.ts:86` fix
- **Callback parameters that mostly select a branch:** `Storable.#disable(dropContents)` and `Listing.#disable(discard)`, two callers each. `#vacateLease(onRefused = panic)`, one caller overriding. `#landGate(proved, commit)`, three callers; `revokePasskey` nests two lambdas on one line. `#moveGate(ante, act, wayinOf)`, where the callback validates, throws, or returns null to mean "no move". `checkOpens(wrongProof)`, two callers. *Solution off, mild except `#moveGate`.* `storage/vault-db-new.ts:242`, `models/vault.ts:142`, `models/vault.ts:277`, `models/storable.ts:295` fix. And don't use null as a sentinel&#32;
- **A closure handed to a store:** `doCacheDeviceRecord(record, isHeld)` asks the adapter to run the base's Zod check inside its atomic step, with the same problem as eyebrow 1. It has no caller in `models/` yet. *Guidance gap.* `storage/device-db-new.ts:32` remove that&#32;
- **Fire-and-forget:** `void (async () => { ... })()` twice, and `void` on an async private call four more times, for six places an error path leaves the caller. The `#askHost` and `#vacateLease` ones are drawn or implied; a plain private async method would replace the two IIFEs. *As drawn in part.* `models/listing.ts:276`, `models/listing.ts:324`, `models/vault.ts:309`, `models/gating.ts:81` invesrigate after sprint not good
- **Dense expressions and guard tricks:** `((fate === 'replace') ? null : held) ?? this.#makeThingOf(record)`; `boxes.at(scope)?.hydrate(timely) ?? boxes.fetch(...)`; `answer.val ?? (answer.dbhas as ...) ?? null`; `const { full } = this.demandEnabled()`, destructuring a guard's return; guards chained through `this` on one aligned line. *Solution off.* `models/listing.ts:232`, `models/vault.ts:356`, `models/vault.ts:377`, `models/listing.ts:379`, `models/storable.ts:219` the fate code is going to get out of control. This sounds like an agent got over their skis and others will add to it.&#32;
- **Reflective property installs:** `tattoo`, `adorn` and `decorate` appear 13 times with `declare readonly` blocks instead of `this.x = x`, and a rule that a subclass's props can't be `#fields` because the base constructor runs first. The old code had it; the new `Gating` copies it. The constructor's `settle()` that justifies `Vault.gate`'s lazy memo is a no-op there, since `#snapshot` is still null. *Redesign?* `models/storable.ts:83`, `models/storable.ts:88`, `models/vault.ts:99`, `models/gating.ts:64` will investigate, only part of that is purposeful
- **Reach-ins against the host's own objects:** `spendClears` handles other-realm buffers by `Object.prototype.toString.call`, and `checkedClears` catches throwing getters. They cite G2 and G8, so they may be owed. It does sit oddly beside the accepted ruling that a host getter may forge a `VaultError`. *Can't tell.* `models/gating.ts:223`, `models/gating.ts:234`, `models/proving.ts:203` i don't know enough there, I assumed that the buffer exhaustion was best practice.

## New names outside the draft

**Count: 250 not in the draft** (245, plus 5 `try*` twins), out of 318 new declarations; 68 are in the draft. That's large, so names only. The count is low, because the test was generous: a name counts as old if its word appears anywhere in base `src/`, even in a comment, and as drawn if its word appears in the draft's prose. Hidden by those tests: `rewrote`, `json_v1` and the `tryGetVault` union member, none of them in the draft.

- &#32;&#32;a lot of these look like types being defined in the file itself, refusals and checks and their types should be in dedicated files

```text
helpers/throwers:   disabledError
box-listing:        #damagedRecords damagedAt watchRows isOwnRow
box:                BoxPut #keptWhisper sweepContents vacateContents noWhisperToKeep
gate:               gateMakeArgs
gating:             ProvingsForGatingkind VaultForGatingkind LaunchArgs #isAttempting #isLastAttempt
                    #refusalOfAttempt declineAtDiscard #endAsking Asked Prove ProveForGatingkind
                    timelyAnte checkedClears spendClears alreadyAsking clearsThrew lockedWhileAsking
                    attemptInFlight
lease:              #isPeeked uncacheForgotten
listing:            ListingAnswer DelTombstone SlotFate #isDisabled demandEnabled demandNotHeld putDraft
                    delOver #makeThingOf fateOver priorOf recordOfAnswer recordOfRefusal
models-shapes:      putAnte namesAHalf boxPut BoxPutGiven boxesListed damagekind BoxesListed boxlabelArg
                    vaultDBDuck putListingOpts PutListingOpts FirstGateEpoch stampedGate
                    passphraseNovelArgs passkeyNovelArgs passphraseStoredArgs passkeyStoredArgs
                    strengthArgs StampedGate peekLease LeaseFriend leasePeekArgs provingLeaseArgs
                    whisperText deviceDBDuck vaultBuildClears vaultUnlockClears passphraseReplaceClears
                    passkeyAddClears passkeyRevokeClears vaultDelClears gatingLaunchArgs
                    ClearsForGatingkind
proving:            invokeStrengthChecker
storable:           #isRefreshedWithin isDisabled
vault-listing:      #openGating #runBirth #demandBirthSlot #deliverStored openGating holdGating
                    releaseGating declineGatingAtLock declineGatingAtDiscard boxListingOf fetchListed
                    NothingListed vaultRowOf recordOfBirth vaultGone delOfOtherLife
vault:              #isGreeted fullRecord #runReplacePassphrase #runAddPasskey #landGate #runDelVault
                    #attachCachedLease #makeFriend #vacateUnattached demandReadyForBoxes
                    #ensureReadyForBoxes #boxscopeOf
phrases:            PatchNamesNeitherHalf LetGoInstance VaultDeleted DelOfOtherLife AlreadyAsking
                    LockedWhileAsking AttemptInFlight ClearsThrew
device-db-new:      Awaitable DeviceCached doCache doPeek doVacate doLeasesProvedBefore
                    doCacheDeviceRecord cacheDeviceRecord
device-db-refusals: storeFailed
device-db-shapes:   leaseQuery leaseSparse leaseRow LeaseQuery LeaseRow
memory-device-db:   ckeyOf leaseCkeyOf #leaserows #devicerows _cheat_leaseRows _cheat_deviceRows
memory-vault-db:    BoxLife boxrows Heeder MemoryVaultDB #vaultrowsOfBank #boxLives #heeders doGetBank
                    doPutVault doTidyGone doWatch _cheat_vaultRowsOf _cheat_boxRowsOf #vaultRowOf
                    #storeVaultRow #storeBoxRow #demandRoom
vault-db-new:       AnswerFacts GoodAnswer BadAnswer GotAct PutAct DelAct Said BankListed VaultListed
                    Tidied Landing BoxLanding PutTerms mayReplaceLive RowOfVault RowOfBox VaultFetched
                    BoxFetched Heard noUnwatching #landVault #moveGate unreadableRowOf boxRowOf
                    listedBoxesOf checkedVaultLife demandNextSeq landingActOf
vault-db-refusals:  vaultEmpty staleWrite gateIssue boxTooLarge damagedRecord newerFormat seqNotNext
                    storageError
vault-db-shapes:    NeverStored damagekindVals format_mismatch boxQuery watchScope boxTombstone boxRow
                    replacePassphraseParams passkeyAddParams revokePasskeyParams ifAbsentOpts putOpts
                    putVaultOpts delOpts reqParams rowPeek fmtPeek vaultDBOpts memoryVaultDBOpts BoxQuery
                    WatchScope VaultRow BoxTombstone BoxRow ReplacePassphraseParams AddPasskeyParams
                    RevokePasskeyParams Damagekind DamagedVault DamagedBox IfAbsentOpts PutOpts
                    PutVaultOpts DelOpts ReqParams MemoryVaultDBOpts reqParamsOf revisionOf nextRevisionOf
                    peekOf isRowAt isLiveRow isLiveRowUnder isCheckedLiveVault isLifeOver isTombstoneRow
                    sentinelTimes sentinelVaultOf sentinelBoxOf isNewerFormat damagekindOf damagedVaultOf
                    damagedBoxOf isDamagedVaultAt isDamagedBoxAt boxTombstoneOf
try twins:          tryGetRow tryPutRow tryDelRow tryCacheLease tryCacheDeviceRecord
```
