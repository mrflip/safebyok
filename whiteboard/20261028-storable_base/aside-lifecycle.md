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

### Why the sidecar is not sealed (cryptographically bound)

The sidecar is not bound so that it can be read and modified server-side. A key motivator for sidecar is accounting: api calls made, input/output token counts, account name, date of next rotation as tracked by app or customer. Yes, yes: the argument for cryptographically signing those is real, a bit less so when you consider the threat model, but still. However, there's  demand for three things: 1. encrypted and unmodifyable without the key: `whisper`; 2. queryable in the database but must not be modified: '?'; 3. queryable and updateable in the database: `sidecar`. Without 3, nothing in the record is modifyable. You can achieve 2 by recording such values in the whisper and the sidecar. It will also not be immediately obvious to the customer that the consequence of modifying a bound sidecar value is not "oops the decrypt says this changed", it's "oops the decryption provably cannot ever succeed" (I think the latter is the case?)

### Cryptographically bound values

Decrypting the whisper requires not only the key but also all values "sealed" (cryptographically bound) to it.
Those include everything but the sidecar and the encrypted whisper's own metadata:
its scope, the `vault_tok`, format, revision props, timestamps, and
whisper parsing (`codec` and `schema_version`)

You must be unlocked to

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

## Lifecycle, old notes


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
