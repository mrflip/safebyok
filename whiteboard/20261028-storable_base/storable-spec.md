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
* `staged`: the record fields edited here and not yet sent; null when none.
* `combined`, the record in hand: the staged where one is begun, else central; what the snapshot shows and what `send` writes.
  - ~~`record` as the accessor for this~~
* `snapshot`: frozen plain data a host renders, the same object until something changes; never a whisper.
* `cacheable`: getter, `{ ...sparse, central, staged }` as they are, frozen: what the listing writes to the device cache after a `receive`, and what `hello` revives an instance from.
  - ~~`combined` frozen. May be sparse, full, or tombstone.~~
  - ~~what `receive` hands the listing~~ (`receive` and `settle` hand back `{ badnews }` only)
  - ~~`cached`: the copy read from the deviceDB at warmup~~ (after warmup the cache is only written; the copy read is just the record a cold instance is born with)

### Record forms

(The second bullet points for some are me folding other drafts back in. The `codeface` ones are consensus)

* `full`, `record` (`BoxRecord`): every field storage holds.
  - _the code uses record as an accessor meaning "the best of central and staged" -- big mistake by me. Will change once I understand the lifecycle_ (now `combined`)
  * ~~record: all props in the database row ("full")~~
* `sparse` (`BoxSparse`): the record without its heavy fields (`gate`, `encrypted_whisper`). Certain listing queries and updated record notifications carry only the sparse form.
* sparse: suitable for listing. does not have heavyweight attributes. Not sure if vault draft is (or can be made to be) sparse.
* `dna`: scope and seed props handed to `build` ~~or `send` with `ifPresent: 'fetch'` (this will be sugar added later: build().send(ifPresent: 'fetch' maxMillis Infinity))~~.
* `tombstone`: durable record of a deletion; scope, revision, times, `deleted: true`. _Explain, intelligibly: ~~An answer of nothing stored is one too, at the revision held.~~_
* tombstone: scope, revision, `registered_at`, `written_at` (when it was deleted), sentinel that it's either gone or damaged. Nothing the user put in the thing (no sidecar).
* `whole`: a record that says all storage holds of the thing: full, or a tombstone (deleted or damaged), which holds nothing more to fetch. A sparse record is not whole. `isWholeRecord` checks it. Success on a fetch is noted only while central or the record in hand is whole, and `hydrate` fetches whatever the horizon while neither is.
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
* `edit(patch, opts)`: reconcile patch, staged, and central; adopt the values; settle the consequences (eg handling the lease and wayins). Does not modify Central. `staged` is now in place -- even if nothing changed, even if the patch is empty. ~~Stores nothing.~~ Does not update the VaultDB, and currently, does not cache. ~~Needs the vault unlocked, whatever the patch holds.~~ _that is Not true for a vault, and it's Not clear if it's true for sidecar._
  - ~~`modify`~~
* `send(patch, opts)`: `edit` to apply the patch, `put`s the reconciled settled
  record bearing the correct next revision. Returns the stored result
  (as `this`, by contract -- it does so by waiting until the answer
  is committed, `receive`d, adopted and settled).
* `del(opts)`: immediately delete the thing using a timely revision. Optimistically applies the tombstone as staged, and once committed, returns the stored value (as `this`, by contract -- same process as for `send`)
* `receive(fetched)`: update to match a new observation of the external value. Reconciles, adopts, settles; and then hands back its `cacheable` and any `badnews`.
* `reconcile(rcvd)`: produce an update strategy using the record's own state, `central`, `staged`, and the `rcvd` props (from edit or recieve). Throws if defects are found (as determined by subclass and presumably someday by a customer hook).
* `adopt(???)`: set own props, private vars, etc for a reconciled newly receive/edit'ed record (and maybe from constructor as well). Unclear about how to handle the edit/receive/constructor split; I was considering `assign`. Never modifies or reconsiders the props, or takes further action
  - ~~(there are no such fields: the snapshot reads the record)~~ yes there are: gate, gate_epoch
* `settle()`: idempotently act on the updated state. Must call super().
  - parent class makes a snapshot
  - ~~now central beyond its fields, and return the bad news found in it~~.
  - A vault settles its lease and ways in here
  - Called after every `receive`, `edit` and once by `build`
* `makeStaged(base, patch, opts)` (concrete): the one step of `edit` the concrete class writes: `base` is the record in hand, sparse or full, under its next revision; lay the patch over it and seal what needs sealing; hand back the whole record.
  - ~~`stagedOf(patch, opts)`: the one step of `edit` the concrete class writes: the record fields a patch becomes, sealed where they must be.~~
  - ~~`stagedPropsAndSealBeforeSettling`~~
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
* `gone`: central is a tombstone (gone or damaged). The listing has let the instance go; every verb on it refuses the absent refusal.
* `damaged`: central is an ouchstone (damaged tombstone)
* `locked`, `unlocked`: the vault's lock, by the listing's word (`lockState`).
* `storable` (adjective): a record can be written now: not gone, unlocked, and the record in hand full.
* `ensureReadyToX(opts)`, `demandReadyToX()`: the guard pair of each verb X (`Fetch`, `Edit`, `Send`, `Del`; box: `Seal`, `UnsealWhisper`). `ensure` hydrates by `opts` then demands; `demand` checks for drift, synchronously.
  - ~~`demandStorability`, `ensureTimelyStorability`~~
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
* `ifPresent`: how `send` meets what storage holds. A put carries the record at revision N, minted
  on the device over the revision N − 1 it holds (`expected`; none when N is 0). A revision is its
  tok and seq: "at N − 1" means the very record the device holds.

  | `ifPresent` | over no row (N = 0) or the record at N − 1 | over N or later | over a lower revision |
  |---|---|---|---|
  | `'replace'` (default; the only one implemented) | lands | `stale_write`, carrying what is stored | `stale_write`, as today |
  | `'fetch'` (not implemented) | lands over no row or a tombstone at N − 1; over a live N − 1: open | answers what is stored, `ok: true` | `stale_write`, as today |

  `'replace'` is the versioned replace (compare-and-swap): storage never renumbers or patches a
  record. `'fetch'` will not be implemented until a clear need and a scenario table arrive.
* `reseal` (box): with no whisper given or exposed, seal the stored one again.

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
* if there is an staged, my intent is clear: stage this for writing when I hit send

The interface I intend to offer combines sending and editing. For simplicity though, let's separate them
Customer must call edit while unlocked and, to them, timely -- earning a sealed staged.
Customer then dirdles a bunch of time away. What happens to box in the meantime? What happens when customer then calls send()?

### staged

The storable coordinates updates from other devices with local uncommitted changes by carrying
- `central`, the latest view of the centrally stored record;
- `staged`, if data has been edited locally: a payload that will overwrite
   the stored values when `send` is called. New data `receive`d passes through
   `reconcile` to allow the staged and central values to be merged
   (or refused if there is a problem). Any call to `edit` activates the staged:
   even if there are no changes, and even if the offered patch is empty.

staged represents uncommitted edits to the box contents. If it is absent,
It honors this contract:

1. If absent, the the box is unmodified since `central`; its values should be preferred.
2. If present, its values are to be preferred over `central`'s, even if central is sparse. ~~fields that are missing or undefined fall back to their central value, here or in the central DB~~
3. Every defined value in the payload should be written to the store. Currently, every value in the payload must be defined. ~~no missing or undefined fields should be written into the store _this may tighten_~~
4. The revision_seq is one greater than that of `central`
5. The revision_tok is new and fabricated using the secure `randomBytes` helper
6. staged is not sent to VaultDB until `send` is called. Currently its value is not cached.

If a newer or fuller version is received, we may choose to update the staged, re-establishing it as ready to send. Storable may choose not to (or may not be able to), deferring that to be done by `send`.

**Initial Creation ('draft') with no timely awareness of a tombstone**: On a new record, `central` has revision `-1` and a fabricated revision id. It's never stored.
The staged with the initial props holds revision `0`.

* If I seal lots of times, and do a send, subsequent seals will go against the central revision. This is necessary, you have to prove you sequence. Also it's good: the worst case scenario is a stale_write that the customer retries. If a send fails, the resealed value is the right one to send.




### Receive

A staged record is always signed, with a revision one larger than `central` when it was prepared.
Unless newer records are spotted, it's ready to send.

The two reconcile tables live in the doc blocks of `reconcileCentral` and `reconcileStaged` in
`src/models/storable.ts` and are authoritative there. The principles that once stood here cannot
all be honored at once; they and the choice made among them are in `receive-principles.md`.

## Box: Edit/Receive, Reconcile/Adopt/Settle, Seal

The scenario tables that stood here are covered by the reconcile doc blocks and by *Guards and states*.

### Send

* world is not timely: get world and box, might as well
*


## Props

| type  | immutable                                 | revision       | payload                 |
| ----- | ----------------------------------------- | -------------- | ------------------------ |
| Vault | scope props, `registered_at`, `vault_tok` | revision props | `gate_epoch`, `gate`     |
| Box   | scope props, `registered_at`              | revision props | whisper props, `sidecar` |

Vault scope:    `applabel`, `user_id`, `vaultlabel`
Box scope:      `applabel`, `user_id`, `vaultlabel`, `boxlabel`
Revision:       `format`, `revision_tok`, `revision_seq`, `written_at`
Whisper:        `whisper_schema_version`, `whisper_codec`, `whisper_ciphered`, `box_key_wrapped`

Tombstone: immutable props, revision props, timestamp, no payload

* **Own props**: everything that is convenient to see in a log or that we'd advertise for use: scope props, timestamps, revision, format; `vault_tok` and `gate_epoch`

Storable props come in several flavors. These are managed by the storable:
- immutable props: the scope (eg `applabel`, `user_id`, `vaultlabel`), plus `registered_at`; Vault adds `vault_tok`
- envelope props: revision props (`revision_tok`, `revision_seq`, `written_at`), managed by the storable
Payload props are defined by the concrete class:
- in Vault, `gate_epoch` and gate props; in Box, `sidecar`, and the whisper / box key props

Public props are exposed as own props or as accessors onto private props -- not onto the
captured records, as those gain and lose in ground truth as the storable is updated.
Objects (vault, lease, gate, world, listing) are adorn'ed or private, as are secret or wrapped things
(ciphered whisper, wrapped keys). Sidecar is an up/down call: a getter.
  - not sidecar, at present: getter on a private variable (the same object held by `combined`)
* **Private vars**: box: whisper props; vault: `gate`, `lease`, etc
* **Non-enumerable frozen props**: world, listing, refresh trigger
* **important delegated props**: instances use `world.logger` and `world.clock`.

## Box record, staged, central

Box payload has its `sidecar`, `whisper_ciphered`, and key metadata (`whisper_schema_version`, `whisper_codec`, `box_key_wrapped`)

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

A storable is instantiated using async `build` in one of these circumstances:

- explicitly by host, giving props for an assumedly never-before-stored thing (¿`listing.make`?)
- listing's subscription reports a record it doesn't yet hold
- during warmup, loaded from the local DeviceDB cache
- when a listing operation contains records not yet held

External updates to the `central` value come via `receive` (even when it's the result of an operation):

- full:    an explicit fetch, yielding a full record
- sparse:  an explicit listing operation, yielding a sparse record
- full:    as metadata on certain refused calls, such as `stale_write` (which returns the stored record that won the race)
- full:    return value of a write operation, giving the full actual record stored
- full(§): subscribed notification of a record change ((§): notification-space-limited VaultDBs, eg Postgres, may omit payloads of large records)
- full:    in the case of vault, the `world` slot of any VaultDB call
- either:  in the case of vault, the `world` slot of any VaultDB subscription (depends on VaultDB capabilities)

The staged changes only when `edit` or `del` is called directly, and is spent when `receive` adopts the record it sent (same `revision_tok`) or a tombstone.

### Short term churn

These phrases replace others use in earlier parts of the design (i.e. we now say `staged` and do not say `edited`)
GOOD:
* patch and PatchT (not props) for edit (not modify);
* 'staged' (replacing the local-copy #edited record).
* `reconcile` (not deconflict)


## Other

### Stashed Prompts

For box edit I want to cheat. Have it pull whisper from the patch, call super.edit, then if patch.whisper is defined (null or set to a value) call sealWhisper.

The whisper functions in src/box aren't terrible; the line calling lease.trySealProps should be using this.stamp. You'll be setting private variables not creating an instance. All of the madeUnder stuff is hallucinated.

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