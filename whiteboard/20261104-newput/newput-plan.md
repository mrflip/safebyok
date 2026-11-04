# newput: what's left

For the Coach, and for the thread-workers who build it. What's done is in `resolutions.md`, beside this file. `whiteboard/20261102-newdesign/newput-handoff.md` says where things stand.
The code below is pseudo code: where it disagrees with common sense or STYLE.md, follow those and say so.

**Threads 1b to 4 are proposals, until the Coach says go on each.** Discuss a change before assigning it. They predate #472, #473 and #480, so check each against the code first: the code is on `20261104-del_damaged`.

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
* **Later rulings are in `resolutions.md`, *Rulings from the rework*:** same-bodied guards stay; the world is checked at each step; a lock keeps the exposed whisper; no repairs in normal operations; the friend stays.

## Thread 1b: plain_whisper (proposed, not started)

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

Approved by the Coach, 2026-11-04. It and the stack both move `vault.ts` and `box-listing.ts`, so build it on the stack.

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
* **`delBox`'s sentinel can tombstone a damaged row with no readable revision.** Such a row is listed at the void revision, the same as the sentinel's prior, so `doDelBox`'s
  `isDamagedBoxAt` lets it land: a normal delete repairing a row, which `#no-repair-in-normal-ops` forbids. A row naming a revision refuses `damaged_record`. Close it here, in the storage rule.
* **The listing keeps its damaged rows (the Coach, 2026-11-04):** "damaged rows are exceptionally unlikely, so it's a small cost." The list isn't updated by `tryDelDamagedBox`; it's replaced on any list refresh. So `BoxListing.del`'s filter of it goes, which it still does today, and a test pins it. `#damagedRecords` and `damagedAt` stay: the next item changes to match.
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
* **`buildVault` stops going through `Vault.launchBirth`:** today it runs listing, `Vault` static, listing.
* **`#receiveNothing` and `buildOrReceive` lose their `demandEnabled`** once `fate` is unwound. `deliver` has the check now.
* **Open:** does a failed `takeWorld` still let the row be delivered? And the `damaged_row` paragraph in `deliver`'s doc
  block: with damaged rows the host's, it probably goes.

## Parked: small things around the lease

* **`settle`'s name promises more than it does:** it remakes the snapshot and notifies.
* **`Box`'s inherited `lock` and `boxListing.lock`** no longer have callers that do anything for a box.

## For Thread 4: the Coach's markup, on `listing.ts`

6. The Coach's draft of `deliver`'s doc block, not yet in the code (the code has a one-line SLOPDOC). Take: apply it with Thread 4, as `deliver`'s rule and the damaged rows change there.

```
/** Delivers each part of a VaultDB answer to the correct `receive`r: `world` is sent to bank/vault, and a newest record/tombstone/etc to the listing.
 *
 * First, `world` is sent to takeWorld before proceeding. Each following step will assume timeliness but demand consistency (if the world changes it will fail, but there's no need to check)
 * Next, if the answer holds a frontier (most-recent-stored) value, as either
 * * `val` -- the return of a successful fetch or put (the typical case)
 * * `dbhas` -- the actual frontier record sent on a stale_write, or a put with ifPresent=fail
 * Route it using buildOrReceive (adding a new instance if necessary)
 *
 * In the very unlikely case of a damaged row coming out of the VaultDB, `damaged_row`
 * holds a sentinel object. That instance is unlisted -- its value otherwise ignored --
 * and the bad_news shared. No further action is safe or desired: we will not use it.
*/
```

7. On `buildOrReceive`: "Deliver to record's instance if we list it; otherwise, build and list a new one". Take: use it once `fate` is unwound, in Thread 4.

## Rows

* A `lock()` crossing a lease's cache put erases the row only if the deviceDB runs its calls in the order they start. An adapter that reorders them could leave a row cached on a locked vault, until the next lock or proof overwrites it.

* A failed birth leaves a void instance in the slot. It's harmless and invisible in the snapshot.

