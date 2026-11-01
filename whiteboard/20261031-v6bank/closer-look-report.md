# A closer look at the v6bank sprint, read as one finished thing

Range: `bac1d45b..10759b69`, `packages/*/src`: 50 files, +2879 / -975. `tests/models` adds another 3507 lines.

How this was checked: I read the code at the tip and compared it with BASE. Where a behaviour matters I ran a throwaway probe against the real `Bank`, `localStoreFront` and `memoryDeviceDB`, then deleted the probe. "Probed" below means I watched it happen. "Inferred" means I reasoned it from the code and did not build it.

I weighed everything by your stated order: simple, readable and predictable first, and "at a vastly lower priority consistently failsafe in every edge case". A counter is not suspect for being a counter. I judged each by whether its machinery is worth its peril.

## The short version

**The sprint spent its complexity on the priority you rank lowest.** The `Vault` went from 372 to 693 lines. At BASE, unlocking touched 6 private methods. Now it touches 15: `#unlock`, `#joinUnlocking`, `#attemptThrough`, `#unlockAlone`, `#unlockByGating`, `#launchGating`, `#launchInTurn`, `#askInTurn`, `#unlockByProof`, `#unlockBy`, `#lookUpCached`, `#setLease`, `#dropLease`, `#leaseChore`, `#withLeaseDB`. Nearly all of that growth handles something landing during something else.

**Meanwhile, several plain behaviours in the plan do not exist, and behaviour is not predictable where it matters:**

* Sign-out closes nothing.
* A gate changed on another device changes nothing here.
* A lost first gate says nothing to the user.
* After a reload, the vault shows no boxes.
* A closed `Vault` object can be unlocked again.
* `closeVault` and `closeVaults` landing in the same window give opposite results.

**Your small questions probably share one answer.** Most of the race machinery comes from four facts, listed below as groups 1 to 4, and none of them was settled in the plan. Each race, met alone, had a locally reasonable fix. Together they make the `Vault` hard to read. So this reads mainly as `guidance incomplete` (the plan never said what happens when verbs overlap), which produced `out of proportion` results.

**What a simplification would keep and drop (inferred, not built):**

| | Names |
|---|---|
| Keep | `#lease`, `#lockSeq` (one check), `#unlocking`, a single `#asking`, a new `#isEvicted`, `#ensuring` |
| Drop | `#leaseMutexes`, `WithLeaseDB`, `#closeSeqs`, `UnlockAtBirth`, `BirthLockSeq`, `#askingMutex`, `#launches`, `#boxesGoodbyes`, `#revisedSeq`, and possibly `#cachedLookup` and `#turns` |

## 1. Root causes of the undergrowth

### Group 1: an evicted Vault is not dead, so per-scope truth lives on per-object state

**The fact.** `closeVault` evicts the `Vault` object, as the plan asked. The next answer for the scope builds a new one. But `evict` only disarms the trigger, lets the lease go and evicts the boxes (`vault.ts:596`, `storable.ts:357`). No verb refuses afterwards. The lease record, meanwhile, belongs to the scope and not to the object.

**Probed, on the object a host still holds after `closeVault`:**

* `zombie.ensureUnlocked()` asks the user through `unlock_vault`, grants a lease, and keeps that lease on the device.
* Its own `fetch` builds a *new* held `Vault` in the listing, so `bank.vaultOf` goes from null to an object the caller never asked for. The fetch delivers to that new object, so the zombie appears to keep its old record. That last part is inferred from `Storable.doFetch` going through `listing.fetch`. If so, "every proof is checked against the gate storage holds" does not hold for the zombie.
* The next `bank.ensureVault` then answers that new object, locked, while the zombie reads unlocked and a lease sits on the device. Two objects of one scope now disagree.
* `zombie.getBox` starts a box watch that nothing ever ends. Probed counts: watches 2, unwatches 1, even after `bank.goodbye()`.

**What hangs off it:**

* `#leaseMutexes` and the `WithLeaseDB` symbol (`vault-listing.ts:54`, `:110`). It sits on the listing because it must outlive the instance, as its doc block says: "an evicted one included".
* Part of `#closeSeqs` (see group 4). `#lockSeq` cannot carry a close across instances.
* `#unsubscribes` (`listing.ts:41`), which is harmless and goes with eviction anyway.

**What would dissolve it.**

1. *Make eviction terminal (cheap, and my recommendation).* One `#isEvicted` flag set in `evict`, checked in the guards that verbs already pass through, refusing by one new kind or by `vault_locked`. A host holding an old object gets a plain refusal.
2. *Let `lock()` call `tryDelLease` directly instead of through a queue.* The `DeviceDB` already promises that calls land in the order made (`devicedb.ts:26`), so a later lookup sees the erase. A grant that finds itself overtaken erases again after its `tryPutLease`. With 1 and 2, the per-scope mutex has nothing left to do.
   * Residual risk: an evicted object's in-flight grant could be taken up by the new object in the gap before its second erase. The failure needs a close, a reopen and a grant landing within milliseconds. That is the same class you already called "wildly unlikely".
3. *The alternative: never evict.* One `Vault` per scope for the bank's life, which is what `Listing`'s class doc still says ("each made once and kept", `listing.ts:23`). This also removes the mutex and `#closeSeqs`, but it contradicts the plan, and a new life with a new `vault_tok` needs a new instance anyway. I prefer option 1.

**Tag:** `redesign dissolves it`.

### Group 2: `lock()` is synchronous, while four async paths can take up a lease

**The fact.** `lock()` must read locked before it returns. Unlocking can be in flight through a fetch, the derivation, a wrap and a `tryPutLease`. The four paths that can take up a lease are: unlock by proof, unlock by gating, the cached look, and birth.

**What hangs off it:**

* `#lockSeq` with `BirthLockSeq`, on 23 lines of `vault.ts`. The saved value is threaded as a parameter through `#askInTurn`, `#unlockByGating`, `#unlockByProof` and `#unlockBy`, and passed to `#launchInTurn`'s call.
* The double check in `#unlockBy` (`vault.ts:516`).
* The conditional `finally` clears in `#unlockAlone`, `#lookUpCached` and `#askInTurn`.
* `#dropLease` clearing `#unlocking`, `#cachedLookup`, `#launches` and `#asking` together.
* The refusal `lockedWhileUnlocking`.

**Is the counter worth its peril? Yes, once.** "I pressed Lock and it stayed locked" is exactly the kind of predictability you want, and a counter is the plainest way to get it. What is out of proportion is how far it spreads.

**What would shrink it (inferred).** Route every take-up through one funnel, `#setLease(lease, lockSeqAtStart)`, which evicts and erases if the count moved. Drop the early checks, which only save work. Stop clearing `#unlocking` at lock: a call joining a doomed unlock gets `vault_locked` and the host calls again. Then the conditional `finally` blocks become plain ones. Cost: a rare extra refusal, and an Argon2id run that finishes before being discarded.

**Tag:** `out of proportion`.

### Group 3: a gating stays open for minutes and verbs can pile up, and the plan did not say what then

**The fact.** The plan specifies the ask loop for one verb. It says nothing about a second verb arriving while a gating is open. The only prior word is `notes/wontfix.md` (2026-10-22), "its gating (one prompt at a time)". The agents invented the rest.

**What hangs off it:**

| Piece | Where | Status |
|---|---|---|
| `#askingMutex` | `vault.ts:122` | Other kinds queue behind the open gating |
| `#launches` | `vault.ts:125` | Same kind joins |
| `#asking` | `vault.ts:128` | Lock can decline it; attempt-through uses it |
| `#turns` | `gating.ts:89` | Queues attempts and settlings (BASE had a simpler `#attempting`) |
| `declineAtLock` | `gating.ts` | A public method on `Gating` that a host can reach |
| `#joinUnlocking`, `#attemptThrough` | `vault.ts:472`, `:480` | A call with cleartexts drives the open dialog's gating |
| `#judgedAgainstLaunch` | `gating.ts` | Passkey changed since the dialog opened; narrow |

**Verified in code:** the `unlock_vault` entry of `#launches` can never be joined. `#launchGating('unlock_vault', ...)` is reached only from `#unlockAlone`, which runs only while `#unlocking` was null, and the two are cleared together. So `#launches` really serves double-calls of `replacePassphrase`, `addPasskey` and `revokePasskey`.

**What would dissolve most of it (inferred).** One field, `#asking: { gatingkind, gating, settled } | null`. Same kind joins. Another kind refuses at once, or awaits `settled` once and then re-checks. A second attempt during an attempt refuses `attempt_in_flight`, a kind `errors.ts:78` still lists and the old core used, instead of queueing. A dialog disables its button during an attempt anyway. That removes `#askingMutex` and `#launches`, and perhaps `#turns`. Cost: a host may see a "busy" refusal where it now sees a wait.

G2 in `notes/guarantees.md` grew a long clause to describe `#joinUnlocking` and `#attemptThrough`. When a security note has to explain a convenience, that is worth weighing.

**Tag:** `guidance incomplete`.

### Group 4: put-first `ensure` has no object for a close to reach

**The fact.** The plan's put-first `ensure` holds no `Vault` until storage answers, so a close in that window has nothing to lock.

**What hangs off it:**

* `#closeSeqs` (`vault-listing.ts:57`, checked at `:74`), a per-scope counter map whose entries are never removed.
* `UnlockAtBirth` plus `BirthLockSeq`, a symbol-keyed route between two classes.

**The telling result (probed):** in the same window, while the put is in flight:

| Verb | Vault answers | Lease kept |
|---|---|---|
| `closeVault` | locked | no |
| `closeVaults` | **unlocked** | **yes** |

`closeVaults` only reaches vaults already held, so it never bumps `#closeSeqs`. `notes/wontfix.md` records a further split: a close landing during the fetch or the build dialog does not stop `ensure`, while a close once `ensure` has begun does.

You said of the wider case, "I could justify either" and "we should have a test demonstrating that at least the same thing happens every time". `#closeSeqs` is the machinery that *prevents* it being the same thing every time.

**Recommendation.** Delete `#closeSeqs`. The rule becomes one sentence: a close does not stop an `ensureVault` already under way. Cost: `closeVault` during the put now answers unlocked, the same as the cases you already won't-fixed. With `#closeSeqs` and the mutex gone, `UnlockAtBirth` can become `vault.takeUpLease(await proving.makeLease(...))` through the existing public verb (inferred).

**Tag:** `not worth solving`.

### Group 5: the box watch starts lazily, and `Listing.hello` starts its watch after an await

**The fact.** `Listing.hello` awaits the cache load before starting the watch (`listing.ts:72`, `:88`). So a `goodbye` during `hello` finds no watch to end, and `hello` starts one afterwards.

**What hangs off it:** `#boxesHello`, `#boxesGoodbyes` and `#helloBoxesOnce` (`vault.ts:136`, `:139`, `:236`). The box cache is `UnkeptBoxCache`, which resolves at once, so the window being guarded is tiny.

**The same race is left open one level up (probed).** `bank.goodbye()` during `bank.hello()` leaves the vault listing's watch running (watches 1, unwatches 0), and the bank reads `ready`. Boxes are armoured and vaults are not.

**What would dissolve it (inferred).** Start the watch synchronously, before `hello`'s first await. Then `goodbye` always ends it, at both levels, and `#boxesGoodbyes` goes. A `sweep(false)` baseline means nothing is announced early. I found no cost, though I have not tried it.

**Tag:** `redesign dissolves it`.

### Group 6: `expose` writes to the object after an await

**The fact.** `expose` is async and ends by storing the whisper on the box.

**What hangs off it:** `#exposedSeq`, `#revisedSeq`, `#replaceExposed`, `#forgetRevised` and the `Box.adopt` override (`box.ts:58`, `:61`, `:179`, `:185`, `:218`). Two counters exist because they are read at different moments, so that `expose`'s own hydrate does not void it.

**What goes wrong without them:** a host sets `box.whisper = null`, or the box is evicted, or a newer revision arrives during those few milliseconds, and the whisper is kept anyway. Only the eviction case is close to a promise, since the plan said "eviction stops the vault showing secrets".

**What would shrink it.** With terminal eviction, `expose` needs one check after its unseal. Host-set-null and newer-revision overlaps could be won't-fixed: a host that sets null while its own `expose` is running gets what it asked for last. `useWhisper` and `getWhisper` keep nothing on the box and need none of this. Forgetting on a newer revision was not asked for by the baseline, though the behaviour itself is sensible.

**Tag:** `not worth solving`.

### Group 7: `doWatch` can say only "something changed"

**The fact.** So the front must re-read every row and compare `revision_tok`s.

**What hangs off it:** `live`, `seen`, the `sweeping` chain and `queueSweep` (`store-front.ts:222`, `:224`, `:256`, `:257`).

**Judgment:** for a local store this is fine and about the right size. Nothing dissolves it short of a richer hook. Its cost shows only on a remote backend, covered in eyebrow-raiser 2.

**Tag:** `guidance incomplete`, weakly: the plan named the watch's lifecycle but not its hook's shape.

## 2. Eyebrow-raisers, ranked by how much they should change your thinking

**1. A closed `Vault` object still works.** See group 1. This matters most because it makes closing unpredictable and it is the root of the mutex. Tag: `redesign dissolves it`.

**2. `StoreFront` is a new adapter contract, not a front for the existing ones.**

* The plan said the model `Store` is "fronted by `localVaultDB` and the `VaultDB` hook adapters". What exists is a new abstract class with four new hooks, and one subclass, `StringStoreFront` (`store-front.ts:377`). `safebyok-convex` was touched only by a rename. No remote adapter can serve a `Bank` today.
* The central hook is `doSwapRow(scopepath, swap)` (`:102`): the adapter hands a row to a JavaScript closure and stores the answer "in one atomic step". A server cannot run a browser closure in its transaction.
* Inferred: a Convex adapter would have to read, call `swap` locally, then write conditionally. That means inventing its own compare-and-set, and probably a retry, which the core rules keep out of primitives. The old hooks avoid this by carrying an expectation for the server to enforce (`doPutBox(scope, expected, box)`).
* The plan's "`revision_seq` computed by storage" also became a client-proposed value that the front checks (`#judgePut`, `:323`).
* Each box call makes a second row read for the world (`#worldNow`, `:340`), and each change re-reads all rows.

This is the one place where a later thread could be built on the wrong shape. Tag: `redesign dissolves it`.

**3. A gate changed on another device changes nothing here (probed).** Device A replaced the passphrase. Device B fetched the new record, stayed unlocked, and could still seal a new box. The plan says "exists: the vault locks on a received gate change", but `Vault` has no such code at BASE or at the tip (no `adopt` override), and `gate.ts:98` says `// not yet: gate_epoch`. So a passkey revoked elsewhere leaves other devices unlocked until autolock, up to 14 days by default, with their kept lease intact. The vaultKey does not change, so this may be acceptable, but nobody has said so.

A lighter form needs no counter: compare `gate` in `Vault.adopt`, as `Box.adopt` compares for `isOwnSend`, and lock on a difference that is not this device's own send. That covers a running tab, not a reload; voiding the kept lease would need something stored, though an equality token would do. Tag: `guidance incomplete`, since the plan believed this existed.

**4. After a reload, a vault shows no boxes (probed).** First session: `getSnapshot().boxes` has 2. Next session, unlocked by its kept lease, after `helloBoxes`: 0. `vault.boxes` is also empty. `snapshot.boxes` holds only what this session has touched. `Store` has `get`, `put`, `del` and `watch`, but no way to enumerate; the watch's first sweep learns the rows and announces nothing; and `UnkeptBoxCache` keeps nothing (`vault.ts:82`). The old surface's documented use, `<BoxList boxes={snapshot.boxes} />`, cannot be written on this one. Your "a vault gets its boxes" was built for naming a box, not for listing them. Tag: `guidance incomplete`.

**5. A lost first gate says nothing (probed on `VaultListing.ensure`).** Device B stores first. Device A's `ensure` with the passphrase its user typed resolves with B's vault, locked, with no refusal and no bad news. Through the `build_vault` gating, the attempt would succeed and the dialog close (from reading the code). The typed passphrase was discarded silently. Then the next verb asks for a different one.

The plan's "gets its own sentence" exists as a phrase, a kind and a factory, but `RefusalFuncs.gateMadeElsewhere` has **no caller**. Two plan lines collide here, "adopt the stored row on `stale_write`" and "its own sentence", and each thread honoured the one in front of it. Tag: `guidance incomplete`.

**6. Sign-out closes nothing (probed).** With the store answering `identity_revoked`, `onBadNews` hears it, the vault stays unlocked and held, and the lease stays kept. The plan said it "closes the vaults". The doc block in `store-front.ts:84` stops at "the bank hears". No test in `tests/models` mentions it. Inferred: the plan's split of thread 4 and thread 6 left nobody owning the wire. It may be meant for a thread still in flight; I cannot tell. Tag: `guidance incomplete`.

**7. The same situation, three rules.** A call handing its own cleartexts while one is in flight:

* `bank.ensureVault(bag, cleartexts)` "runs apart" (`bank.ts:199`).
* `vault.ensureUnlocked(cleartexts)` attempts through the open gating, or else spends the answer untried (`vault.ts:472`).
* `vault.replacePassphrase(cleartexts)` joins nothing, and races to a `stale_write`.

Each is defensible; together they cannot be guessed. Tag: `guidance incomplete`.

**8. Correctness that rests on microtask order.** Comments at `vault.ts:350`, `:366`, `:490` and `:531` each explain that something is safe because an async function runs synchronously up to its first await. Two of the four have forebears at BASE; the others are new. `DeviceDB`'s call-order promise is the same idea. A reviewer has to simulate the event loop to trust these. Tag: `out of proportion`.

**9. Two orderings for one record.** `DeviceDB` promises call order (`devicedb.ts:26`), and the lease mutex orders the same calls again. The mutex wraps every lease `tryGetLease` and `tryPutLease`, and `lock()`'s erase, so it sits in the critical path of the primitive. My judgment is that this is the "whizbang" `CLAUDE.md` warns of. And it stops at the bank's edge: two banks are already undefined by your ruling. Tag: `redesign dissolves it`.

**10. The device record is half a guard.** Your question was whether the machinery is worth the peril, so here is the ledger.

*Built:*

* The stored field `highest_gate_epochs`, `GateEpochSeen`, `hasEachVaultOnce`.
* `advancedDeviceRecord`'s merge and `highestGateEpochOf`.
* A required transactional adapter hook, `doUpdate` (`devicedb.ts:167`).
* `wroteOverDamaged`, which nothing reads.

*Not built:* `gate_epoch` on the vault record and the lease stamp, and anything that writes an epoch or compares one. `highestGateEpochOf` has no caller in `src`. In production the record carries only `device_id`. `devicedb.ts:133` cites "the rollback guard", which does not exist.

*Peril still to come (inferred):* the epochs are keyed by `vaultlabel`, not `vault_tok`, so a vault remade under the same label starts low and reads `vault_behind` unless deletion handles it. A restored backend reads the same way. The old core handles this through its tombstone's `vault_epoch`.

So the guard's real cost is still ahead. Decide it together with raiser 3, since both turn on `gate_epoch`. If it goes, `doUpdate` can go too, and "the first `device_id` stored wins" gets much simpler. Tag: `guidance incomplete`.

**11. Every attempt now does a storage fetch.** `#unlockByProof` calls `fetch()` each time (`vault.ts:506`); BASE fetched only when sparse. This gives a real promise, that a wayin revoked elsewhere unlocks nothing, and fits "the vaultDB is the ground truth". But a storage hiccup is not correctable, so it settles the gating and closes the dialog mid-typing. I think it is fine; you should just know it is there. Tag: `out of proportion`, mildly.

**12. Deletion today (possibly in flight, thread 8).** Probed: a locked `vault.del()` lands with no proof and no gating. It is inherited from `Storable` and already existed at BASE; `vault.ts` says "Not yet" in `demandReadyToDel`. `ensureVault` after a deletion refuses `stale_write`, so a deleted label cannot be remade this way. `FrontedStore.delDamaged` has no caller yet. Tag: `guidance incomplete`.

**13. Small, for completeness.** `boxListing.subscribe(() => this.settle())` (`vault.ts:256`) and `settle`'s habit of saving mean an unchanged vault copy is rewritten on lock (1 put), `ensureBox` (1) and `closeVault` (3), probed. The listener-isolation loop was asked for on `Storable` and now exists as four separate copies (`storable.ts:218`, `listing.ts:346`, `bank.ts:272`, `store-front.ts`). `modelsRefusalKindVals` lists kinds nothing in the models throws yet (`vault_gone`, `vault_remade`, `gate_made_elsewhere`, `damaged_wayin`, `vault_behind`). Tag: `not worth solving`.

## 3. Looked at hard, and sound

* **No retries, abort controllers or new timers.** I searched the added lines. The only timers are the existing `Trigger`'s, which did not change. `crypto.ts` is untouched.
* **The refusal move.** `refusal-funcs.ts` is plain and legible, and `listedRefusal` ties each factory to a listed kind. `raise` and `kept` renames are mechanical and consistent.
* **Dropping the closures.** No `*Closure` remains in `models/`. Cleartexts travel as values, and I found no field holding one.
* **`spendAnswerAfter`, 15 uses.** It looks heavy, but it is idempotent, sits at each export as G2 asks, and reads the same everywhere.
* **The core of `Gating`.** The attempt loop, the correctable set and `deferred` (asked for, 21 lines) are small and clear. The trouble is around it, not in it.
* **`Mutex` from `es-toolkit`.** Library first, rightly, wherever a mutex stays.
* **`#ensuring`.** A real problem (two components, one dialog) solved with a small map. Keep it, apart from the rule in raiser 7.
* **`#helloing`.** Small and harmless.
* **`Bank`'s options and lifecycle.** As the plan says, with `_cheat_clock` as the plan's only backdoor. `BankOpts.device_id` was already in the sketch. It is silently ignored once a device record holds one, which the doc block does say.
* **`VaultSnapshot`.** Frozen, no secret material, and built without a `Gate`, so a damaged wayin cannot break it.
* **`useWhisper`, built differently and better.** The plan said it zeroes the bytes after the callback. It zeroes them *before* the callback and says plainly that the JavaScript value cannot be zeroed.
* **`BoxListing` on the vault.** Your "no thread gives a vault its boxes" is built in the shape you asked for, apart from raiser 4.

**Baseline items not at this tip**, beyond those above: the pester (`bank.ts:74` has a GAP comment; the getter exists), the `v06` entry, `damaged_wayins`, thread 8. Two threads are still being built, and I do not know which these are. The plan's reserved `test_` namespace for names: in `src` I find `test_` only for deriver labels, so check that one too.

## 4. Inventory of control primitives

Baseline column: asked, implied or not asked. "BASE" means it already existed. Branch from `git grep` per branch tip.

| Where | Name | Guards | Without it | Baseline | Branch |
|---|---|---|---|---|---|
| `vault.ts:113`, `:35` | `#lockSeq`, `BirthLockSeq` | A lock or let-go overtakes an unlock, a look or a launch | Lock pressed during Argon2id, vault unlocked moments later | not asked | bank_eviction |
| `vault.ts:116` | `#cachedLookup` | Joins looks for the kept lease | Two lookups; the second evicts its lease | BASE (`#keptLookup`), lock-clear new | names, eviction |
| `vault.ts:119` | `#unlocking` | Joins an unlock in flight | Two dialogs or two derivations | BASE, lock-clear new | eviction |
| `vault.ts:122` | `#askingMutex` | One gating of a vault at a time | Two dialogs at once | implied for one at a time; queueing by kind not asked | gating_concurrency |
| `vault.ts:125` | `#launches` | A same-kind launch joins | A double-click queues a second dialog | not asked | gating_concurrency |
| `vault.ts:128` | `#asking` | Lets lock decline, lets attempt-through find the gating | A lock leaves the dialog open | implied (decline), not asked (attempt-through) | gating_concurrency |
| `vault.ts:136` | `#boxesHello` | First box verb starts the watch once | One watch per verb | implied by your boxes ruling | vault_boxes |
| `vault.ts:139` | `#boxesGoodbyes` | A goodbye overtakes a box hello | A box watch outlives goodbye | not asked | vault_boxes |
| `vault.ts:617`, `:622` | `#leaseChore`, `#withLeaseDB` | Fire-and-forget deviceDB work in order | See mutex | BASE as a serial chain, rerouted | lease_plumbing |
| `vault-listing.ts:54` | `#leaseMutexes` + `WithLeaseDB` (`vault.ts:31`) | Orders lease deviceDB calls across all objects of a scope | Evicted object's erase lands after a new look | not asked (BASE per object) | lease_plumbing |
| `vault-listing.ts:57` | `#closeSeqs` | A close during the put stops the birth lease | Same as the won't-fix cases | not asked | lease_plumbing |
| `vault.ts:28` | `UnlockAtBirth` | Symbol route for a listing to unlock at birth | Uses a public verb | not asked | lease_plumbing |
| `gating.ts:86` | `#settled` (`deferred`) | The verb awaits settlement | n/a, it is the mechanism | asked | gating |
| `gating.ts` | `#outcome` | Once-guard on settlement | Double settlement | BASE | gating |
| `gating.ts:89` | `#turns` | Attempts and settlings run in order | A decline overtakes an attempt in flight | BASE as `#attempting`; settling in turn not asked | gating_concurrency |
| `bank.ts:82` | `#helloing` | Joins a hello | A second harmless hello | not asked; fine | bank |
| `bank.ts:84` | `#ensuring` | Joins an `ensureVault` that hands no cleartexts | Two build dialogs | not asked; a real problem | bank |
| `box.ts:58` | `#exposedSeq` | A forget during `expose` | Whisper kept after forget | not asked | vault_boxes |
| `box.ts:61` | `#revisedSeq` | A newer record during the unseal | Old whisper kept | not asked | vault_boxes |
| `listing.ts:41` | `#unsubscribes` | Stops hearing an evicted thing | Evicted thing rings the listing | implied by evict | bank_eviction |
| `store-front.ts:222` | `live` | No callback after unwatch | Late notices | implied by the watch | store_fronting |
| `store-front.ts:224` | `seen` | Which rows changed | Re-announces every row | implied by the hook shape | store_fronting |
| `store-front.ts:256` | `sweeping`, `queueSweep` | Sweeps one at a time | Out-of-order notices | not asked; reasonable | store_fronting |
| `store-front.ts:152` | `queueMicrotask` | A throwing `doWatch` reports on the next tick | Trouble fires before the caller holds its unwatch | not asked | store_fronting |
| `storable.ts:218` | listener isolation | One listener's throw | Aborts a verb | asked | names_and_refusals |
| `listing.ts:346`, `bank.ts:272`, `store-front.ts:230`, `:238`, `:264`, `:275` | same, copied | Same, on other notifiers | Same | implied | various |
| `devicedb.ts:81` | `let advance` | Last call of a re-run transaction wins | Stale answer returned | implied by `doUpdate` | devicedb |
| `models-shapes.ts`, `devicedb.ts:218` | `highest_gate_epochs` | Ordered counter for the rollback guard | Nothing yet; no writer | asked by plan; guard undecided | devicedb |

Already at BASE and not new: `Trigger`'s `#currentTask` and `#disarmed`, `Listing.#told`, `Storable`'s one-fetch-at-a-time.

**Other unrequested machinery.** `FrontedRows` and `StoreKind` (a layer inside `store-front.ts`). `RowSwap`. `Gating.#judgedAgainstLaunch`. `Gating.provedBy` and `ProvedByForGatingkind` (useful). `BoxListing.#rebirthOf` (`ensureBox` brings a deleted box back). `Bank.autolockMinutes` and `Bank.pesterMinutes` (the plan asked for these on the vault). `DeviceRecordAdvance`.

## 5. New names

**Volume: large.** About 370 raw by a heuristic harvest of the net diff: about 160 module-level exports and about 210 class members and fields. Roughly 100 of the exports are moves or renames rather than new concepts: 63 refusal factories were previously module-private, and many phrases follow them. So these are names only, by file. No package entry point exports `models/` yet, as `v06` is not built, so "exported" means from its module. In the published surface, `src/index.ts` renames `keptLeaseRow` / `KeptLeaseRow` to `cachedLeaseRow` / `CachedLeaseRow`.

**Fighting `VOCABULARY.md`** ("Words safebyok does not use"):

* *ask:* `#askHost`, `#askInTurn`, `#asking`, `#askingMutex`, `lockedWhileAsking`, `LockedWhileAsking`.
* *proof:* `#unlockByProof`, `provedBy`, `ProvedByForGatingkind`.
* *unlock as a noun*, in doc blocks throughout ("the unlock in flight"), and in `#joinUnlocking`.

**Not in the vocabulary, new cast-adjacent words:** "look" (`#lookUpCached`, `#cachedLookup`), "turn" (`#turns`, `#inTurn`, `#askInTurn`), "ante", "rebirth", "trouble", "fronted", "row" beside "record", "advance" for the device record.

**Duplicate exported name:** `FoundRow`, in both `devicedb/devicedb.ts` and `models/models-shapes.ts`.

**Test backdoors:** `_cheat_clock` (`bank.ts:90`) and its checker `cheatClock` (`models-shapes.ts:912`). No others.

**New refusal kind:** `declined` (`errors.ts`). Listed for the models: `modelsRefusalKindVals`, `ModelsRefusalKind`.

**New stored fields:** `highest_gate_epochs`, with `gate_epoch` inside it (device record).

### Exported

* `checks/validator.ts`: `isBytes`
* `deriver/basederiver.ts`: `checkKeyDeriver`, `checkSuppliedSpecUnchanged`
* `devicedb/devicedb.ts`: `DeviceDB`, `DeviceRow`, `DeviceVerb`, `FoundRow`, `advancedDeviceRecord`, `deviceRecordOf`, `highestGateEpochOf`
* `devicedb/idb.ts`: `idbDeviceDB`. `devicedb/memory.ts`: `memoryDeviceDB`
* `helpers/deferred.ts`: `Deferred`, `deferred`. `helpers/parse-json.ts`: `parseJsonOrNull`
* `helpers/refusal-funcs.ts`: `alreadyHeld`, `answerOfOtherScope`, `boxAbsent`, `damagedBoxRow`, `damagedLease`, `damagedVaultRow`, `deviceStoreBlocked`, `deviceStoreUnavailable`, `dnaHandedToBuild`, `gateMadeElsewhere`, `gateMovedUnderChange`, `gatingDeclined`, `gatingSettled`, `insecureContext`, `keyDeriverThrew`, `leaseNotInForce`, `leaseOfOtherHolder`, `leaseOfOtherVault`, `lockedWhileAsking`, `lockedWhileUnlocking`, `misfiledCachedCopy`, `movedUnderEdit`, `needVaultUnlocked`, `noPasskeyToRevoke`, `noPasskeyWayin`, `notAVerdict`, `notKeyBytes`, `oneRevisionTwoFates`, `oneRevisionTwoLives`, `oneRevisionTwoToks`, `otherPasskey`, `otherPrfSalt`, `otherStoresThanHeld`, `otherVaultTok`, `otherVaultTokAtBirth`, `partialLoad`, `passkeyHeldAlready`, `passkeyMovedSinceLaunch`, `passkeyProvesNot`, `provingOfOtherVault`, `putUnfitForPrior`, `recordOfOtherScope`, `requestCleartextThrew`, `reservedLabel`, `saltDoesNotFit`, `samePassphrase`, `scopeOutsideStore`, `shapeUnreconciled`, `storeRowsMiscounted`, `strengthCheckerThrew`, `suppliedSpecChanged`, `undecodedWhisper`, `unknownKeyDeriver`, `unopenedWhisper`, `vaultAbsent`, `vaultBehindWhileOpening`, `vaultGoneWhileOpening`, `vaultLocked`, `wayinMadeAlready`, `wayinNotMadeYet`, `weakPassphrase`, `wrongPasskey`, `wrongPassphrase`
* `models/bank.ts`: `BankStage`, `BankVaultDB`. `models/gating.ts`: `GatingOpts`. `models/vault-listing.ts`: `BoxVaultDB`. `models/vault.ts`: `BoxDnaInVault`, `UnlockAtBirth`, `WithLeaseDB`
* `models/models-shapes.ts`: `BankDeviceDB`, `BoxBag`, `DeviceRecord`, `DeviceRecordAdvance`, `DeviceRecordFormat`, `FoundRow`, `GateEpochSeen`, `GateWorld`, `LocalStoreFrontOpts`, `ModelsRefusalKind`, `OnBadNews`, `PasskeyAddCleartexts`, `PasskeyGatingKind`, `PassphraseReplaceCleartexts`, `ProvedByForGatingkind`, `StoreFrontOpts`, `VaultCacheable`, `VaultTrouble`, `bankDeviceDB`, `bankVaultDB`, `boxBag`, `boxVaultDB`, `cheatClock`, `deviceRecord`, `foundRows`, `gateEpochSeen`, `gateWorld`, `isCorrectable`, `localStoreFrontOpts`, `modelsRefusalKindVals`, `onBadNews`, `priorRevisionTok`, `storeFrontOpts`, `storeRows`, `storeWatchArgs`, `vaultCacheable`, `vaultUnlockArgs`
* `models/proving.ts`: `checkStrength`, `spendAnswer`, `spendAnswerAfter`
* `models/store-front.ts`: `FrontedBoxStore`, `FrontedStore`, `FrontedVaultStore`, `RowSwap`, `StoreFront`, `localStoreFront`
* `phrases.ts`: `BoxRowDamaged`, `DeviceStoreFailed`, `DeviceStoreSaid`, `DnaHandedToBuild`, `GateMadeElsewhere`, `LockedWhileAsking`, `LockedWhileUnlocking`, `MisfiledCachedCopy`, `NeedVaultUnlocked`, `PasskeyMovedSinceLaunch`, `PasskeyProvesNot`, `PassphraseIrremovable`, `ScopeOutsideStore`, `StoreRowsMiscounted`, `VaultRowDamaged`, `VaultStoredDamaged`, `VaultlabelRepeated`, `boxAbsent`, `boxOfOtherVault`, `deviceStoreBlocked`, `deviceStoreUnavailable`
* `scopepath.ts`: `withinBankScopepathPred`, `withinBankScopepathPrefix`
* Old core, from renames: `LaunchedGating` (`gating.ts`), `CachedLease` (`lease.ts`), `CachedLeaseRow`, `cachedLeaseRow` (`shapes/device.ts`), `advancedDeviceRecord` (`device-db.ts`), `getJson`, `jsonOrText` (`local-vault-db.ts`), `checkSuppliedSpecUnchanged` (`key-deriver-spec.ts`)

### Class members and fields

* `Vault`, public: `autolockMinutes`, `pesterMinutes`, `boxes`, `boxscopeOf`, `boxOf`, `getBox`, `makeBox`, `ensureBox`, `helloBoxes`, `goodbyeBoxes`, `evict`, `takeUpCachedLease`, `tryEnsureUnlocked`, `tryGetBox`, `tryMakeBox`, `tryEnsureBox`, `tryLock`, `tryTakeUpLease`, `tryTakeUpCachedLease`, `[UnlockAtBirth]`
* `Vault`, private: `#addPasskeyBy`, `#askInTurn`, `#asking`, `#askingMutex`, `#attemptThrough`, `#boxListing`, `#boxesGoodbyes`, `#boxesHello`, `#cachedLookup`, `#dropLease`, `#evictBoxes`, `#helloBoxesOnce`, `#joinUnlocking`, `#launchGating`, `#launchInTurn`, `#launches`, `#lockSeq`, `#lookUpCached`, `#makeBoxListing`, `#replacePassphraseBy`, `#revokePasskeyBy`, `#unlockBy`, `#unlockByGating`, `#withLeaseDB`
* `VaultSnapshot` fields: `autolock_at`, `full`, `hasPasskey`, `lockState`, `refreshedAt`, `trouble`
* `VaultListing`: `ensure`, `close`, `[WithLeaseDB]`, override `fetch`, `#buildDraft`, `#closeSeqOf`, `#closeSeqs`, `#leaseMutexes`
* `Listing`: `evict`, `putDraft`, `#deliver`, `#liveInStaleRefusal`, `#onChange`, `#unsubscribes`
* `Storable`: `evict`, `refreshedAt`
* `Bank`: `clearCachedVault`, `tryClearCachedVault`, `vaultDB`, `#deviceId`, `#ensureVault`, `#ensureVaultOnce`, `#ensuring`, `#hello`, `#helloOnce`, `#helloing`, `#joinEnsuring`, `#keepDeviceRecord`, `#listeners`, `#remakeSnapshot`, `#setStage`, `#snapshotNow`, `#stage`, `#subscribe`
* `Box`: `disarm`, `evict`, `getWhisper`, `tryGetWhisper`, `useWhisper`, `#exposedSeq`, `#forgetRevised`, `#replaceExposed`, `#revisedSeq`. `BoxListing`: `ensure`, `#rebirthOf`
* `Gate`: `demandPasskeyAddable`, `demandPasskeyRevocable`, `passkeyHeader`
* `Gating`: `launch`, `provedBy`, `passkeyHeader`, `attemptPasskey`, `tryAttempt`, `tryAttemptPasskey`, `checkStrength`, `tryCheckStrength`, `declineAtLock`, `#askHost`, `#inTurn`, `#isPasskeyMovedSinceLaunch`, `#judgedAgainstLaunch`, `#scope`, `#settleInTurn`, `#turns`, `#world`
* `StoreFront`: `vaultStore`, `boxStore`, `clock`, `getRows`, `swapRow`, `findRows`, `watchRows`, `doGetRows`, `doSwapRow`, `doFindRows`, `doWatch`
* `FrontedRows`: `get`, `put`, `del`, `delDamaged`, `watch`, `#askedOf`, `#changesSince`, `#fetchedOf`, `#front`, `#isWithin`, `#judgeDel`, `#judgePut`, `#kind`, `#prefix`, `#sparseOf`, `#worldNow`, `#worldpath`
* `StoreKind` fields: `scopeOf`, `scopepathOf`, `record`, `sparse`, `damaged`, `stale`
* `DeviceDB` (`devicedb/`): `advanceDeviceRecord`, `tryAdvanceDeviceRecord`, `getDeviceRecord`, `tryGetDeviceRecord`, `findCachedVaults`, `tryFindCachedVaults`, `putCachedVault`, `tryPutCachedVault`, `clearCachedVault`, `tryClearCachedVault`, `delAll`, `tryDelAll`, `delLease`, `tryDelLease`, `doGet`, `doPut`, `doUpdate`, `doDel`, `doFind`, `doDelDamaged`, `doDelAll`
* Old `DeviceDB` (renames): `advanceDeviceRecord`, `tryAdvanceDeviceRecord`, `doAdvanceDeviceRecord`
