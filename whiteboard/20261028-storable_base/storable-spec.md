## Please Remember!!

* `timely` is measured against the maxMillis number given. maxMillis of Infinity means go ahead! (*excluding a special case involving sparse data*)
* Throwing exceptions is our job! The library offers simple brittle primitives that can be composed into resilient operations
* Complex code cannot be safe, and safety is our top value. Short, clean stack traces make the code easy to reason about and review
* The core use case -- storing a handful of API keys accessible only on-device -- is pretty chill. They'll be entered once, maybe modified on a schedule but who are we kidding, and the customer will only tolerate being re-prompted for a passphrase weekly or so. Updates will be very very infrequent, and most likely be from another tab, only occasionally from tablet to phone or whatever. Race conditions require pasting different value into different devices/tabs and hitting submit within the network response time. With all that said: (a) the library has potential past that use case, and (b) even if they don't care, we have to detect the edge cases and that means we have to name refusals and handle them somehow. The takeaway is not "we can allow unsafe handling", the takeaway is "we don't have to make edge cases ergonomic or even accept every edge case -- only to be clear what the outcome is".
  - whispers change very slowly - days/months/years.
  - a handful of tabs and 2-3 devices would be a large number of competing writers, and it's physically difficult to have them submit competing writes

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

These terms are new within this design sprint, or bear important refinements over what's in
VOCABULARY.md. One line each; a second, struck-out line is a use found in the playground or the
spec that conflicts with the first. `box`-only terms say so.

### Players:
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

### Please avoid / Deprecated

* `takeStorage`
* `ring` -- use `notify`
* `held` as a noun. "holds" can mean "prop of", has a pointer to, contains, stores, etc.
* `strobe`, `tickle`, `poke` -- these are jocular terms meaning activate or trigger and not method name suggestions
  - ~~`edited`: the same, kept as a whole record rather than as the fields laid over central~~
  - ~~`eager`: central with an optimistic update~~ (that is the record in hand, below)

* Avoid the terms
  - `standing`, `stands` (temporary? estimation? upright?)
  - `raise` (fail? increment?)
  - Use a specific term (`get`, `find`) in place of `write` or `read` (unless you intend a blanket term for non-/modifying operations)
* Do not start comments `What the` (`What a foo returns`, `What the blerg sees when created`). Be concise and specific: `Return type of foo's X, Y or Z operations`, `DNA for creating a blerg`.

### Copies a storable keeps

* `central`: the latest record this device knows storage holds, frozen: full, sparse, a draft, or a tombstone.
* `overlay`: the record fields edited here and not yet sent; null when none.
* `record`, the record in hand: central with the overlay laid over it; what the snapshot shows and what `send` writes.
* `snapshot`: frozen plain data a host renders, the same object until something changes; never a whisper.
* `cacheable`: what `receive` hands the listing to write to the device cache. May be sparse, full, or tombstone.
  - ~~`cached`: the copy read from the deviceDB at warmup~~ (after warmup the cache is only written; the copy read is just the record a cold instance is born with)

### Record forms

(The second bullet points for some are me folding other drafts back in. The `codeface` ones are consensus)

* `full`, `record` (`BoxRecord`): every field storage holds.
  - _the code uses record as an accessor meaning "the best of central and overlay" -- big mistake by me. Will change once I understand the lifecycle_
  * ~~record: all props in the database row ("full")~~
* `sparse` (`BoxSparse`): the record without its heavy fields (`gate`, `encrypted_whisper`). Certain listing queries and updated record notifications carry only the sparse form.
* sparse: suitable for listing. does not have heavyweight attributes. Not sure if vault draft is (or can be made to be) sparse.
* `dna`: scope and seed props handed to `build` ~~or `send` with `ifPresent: 'fetch'` (this will be sugar added later: build().send(ifPresent: 'fetch' maxMillis Infinity))~~.
* `tombstone`: durable record of a deletion; scope, revision, times, `deleted: true`. _Explain, intelligibly: ~~An answer of nothing stored is one too, at the revision held.~~_
* tombstone: scope, revision, `registered_at`, `written_at` (when it was deleted), sentinel that it's gone. Nothing the user put in the thing (no sidecar).
* `stamp`: the fields the seal binds: without the full set of values, the encrypted value cannot be recovered. For box, its sparse form plus `vault_tok`.
* `live`: an instance, (eg of `Box`); `pojo` (Plain Ol' Javascript Object): by implication, the fields of a datatype as plain properties and none if its methods (eg `mybox.record` or `{ ...mybox }`).
  * live: an instance, meeting one of those shapes via getters or ownprops, enumerable or not
  * pojo: any of the above, but props-only
* `snapshot`: frozen slice of props given to `subscribe`rs
  - serves customers, *only*. Not used in any was as a data source.
  * snapshot: confection of fields to serve react and other clients (snapshots are pojos; may have extra props or methods. Serves customer, not us)
* (If we need the term) `listed`: an instance the listing has; its central may be sparse or full -- not `held`, which is in the `Avoid` list now
* _(`draft`): I'm not convinced this is a thing, and don't want it named until we know why it needs special treatment. For both Box and Vault we can fill in defaults that look perfectly good in the data store just as they are if nothing is present._ ~~the sparse form at `revision_seq` 0, made here from a dna and not stored yet. A vault's draft is its full novel record, `gate` null.~~
  - ~~a full record at revision 0, its ciphered fields filled with placeholders~~

* Whisper is anything JSONable. It is AES-GCM encrypted by a key that never leaves the device, sealed with the metadata. It may only be accessed while the vault is present and unlocked.
* Sidecar is an object. It is visible even if the vault is locked. It is not sealed -- customer may change and access its values off-device

*Note:* Sparse, Full, Tombstone imply a set of fieldnames; they do not imply whether it's a pojo or instance.

### Verbs on a storable

* `hydrate(opts)`: make the world and then the record in hand timely, fetching each that is not. Calls made during a fetch join it.
* `edit(patch, opts)`: reconcile patch, overlay, and central; adopt the values; settle the consequences (eg handling the lease and wayins). Does not modify Central. `overlay` is now in place -- even if nothing changed, even if the patch is empty. ~~Stores nothing.~~ Does not update the VaultDB, and currently, does not cache. ~~Needs the vault unlocked, whatever the patch holds.~~ _that is Not true for a vault, and it's Not clear if it's true for sidecar._
  - ~~`modify`~~
* `send(patch, opts)`: `edit` to apply the patch, `put`s the reconciled settled
  record bearing the correct next revision. Returns the stored result
  (as `this`, by contract -- it does so by waiting until the answer
  is committed, `receive`d, adopted and settled).
* `del(opts)`: immediately delete the thing using a timely revision. Optimistically applies the tombstone as overlay, and once committed, returns the stored value (as `this`, by contract -- same process as for `send`)
* `receive(fetched)`: update to match a new observation of the external value. Reconciles, adopts, settles; and then hands back its `cacheable` and any `badnews`.
* `reconcile(rcvd)`: produce an update strategy using the record's own state, `central`, `overlay`, and the `rcvd` props (from edit or recieve). Throws if defects are found (as determined by subclass and presumably someday by a customer hook).
* `adopt(???)`: set own props, private vars, etc for a reconciled newly receive/edit'ed record (and maybe from constructor as well). Unclear about how to handle the edit/receive/constructor split; I was considering `assign`. Never modifies or reconsiders the props, or takes further action
  - ~~(there are no such fields: the snapshot reads the record)~~ yes there are: gate, gate_epoch
* `settle()`: idempotently act on the updated state. Must call super().
  - parent class makes a snapshot
  - ~~now central beyond its fields, and return the bad news found in it~~.
  - A vault settles its lease and ways in here
  - Called after every `receive`, `edit` and once by `build`
* ~~`overlayOf(patch, opts)`: the one step of `edit` the concrete class writes: the record fields a patch becomes, sealed where they must be.~~
  - ~~`overlayPropsAndSealBeforeSettling`~~
* `seal` (box): cipher a whisper under a fresh boxKey wrapped under the vaultKey, cryptographically binding the stamp. `unsealWhisper` opens the stored whisper for one call. ~~`unseal` is not a thing~~
* `reseal` (box): unseal the stored whisper and edit it back in, sealed again.
* `expose` (box): unseal and save the `#whisper` internally. This opens a whole ton of questions, and is a NOTYET todo. I have included it as an important forcing consideration for the design.
  - Use of this function presumes a looser threat model and warrants different guarantees.
  - `whisper` get/set access to `#whisper` while unlocked, returns a sentinel otherwise (?)
  - `veil` disables access.
  - `LOCKED` (box): sentinel `box.whisper` returns while the vault is locked.

### Guards and states

* `timely`: fetched within its horizon. Of a storable, the record in hand; of the world, its own.
* `hydrated`: the record in hand is full.
* `gone`: central is a tombstone. The listing has let the instance go; every verb on it refuses the absent refusal.
* `locked`, `unlocked`: the vault's lock, by the listing's word (`lockState`).
* `storable` (adjective): a record can be written now: not gone, unlocked, and the record in hand full. `demandStorability` throws otherwise; `ensureTimelyStorability` hydrates first.
* `isX`: boolean, never throws. `demandX`: synchronous, throws unless X. `ensureX`: async, makes X so or dies trying
* `absent_box`, `absent_vault`: refusal when `ifAbsent: fail`

### StorableListing

A `listing` tracks all known live instances of one Storable type, by scope.
It owns the VaultDB subscriptions, the cache writes, the bad news, and every VaultDB call made for that storable type.
`Bank` uses a `VaultListing` of `Vault`s, `Vault` uses a `BoxListing` of `Box`es.

  - where does it put its tombstones? what does it do when a new record appears with that scope?
* `hello`: warm from the cache, start the watch, hydrate everything. _probably_
  - ~~`goodbye`: end the watch.~~ probably, not yet
* `build(record|sparse)`: constructs instance, settles its props. Sends nothing to VaultDB. Currently is not cached.
  - ~~`make(dna | fetched)` is sync and typically a class method, we're not offering that~~
* `at(scope)`: the instance held, or null; reads nothing. `fetch(scope, opts)`: the instance, hydrated, or what `ifAbsent` says for one not held or found gone.
* `deliver`: the pipeline for a VaultDB response: update world, hand the record to `receive`, evict gone things, cache, tell bad news, settle self.
* `evict`: a vault taken away, with every box in it; the bank lets it go.
  - ~~`let_go`: the listing drops an instance gone.~~ I prefer the bluntness of evict/evicted.
* `settle` -- handle consequences of new data (eg updating snapshot)
  - ~~`publish`: replace the listing's snapshot and call its listeners.~~ use same verbs everywhere
* `answer`: outcome of a storage call: `{ val world meta err ok}`.
* `notice`: what the watch delivers: a record, sparse at least, and its world. Enters `deliver` like an answer.
  - ~~`ring`~~ (a bare ring, with no record, is not a notice)
* `watchFull`: the storable scopes the watch should push full records for: the hydrated ones. ~~`fullFor`~~
  - is it important to keep a separate list? Not sure.
* `world`: what surrounds a listing: the bank for vaults, the vault for boxes. Supplies the clock, the lock, its own timeliness; Can `receive` an updated record.
* `badnews`, `tellBadNews`: a refusal met in storage that nobody asked for (a damaged box, a damaged way in), told once to the host's `onBadNews`.
* ~~`adopt` schedules the trigger's launch now when a sparse record lands on a full one.~~ maybe
* `hydrateAll`

### The trigger

* `trigger`: the per-storable timer that knows when the record in hand last came whole and launches the next fetch.
* `launch`: one fetch through the listing; calls made meanwhile join it.
* `noteSuccessNow`: a whole record came some other way than a launch: a send's answer, a full notice.
  - this name will change: `noteLanding({ ok, err })`?
* `ensureTimelyWithin(millis | undefined)`: launch unless the last whole record is within `millis`; with no `millis`, unless the scheduled launch is still ahead.
  - this name will also change
  - if a refresh is underway, but I consider the record timely as-is, do I join the refresh?

### Options

Some of these are design considerations / future feature requests but they influence design
* `maxMillisSinceRefresh`: how old the record in hand may be.
  - `maxWorldMillis`: the same for the world (not acted on yet).
  - `maxBoxMillis`: specialized for the box (not acted on yet).
* `ifAbsent`: `'fail' | 'nil'`, policy when attempting to read an absent or tombstoned record -- default `'fail'`.
* `ifPresent`: `'replace' | 'fail' | 'fetch'`, policy when writing to an already-present record (not acted on yet). (this interacts with `stale_write` and `ensure_x`; its semantics viz tombstone need consideration)
* `reseal` (box): with no whisper given or exposed, seal the stored one again.

* `ifPresent`: 'replace', 'fail', 'fetch'
* `maxMillisSinceRefresh`, `maxWorldMillis`

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

## Operations

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

## Box lifecycle

* Must reseal to update revision YES even if nothing changes, even if only sidecar changes
* Must reseal to send a sidecar update MAYBE NOT YET
* Must be unlocked to seal YES -- impossible even if we wanted
* Seal on every edit YES, very desirable
  - seals at customer's indicated timeliness
* Must be unlocked to edit. YES, because we want to seal
* if there is an overlay, my intent is clear: stage this for writing when I hit send

The interface I intend to offer combines sending and editing. For simplicity though, let's separate them
Customer must call edit while unlocked and, to them, timely -- earning a sealed overlay.
Customer then dirdles a bunch of time away. What happens to box in the meantime? What happens when customer then calls send()?

### Overlay

Overlay represents staged edits to the box contents. If it is absent,
It honors this contract:

1. If absent, the the box is unmodified since `central`; its values should be preferred.
2. If present, its values are to be preferred over `central`'s, even if central is sparse. ~~fields that are missing or undefined fall back to their central value, here or in the central DB~~
3. Every defined value in the payload should be written to the store. Currently, every value in the payload must be defined. ~~no missing or undefined fields should be written into the store _this may tighten_~~
4. The revision_seq is one greater than that of `central`
5. The revision_tok is new and fabricated using the secure `randomBytes` helper
6. Overlay is not sent to VaultDB until `send` is called. Currently its value is not cached.

If a newer or fuller version is received, we may choose to update the overlay, re-establishing it as ready to send. Storable may choose not to (or may not be able to), deferring that to be done by `send`.

**Initial Creation ('draft') with no timely awareness of a tombstone**: On a new record, `central` has revision `-1` and a fabricated revision id. It's never stored.
The overlay with the initial props holds revision `0`.

* If I seal lots of times, and do a send, subsequent seals will go against the central revision. This is necessary, you have to prove you sequence. Also it's good: the worst case scenario is a stale_write that the customer retries. If a send fails, the resealed value is the right one to send.




### Receive

An overlay is always signed, with a revision one larger than `central` when it was prepared.
Unless newer records are spotted, it's ready to send.

Principle: it's desireable to allow customer to make reconciliation decisions
Principle: don't throw away customer data.
Principle: honor customer intent
Principle: provide defaults that are #1 safe > #2 clear >> ... >> #3 ergonomic

#### Reconcile:

If `rcvd` is older than `central`, return `{ central, 'older' }`. Adopt and settle will be skipped
If `rcvd` is the same age `central`, return `{ central, 'older' }`. Adopt and settle will be skipped

|       | rcvd   | central | policy                   | considered   |
| ----- | ------ | ------- | ------------------------ | ------------ |
| older | any    | here    | 'older'                  | -            |
| older | any    | gone    | 'older'                  | ('gone') |
|       |        |         |                          |              |
| same  | sparse | here    | 'same'                   | -            |
| same  | full   | sparse  | 'fill'                   | -            |
| same  | full   | full    | 'same'                   | -            |
| same  | gone   | here    | ~ _fill in refusal name_ | (any better decision is customer's)          |
|       |        |         |                          |              |
| newer | sparse | any     | 'adopt'                  | -            |
| newer | full   | any     | 'adopt'                  | -            |
|       |        |         |                          |              |
|       | gone   | any     | ???                      |

(? damaged)


With no overlay present, it's easy: if `central` is older than , or if `central` is sparse and `reconciled` is the same age and full, set the central prop to `reconciled`, `adopt` its properties, and `settle`

reconcile returns an updated payload and a policy.
* `'reseal'`

### Send

* world is not timely: get world and box, might as well
*


## Props

| type  | immutable                                 | revision       | hydrated                 |
| ----- | ----------------------------------------- | -------------- | ------------------------ |
| Vault | scope props, `registered_at`, `vault_tok` | revision props | `gate_epoch`, `gate`     |
| Box   | scope props, `registered_at`              | revision props | whisper props, `sidecar` |

Vault scope:    `applabel`, `user_id`, `vaultlabel`
Box scope:      `applabel`, `user_id`, `vaultlabel`, `boxlabel`
Revision:       `format`, `revision_tok`, `revision_seq`, `written_at`
Whisper:        `whisper_schema_version`, `whisper_codec`, `whisper_ciphered`, `box_key_wrapped`

### Box record, overlay, central

Box payload has its `sidecar`, `whisper_ciphered`, and key metadata (`whisper_schema_version`, `whisper_codec`, `box_key_wrapped`)

## Box: Edit/Receive, Reconcile/Adopt/Setttle, Seal

| scenario     | `c` timely | `c` data | `overlay` | ... |
| ------------ | ---------- | ------- | --------- | --- |
| probably-new | no       | sparse     | box dna |
| listed       |

In the below, keep in mind that `timely` is against the maxMillis number given. Creating a new record
is best done with maxBoxMillis: Infinity, and we will likely offer that as sugar.

| scenario                | central           | timely | overlay        | `isHydrated` | `send` needs                    |
| ----------------------- | ----------------- | ------ | -------------- | ------------ | ------------------------------- |
| new dna, never fetched  | draft (sparse, 0) | no/∞   | dna            | no           | hydrate, unlock, a whisper      |
| new dna, fetched absent | draft (sparse, 0) | yes    | dna            | no           | unlock, a whisper               |
| warm from cache         | full              | no/∞   | none           | no           | hydrate (brings the whisper)    |
| warm from cache         | sparse            | no     | none           | no           | hydrate (brings the whisper)    |
| listed by a notice      | sparse            | no     | none           | no           | hydrate                         |
| fetched                 | full              | yes    | none           | yes          | unlock                          |
| fetched, sidecar edited | full              | yes    | `{ sidecar }`  | yes          | unlock (already proven at edit) |
| fetched, whisper edited | full              | yes    | ciphered + key | yes          | unlock                          |
| draft, whisper edited   | draft             | yes    | ciphered + key | yes          | unlock                          |
| had full, rcvd sparse   | sparse (newer)    | yes    | kept           | no           | the strobe's fetch, then unlock |
| had del, rcvd sparse    | tombstone         | yes    | dropped        | no           | nothing: gone, let go           |

I don't see a difference or need for `isHydrated` -- explain
My intention is that send checks for timely and then writes

## Open questions

settle has to handle snapshot, because you want subclass adopt to have returned (meaning the instance is fully consistent again).
settle force-replaces the snapshot
(can it invalidate it and have it prepared lazily on request (which the subscribe would if there are listeners)?)

 The case of edit and recieve is mostly similar, it diverges maybe within reconcile and in adopt it matters where the record is attached. not sure when those happen. T



I want to serve the react case and the non-react case: I can fiddle around
with the innards of sidecar and whisper

Getting a box creates a live instance that guards the data. Triggered locally, via timer, or via subscription, a signal may come in to lock or evict the vault:

* if the vault is locked, boxes should stop showing secrets;
* if the vault is evicted, everything stops showing any data and disappears
* (an intermediate verb might have boxes remove their encryptedWhisper and sidecar but preserve the listing)

* can you edit a box when locked? NO
* can you send a signed box with a newer version when locked? I think so?, but it's easier to say NO
* can you edit when untimely? No; customer can adjust what "untimely" means per-call
* can you send when untimely? Also no, customer can adjust

* When do we seal? I think it has to be at each edit, so that we can lock access and keep the uncommitted value
* Can you access sidecar data when locked? NO. Customer can copy whatever they want from it already; they don't have the capability to lock/unlock
* Does listing make a new instance following a deletion? What does the react dev want?
  - The rule "one durable instance per scope" is reasonable and has some advantages in the case of Box. Less so vault, as we must dispose of it (and its box listing and boxes). For now, listing replaces with a new instance for both.

When do we seal? When can we send?

### Instance lifecycle

Design here is inchoate.

Listing creates instances on only these occasions:

* listing `hello` (`warmup`?): loads anything found in deviceDB, makes instances from them
* host calls listing.send({...}) (¿listing.make?)
* listing is notified of a record change for an absent record

Listing updates instances on

* return of an operation
* listing is notified of a record change for an instance it has (might be sparse, full, or tombstoned)
* #edit is called directly

### Short term churn

These phrases replace others use in earlier parts of the design (i.e. we now say `overlay` and do not say `edited`)
GOOD:
* patch and PatchT (not props) for edit (not modify);
* 'overlay' (replacing the local-copy #edited record).
* `reconcile` (not deconflict)


## Other

### Stashed Prompts


Implement types and validations for the storable files as we do for everything else (see shapes). Use, but don't (yet) modify, the types and checkers in shapes/box or shapes/vault. if there are strays -- a shape from the existing shapes/box doesn't match well -- put that in storable/goaway.ts.  To be clear: (a) reuse existing structures when they serve the design; (b) don't modify the larger body of working code.

### Performance & Overhead Breakdown

To perform JSON.stringify, generate a cryptographically secure key, and execute AES-GCM encryption with Associated Data (AAD), the total execution time on an iPhone 13 class browser will be roughly 0.15 to 0.45 milliseconds.


| Operation               | Estimated Time | Driver of Performance                                                                                                      |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| JSON Serialization      | 0.05 – 0.15 ms | JSON.stringify on your medium-sized object + metadata. V8/JavaScriptCore highly optimizes this into native memory buffers. |
| Text Encoding           | 0.01 – 0.03 ms | TextEncoder.encode() converting strings to Uint8Array views.                                                               |
| Key Generation          | 0.01 – 0.02 ms | crypto.getRandomValues() to extract CSPRNG bytes for the key or IV (96-bit IV recommended for GCM).                        |
| AES-GCM + AAD Execution | 0.05 – 0.15 ms | Native crypto.subtle.encrypt hardware pipeline processing the plaintext payload while mixing in the cleartext AAD bytes.   |

### Fin
...