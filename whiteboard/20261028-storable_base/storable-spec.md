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

### Copies a storable keeps

* `central`: the latest record this device knows storage holds, frozen: full, sparse, a draft, or a tombstone.
* `overlay`: the record fields edited here and not yet sent; null when none.
  - ~~`edited`: the same, kept as a whole record rather than as the fields laid over central~~
  - ~~`eager`: central with an optimistic update~~ (that is the record in hand, below)
* `record`, the record in hand: central with the overlay laid over it; what the snapshot shows and what `send` writes.
* `snapshot`: frozen plain data a host renders, the same object until something changes; never a whisper.
* `cacheable`: what `receive` hands the listing to write to the device cache: the sparse form, or the tombstone, of the record now central.
  - ~~`cached`: the copy read from the deviceDB at warmup~~ (after warmup the cache is only written; the copy read is just the record a cold instance is born with)
* `exposed` (box): the whisper kept open on the instance by `expose` or by setting `box.whisper`, until the vault locks.
* `held`: said of an instance the listing has, or of the record central holds, as against the one an answer brings.
  - ~~`standing`, `stands`~~

### Record forms

* `full`, `record` (`BoxRecord`): every field storage holds.
* `sparse` (`BoxSparse`): the record without its heavy fields; what a listing, a notice and the cache carry.
* `draft`: the sparse form at `revision_seq` 0, made here from a dna and not stored yet. A vault's draft is its full novel record, `gate` null.
  - ~~a full record at revision 0, its ciphered fields filled with placeholders~~
* `dna`: what a host hands `make`, or `fetch` with `ifAbsent: 'create'`: the scope and any record field it sets.
  - ~~`Draft<ScopeT, RecordT>` as the name of that type~~
* `tombstone`: what a deletion leaves: scope, revision, times, `deleted: true`. An answer of nothing stored is one too, at the revision held.
* `stamp`: the fields the seal binds. Today a box's sparse form plus `vault_tok`; open question A narrows it.
* `live`: an instance, a `Box`; `pojo`: plain fields and no methods, every other form.
* `listed`: not used. Say `sparse` for the form, `held` for an instance the listing has.

### Verbs on a storable

* `hydrate(opts)`: make the world and then the record in hand timely, fetching each that is not. Calls made during a fetch join it.
* `edit(patch, opts)`: lay a patch over the record in hand as the overlay, sealing what needs the vaultKey. Stores nothing. Needs the vault unlocked, whatever the patch holds.
  - ~~`modify`~~
* `send(patch, opts)`: edit, then write the record in hand under the next revision. The answer comes back through `receive`.
* `del(opts)`: ask storage to delete the thing at the revision in hand. The tombstone comes back through `receive`.
* `receive(fetched)`: take in what storage said of the thing: reconcile, adopt, settle; hand back `{ cacheable, badnews }`.
* `reconcile(fetched)`: judge an answer against central and return the record that is central after it. Throws what cannot be made sense of. No verdicts, no overlay.
  - ~~`deconflict`~~ ~~verdicts `older`, `same`, `adopt`, `gone`, `conflict`~~
  - ~~`edit` reconciles the patch~~ (an edit lays over; only `receive` reconciles)
* `adopt(central)`: hold a record as central, frozen, and replace the snapshot.
  - ~~`assign`: copy the record's fields onto the instance~~ (there are no such fields: the snapshot reads the record)
* `settle()`: act on the record now central beyond its fields, and return the bad news found in it. A vault judges its lease and ways in here. Called after every `receive` and once at birth.
* `overlayOf(patch, opts)`: the one step of `edit` the concrete class writes: the record fields a patch becomes, sealed where they must be.
  - ~~`overlayPropsAndSealBeforeSettling`~~
* `seal`, `unseal` (box): cipher a whisper under a fresh boxKey wrapped under the vaultKey, over the stamp; the reverse. `unsealWhisper` opens the stored whisper for one call.
* `reseal` (box): unseal the stored whisper and edit it back in, sealed again.
* `expose` (box): `unsealWhisper`, then keep the whisper open on the instance as `box.whisper`. `forgetWhisper` drops it; the box listing calls that as the vault locks.
* `LOCKED` (box): what `box.whisper` reads while the vault is locked.

### Guards and states

* `timely`: fetched within its horizon. Of a storable, the record in hand; of the world, its own.
* `hydrated`: the record in hand is full.
* `gone`: central is a tombstone. The listing has let the instance go; every verb on it refuses the absent refusal.
* `locked`, `unlocked`: the vault's lock, by the listing's word (`lockState`).
* `storable` (adjective): a record can be written now: not gone, unlocked, and the record in hand full. `demandStorability` throws otherwise; `ensureTimelyStorability` hydrates first.
* `isX`: yes or no, never throws. `demandX`: synchronous, throws unless X. `ensureX`: async, makes X so (STYLE.md, the triplet).
* `absent refusal`: the refusal for a thing not stored, the listing's to name: `absent_box`, `absent_vault`.

### The listing

* `listing`: the live instances of one kind of thing, by scope. It owns the watch, the cache writes, the bad news, and every storage call made for a thing.
* `hello`: warm from the cache, start the watch, hydrate everything. `goodbye`: end the watch.
* `make(dna | fetched)`: the one place an instance is born. Stores nothing.
* `at(scope)`: the instance held, or null; reads nothing. `fetch(scope, opts)`: the instance, hydrated, or what `ifAbsent` says for one not held or found gone.
* `deliver`: the pipeline for one answer: take the world, hand the record to `receive`, let a gone thing go, cache, tell bad news, publish.
* `let go`: the listing drops an instance gone. `evict`: a vault taken away, with every box in it; the bank lets it go.
* `publish`: replace the listing's snapshot and call its listeners.
* `answer`: what a storage call resolves: the record or null, and the world it lies in.
* `notice`: what the watch delivers: a record, sparse at least, and its world. Enters `deliver` like an answer.
  - ~~`ring`~~ (a bare ring, with no record, is not a notice)
* `fullFor`: the boxlabels the watch should push full records for: the hydrated ones.
* `world`: what surrounds a listing: the bank for vaults, the vault for boxes. Supplies the clock, the lock, its own timeliness, and takes the world an answer carries (`takeWorld`).
* `badnews`, `tellBadNews`: a refusal met in storage that nobody asked for (a damaged box, a damaged way in), told once to the host's `onBadNews`.
* `strobe`: not a thing of its own any more: `adopt` schedules the trigger's launch now when a sparse record lands on a full one.

### The trigger

* `trigger`: the per-storable timer that knows when the record in hand last came whole and launches the next fetch.
* `launch`: one fetch through the listing; calls made meanwhile join it.
* `noteSuccessNow`: a whole record came some other way than a launch: a send's answer, a full notice.
* `ensureTimelyWithin(millis)`: launch unless the last whole record is within `millis`; with no `millis`, unless the scheduled launch is still ahead.

### Options

* `maxMillisSinceRefresh`: how old the record in hand may be. `maxWorldMillis`: the same for the world (not acted on yet).
* `ifAbsent`: `'create' | 'fail' | 'nil'`, what `fetch` does for a thing not held or found gone. `'fail'` unless given.
* `ifPresent`: `'replace' | 'fail' | 'fetch'`, what `send` does with a draft when storage holds the thing (not acted on yet).
* `reseal` (box): with no whisper given or exposed, seal the stored one again.

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


## The lifecycle, as built (2026-10-29)

The code is `packages/safebyok/src/models/{storable,listing,box,box-listing}.ts`, typecheck and
lint clean. This section says what it does, in order. The Coach's sections below it are the
design it was built from and stay as written; where I departed, *Decisions* says so.

### Birth

`listing.make(input)` is the one place an instance is born, on three occasions: `hello`, for
each copy in the device cache; `fetch` with `ifAbsent: 'create'`, for a scope not held; a notice
for a scope not held. A dna is stamped (`revision_seq` 0, a fresh `revision_tok`, both times now)
and completed by `draftOf` into the draft: for a box, the sparse form with an empty sidecar; for a
vault, the novel record. A sparse record, a full one or a tombstone is held as it is. The
constructor attaches the scope as the instance's only own fields, freezes central, and makes the
trigger, due now but with no timer armed. Then `settle()` runs once, its bad news is told, and the
listing publishes. No snapshot is made until something reads it.

### hydrate

The world first (`listing.ensureTimelyWorld`), then the record in hand: the trigger launches unless
it is timely, and a launch is `listing.fetchRecordOf(this)`, which is `storeGet` then `deliver`.
The world goes first because its answer may lock the vault or take the thing away. Hydrating
resolves `this` even when the fetch found the thing gone: `fetch` is what applies `ifAbsent` to
that.

### edit

Hydrate; demand not gone and unlocked; `overlayOf(patch, opts)`, the concrete step; demand both
again, as it awaited; lay the result over the overlay held, frozen; replace the snapshot. For a
box, `overlayOf` parses the patch (`boxPatch`, 'bad_option'), lays the sidecar in as it is, and
seals the whisper given, else the one exposed, else with `reseal` the one stored. Every edit
needs the vault unlocked, a sidecar-only edit included: the Coach's *Box record, overlay,
central*, below. The seal happens at the edit, so the overlay holds ciphertext and a lock can
interdict the whisper while the unsent edit is kept.

### send

Edit; `demandStorability`; the record in hand under `nextRevision()` with `written_at` now;
`listing.putRecordOf`, which is `storePut` then `deliver`, so central is what storage now holds
by the time it resolves; then the overlay is dropped, unless another edit replaced it meanwhile.
A 'stale_write' refusal is delivered first, with the record the refusal carries, then thrown: central
catches up, the overlay stays, and the host decides between them.

### del

Hydrate; demand not gone; demand unlocked; `listing.delRecordOf(this)`, which is `storeDel` at
the revision in hand then `deliver`. The answer is a tombstone: the instance adopts it, the listing
lets it go, and the snapshot shows no data.

### receive

`reconcile`, then `adopt` if the result is not the central already held, then `settle`; hand back
the cacheable form of what is now central and the bad news. The listing passes null for nothing
stored, and the storable turns that into a tombstone at the revision held.

What `reconcile` returns, the answer against the record held:

| answer                                       | result                                   |
| -------------------------------------------- | ---------------------------------------- |
| lower `revision_seq`                         | held (a read served before an own write) |
| higher `revision_seq`                        | the answer                               |
| same seq, another `revision_tok`             | throw 'corrupt_record'                   |
| same, a tombstone, held is a draft           | held (absence confirms a draft)          |
| same, a tombstone                            | the answer: gone                         |
| same, held is a tombstone                    | held                                     |
| same, held full and the answer sparse        | held                                     |
| same, otherwise                              | the answer                               |

`adopt` freezes the record as central and replaces the snapshot. A tombstone drops the overlay. A
full record or a tombstone counts as a fetch that landed (`noteSuccessNow`). A sparse record over
a full one schedules a launch now: the trigger's timer fetches the full record, which is the
strobe. A sparse record over a sparse one schedules nothing: a thing never opened stays sparse.

### Decisions that depart from the playground

1. **A draft is the sparse form at revision 0**, not a full record with `''` for its ciphertext.
   `isHydrated` is false for a draft, and `send` of a draft needs a whisper in the patch or
   exposed, which is "there is a payload" in the Coach's timeliness rule.
2. **Nothing stored is a tombstone at the revision held, and the thing is gone.** The spec said
   "absence where a record was held: refuse". A box deleted on another device reads as absent
   here, as the vaultDB keeps no box tombstones, so under that rule it would be refused on every
   fetch and never let go. The vaultDB is the ground truth; the copy here is the one behind. The
   draft is the exception: absence confirms it.
3. **The instance's own fields are its scope and nothing else.** No `declare revision_tok`, no
   `assign`. Everything that changes is read through `snapshot`, as STYLE.md's *Stateful objects
   and snapshots* asks, and the instance is frozen. Open question G asks whether `box.sidecar`
   is wanted as a getter anyway.
4. **The snapshot is made on first read**, not in the constructor. A base constructor cannot
   call `makeSnapshot`: the concrete class's private fields do not exist until its own
   constructor runs after `super()`. Lazy keeps the identity contract and needs no hook.
5. **The overlay is record fields** (`Partial<RecordT>`), frozen, accumulated across edits, and
   it never carries a revision: `send` mints the next revision when it writes. So two edits then a
   send mint one revision, and a newer central received meanwhile does not invalidate the
   overlay's count. This is the reason behind open question A.
6. **`edit` does not reconcile.** The playground's doc block had `receive` pass through
   `reconcile` to merge the overlay and central; the spec said the overlay is not reconciled
   against. The spec wins: central is adopted beneath the overlay, the snapshot shows the
   overlay, and the host decides.
7. **`send` drops its own overlay.** The listing cannot tell an own put's answer from a notice,
   so `receive` cannot; `send` remembers the overlay it sent and drops it if it is still the one
   held.
8. **The strobe lives in `adopt`**, through `trigger.scheduleLaunchNow()`, and only when the
   thing was hydrated. The listing no longer fires a `tryHydrate`.
9. **`fetch` refuses unless `ifAbsent` says otherwise.** A typo'd boxlabel should not leave a
   draft in the listing.
10. **`revision_tok` is `randomId()`**, the existing maker; `mintRevisionTok` is gone.
11. **The new `BoxSparse` and `BoxRecord` are intersections** of the existing shapes with
    `Boxscope`, `Revision` and `Times`, so shapes/box is used and not modified. Their validators
    wait on the match-up: `isBoxSparse` in box-listing.ts stands in, and says so.
12. **`storable-things.ts` is deleted.** It broke the package's typecheck, and its notes are
    below under *Notes carried from storable-things.ts*.

### Open questions, in the order they matter

A. **What the seal binds.** The spec says the sidecar will not be bound. With every edit
   needing the vault unlocked (the Coach's note below the Props table), the sidecar could stay
   bound after all; the live question is the revision. As built, `edit` seals over the revision in
   hand and `send` mints the next one, so a stamp that binds `revision_tok` or `written_at` would
   refuse to open what `send` wrote. Two ways out: (1) the stamp binds only what is fixed for the
   box's life (the scope, `vault_tok`, `format`, `whisper_codec`, `whisper_schema_version`,
   `registered_at`), and the revision and sidecar ride unbound, as the spec's "sidecar will not be
   bound" already leans; or (2) `edit` mints the next revision into the overlay and seals under
   it, and `send` writes that revision, resealing when central moved meanwhile (a second seal,
   unlocked anyway). Either is a change to what the construction binds (CLAUDE.md, *Never invent
   cryptography*), so it is raised and not made: today's `#seal` passes the sparse form in hand,
   and the comment on it points here. I lean to (1): the seal then depends on nothing `send`
   changes, and a stale write is storage's refusal alone.
B. **A vault whose `vault_tok` differs from the copy held.** The spec says two things: at birth
   from the cache, the cached copy is thrown away and the answer taken (the instance keeps its
   identity); and under *Update the world*, a vault of another `vault_tok` means the Vault object
   is gone and the bank births the next. Both are right, for a cold instance and for a live one.
   The base class needs to know which it is: a flag set when the listing first hands the instance
   out, or the rule that an instance born from the cache may be remade until its first full
   answer. I lean to the second: it needs no flag.
C. **A vault answer older than the copy held.** The generic rule ignores it (an own write's race).
   The spec says `vault_behind`, lock, take nothing. The old code told them apart by reading the
   device record before the vaultDB. In the new design the instance's central is the high-water
   mark after warmup, so an older answer is either the benign race or a storage rollback, and the
   revision alone cannot say which. Recommendation: the generic rule stands for the record; the
   vault's `reconcile` adds one judgment, that a `gate_epoch` below the one held is
   `vault_behind`, since the gate is what an unlocked vault must not trust a rollback of. An own
   `putWayin` whose read-before-write answers after it is the one case that rule gets wrong, and
   it is the case the old device-record ordering was for. If that case matters, central keeps
   the `gate_epoch` of the last answer this device wrote, and the rule compares against that.
D. **The trigger's timer.** It launches a fetch at `launchAt` on its own, so every storable
   polls storage every `maxMillisSinceRefresh` for as long as the page lives. The seed recorded
   the ruling that the timer stays as a mechanism; the policy of when it is armed is not written.
   As built, it is armed on every success. A vault's `hello` could disarm the boxes' timers and
   rely on the watch, with the horizon enforced only when a verb asks.
E. **Should `del` demand unlocked?** Built so, reading "certain updates" in the spec's first
   bullet to include a delete, and the Coach's note that a send while locked is a NO. Every
   `edit` demands unlocked too, after that note. The one reading of the note I am unsure of is
   "can you access sidecar data when locked? NO": VOCABULARY.md and the spec's *More* section
   say the sidecar shows while locked, so I took it as "edit", not "read". If it means read, the
   snapshot must hide the sidecar while locked, which is a one-line change in `makeSnapshot`.
F. **Does the listing's snapshot show drafts?** It does as built: a draft made by `fetch` with
   `ifAbsent: 'create'` lists at revision 0 before its first send. A notice for an unheld scope
   also makes a draft, which the notice replaces in the same tick.
G. **Per-field getters on a Box.** The playground had `box.sidecar`. STYLE.md says read what
   changes through the snapshot, so it is not built. `box.whisper` is the deliberate exception:
   a secret is never in a snapshot.
H. **`ifPresent` and `maxWorldMillis`** are declared and not acted on. `ifPresent` needs the
   vaultDB's word on whether a put created or replaced; `maxWorldMillis` needs the world's own
   trigger.
I. **The lease counter** (`#leasesHeld` in vault.ts, the Coach's note below). It guards one race:
   a lease granted between the start of a refresh's device-store read and its judgment. In the new
   design the lease is read inside `settle`, after the answer, so the window is the read alone.
   Proposal: `settle` remembers the lease held before its read and skips the judgment when the
   lease changed during it. An identity compare, no counter, one name.

### Notes carried from storable-things.ts

The Coach's running comments in the deleted scratch file, kept here as they bear on the vault's
`settle`:

* On `#leasesHeld`: "I don't know what this counter is for but I'm skeptical it's needed. It
  needs a better encapsulation and one name." (Question I.)
* On `#judgeStored`: "reconcileOrThrow: if consistent, returns a ready-to-make ducktyped vault
  object `{ ...props, boxes, lease }`."
* On `#takePicture`: "adopting values, updating the snapshot (are there consequences to that),
  stuff with the trouble queue, making new decisions about the lease, making new decisions about
  error conditions, then updating the boxes, then updating the wayins. That's about 2/3rds of it.
  Seems a bit action packed." In the new shape that is `adopt` (the record and snapshot), then
  `settle` (the lease and the ways in), and the boxes are the box listing's, fed by `takeWorld`.
* On `#raiseRecordAfter`: "Anyone new to the codebase will think raise means throw. Hasn't the
  epoch already updated? Does this mean 'cache the record'?" Yes: it is the device cache write,
  which is the listing's `saveCached` of what `receive` hands back.

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


### Box record, overlay, central

Box payload has its `sidecar`, `whisper_ciphered`, and key metadata (`whisper_schema_version`, `whisper_codec`, `box_key_wrapped`)

When do we seal? When can we send?

* can you edit a box when locked? NO
* can you send a signed box with a newer version when locked? I think so?, but it's easier to say NO
* can you edit when untimely? No; customer can adjust what "untimely" means per-call
* can you send when untimely? Also no, customer can adjust

* When do we seal? I think it has to be at each edit, so that we can lock access and keep the uncommitted value
* Can you access sidecar data when locked? NO. Customer can copy whatever they want from it already; they don't have the capability to lock/unlock

| scenario     | `c` timely | `c` data | `overlay` | ... |
| ------------ | ---------- | ------- | --------- | --- |
| probably-new | no       | sparse     | box dna |
| listed       |

*(The Coach's note, restored from the stash of 2026-10-29 21:45. As built: `edit` and `send` both
hydrate with the call's horizon and demand unlocked; the seal happens in `edit`, so the overlay
holds ciphertext. The sidecar reading is open question E. The scenario table is the Coach's to
finish; the rows I can fill from the code are below.)*

| scenario                         | central            | timely | overlay              | `isHydrated` | `send` needs                    |
| -------------------------------- | ------------------ | ------ | -------------------- | ------------ | ------------------------------- |
| made from dna, never fetched     | draft (sparse, 0)  | no     | none                 | no           | hydrate, unlock, a whisper      |
| made from dna, fetched absent    | draft (sparse, 0)  | yes    | none                 | no           | unlock, a whisper               |
| warm from cache                  | sparse             | no     | none                 | no           | hydrate (brings the whisper)    |
| listed by a notice               | sparse             | no     | none                 | no           | hydrate                         |
| fetched                          | full               | yes    | none                 | yes          | unlock                          |
| fetched, sidecar edited          | full               | yes    | `{ sidecar }`        | yes          | unlock (already proven at edit) |
| fetched, whisper edited          | full               | yes    | ciphered + key       | yes          | unlock                          |
| draft, whisper edited            | draft              | yes    | ciphered + key       | yes          | unlock                          |
| sparse notice over a full record | sparse (newer)     | yes    | kept                 | no           | the strobe's fetch, then unlock |
| deleted elsewhere, then fetched  | tombstone          | yes    | dropped              | no           | nothing: gone, let go           |

### Performance & Overhead Breakdown

To perform JSON.stringify, generate a cryptographically secure key, and execute AES-GCM encryption with Associated Data (AAD), the total execution time on an iPhone 13 class browser will be roughly 0.15 to 0.45 milliseconds.


| Operation               | Estimated Time | Driver of Performance                                                                                                      |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| JSON Serialization      | 0.05 – 0.15 ms | JSON.stringify on your medium-sized object + metadata. V8/JavaScriptCore highly optimizes this into native memory buffers. |
| Text Encoding           | 0.01 – 0.03 ms | TextEncoder.encode() converting strings to Uint8Array views.                                                               |
| Key Generation          | 0.01 – 0.02 ms | crypto.getRandomValues() to extract CSPRNG bytes for the key or IV (96-bit IV recommended for GCM).                        |
| AES-GCM + AAD Execution | 0.05 – 0.15 ms | Native crypto.subtle.encrypt hardware pipeline processing the plaintext payload while mixing in the cleartext AAD bytes.   |


Implement types and validations for the storable files as we do for everything else (see shapes). Use, but don't (yet) modify, the types and checkers in shapes/box or shapes/vault. if there are strays -- a shape from the existing shapes/box doesn't match well -- put that in storable/goaway.ts.  To be clear: (a) reuse existing structures when they serve the design; (b) don't modify the larger body of working code.