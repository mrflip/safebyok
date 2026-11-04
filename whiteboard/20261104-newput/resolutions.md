# newput: what's been resolved

What the newput work settled, moved out of `newput-plan.md` so that file holds only what's left. For whoever needs to know why the code is the way it is.

## Where it landed

| PR | Branch | What it did |
|---|---|---|
| [#470](https://github.com/mrflip/safebyok/pull/470) | `20261104-newput` | One straight chute into the box listing: `puttable`, `box.put`, `listing.put`. The fix list, and the Coach's markup: `#isEnabled`, `demandUsable` gone, `lockState` off the box snapshot, `#attachLease` in four lines |
| [#472](https://github.com/mrflip/safebyok/pull/472) | `20261104-shapes_home` | The models' types to `models-shapes.ts`, their refusal factories to `helpers/throwers.ts`. `BoxDna` and `BoxPatch` derived from their checks |
| [#473](https://github.com/mrflip/safebyok/pull/473) | `20261104-lease_chain` | `Lease.buildFromCache`, `Lease.buildGranted`, no `lease.attach()`, `#attachCachedLease` folded into `ensureUnlocked`, no `#vacateUnattached` |
| [#480](https://github.com/mrflip/safebyok/pull/480) | `20261104-del_damaged` | `delBox` stops repairing damaged rows, and `tryDelDamagedBox` does that alone. `notes/gallant.md` gains `#no-repair-in-normal-ops` |

## Rulings from the rework (the Coach, 2026-11-04)

Later than the plan's list, and binding on what comes next.

* **`create` pin: A, as built.** `create({ ...record })` refuses `bad_option` from the strict `boxDna`, and `RecordForNewBox` fires through `box.put` and `vault.putBox`. "We've fine tuned enough absent customer feedback."
* **`fetch` and `hydrate` check the world at each step.** A check that's timely costs nothing. `fetchRow`, built to ensure once, was taken out.
* **Enabled is a special guard:** one monkeywrench is enough. The code that ends a listing is synchronous, so nothing crosses it halfway. The one check after a store's answer is at the top of `deliver`. `#receiveNothing` and `buildOrReceive` keep theirs until `fate` is unwound.
* **A boolean says the positive:** `isEnabled`, never `isDisabled` (`STYLE.md`).
* **A vault's `demandEnabled` is enabled and present.** `demandUsable`, `ensureUsable` and `demandBoxesUsable` are gone; a box asks `world.demandUnlocked`.
* **Same-bodied guards and ensures stay,** by a firm decision: each is named for its call site.
* **A birth's refusal of a vault held stays,** inline in `launchBirth`, as it spares a passphrase dialog and a KDF that could only fail. `demandBirthSlot` and the listing's `ensureVault` are gone.
* **`ifAbsent: 'fail'` on a put is the vaultDB's to judge:** `demandPuttable`'s local check is gone. `Storable.fetch` keeps its own test.
* **A box's snapshot has no `lockState`.** A lock tells a box's listeners nothing, so a component showing `box.whisper` watches the vault too.
* **A lock does not forget the exposed whisper.** "Forgetting the exposed whisper is not its contract. The customer has decided to leave it exposed, honor that." The getter checks the lock.
* **A lock crossing the cache put is no reason to think the lease wrong.** `#attachLease` holds the lease, then awaits `lease.cacheAsCacheCan()`, which tells its own bad news.
* **The friend stays as it is,** an `objCheck` of `fn<>`s: "a legit safety thing". `gate_epoch` stays an argument.
* **`make` is sync, `build` is async:** where both exist, `build` calls `make`, and `make` calls `new`.
* **Normal operations don't do repairs** (`#no-repair-in-normal-ops`). `tryDelDamagedBox` has only the try form.
* **Anything to do with a host clock is undefined** (`notes/wontfix.md`): `clock` exists only for test injection.
* **`notes/gallant.md` stays whole, for reviewers.** Agents learn it from gallant code, not from a digest.
* **Test access to a class holding keys** is a constructor `molerat`, not a public `_cheat_` method, and only where the public API can't do it. #473 needed none.

## The Coach's notes on `#attachCachedLease`, all answered by #473

1. "vault shows all appearance of pulling a pojo (tryPeek); I'm assuming this is actually a factory"
   Take: it is a factory, answering an Outcome of a lease or null. The name hides that. `Lease.fromCache` would say it.
2. "leaseFriend can carry the gate_epoch. isn't gate_epoch an attribute of this?"
   Take: it's `this.gate.gate_epoch`. The friend is built once for the vault's life and the epoch moves, so it would need a getter on the friend.
3. "outcome would be a better return type."
   Take: or a `Lease | null`, with `ensureUnlocked` doing the attach, so the method only finds the lease. See 4.
4. "this looks like it passes a friend to Lease who builds an outcome that holds a lease that calls attach that calls attachLease and this method is called attachCachedLease"
   Take: that is the chain. Every `lease.attach()` in `src/` is in `vault.ts`, so `this.#attachLease(lease)` can replace it, and `attachLease` leaves the friend.
5. "I can't actually trace that through because it runs through friend which has a mystery meat ts interface"
   Take: `leaseFriend` is an `objCheck` of `fn<>`s in `models-shapes.ts`, so go-to-definition lands on a field, not the code. Open question: is a friend needed at all, or could a lease
   take a narrow view of the vault (`Pick<Vault, ...>`) that an editor can follow?

### Also settled

* "FFS FIXMEs: why does this take scope separately from record?": `buildOrReceive` takes the record alone now.
* "FIXME this is paranoia", on the `isForgotten` check: gone, in 2fe3942f.
* "this isn't possible is it, we ensure timeliness above?", on `ensureUnlocked`'s fetch: right, and gone, in 2b774dcc.

## The fix list for #470, as ruled and built

All built on #470, except item 9, which went to Thread 4. Item 4's `create` pin settled as A, above.

**Ruled by the Coach**

1. **`get` is the two-branch shape, and `hydrate` takes no `ifAbsent`.** One `handleIfAbsent` does the test, the body lifted
   from `#deliverGood`, so `deliver` loses its `ifAbsent` parameter and `fetch` calls it too:
   ```ts
   async get(scoped: Boxscope, opts: FetchOpts = {}): Promise<Box | null> {
     const held = this.at(scoped)
     if (held === null) { return this.fetch(scoped, opts) }
     const { ifAbsent, ...timely } = MSX.fetchOpts.parse(opts)
     return this.handleIfAbsent(await held.hydrate(timely), scoped, ifAbsent)
   }
   ```
   `isPresent` and both `demandUsable` calls go, and with them `BoxListing.demandUsable`. The tombstone-asks-storage pin goes.
2. **`isRefusalOfRow` and its two overrides go:** `deliver` asks `this.isOwnRow(stored)`.
3. **`parseConsistent`** replaces `verifyConsistent(MSX.boxPatch.parse(...))` in `demandPuttable`. `BoxPatchAdvice` drops.
4. **`box.put` stops calling `puttable`.** `demandPuttable(patch, { ifAbsent, ifPresent })` carries the recycled-data and
   `ifAbsent: 'fail'` checks, after the refresh. `puttable` is `at ?? shell`, refusing only an empty slot under `'fail'`.
   `create` hands `box.put` its raw input with the defaults filled, so the recycled-data check still sees `whisper_ciphered`:
   pin that.
5. **The doc blocks say purpose, not process.** `#shellFor`, `#receiveNothing`, `#edit`, `vault.hello`, `#deliverGood`.
   "What a void row stands at" and "What a box verb needs" break STYLE.md's opener rule. `VoidRevisionSeq`'s block in
   `models-shapes.ts` still says "never stored". `phrases.ts`'s "Why a..." openers are that file's convention: leave them.

**Found in the read, for the Coach to rule**

6. **`#edit` answers `VS.revisionOf(prior)`,** so ciphertext doesn't travel in an options bag.
7. **`vault.putBox`'s `MSX.boxPut.parse(...)` is parsed and discarded,** and `scopeOf` and `box.put` check the same again.
   Drop the call and the `boxPut` checker. A missing `boxlabel` then refuses `bad_scope`, not `bad_option`.
8. **`#boxscopeOf` can go:** `{ ...this.scope, boxlabel }` is the Coach's one-liner, and `scopeOf` parses it. The same `bad_scope` change.
9. **`buildOrReceive` went from private to protected only for `#shellFor`,** and `#shellFor` sends a sentinel through `fate` to
   make an instance. Left until `fate` goes, in Thread 4, unless the Coach wants it now.

## Thread 1: newput

### Target

```ts
// BoxListing
puttable(scoped, opts): Box {
  const { ifAbsent, ifPresent } = MSX.puttableOpts.parse(opts)
  if ((ifPresent === 'fail') && looksFull(scoped)) { throw /* said only-if-new, but handed a record */ }
  const held = this.at(scoped)
  if ((! held?.isPresent) && (ifAbsent === 'fail')) { throw this.nothingListedError(scoped) }
  return held ?? this.shellFor(scoped)
}

async create(dna, opts = {}) {                    // ifAbsent lit('add').default('add'), ifPresent default 'fail'
  const filled = MSX.createOpts.parse(opts)
  return this.puttable(dna, filled).put(dna, filled)
}

// Box
async put(patch, opts = {}) {
  const { ifAbsent = 'add', ifPresent = 'repl', ...timely } = MSX.boxPutOpts.parse(opts)   // timely: TimelyOpts
  this.listing.puttable({ ...this.scope, ...patch }, { ifAbsent, ifPresent })
  await this.ensurePuttable(timely)
  const given = this.demandPuttable(patch)        // parses, checks consistency, enabled, the vault usable, whole
  const { record, prior } = await this.#edit(given)
  this.demandPuttable(patch)                      // no ensure here: nothing awaited between this and the put
  return this.listing.put(record, { prior, ifAbsent, ifPresent })
}

// #edit takes central once, on entry, and answers the record with the revision it was sealed over. It mints the seq
// and, over a tombstone, the box_tok: -1 + 1 = 0

// Vault: sugar
getBox(boxlabel, opts) { return this.boxListing.get({ ...this.scope, boxlabel }, opts) }
putBox(patch, opts)    { return this.boxListing.puttable(scoped, opts).put(patch, opts) }
```

`BoxListing.get(scoped, opts)`: a held box hydrates, else `fetch`; it owns `ifAbsent` and the demands, as today's
`vault.getBox` does. `fetchBox` stays, as `get` with `maxMillisSinceRefresh: 0`.

`listing.put` forwards `ifAbsent` with the rest: `{ prior, ifAbsent, ifPresent }`.

### The VaultDB's `ifAbsent`

`VS.putOpts` and `VS.putVaultOpts` gain `ifAbsent: 'add' | 'fail'`, a checker of its own beside the get's `'fail' | 'nil'`.
`PutTerms` gains a term the adapter enforces in its transaction, beside `mayReplaceLive`:

```ts
landed = isRowAt(ante, prior) && (mayReplaceLive || (! isLiveRow(ante))) && (mayAdd || isLiveRow(ante))
```

Absent means void or a tombstone, as the listing's check has it. Not landed, the base class refuses what it finds:

| Stored | `ifAbsent` | `ifPresent` | Answer |
|---|---|---|---|
| Absent | `'fail'` | Any | Refused: `Refuse.absentBox` for a box; `vaultEmpty` or `vaultGone` for a vault |
| Live | Any | `'fail'` | `camped` |
| Live | Any | `'get'` | `declined`, with the record |
| Anything else that missed `prior` | Any | Any | `stale_write` |

* **`{ ifAbsent: 'fail', ifPresent: 'fail' }` can never land.** Let it refuse by whichever row it finds: no checker for it.
* **`putVault` is births only, so its `ifAbsent: 'fail'` can't land either.** It takes the flag all the same, and
  `ensureVault` passes `'add'`.
* **The base class defaults to `'add'`**, the same upcreate default as every layer above it.
* **Gate verbs and dels aren't puts**, and don't take it.
* **Only `MemoryVaultDB` implements this `VaultDB`**, so one adapter changes. Pin the table in
  `tests/storage/vault-db-new.test.ts`.

### Why these details

* **`at` takes any duck.** At runtime it already does, through `scopeOf`: widen its parameter type.
* **`shellFor` leaves the instance timely**, by having it `receive` its own void revision (corrected by the Coach,
  2026-11-04, after a wrong turn). `demandPuttable` demands whole, which a void or a tombstone satisfies and a sparse record
  doesn't. On a birth, a whisper and a sidecar left out both default to `{}` (the Coach, 2026-11-04), so a sidecar alone over
  a box stored but not listed seals, puts, and hears `stale_write`. `no_whisper` goes from the models.
* **The stable tok is required**, not cosmetic. `#neverStoredOf`'s random tok is why `build(sentinel)` throws
  one-revision-two-toks today, and why `priorOf` must translate. Both go.
* **`looksFull` is `Box.isFullRecord`'s test**, `'whisper_ciphered' in duck`, and it reads the raw input: `boxDna`'s
  transform strips record props. A Box answers true through its getter, so `box.put` passes its scope and patch, not
  itself.
* **`puttable` is called twice on `create`** (`create`, then `box.put`). It's idempotent, so leave it.
* **`#edit`'s prior can't be read after it returns, or derived from the record.** The seal awaits, and `central` can
  move meanwhile; the record carries the next seq, but not the prior's tok. The check-and-set has to be over the revision
  that was sealed on, so `#edit` answers both.
* **The refusal must say "not listed"**, not "No box is stored": with no `hello`, the box may well be stored. It names
  `vault.hello`. Only a caller who asks for `ifAbsent: 'fail'` leans on a timely listing.
* **A gone box comes back on a plain `box.put`**, as `send` brings it back today. `create`'s `looksFull` check is what
  stops recycled data, as `create` is the one that defaults to `ifPresent: 'fail'`.
* **`put` and `del` return the listed instance.** Only `fetch` and `get` stay nullable. `box.put` returns that
  instance, typed `Box`, not `this`.
* **Gate verbs keep returning the stored record.** `#landGate` needs the epoch that commit landed under, and the
  instance may already hold a newer one.

### What goes

`demandNotHeld`, `putDraft`, `stampDna`, `priorOf`, `#neverStoredOf`, `sealedRecordOf`'s export, `#isGreeted`,
`#ensureGreeted`, `#ensureCreatable`, `#demandCreatable`, the `Thing` form of `listing.put`, the `ante` parameter of
`listing.put`, and `#buildOrReceive`'s scope parameter and null overload (the null case, a `fetch` finding nothing, is
handled in `fetch`: `this.at(scope)?.receive(null)`).

`alreadyHeldError` stays for `VaultListing.demandBirthSlot`.

### Names

| Today | Becomes |
|---|---|
| `box.send`, `trySend` | `box.put`, `tryPut` |
| `demandSendable`, `ensureSendable` | `demandPuttable`, `ensurePuttable` |
| `MSX.sendOpts`, `SendOpts` | Worker's choice: `VS.PutOpts` and `boxPut` are taken. Look before naming. |
| `NeverStored`, `NeverStoredSeq` | `VoidRevision`, `VoidRevisionSeq` |
| `NeverStoredTok` | `VoidRevisionTok`, and a `VoidLifeTok` for `box_tok` and `vault_tok`: zero UUID, `00000000-0000-0000-0000-000000000000` |
| `sentinelTimes`'s `FarPast` | A new named constant, `1218182888777`. `FarPast` stays: it's `epochMillis`'s floor and a public export. No zod change is needed. |
| `BoxProps` | `BoxHalves`, as `models-shapes.ts` already calls them `halves` |

Update VOCABULARY.md for any term of the cast this touches.

### Commits, in order

1. **Void sentinels.** The constants and names above. `#neverStoredOf` gives way to the stable void revision.
2. **`demandNotHeld` out.** Create over a stored box now hears the vaultDB's `stale_write`, seals first, and keeps the
   box held. Three tests move: one in `box-listing.test.ts`, two in `listing.test.ts`, which must also seed the store.
   Stash 0 of the shared repository holds this against the code before #469, so a plain `git apply` of it fails at
   `b83afc28`: use it to read the intended test changes, and make them by hand. Its `listing.ts` also holds the Coach's
   own edits. In `listing.ts` the change is the method, its banner name and the `alreadyHeldError` import.
   **Never pop or drop the stash.**
3. **The VaultDB's `ifAbsent`**, as above.
4. **`put` returns the instance.** `listing.put(record, { prior, ifAbsent, ifPresent })`, `putDraft` out.
5. **`hello` decoupled, `get`.** `BoxListing.get`, `#isGreeted` out, `vault.getBox` as sugar.
6. **`puttable`, `create`, `box.put`, `vault.putBox`.** The rename can be its own commit if that reads better.
7. **Overstretched ensures out.** The Coach asked for an adjacent `await ensureFoo(); demandFoo()` to sit on one line,
   where not in the parse form. `8ceaeded` read that as every demand having an ensure, and added some where a plain
   demand stood. Restore the plain demand in `box.expose`, `vault.unlock` and `vault.hello`. An ensure goes where a
   refresh is wanted; a demand after an await needs none.

### What the probes showed

Temporary tests against the code before #469, with real seals and the memory vaultDB. The stable tok was mocked and
`ensure` stood in for `puttable`, so confirm these in the real build, and pin them as tests.

| A void instance, then a put | Result |
|---|---|
| Nothing stored, with a whisper | Seq 0, a real `box_tok`, the whisper opens |
| Nothing stored, sidecar only | Refused `no_whisper`, no put; a retry on the same instance works |
| Stored, marked timely (this design) | Refused `stale_write`, frontier delivered |
| On that delivered instance | The next put lands |
| Stored, `ifPresent: 'fail'` | Refused `camped` |
| Deleted, then put | Reborn at the next seq, a new `box_tok` |
| Void in the slot | In `things`, not in the snapshot |

A zero-tok tombstone with the 2008 date passes `boxTombstone`.

### Tests

Heavy churn in `box-listing.test.ts` and `listing.test.ts`. `vault-boxes.test.ts`'s "first box call" block and one in
`halpimonfire.test.ts` pin the auto-hello: they change to the new ruling. `tests/` outside `tests/models/` is no bar.
Expect `create`-over-held tests to become `stale_write` tests.

### Leave alone

* The base checkout: the Coach has staged edits there. Read it, never write it.
* `newdesign-models.md`: the Coach is editing it. Note its stale lines in your thread file (line 131's first-box-call,
  `box.del=>listing.del`).
* Vault birth, `ensureVault`, `demandBirthSlot`: a vault's birth needs a proof first, and its `vault_tok` comes from the
  gating. Not this thread.
* `vault.hello`'s own route, `fate`, `del`, the hook move, `deliver`'s failure handling: later threads.

## Thread 5: lease_chain, as briefed (now #473)

Stacked on #472 (`bd3d8932`). Worktree by `scripts/cut-thread lease_chain 20261104-shapes_home`.

**The goal:** a reader can follow how a cached lease comes to be held. Today it reads vault, `Lease.tryPeek`, an Outcome, `lease.attach()`, the friend,
back to `vault.#attachLease`, from a method called `#attachCachedLease`.

**The rulings:**
* The friend stays, as it is: an `objCheck` of `fn<>`s. "I'm resigned to the mystery meat interface, it's a legit safety thing" (the Coach). It keeps a lease's view of the vault small.
* `gate_epoch` stays an argument, read from `this.gate.gate_epoch`: the friend is built once and the epoch moves.
* `make` and `build` are the factory verbs: `build` is async, `make` is not. Where both exist, it goes `build`, then `make`, then `new`.

**The work, a commit each:**

1. **`lease.attach()` goes, and `attachLease` leaves the friend.** `#unlockByProof` and `#renewLease` call `this.#attachLease(lease)`. Take it out of `leaseFriend`,
   `lease.ts`, and the fake friend in `tests/test-helpers/proving-world.ts`.
2. **`Lease.peek` and `tryPeek` become one factory, `Lease.buildFromCache`,** answering a `Lease` or null, never an Outcome. It tells its own bad news through the friend, as
   `cacheAsCacheCan` does: a row it can't read, or a damaged one, is `friend.tellBadNews` and null, and the row stands. So the friend's `peekLease` becomes `tryPeekLease`, over
   `deviceDB.tryPeek`, as `tryCacheLease` already is. A bad argument still throws. Update the doc comment in `bank.ts`, and `lease.test.ts` and `proof.test.ts`, where a refusal from
   a peek becomes bad news and null.
3. **`Lease.grant` is `Lease.buildGranted`,** by the same rule.
4. **`#attachCachedLease` folds into `ensureUnlocked`,** its one call site:

```ts
async ensureUnlocked(): Promise<this> {
  await this.ensureTimely(); this.demandEnabled()
  if (this.isUnlocked) { return this }
  const cached = await Lease.buildFromCache(this.#leaseFriend(), this.gate.gate_epoch)
  if (cached) { await this.#attachLease(cached); return this }
  return this.unlock()
}
```

5. **`STYLE.md`'s `make` and `build` rows** gain the order: where both exist, `build` calls `make`, and `make` calls `new`.

**Tests:** `vault-unlock.test.ts` has five direct `lease.attach()` calls, in `describe("lease.attach: ...")`, which build a lease and attach it. Drive each through `unlock` or
`ensureUnlocked` where it can be. Where a test still needs a crafted lease, use the Coach's seam, not a `_cheat_` method: `Vault`'s constructor takes an optional `molerat`, handed a `VaultTestCheater`. Only a test subclass of `VaultListing` passes one; it goes through no production option.
Keep what they pin: holds the lease and caches its row; past a sweep, refuses and keeps the row; loses to a lock made straight after it.

**Leave alone:**
* `#vacateUnattached` in `#renewLease`, which can erase a row its lease never wrote: report it, don't fix it.
* `settle`'s name, `Box`'s inherited `lock`, `demandAttachable` and the other same-bodied guards (kept by the Coach's decision).
* Anything in Threads 1b to 4.

**Before changing `lease.ts` or `vault.ts`:** read `notes/guarantees.md`, *The guarantees*, and check the change against it. Update anything there that names these methods.

**Done means:** `pnpm justify` green before each commit, an empty changeset, and stop at `ready`, with nothing pushed, for a read of the diff. Report any `eslint-disable-line` or `@ts-expect-error` added.
