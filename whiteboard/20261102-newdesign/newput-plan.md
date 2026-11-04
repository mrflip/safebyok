# newput: straight chutes into the listing

For the Coach, and for the thread-worker who builds it. Cut from `origin/main` at `b83afc28` (#469).
The code below is pseudo code: where it disagrees with common sense or STYLE.md, follow those and say so.

**Paused by the Coach, 2026-11-04: no thread past Thread 1 starts until the Coach says so.** Thread 1 is in rework. Threads 2,
3 and 4 below are proposals, not instructions.

## The rulings (the Coach, 2026-11-03/04)

* **Change rate is months to nevers.** A put demands timeliness as anything does: a record past its horizon, or only
  sparse, forces a refresh. A void shell is whole and timely, as absence in the listing is trusted, and its put fails stale
  if the slot isn't vacant. `stale_write` with the frontier is the right answer there (the Coach, 2026-11-04).
* **Two forms.** Form 1, `listing.build`: props from storage; get or make the instance, and it receives them. Form 2,
  `puttable`: assume the listing is timely, so absence or a tombstone means creation.
* **`create` can only mean over a tombstone**, in a revisioned CAS model. `ifPresent: 'fail'` on a live box is the
  vaultDB's to refuse (`camped`). `puttable`'s check is a defense against recycling data.
* **Every put defaults to upcreate: `{ ifAbsent: 'add', ifPresent: 'repl' }`.** It's clobbering time. The only other
  sugar is `create`: `ifAbsent: 'add'` with no option to change it, and `ifPresent` defaulting to `'fail'`, overridable
  to `'repl'` (upcreate) or `'get'` (ensure). `ifAbsent: 'fail'` is there for a caller who asks.
* **The VaultDB takes `ifAbsent` on every put.** Some combinations go vacuous by the time they reach it: it's fine for
  those to refuse differently, as long as they refuse.
* **A vault record of another life throws, whatever its age.** The instance is tossed on `vault_tok`, so an older life's
  record should never get this far.
* **The word is `'get'`**, for `ifPresent`, from the listing down to the vaultDB. `fetch` stays the verb that always
  calls the vaultDB.
* **`ifAbsent` has two value sets:** `'fail' | 'nil'` on `fetch`, `'add' | 'fail'` on a put. Same name, separate checkers.
* **`box.send` becomes `box.put`.**
* **Nothing depends on `hello`.** `#isGreeted` goes, and no box verb refuses hello-first or runs hello for you. This
  replaces that half of `unrace-nextplan.md`. The host calls `vault.hello` for the list and the pushes.
* **Vault box verbs are sugar**, kept to the side, holding no logic.
* **Damaged rows are the host's**, on its vaultDB. The library doesn't handle them.
* **Sentinels:** a date of `2008-08-08T08:08:08.777Z`, and a zero tok. The revision is -1 under `VoidRevisionTok`.
* **A branch the types force and only a broken system reaches is one line: `throw`.** If it wants a second line, stop
  and raise it. No `!` or cast, no row, no FIXME. Reviewers don't get to ask for more. Default `unexpected_error`.
* **A race gets a row, not a fix.** No counters, no retries.

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

## Thread 1: the fix list for #470 (awaiting the Coach's go)

From reading the source diff line by line at `588988f7`. Strike anything; nothing here has been started.

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

## Thread 1b: plain_whisper (proposed, not started: threads are paused)

The Coach's ruling, 2026-11-04: a whisper and a sidecar are both plain objects, and a patch always names its fields.

```ts
box.put({ whisper: { a: 7 } })    // seals the JSON of { a: 7 }: '{"a":7}'
box.put({ whisper: 7 })           // refused 'bad_option'
```

* `whisper` is checked with `whisperBag` from `shapes/box.ts`, as a sidecar is, plus the refusal of `LOCKED`, itself a frozen
  object. Strings, numbers, booleans and arrays are refused.
* `whisperHolder`, `WhisperHolder` and every `{ val }` go: the patch, `boxDna`, `box.whisper`'s getter and setter,
  `extractWhisper`, `#unseal`, `sealedRecordOf`. The whisper stays deep-frozen where the holder froze it.
* The birth default is a plain `{}`, sealing `'{}'`.
* `#unseal` holds what it opens to the same check: anything else is `damaged_box`, as today.
* The older public `src/box.ts` and `src/vault.ts` are not touched. Pre-1.0, no migration, and nothing uses the new models yet.
* Starts after #470 merges. Heavy test churn, all mechanical.

## Thread 2: newhello

Approved by the Coach, 2026-11-04. Starts once Thread 1 merges: both move `vault.ts` and `box-listing.ts`.

### Target

```ts
vault.getBox(bx)     // and box.get  >> vault.boxes.get(bx)  >> vaultDB.getBox(bx)
vault.boxes.hello()     : this       // setup work: the watch, then refresh
vault.boxes.refresh()   : this       // >> vaultDB.getVault: { val: { ...vault, boxes: [] }, damaged_rows, world }
vault.boxes.hydrate()   : this       // timely ? this : this.refresh()

bank.vaults.hello()     : this
bank.vaults.refresh()   : this       // >> vaultDB.getBank:  { val: { ...bankScope, vaults: [] }, damaged_rows, world }
bank.vaults.hydrate()   : this
```

* **`bank.vaultListing` becomes `bank.vaults`, `vault.boxListing` becomes `vault.boxes`.** Each is a listing, with its
  instances at `.things`. The answer's `val.boxes` is an array of records, so the same word means two things by layer.
* **`damaged_records` becomes `damaged_rows`**, moving out of `val` to the answer beside `dbhas`, on `getBank` and
  `getVault`. This is the "separate response field" of `unrace-nextplan.md`. `val` then ducks as its parent.
* **`getBank` as parallel as reasonable:** its `val` gains the bank's scope, and its `world` stays the `BankScope`.
  `getVault` can refuse absence and `getBank` can't, which is fine.
* **A listing is timely as a storable is:** it holds when it last refreshed, against the `maxMillisSinceRefresh` it
  already has. `hello` and `hydrate` live on the base, and `refresh` on each concrete listing, same section, same layout.
* **`refresh` takes `world` first, then builds each row**, as `fetchBank` does today. `getVault` goes with its default
  `ifAbsent: 'fail'`, so a void or gone vault is refused by the vaultDB, its `world` reaching the vault before the throw.
  `fetchListed`, `NothingListed` and the `BoxListing.hello(listed)` override go. `vaultRowOf` stays for `tryGetRow`.
* **`vault.hello`** is sugar over `this.boxes.hello()`.
* **The vault makes its own box listing.** `VaultWorld` gains `vaultDB`, `boxListingOf` goes, and `VaultListing` stops
  knowing boxes exist.
* **Watch, then refresh, in both listings.** `refresh` runs under a live watch later anyway, so fetch-first spares no
  case, and leaves a gap. A refused `hello` leaves the watch on: `??=` makes the retry safe.

### A vault of a new life is vacated and delisted

Everything in it goes away:

```ts
takeWorld(world: unknown): void {
  const row = MSX.vaultRow.parse(world)
  if (row.vault_tok !== this.vault_tok) { this.vacate(); return }
  this.receive(row)
}
```

The slot empties, and the next fetch builds the new life. A box is durable across tombstones: its instance stays.

### Bank

**A vacated or swept bank is done** (`unrace-nextplan.md`, not yet built). That removes the rest:

```ts
async hello(): Promise<this> {
  try {
    await Promise.all([this.keyDeriver.load?.(), this.strengthChecker.load?.()])
    await this.vaults.hello()
    this.#stage = 'ready'; this.#err = null
    return this
  } catch (err) {
    this.#stage = 'refused'; this.#err = refusalOf(err)
    throw err
  } finally {
    this.settle()
  }
}
```

* **The prerequisites run together, and nothing is listed unless they all land.** Plain `Promise.all` is enough: a late
  load past a refusal does no harm, and a retry repeats it. Confirm they're independent as you build.
* `#bringUp`, `#lastHello`, `#makeListing` and the identity comparison go. `vaults` is made once, and readonly.
* `#remakeSnapshot` stays, and a `settle` calls it, as on a storable.
* **`Bank.make(opts)` is the one way in** (the Coach, 2026-11-04). It is synchronous: it validates, applies defaults, and
  hands a private constructor its arguments fully validated. No `build`, and no async housework.
* **`device_id` is a required option, the host's to keep.** The deviceDB no longer caches it: `cacheBank`, `forgetBank`,
  `doCacheDeviceRecord`, `DeviceRecord`, `rewrote` and its bad news all go, and the deviceDB serves leases alone. So
  `device_id` is `readonly`, real from the first moment, and in the snapshot. `proving.ts` doesn't change.
* **Its doc block carries the privacy rule the mint used to enforce:** a random id you keep, never drawn from anything about
  the device or the user. It is stored in the clear on every wayin, readable by the backend. Update VOCABULARY.md's
  **deviceId**. Consider a bound on `str.min(1)`, as `credential_id` has.
* A host that passes a new id each page load breaks nothing: nothing reads it back, and each wayin's ctx is rebuilt from
  its own stored header.
* **`bankOpts` must answer what it checked:** the constructor parses and discards today, as a zod `obj` hands back a copy
  of each duck (measured: `vaultDB`, `deviceDB`, `keyDeriver`, `clock` all lose their identity, and a class instance its
  methods). Make the ducks identity-preserving, as `VX.strengthChecker`'s `custom` already is, then take defaults and the
  minutes-to-millis in the checker and read the parse's result.
* **The deviceDB's verbs are named by kind**, as most things are peeked by their holder: `cacheLease`, `peekLease`,
  `forgetLease`, and `leasesProvedBefore`.

## Thread 3: newdel (sketch)

* **`vaultDB.delBox(duck)`, `delVault(duck)`**, building the tombstone in the base class, as gate verbs already stamp
  their own revision. Nobody upstream writes a next revision or an `am`. The duck's revision is the prior, so `{ prior }`
  goes, and `demandNextSeq` with it for dels. `doDelBox` keeps its signature.
  ```ts
  { ...VS.sentinelBoxOf(scope, vault_tok), ...knownFields(duck), ...VS.nextRevisionOf(duck, now), am: 'x' }
  ```
* **Any duck will do:** `{ ...scope, vault_tok, ...revision }`, a record, an instance, a damaged entry. `vault_tok` is
  required, as box rows are stored per life. A thin duck's tombstone carries `VoidLifeTok` and the sentinel date.
  `written_at` is now.
* **`listing.del(duck)`** forwards and delivers. `delOver`, `tryDelRow`, the held-revision swap and the `am === 'd'`
  branch go. `Storable.del` moves to Box. `vault.del` keeps deleting over the revision the gate was read at.
* **Damaged rows out of the listing:** `#damagedRecords`, `damagedAt`, `BoxListing.del`'s override, the vacate in
  `BoxListing.hello`. Then `box.vacate` is called only by a listing that will never serve again.
* **`delBox` keeps #470's `stale_write` with the frontier** over a box not held. A host that skips `vault.hello` chooses
  that: the library adds nothing at the bottom for it (the Coach, 2026-11-04).
* **`#receiveNothing` folds into `fetch`:** with the void `del` gone, `gotvoid` is the only null left.
* A void `del` over a held box still crashes `record_conflict`; any other void `del` gets the one-line throw.

## Thread 4: the listing's shape (sketch, design not done)

To firm up in chat with the Coach first.

* **Verbs to the concrete listings:** `put` and `del` leave `Listing`, same names, same sections. Abstract hooks fall
  from 12 to 8. `watchRows` moves to the base, as both are identical, once `ListingWorld` has `scope`.
* **Forwards go:** `listing.lockState`, `ensureTimelyWorld`, `clock`: a storable holds `world` already.
* **`fate` out.** Only `replace` is a real need: a newer vault of another life, or alive over a tombstone, takes the slot.
  `lose` goes altogether. `receive` already lets an older record of the same life lose, and an older life's record
  throws, by the Coach's ruling. Any test pinning `lose` for another life changes to that throw.
* **`deliver`'s rule:** the caller hears one thing, the refusal or a failed `receive` of the row it asked about; all else
  is bad news. `takeWorld` is unguarded today, and sinks the rest.
* **`Settled.badnews` out:** it is always `[]`.
* **Open:** does a failed `takeWorld` still let the row be delivered? And the `damaged_row` paragraph in `deliver`'s doc
  block: with damaged rows the host's, it probably goes.

## Rows

* A failed birth leaves a void instance in the slot. It's harmless and invisible in the snapshot.
