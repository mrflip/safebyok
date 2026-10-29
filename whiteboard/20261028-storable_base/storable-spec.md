## Notable changes:

* customer always has durable access to the box -- no more mid-flight
  `demandUnlocked` and hairsplitting policy decisions. You must be unlocked to view a whisper or make certain updates. Locking or evicting a vault interdicts access.
  - that said: the new policies are nowhere clearly stated, and consequently inadequately implemented.
    The important part, however, is: each operation just calls a function to establish its success (`ensureTimelyStorability` or whatever) and then a guard to check for drift (`demandStorability`).
* The Listing model, not vault, intermediates between the storable and the VaultDB, handling
  generic errors; syndicating the updated world states that arrives with each response;
  owns bad news and refusal handling; and owns caching records
* The cache (backed by DeviceDB) is consulted once, to preload the listing, and never again. (The vault's use of DeviceDB to store the lease won't change)
* Listings own subscriptions and syndication. Vaults have a listing.
* The storable public-facing interface uses some new verbs (send, edit, fetch) so they aren't too tightly married to their VaultDB counterparts
* VaultDB subscription notifications will include a record:
  - box: a full record and a sparse vault
  - vault: full vault and gate
  - vault listing: sparse vaults
  - box listing: sparse boxes and vault

## Mini-Vocabulary

These terms are new within this design sprint, or bear important refinements over what's in VOCABULARY.md:

* `edit(patch)`: public entrypoint to modify a storable
* `storable`: a versioned-update record that coordinates local edits, lazy-updated cached state, tombstoning, and limits access when vault is locked or evicted.d
// Fill in

* `world`: a still-a-bit-hazy abstraction from the parts above the storable (that aren't its listing): for a vault, it's the bank or some pieces of it; for a box, it's the vault.

### Please avoid / Deprecated

* `takeStorage`
* `ring` -- use `notify`

* Avoid the terms
  - `standing`, `stands` (temporary? estimation? upright?)
  - `raise` (fail? increment?)
  - Use a specific term (`get`, `find`) in place of `write` or `read` (unless you intend a blanket term for non-/modifying operations)
* Do not start comments `What the` (`What a foo returns`, `What the blerg sees when created`). Be concise and specific: `Return type of foo's X, Y or Z operations`, `DNA for creating a blerg`.


### Short term churn

These phrases replace others use in earlier parts of the design (i.e. we now say `overlay` and do not say `edited`)
GOOD:
* patch and PatchT (not props) for edit (not modify);
* 'overlay' (replacing the local-copy #edited record).
* `reconcile` (not deconflict)


## Local copies

We have, in principle, these copies of the data for a thing:

* listed: might be tombstone, sparse, or full // (unclear if instance or pojo)
* stored: most recent view from db
* live:   instance instantiated from full record
* cached: cached or local copy
* dna:    stub for `fetch(ifAbsent: create)`
* eager:  most recent + optimistic update
* edited: local update that has not been sent

It would be pleasant for the listing objects to incorporate all of those!
And to do so (a) as instances that (b) retain their identity through updates,
(c) hydrate in place, and (d) manage local updates, optimistic updates and
ground truth (latest observed stored values).

We receive a vault record for every vaultDB op touching a vault (a vault, a thing in that vault, a listing). In the case of a vault op, it's the same as the vault itself, maybe.

## Record forms

These forms do not imply pojo or instance:
* sparse: suitable for listing. does not have heavyweight attributes. Not sure if vault draft is (or can be made to be) sparse.
* tombstone: scope, revision, `registered_at`, `written_at` (when it was deleted), sentinel that it's gone. Nothing the user put in the thing (no sidecar).
* record: all props in the database row ("full")
* snapshot: confection of fields to serve react and other clients (snapshots are pojos; may have extra props or methods. Serves customer, not us)

Separately:

* live: an instance, meeting one of those shapes via getters or ownprops, enumerable or not
* pojo: any of the above, but props-only

Players:
* world (vault + bank):
  - provides a clock
  - carries listings
  - knows the vault scope and its epochs
  - knows vault states: locked/unlocked; fresh/stale; autolocking or not
* listing:
  - holds listed
  - offers operations via db
* vaultDB
* deviceDB

## Instance lifecycle

Listing creates instances on only these occasions:

* listing hello: loads anything found in deviceDB, makes instances from them
* host calls listing.send({...}) (¿listing.make?)
* listing is notified of a record change for an absent record

Listing updates instances on

* return of an operation
* listing is notified of a record change for an instance it has (might be sparse, full, or tombstoned)
* #edit is called directly

## Update

*Not the vault's concern: true of any storable, so the listing's to handle*

* Place errors and conditions in the correct pipeline
* dispatch errors so severe the world can't be updated
* no answer at all (`storage_unavailable`, `storage_blocked`, `not_permitted`): nothing carried,
  nothing to update. The trigger notes a completion without success; the refusal goes to the caller.
* what we sent was malformed (`bad_record`: a record or expectation not one this package builds;
  family `misuse`): our bug, refused before the adapter sees it. Nothing stored, nothing to update.
* what the db sent will not parse: `corrupt_record` (an answer missing what it must say: a stale
  refusal with no stored record, a tombstone naming another scope, a lease this package did not
  write), `damaged_vault` / `damaged_box` (a stored record failing its checks), `newer_format` (a
  format a later safebyok may write). What we hold stands; the refusal goes to the caller.
  - "the entry reads as damaged": for a box, yes, today. The listing carries `damagedBoxes`
    (`boxlabel`, `revision_tok` or null, `damage: 'newer_format' | 'damaged'`), the snapshot shows
    them, `damaged_box` is told once per revision, and `putBox` may write over one whose revision
    is known (`damagedBeyondNaming` refuses the rest). For the vault record there is no entry state:
    `damaged_vault` is a refusal of the read.

### Update the world

*Evicts the vault, and every box with it*

* the world in the answer is no vault (`absent_vault`), or a vault of another `vault_tok`
  (`vault_remade`): the Vault object is gone. The pending gating lands, the lease is dropped from
  memory (erasing nothing), the watch on storage ends, the bank hears and removes it from its
  listing, every box stops showing any data and disappears.
* the bank letting it go (`letGo`): the same path, with no refusal to tell.

Conditionally terminate, remove and clean up the vault (vault_gone) -- done

**Locks the vault**

* storage it cannot trust: an answer whose `vault_epoch` is below this device's record
  (`vault_behind`), or a user no longer signed in (`identity_revoked`). Lock: land the gating, drop
  the lease, erase this device's lease, force the next read; take nothing from the answer.
* a gate moved elsewhere (`gate_epoch` changed, the lease no longer fits): drop the lease from
  memory, erasing nothing; land the gating `gate_moved`. Boxes stop showing secrets.

* conditionally lock (ident changed, wayins changed)
* update the world


### Process record

An answer is a refusal, or a record (full, sparse or tombstone) beside the world it lies in.

* a write refused `stale_write`: dispatch the stored (newer) record, then send refusal to host
* Otherwise dispatch the answer's val record

central: grounded, worldly, inbound, given, offered, told, frontier, forward, topmost topfull
what to do with sidecar when a newer sparse record shows up?

Dispatch recent central version:

* Inconsistent: absence where a record was held, a tombstone with same version: refuse
* a record older than the version held (lower `revision_seq`): ignored, held copy stands. A read
  served before an own write and answered after it looks exactly like this.
* a tombstone, : the instance is evicted from the listing and told
  it is gone; its snapshot stops showing data.
* a record stored damaged (`damaged_box`, `invalid_box`):
  - instance is evicted, the news is told once per revision. ~~The read that found it succeeds.~~
* a write refused for size or room (`whisper_too_large`, `box_too_large`, `vault_full`): nothing
  stored, nothing to update; the caller's refusal.
* a record at the same or newer version: the "if conditions are met" path below.

If conditions are met:
* edit the record -- causes these things to happen
  - edit the local copies
  - updateSnapshot: if snapshot will change, make a new one and #replaceSnapshot (sets prop and sends to listeners)

### Storable receiving new central value

1. **Reconcile** and verify consistency of the answer
   - new record, old record, whatever the instance posesses right now -- this is where lease can do its battle royale
   - **Refusals throw; reasonable data is judged.** A scenario that cannot be made sense of (two
     records claiming one `revision_seq` under different `revision_tok`s; absence, or a tombstone, at
     the very revision held, a draft at 0 excepted) is a refusal, thrown. A record of another scope
     is the listing's to refuse: nothing in the storable knows a scopepath.
   - **Reconcile returns the record that stands**, and that record is what can be cached: the held
     one where the answer is older or says less (a sparse over a full at the same revision), else the
     answer. No verdicts. ~~`older`, `same`, `adopt`, `gone`, `conflict`~~ An edited copy is not
     reconciled against: the host deals with drift between edited (theirs) and central (ours).
2. **Adopt** the record as the central copy, frozen, if it is newer or the same and full-replacing-sparse
   - instance assigns props, private variables, anything denormalized or spread
   - makes a new snapshot
3. **Settle**: with the instance now complete and current, handle any consequences

### Storable returns { cacheable, badnews }

1. **Tell bad news** once: damaged ways in (and, via the listing, damaged boxes).
2. **Save to Local Backing Cache**

## Vault Storable

### `vault.reconcile()` -- still in old state, given new state and anything else it needs

### `vault.adopt()` -- assign props/private vars/etc; make snapshot

### `vault.settle()` -- consequences of the new props

Process changes to gate and wayin:
* ~~a way in stored damaged (`damaged_wayin`): told once per way in; the other still opens.~~
* ~~its own identity write (`putWayin`, `delWayin`): the record taken as an answer is, and the lease~~
  ~~dropped when it no longer fits the new gate.~~
I think this means:

* add, update or remove any wayins that change, and handle a damaged wayin
* Any changed wayin drops the lease

What the struck sentence meant, said plainly: when this device changes a way in itself, through
`putWayin` or `delWayin`, the vault record that write returns is handled the same way a fetched
record is. No special path. Then: the lease in hand was granted under the old gate. If the new gate
is not the one it was granted under, the lease is dropped. One correction to "any changed wayin
drops the lease": after a `putWayin` made here, the proving that proved the change grants a fresh
lease under the new gate, so this device stays unlocked. Only a gate changed elsewhere locks here.

 ~~this device's record (`DeviceRecord`: scope, `device_id`, `highest_vault_epoch`), kept in the~~
  ~~deviceDB beside the lease: a per-device watermark of the highest epoch this device has seen~~,
  ~~distinct from the vault's own epoch, which storage bumps~~
  -- this is just a cached copy. The listing will have used it to pre-hydrate the vault,
  and will update it after the vault settles and returns

### Other vault responsibilities

* a lease revoked in another tab (this device's store holds none, or one under another gate):
  drop the lease from memory.
* autolock: `ask_passphrase_at` reached. Drop the lease, disarm the timer. Boxes stop showing secrets.


## A new vault showing up

Who does what, step by step, following *Instance lifecycle*. "Listing" is the bank's listing of
vaults. "Vault" is the Storable instance. Timing is set aside.

1. **Warmup, once per page.** At the listing's hello it reads every cached copy from the deviceDB
   and makes a cold instance from each. This is the only time the device cache is read. After this
   it is only written.
   *Listing reads; the Vault constructor assigns.*

2. **The host asks.** `bank.ensureVault({ vaultlabel })` is `vaultListing.fetch(scope, { ifAbsent:
   'create' })`. An instance already under the scopepath, warm from step 1 or born earlier, is the
   one. None: `vaultListing.make(draft)` makes a cold instance from the dna.
   *Listing.*

3. **The instance decides to fetch.** Its trigger says it is not timely: nothing fetched yet, or the
   cached copy is past `maxMillisSinceRefresh`. It asks the listing to run `vaultDB.ensureVault`.
   The trigger is the instance's. The vaultDB call is the listing's.
   *Vault decides; listing calls.*

4. **The listing screens the answer.** The cases under *Update* that concern no vault in particular:
   no answer, a malformed request, an answer that will not parse. Any of these is a refusal to the
   caller and nothing reaches the instance. For a vault, the world in the answer is the vault
   itself, so there is nothing to peel out.
   *Listing.*
   - **important note**: the vault is only updated from the `world.vault` section of the reply: even
     if an error occurred (stale write or whatever), the `world.vault` in the answer is timely

1. **`vault.receive(answer)`.**
   *Vault, in three parts:*

   - **Reconcile.** The instance holds the cached copy, or nothing. A different `vault_tok` means
     the cache was of a vault since deleted and made anew: the cache is wrong, not the answer, so the
     cached copy is thrown away. An epoch below the cached one means storage is serving less than
     this device has seen: refuse `vault_behind`, take nothing. Otherwise the answer is the new
     central record. Here the vault reads its own lease from the deviceDB and judges it: it fits
     only under this `vault_tok` and this `gate_epoch`, before its `ask_passphrase_at`.
   - **Adopt.** Assign the props from the central record. Freeze it. Make the ways in from the
     gate. Make the snapshot.
   - **Settle.** Take up a lease that fits: hold it, arm the autolock timer. Erase one that does
     not, with the vault's own `deviceDB.delLease`. No gating is pending at birth, so nothing lands.

   `receive` returns `{ cacheable, badnews }`: the safe parts of the central record, and each way
   in found stored damaged.

2. **The listing acts on the return.** It writes `cacheable` to the deviceDB. It tells each item of
   `badnews` once, to the host's `onBadNews`. It publishes its own snapshot, the list of vaults.
   *Listing.*

3. **The watch.** One vaultDB subscription per vault scope, held by the listing. A notify
   jumps in at step (4).
   *Listing carries; vault decides.*

4. **The listing hands the instance to the host.**
   *Listing.*

A vault new in storage, not only new to this page, takes the same steps. In step 4 the answer is
the draft just written, with no gate. In step 5 there is no cached copy and no lease, and the
instance comes out novel.

Neither the storable machinery nor the listing touches the lease. The vault reads it, judges it,
takes it up or erases it, and renews it, all through its own deviceDB handle.

### What a notice carries

A box notice carries the box in a record form and the world it lies in. Neither is the whole thing.

* **The world, without the gate.** The vault's sparse form: scope, `vault_tok`, `revision_tok`,
  `revision_seq`, `gate_epoch`. The gate itself, two ways in with their salts, wrapped keys and a
  passkey's `credential_id`, is most of the vault record by a factor of twenty or so, and a box
  notice has no use for it. A changed `gate_epoch` locks the vault regardless; the gate is fetched
  when something next needs it.
* **The box, sparse at most.** Never the whisper: `whisper_ciphered` and `box_key_wrapped` are the
  weight of the record and are only needed to open it. The sidecar does ride along, since it is
  what the listing shows and what the snapshot renders; without it a notice could not be adopted
  and every visible change would cost a fetch anyway. A box whose whisper is wanted hydrates.
* **The adapter makes that true.** Convex's `watchVault` can return the sparse forms directly.
  Postgres `NOTIFY` carries 8000 bytes, so that adapter reads the sparse forms itself after the
  notify, and only then notifies the core. The core sees one contract: a notice is always a sparse
  form or better, or a tombstone, and enters the pipeline at step 4.

* **A sparse notice landing on a full record strobes a refresh.** The instance adopts the sparse
  form, since it is newer, and so loses its whisper. The listing then fetches the full record at
  once, fire and forget, so a thing this device held hydrated stays hydrated. A notice that is
  already full, from `fullFor`, needs no strobe.

Today's `watchVault` signature carries `vault_tok`, `gate_epoch` and `[boxlabel, revision_tok]`
pairs, and the adapter discards even that and rings bare. The version-only pair is a fourth form
that cannot be adopted, which is why it is not one here.

### The device cache, across tabs

`idbDeviceDB` is IndexedDB, which is per origin: every tab of the app shares it. `memoryDeviceDB`
is per tab. So yes, with the supplied browser store the cache is shared, and two tabs write it.

The deviceDB deconflicts, as `raiseDeviceRecord` already does: a write is one read-modify-write
transaction that keeps the copy with the higher `revision_seq` and never lowers. A tab's warmup
then reads whatever any tab last saw, which is the point of the cache. Neither the listing nor the
storable compares versions on the way in to the deviceDB. No change bell is needed for the cache:
a tab learns of a change from its own vaultDB watch, and the cache is read only at warmup.

The lease is also in the deviceDB and also shared. It is the exception to "written after warmup":
the vault reads it again whenever it judges whether it is still unlocked (`ensureUnlocked`, and
each `receive`), because a lock in another tab erases it.

## More

I want to serve the react case and the non-react case: I can fiddle around
with the innards of sidecar and whisper

Getting a box creates a live instance that guards the data. Triggered locally, via timer, or via subscription, a signal may come in to lock or evict the vault:

* if the vault is locked, boxes should stop showing secrets;
* if the vault is evicted, everything stops showing any data and disappears
* (an intermediate verb might have boxes remove their encryptedWhisper and sidecar but preserve the listing)

Whisper is anything JSONable. It is AES-GCM encrypted by a key that never leaves the device, sealed with the metadata. It may only be accessed while the vault is present and unlocked.
Sidecar is an object. It is visible even if the vault is locked.

## Operations

### Options

* `ifAbsent`:  'create', 'fail', 'nil'
* `ifPresent`: 'replace', 'fail', 'fetch'
* `maxMillisSinceRefresh`, `maxWorldMillis`

### Listing Ops

* A listing is a map of live instances, and offers batch gets `listing.hydrateAll()`. Hydrating a record does not change its identity, only populate the missing fields.

* `thingListing.make(props)` constructs a thing. Don't call `new Thing()`
* `thingListing.at(scope): Thing | null` -- cached value
* `thingListing.fetch(scope, opts): Thing` (with `ifAbsent: 'nil'`, returns `Thing | null`)

### Storable Ops

I'm being pretty vague about what the ensureWhatever guards do, because I'm not perfectly certain.
But: they're not the concern of the op-- all they need to know is that their preconditions are met.

  // this is not how things work in practice for the fetch: listing fetches, calls `receive`, caches
* `thing.hydrate(opts)` ensureTimelyWorld. if stale, fetches; returns the cached value. Calls to hydrate are joined oneAtATime (only one call is pending at a time, all callers receive its result)
* `thing.send(props, opts)` ensureTimelyStorability, edit(props, opts), db.puts the sealed record
* `thing.edit(props, opts)` async, replaces the `edited` state and settles side effects like `written_at` or lease stuff
* `thing.del(opts)` async, ensureTimelyStorability, replaces #edited with a tombstone, asks listing to delete from vaultDB and remove. Not sure of the ordering between the two. Customer can specify infinity time to delete without looking. Or something. But the base case is to ensureTimelyStorability
* ~~`thing.deconflict(opts)` -- becomes timely, calls `opts.mediatorFunc({ stored, cached, current })`, then `modify`s with the result if non-blank.~~ leave to later
  - vault does not accept mediatorFunc, involves lease and deviceDB

### Concrete Ops

* `box.unsealWhisper(opts): Whisper` on the instance unseals the whisper temporarily and returns it, storing nothing in the box (the customer can do what they wish).
  - returns `LOCKED` symbol if locked. or throws. or something.
* `box.expose(boxlabel, opts): void` unseals the whisper, stores in a private variable and offers it with a public getter on the box. (it's the customer's decision, and if we don't write it some will, but without the guard). On lock, a sentinel symbol is returned in place of the whisper prop
  - `box.get/set whisper(val)`: accesses private variable #whisper if exposed. returns `LOCKED` symbol if locked. These do not seal -- that happens on `send`
* `box.seal(whisper)`: uses lease to seal with current props, updating encryptedWhisper
* `box.reseal(opts)` hydrates, `unseal`s the whisper, then `seal`s it
* `box.edit({ whisper?, sidecar? }, opts)` Takes up most recent between `edited` and `central`
  - replaces the sidecar (if given)
  - seals the whisper (if given or exposed); otherwise, with opts.reseal, `reseal`s (hydrate, unseal, seal)
  - note: the sidecar will not be bound (not part of the cryptoCtx)

## Props

| type  | immutable                                 | revision       | hydrated                 |
| ----- | ----------------------------------------- | -------------- | ------------------------ |
| Vault | scope props, `registered_at`, `vault_tok` | revision props | `gate_epoch`, `gate`     |
| Box   | scope props, `registered_at`              | revision props | whisper props, `sidecar` |

Vault scope:    `applabel`, `user_id`, `vaultlabel`
Box scope:      `applabel`, `user_id`, `vaultlabel`, `boxlabel`
Revision:       `format`, `revision_tok`, `revision_seq`, `written_at`
Whisper:        `whisper_schema_version`, `whisper_codec`, `whisper_ciphered`, `box_key_wrapped`

### Performance & Overhead Breakdown

To perform JSON.stringify, generate a cryptographically secure key, and execute AES-GCM encryption with Associated Data (AAD), the total execution time on an iPhone 13 class browser will be roughly 0.15 to 0.45 milliseconds.


| Operation               | Estimated Time | Driver of Performance                                                                                                      |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| JSON Serialization      | 0.05 – 0.15 ms | JSON.stringify on your medium-sized object + metadata. V8/JavaScriptCore highly optimizes this into native memory buffers. |
| Text Encoding           | 0.01 – 0.03 ms | TextEncoder.encode() converting strings to Uint8Array views.                                                               |
| Key Generation          | 0.01 – 0.02 ms | crypto.getRandomValues() to extract CSPRNG bytes for the key or IV (96-bit IV recommended for GCM).                        |
| AES-GCM + AAD Execution | 0.05 – 0.15 ms | Native crypto.subtle.encrypt hardware pipeline processing the plaintext payload while mixing in the cleartext AAD bytes.   |


Implement types and validations for the storable files as we do for everything else (see shapes). Use, but don't (yet) modify, the types and checkers in shapes/box or shapes/vault. if there are strays -- a shape from the existing shapes/box doesn't match well -- put that in storable/goaway.ts.  To be clear: (a) reuse existing structures when they serve the design; (b) don't modify the larger body of working code.