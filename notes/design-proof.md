# Unrace: a new vault

The design for vault birth and the other gatings in the models, built from the bottom up. It is built
in `src/models/`, with no public entry point yet; the diagrams show the code as it is now. The Coach,
2026-11-02: the v6bank PRs (#426 to #442) "are likely to be thrown out or at best scavenged", so
their shapes are not settled.

## `bank.hello`

```text
bank.hello()                                         a forced reset; a host may call it again, on its own timer
└─ bank.#bringUp(vaultListing)                       refused → hello refuses, and the bank is not ready
   ├─ keyDeriver.load, strengthChecker.load
   ├─ vaultListing.fetchBank()                       vaultDB.tryGetBank: full vaults, no boxes, gone_vault tombstones (does not fetch or sync with DeviceDB)
   │  │    refused → tellIfRevoked, then thrown;  damaged_records → bad news
   │  └─ each vault or gone_vault, by scope: vaultListing.build(record) → #buildOrReceive
   │       none listed                               → build, enlisted
   │       older than the one listed                 → ignored
   │       new vault_tok, or alive over a tombstone  → build, enlisted; old_vault.vacate, delist
   │       same life                                 → vault.receive(record)
   │       a tombstone of its own vault_tok          → the vault stays in its slot and adopts it (locked, row forgotten, boxes vacated)
   ├─ bank.#cacheDeviceRecord                        a damaged record written over → bad news
   ├─ vaultListing.hello()                           subscribe to VaultDB
   └─ vaultListing.demandEnabled()                   a sweep crossing hello refuses here
                                                     no autolock here: the host calls bank.autolock() after hello, and on its own timer
```

## What a vault record needs

| Part                | Fields                          | Comes from                                           |
|---------------------|---------------------------------|------------------------------------------------------|
| Vault identity      | `applabel`, `user_id`           | Bank                                                 |
|                     | `vaultlabel`                    | Caller's bag                                         |
|                     | `vault_tok`, `revision_tok`     | Random                                               |
|                     | `registered_at`, `written_at`   | Clock                                                |
| Vault constants     | `fmt`, `am: 'a'`, `gate_epoch: 1` | Fixed                                              |
|                     | `revision_seq`                  | 0, or the tombstone's plus one                       |
| Passphrase wayin    | `wayinkind`                     | Fixed                                                |
|                     | `key_deriver_label`             | Key deriver                                          |
|                     | `salt_b64`                      | Random, of the deriver's `salt_size`                |
|                     | `device_id`, `registered_at`    | Bank, clock                                          |
|                     | `vault_key_wayin_wrapped`       | New random vaultKey, wrapped under the passphraseKey |
| Passkey wayin (opt) | `credential_id`, `prf_salt_b64` | `passkeyClear`                                       |
|                     | `device_id`, `registered_at`    | Bank, clock                                          |
|                     | `vault_key_wayin_wrapped`       | Same vaultKey, wrapped under the passkeyKey          |

The ordering rules:

1. The stamp (scope, `vault_tok`, `registered_at`) comes before any key: a wayin's ctx binds
   `[stamp, purpose, header]`, and a passkeyKey's HKDF `info` is that same ctx.
2. A header comes before its key: a passphraseKey is derived from the header's salt.
3. The passphrase wayin comes before the passkey wayin: it is where the vaultKey comes from.

The lease is not an input. It is a second output of the same vaultKey.

## The provings

Every proving instance has a strong key from the moment it is made, and only the static methods below
are given a cleartext. Key bytes stay inside `passphraseKeyOf`, which keeps the deriver's bytes in a local
variable and zeroes them. A stored wayin is read from the gate, which also supplies the stamp and the
`gate_epoch`. A novel proving's epoch is the first.

```text
PassphraseProving.buildNovel(stamp, passphraseClear, world)
├─ checkStrength(passphraseClear, scope)     weak → 'weak_passphrase'
├─ mintPassphraseHeader                      key_deriver_label, salt_b64, device_id, registered_at
└─ passphraseKeyOf(keyDeriver, cleartext, salt)  bytes zeroed; non-extractable #wayinKey

PasskeyProving.buildNovel(stamp, passkeyClear, world)
├─ mintPasskeyHeader                         credential_id, prf_salt_b64, device_id, registered_at
└─ deriveWrappingKey(prfBytes, ctx)          non-extractable #wayinKey

PassphraseProving.buildStored(gate, passphraseClear, world)
├─ key_deriver_label is the world's          else 'unknown_key_deriver'
├─ passphraseKeyOf(keyDeriver, cleartext, stored salt)
└─ the wrap opens                            else 'wrong_passphrase'

PasskeyProving.buildStored(gate, passkeyClear)
├─ the gate has a passkey wayin            else 'absent_wayin'
├─ credential_id and prf_salt_b64 match      else 'wrong_passkey', the answer left unspent
├─ deriveWrappingKey(prfBytes, ctx)
└─ the wrap opens                            else 'wrong_passkey'

proving.buildWayin(NOVEL | sourceProving)    a Wayin; the vaultKey made or unwrapped, wrapped, dropped
proving.buildLease(friend, gate_epoch?)      a Lease on friend's vault, under the epoch it proved or the one passed
```

A proving never has the Vault. All that a `Proving` or a `Lease` gets of a vault is `vault.#leaseFriend()`: the
stamp, `leaseMillis`, the clock, the logger, `lock`, and the deviceDB's lease verbs bound to its scope. All of
that is fixed for the vault's life, so `gate_epoch`, which changes, is passed in where it is needed. The friend has
no key, and gives access to neither the record nor the boxes. `buildLease` refuses a friend whose stamp is not the
proving's.

A caller always needs the proving of the current gate itself, not only whether it succeeded: it is the only
thing that can unwrap the vaultKey, for the next wayin and for the next lease. So there is no `demandMatch`.

`gating.checkStrength`, for the live check as the user types, calls the same `checkStrength`.

"May re-enter" below means a correctable refusal: the host receives the refusal, and the gating stays open,
so the host can shake its dialog and let the user try again. Nothing retries.

## `put`

```text
box.put(patch, opts)                                 vault.putBox comes here, through boxListing.puttable
└─ box.tryPut(patch, opts)
   ├─ await ensurePuttable(patch, timely)            hydrates, unless the box is sparse and patch carries whisper and sidecar
   ├─ given = demandPuttable(patch, { ifPresent })   the box itself: enabled, unlocked, whole only for a patch missing a half
   ├─ { record, prior } = await #edit(given)         laid over the current record, sealed, returned, kept nowhere
   ├─ demandPuttable(patch, { ifPresent })           again, past the seal: locked → refused
   └─ listing.tryPut(record, { prior, ifAbsent, ifPresent })    over the revision #edit read, not whatever the instance has by then
      ├─ doTryPut(record, { prior, ifAbsent, ifPresent })
      │    moved → 'stale_write'; a live row and ifPresent 'fail', or a live row of another box_tok at prior → 'camped':
      │    the stored record delivered, then thrown
      └─ deliver(answer, record) → receive → adopt, align      checked against what it sent; put resolves at the end of receive
```

Nothing is kept between `#edit` and the put: storage refuses a record built on a revision that has since
changed. So a refused put leaves nothing behind, like a refused birth's put, and a snapshot shows a change
only once it has been written. A sparse box given a patch with both halves needs no fetch, because the put's
revision check catches a stale record.

Only a box has `put`. A vault has none, because the only part of its record that changes is its gate, which has its
own verbs (*Changing the gate*). The patch hooks belong to `Box`.


## Notable Changes (that may be inconsistent)

* DeviceDB.cache/peek/vacate: directly keep/retrieve record by scope + vault_tok
* Unlist: remove from the listing's list
* A listing memoizes its children in a Map, and `deliver` has an instance in its slot before it yields, so
  overlapping answers land on one instance. Subscriptions are not relied on: a fetch answer builds an instance where
  there is none, as a notice does
* The Bank is durable: `bank.sweep` sweeps its listing and children, and the next hello builds fresh ones (ruled: a swept bank is done, a host makes a new Bank; not built yet)
* A Vault instance is replaced only when vacated, swept, or created from gone or void. When a birth's
  `vaultListing.put` is delivered, it replaces the object. Only a deleted vault stays in its slot, tombstoned, so a
  late fetch answer loses to it. When the tombstone is delivered, it vacates the vault's box listing and boxes
* No timers on a Storable or a lease: a JS timer on a page that may be suspended at any moment guarantees nothing.
  Refresh timers belong to the listing or the bank. Autolock is a best-effort reminder, not a guarantee. It has two
  parts: `bank.autolock`, which a host calls when it likes, after hello and on its own timer; and `Lease.peek`, which
  declines to load a row that is past autolock, and leaves the row where it is
* A lease records `proved_at` and the kind of proving. `bank.autolock` finds cached leases through a deviceDB index range
  scan, so a fresh page needs no instance. It locks each listed vault that has the row's own `vault_tok`, and the lock
  forgets the row. It reports failures loudly: a refused scan is bad news, and a lock whose forget is refused panics
* The device caches only leases and the device record, not vault or box records, and no refresh timer runs
* The goal: when lock is called, nothing crosses it. We get there with simple code that can be analyzed in context, so a
  crossing is stated in one sentence (`whiteboard/20261102-newdesign/reference-timings.md`), not fine-tuned
* A box birth: when no box is listed, `vault.putBox` lists a void box (`boxListing.puttable`). That box's `box.put` makes
  the record with the shell as its prior, seals it and puts it (`born` or `reborn`), and the answer is delivered. A
  `box.put` of only a sidecar unseals and reseals, because the box stamp binds the sidecar
* A cached lease that clearly must be removed is never left in place quietly. When a user who has proved authority and
  intent to unlock crosses something that says lock, the case is ambiguous, and we settle it with clear code and a stated
  rule: `#attachLease` checks at its start and then carries through
* A crossing unlikely enough may just throw, and the host deals with it
* Each update, as it comes in, transactionally establishes its invariants. Where those invariants don't commute, it takes a
  higher-level coordinator, resolution by the host, or most likely advice to the host on making the ordering predictable
* `vaultDB.tidyGone` is for hosts: nothing in the package calls it
* No guarantee of the ordering of simultaneous gets, puts and dels of a box, or even of how many will succeed
* Only Proving, Gating and Vault touch a lease. A box seals and unseals through `vault.sealStampedString` and
  `vault.unsealStampedString`, and `ensureUnlocked` returns no lease

## The lease: make, attach, cache

Each way of unlocking makes a lease in its own way, then attaches it in the same way. There is no counter and no compare.

```text
an unlock    lease = await proved.buildLease(friend);                  await vault.#attachLease(lease)
a birth      lease = await passphraseProving.buildLease(friend);       await vault.#attachLease(lease)
the cache    lease = await Lease.buildFromCache(friend, gate_epoch);   await vault.#attachLease(lease)    null → ask

friend is vault.#leaseFriend(): the stamp, the deviceDB's lease verbs bound to its scope, vault.lock

vault.#attachLease(lease)                            private: by #unlockByProving, and by ensureUnlocked for a cached lease
├─ demandAttachable                                  swept, vacated or deleted → refused, nothing cached
├─ this.#lease = lease
├─ await lease.cacheAsCacheCan()                     refused → bad news; the lease is still granted
├─ align                                             reports unlocked; listeners run; snapshot re-made
└─ #alignBoxes                                       each box listed aligned: its snapshot's isLocked changes, its own listeners notified once

vault.#revokeLease(where)                            private: called by lock and vacate, and by adopt of a tombstone
├─ this.#lease = null                                the lease goes first, so a refused forget leaves none
├─ revoking = granted?.tryRevoke() ?? Lease.tryForget(friend)    always, granted or not: a vault reporting locked still forgets
├─ align                                             reports locked; listeners run; snapshot re-made
├─ #alignBoxes                                       each box listed aligned, as at the attach
└─ await revoking                                    refused → announced 'lease_revoke_failed'
```

**A `lock()` before the attach, on an unlock or a birth,** has no effect, by the enter-key rule. The vault ends
up unlocked with its lease cached: a normal, visible state that the next `lock()` ends. The vault was
already locked, so that `lock()` changed no state.

**A `lock()` after the attach** is an ordinary lock of an unlocked vault: it vacates the lease, which removes
it from the cache. This requires the new deviceDB to apply calls in the order they were made, so
that the vacate is written after the put. The put is awaited before `align`, because a listener may call
`lock()`. So the attach needs no compare, and no second vacate.

**A `lock()` that crosses a gate change** does not stay in effect, as with an unlock: the proof shows that this
user may have the vault unlocked. Each of the three gate changes ends in `#unlockByProving`, which gives the vault a
lease for a full term under the epoch that was written.

**`sweep`, `vacate` and `delete`** leave a one-way state: every guard refuses from then on, so
anything worth guarding stops working. A swept or vacated object is also delisted. A deleted vault stays listed,
tombstoned, while its box listing and boxes are removed. The refusals are for whoever still has a reference.
`#attachLease` makes the same check (`demandAttachable`) as its first step, so a refusal there leaves nothing cached.

**The cache:** a `lock()` during `Lease.buildFromCache`'s read has no effect on the vault either: the vault reports
unlocked. The lock's vacate of the cached lease does take effect, so the next session asks. This is a row for
`notes/wontfix.md`.

Another tab's `lock()` is not passed on to this tab.

## The discards

```text
lock     revoke the lease and forget its cache; align; align each box listed
sweep    drop the lease private property, leaving the cached; disable watches; disable all calls; sweep children; delist children
vacate   disable; vacate the lease and forget its cache; vacate children (disables, delists them); conclude its gating
delete   lock; vault.del → vaultListing.del(vault.sparse): a tombstone, storage cascading its boxes, transactionally; delivered, it forgets the cached lease and vacates the box listing (boxes disable, delist); only the vault stays, tombstoned
autolock bank: deviceDB.leasesProvedBefore(cutoff), an index range scan; lock each listed vault of the row, which forgets it
```

**A `lock()` whose vacate is refused panics**: it is not bad news. The call
itself stays synchronous and does not throw, because the refusal comes later, from the deviceDB. A panic calls the
host's async `onPanic` with the refusal, and no secret material; if `onPanic` rejects, that is reported and goes no
further. With no `onPanic`, the refusal is reported by `reportToPlatform`, and the Vault is vacated as the refusal
arrives, with no timer. Because the vacated Vault's calls are disabled, it cannot be reopened in this tab, even if the
deviceDB still refuses. A second refusal panics again and finds the vacate already done, which makes it a no-op, so
this needs no counter; a vacate marks itself done before its forget.

**A `lock()` and the dialog.** A lock leaves an open gating open: the lock says the vault is locked, and
the user can still answer the dialog. If the gating was asking for an unlock, it still unlocks, and if it was
asking for a change of the gate, the change is written and unlocks. A valid request goes through if it was authorized at
the start of its critical section.

**A `dismiss()` and the dialog.** The package cannot close a host's dialog, so a gating says when to close it:
`gating.whenConcluded` is a promise that a dialog can close on. A Cancel, a sweep or a vacate dismisses the gating:

```text
no attempt under way    concludes it 'dismissed': the verb refuses, the dialog closes; a later attempt refuses 'gating_concluded'
an attempt under way    the attempt runs through and its outcome concludes the gating, so a wrong passphrase
                        crossed by a dismiss still refuses 'wrong_passphrase'; a re-entry refuses
```

## End-of-method invariants

Each method states what stays true when it ends, whatever crossed it.

At all times, having a lease granted and reporting unlocked are the same fact: `isLocked` is `#lease === null`, not a
second field.

| Method           | When it returns                                                                                                                                                                           | When it throws                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `lock`           | revoke the lease and forget its cache; align; align each box listed
| `sweep`          | drop the lease private property, leaving the cached; disable watches; disable all calls; sweep children; delist children
| `vacate`         | disable; vacate the lease and forget its cache; vacate children (disables, delists them); conclude its gating
| `vault.del`      | the tombstone at the revision after the sparse record's, storage cascading its boxes, transactionally; delivered, the cached lease forgotten and the box listing vacated (boxes disable, delist); only the vault stays, tombstoned
| `box.put`        | The record kept is what it put, or newer; snapshot and cache aligned                                                                                                                      | Nothing stored; on `stale_write` or `camped`, the stored record taken in                             |
| `attachLease`    | Attached and in force; cached as the cache can; aligned, and each box listed                                                                                                              | Past a discard: refused, nothing cached                                                              |
| `ensureVault`    | A Vault listed, the only one of its scope: unlocked, or locked by a `lock()` after the attach                                                                                              | Nothing stored; has only what the answer delivered. Another won: `gate_made_elsewhere`, its Vault listed, locked |
| `ensureUnlocked` | Unlocked, a lease in force at its attach                                                                                                                                                  | `dismissed`: no lease granted, none cached by this call                                       |
| A gate change    | The record has the next gate, its epoch one up. Unlocked under that epoch, a fresh lease of full term, whatever lock came before or crossed                                                 | Nothing stored, unless the answer was lost; the lease as it was                                      |
| `delVaultPrompt` | A tombstone stored and its box rows tombstoned; nothing of it on this device; the Vault tombstoned in its slot                                                                           | Nothing stored, unless the answer was lost; the Vault locked, and otherwise as it was                |
| `gating.attempt` | At most one under way; its gate read once; no cleartext kept                                                                                                                                  | The same; correctable: the gating still open; any other: settled                                     |

## `build_vault`

```text
bank.ensureVault(bag)
├─ bank.#demandReady                                 hello's own error, where it failed; 'bad_option' before any hello
├─ vaultListing.at(scope)                            what hello loaded: a present vault → returned, without asking
└─ vaultListing.buildVault(scope) → Vault.launchBirth(listing, scope)
   ├─ prior = the slot's tombstone's revision, else VoidRevision     a present vault listed → 'bad_option'
   └─ Gating.launchBirth(listing, scope, prior, Vault.#unlockVaultByProving, askUser)
      ├─ no requestCleartext                         → 'bad_option', without asking
      ├─ listing.attachGating                          one open on this bank → 'already_asking'
      ├─ void #askHost → requestCleartext(gating)    ← host opens the dialog
      └─ await #concluded
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear? })           a second while one runs: attempt_in_flight
│                                                    passkeyClear spent after, unless correctable (G2)
│                                                    no lock check: a lock does nothing to a birth
├─ stamp = listing.stampOfBirth(scope)              a fresh vault_tok, registered_at now; one per attempt
├─ PassphraseProving.buildNovel(stamp, passphraseClear, world)      weak → may re-enter
├─ PasskeyProving.buildNovel(stamp, passkeyClear, world)            where a passkeyClear is handed
└─ then the change, from { passphraseProving, passkeyProving | null }   ── no cleartext is used past here ──
   the build_vault act's change
   ├─ passphraseProving.buildWayin(NOVEL)            makeVaultKey; wrap; vaultKey dropped
   ├─ passkeyProving?.buildWayin(passphraseProving)  unwrap from the source; wrap; dropped
   ├─ gate = Gate.make(stamp, passphraseWayin, passkeyWayin | null)
   ├─ record = listing.recordOfBirth(gate, prior)    sync pojo at the revision after prior; its gate is gate.pickle()
   ├─ vault = vaultListing.put(record, { prior, ifAbsent: 'add', ifPresent: 'get' })
   │    ├─ vaultDB.tryPutVault(record, { prior, ifAbsent, ifPresent })    ← the commit
   │    │    a live row → 'declined', the stored record its answer: another won
   │    │    a newer tombstone → 'stale_write', delivered, then thrown
   │    └─ deliver(answer, record) → new Vault(what is stored), listed, locked    a declined put pins only the scope
   ├─ vault's vault_tok is not the record's → another won: refused 'gate_made_elsewhere', its Vault listed, locked
   └─ vault.#unlockByProving(passphraseProving)
      ├─ lease = passphraseProving.buildLease(vault.#leaseFriend())    refused → the vault stays stored and listed, locked
      └─ vault.#attachLease(lease)                   cached as it attaches

the act returns → gating concludes ok → bank.ensureVault resolves    provings dropped with their keys
host closes dialog → requestCleartext resolves → conclude is a no-op
```

`prior` is carried across the dialog: it decides whether to ask, and the put needs it. It is always a value:
the tombstone's revision, or `VoidRevision` (*Required of the parts not yet drawn*).
A stale `prior` is safe: over a live row the put is declined, and that answer is the "another won"
line above; over a newer tombstone the put refuses with 'stale_write'. A refused put leaves only what its answer delivered, and nothing on the device.
The act tells its own birth from another's by comparing the record it sent with the one it got back, before attaching a lease. The new Vault reports locked between the
put and the attach, with no listener yet to see it. A Bank's `lock` during the put or that await comes after
the enter key, so the birth runs to its end and the vault is unlocked.

## `unlock_vault`

```text
vault.ensureUnlocked()
├─ await ensureTimely()                              asked first: it makes the vault recent enough to know if it deserves a lease
├─ a lease in force → done
├─ not full → fetch
├─ #attachCachedLease: Lease.tryPeek → lease.attach → done, where one is cached; of this vault_tok and gate_epoch, and not past autolock
│    another epoch or stamp: uncached, reads as no row;  past autolock: left, reads as no row;  refused: bad news, no row
├─ no requestCleartext → 'vault_locked'
└─ Gating.launchOn(vault, 'unlock_vault', Vault.#unlockVaultByProving, askUser)
   ├─ a gating open on this bank → refuses already_asking
   ├─ void #askHost → requestCleartext(gating)
   └─ await #concluded
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear }) or attempt({ passkeyClear })
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ gate = vault.gate                                 this attempt's, from here on
├─ PassphraseProving.buildStored(gate, passphraseClear, world)
│    or PasskeyProving.buildStored(gate, passkeyClear)
│    wrong → may re-enter
└─ then the change, from { proved }                                   ── no cleartext is used past here ──
   vault.#unlockByProving(proved)
   ├─ lease = proved.buildLease(vault.#leaseFriend())   the proved gate's epoch, whatever arrived since
   └─ lease.attach()                                 cached after it

the act returns → gating concludes ok → ensureUnlocked resolves
```

## Changing the gate

The gate is the only part of a vault record that changes, so each change has its own vaultDB verb, named for what
it does: `replacePassphrase`, `addPasskey` or `revokePasskey`. No `Gate` is made for the next gate: a `Gate` is a read-only
view of a record's gate, and adopt makes a new one from each record. The vault listing mints the whole next record, and each
verb lets the vaultDB check it against the row (`notes/design-vaultdb.md`, VG1 to VG3). Each change ends the same way, and
needs nothing that the vault does not already have:

```text
each gate change's act, past its provings
├─ stored = await vaultListing.<gate verb>(ante, wayin)    ← the commit; ante, the record the attempt read
│  └─ #gateVerbAnswered(ante, moved, call, { isScopePinned })
│     ├─ record = ante at nextRevisionOf(prior), gate_epoch one up, the moved wayin laid on its gate
│     ├─ call(record, { prior })                     the vaultDB's verb; prior is ante's revision; moved → 'stale_write', nothing stored
│     │    the vaultDB checks registered_at unchanged, gate_epoch one up, only its own wayin moved, then puts the record whole
│     │    and refuses what its row rules out, such as an addPasskey over a passkey already stored ('camped')
│     └─ deliver(answer, record)                     checked against what it sent; a revoke pins only the scope
│        no lock: adopt never locks on a move
└─ vault.#unlockByProving(proved, stored.gate.gate_epoch)    a fresh lease of full term; a lock() crossing the change does not stay in effect
```

* **The lease comes after the put**, so its `gate_epoch` is the one that was written, and a refused put
  has nothing to clean up. The old lease stays in force in between, so the vault does
  not report locked. That is safe, because the vaultKey did not change. A crash between the two leaves a cached
  lease under the old epoch, which `Lease.buildFromCache` forgets, so the next session asks for a passphrase: a normal state.
* **One record through the attempt.** The attempt reads `ante`, the vault's record, after its timeliness request, and
  proves against `ante`'s gate. The next record is minted from `ante`, not the live vault, so `ante`'s revision is the put's prior.
  Anything the watch delivers during the attempt therefore makes the put refuse: a passkey revoked elsewhere is not brought
  back, and a passphrase replaced elsewhere is not overwritten.
* **A write made after the timeliness request.** The put refuses with 'stale_write'. The gating concludes with
  that refusal, and the vault has by then taken in the stored record. Nothing retries; a host may call
  the verb again.
* **A gate change locks no device.** Another device's session keeps its lease until its own lock or next `bank.autolock`; its
  cached lease, of the older `gate_epoch`, is forgotten at its next session (Decided).
* **The vaultDB checks what it can see, and no more.** It refuses a record whose `registered_at` moved, whose `gate_epoch`
  is not one up, or that moves the other wayin (`gate_issue`), and an `addPasskey` over a passkey already stored (`camped`).
  It cannot tell whether a wrap opens, so a bad `vault_key_wayin_wrapped` is still written.

### `replace_passphrase`

```text
vault.replacePassphrasePrompt()
├─ await ensureTimely(); demandPromptable
└─ Gating.launchOn(vault, 'replace_passphrase', Vault.#unlockVaultByProving, askUser)
   →→→ user hits enter key →→→
gating.attempt({ antePassphraseClear, nextPassphraseClear })
├─ the two cleartexts equal → 'same_passphrase', may re-enter
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ anteProving = PassphraseProving.buildStored(gate, antePassphraseClear, world)
│    wrong → may re-enter
├─ nextProving = PassphraseProving.buildNovel(gate.stamp, nextPassphraseClear, world)
│    weak → may re-enter
└─ then the change, from { ante, anteProving, nextProving }           ── no cleartext is used past here ──
   ├─ nextWayin = nextProving.buildWayin(anteProving)    unwrap the vaultKey; wrap; dropped
   └─ vaultListing.<gate verb>, then vault.#unlockByProving(anteProving, stored.gate.gate_epoch)
      commit: vaultListing.replacePassphrase(ante, passphrase_wayin)    ← the commit; passphrase_wayin is nextWayin.pickle()
```

The current passphrase is proved before the next is judged, so the `strengthChecker` is given a next
passphrase only from someone who has proved the current one.

### `add_passkey`

```text
vault.addPasskeyPrompt()
├─ await ensureTimely(Promptly); demandPromptable    the vault's gate is refreshed first
├─ gate.demandPasskeyAddable                         one already there → refused, without asking
└─ Gating.launchOn(vault, 'add_passkey', Vault.#unlockVaultByProving, askUser)
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear })
│                                                    passkeyClear spent after, unless correctable (G2)
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter, passkeyClear unspent
├─ passkeyProving = PasskeyProving.buildNovel(gate.stamp, passkeyClear, world)
└─ then the change, from { ante, proved, passkeyProving }             ── no cleartext is used past here ──
   ├─ passkeyWayin = passkeyProving.buildWayin(proved)   unwrap the vaultKey; wrap; dropped
   └─ vaultListing.<gate verb>, then vault.#unlockByProving(proved, stored.gate.gate_epoch)
      commit: vaultListing.addPasskey(ante, passkey_wayin)                  ← the commit; passkey_wayin is passkeyWayin.pickle()
           one added before the enter key → 'camped'; after the attempt read ante → 'stale_write'
```

### `revoke_passkey`

```text
vault.revokePasskeyPrompt()
├─ await ensureTimely(Promptly); demandPromptable    the vault's gate is refreshed first
├─ the gate has no passkey                           returns the vault, without asking
└─ Gating.launchOn(vault, 'revoke_passkey', Vault.#unlockVaultByProving, askUser)
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ then the change, from { ante, proved }                             ── no cleartext is used past here ──
   └─ vaultListing.<gate verb>, then vault.#unlockByProving(proved, stored.gate.gate_epoch)
      commit: vaultListing.revokePasskey(ante)                              ← the commit
           revoked before the attempt read ante → 'revoked', nothing moved; after it → 'stale_write'
```

### `del_vault`

```text
vault.delVaultPrompt()
├─ await ensureTimely(); demandPromptable
└─ Gating.launchOn(vault, 'del_vault', Vault.#unlockVaultByProving, askUser)
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })                  no lock check: a lock does not stop a delete
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ then the change, from { ante, proved }                             ── no cleartext is used past here ──
   ├─ vault.lock()                                   sync, no throw: the lease revoked, the boxes aligned
   └─ vault.del(ante)                                Storable's
      ├─ await ensureDeletable()                     hydrates
      ├─ demandDeletable                             enabled only: a lock does not stop a delete
      ├─ vault.sparse consistent with ante           scope, vault_tok and revision; moved since the proof → 'stale_write', nothing sent
      └─ vaultListing.del(vault.sparse) → tryDel
         ├─ a vault listed of another vault_tok      → 'vault_reborn', nothing sent
         └─ Listing.tryDel: the tombstone at nextRevisionOf(the sparse record's revision)
            ├─ vaultDB.tryDelVault(tombstone, { prior })    ← the commit: a tombstone, its boxes cascading
            │    moved → 'stale_write', nothing stored
            └─ deliver(answer, tombstone) → receive → adopt(tombstone)
               ├─ vault.#revokeLease('tombstone')    refused → announced 'lease_revoke_failed'; the tombstone stays
               └─ boxListing.vacate()                boxes disabled and delisted, nothing deleted; the vault stays in its slot, tombstoned
```

The lock comes first because it is synchronous and safe: from then on no box can be unsealed under a lease while
the tombstone is sent. Locked is also a normal state, so a refused delete leaves a Vault that reports locked and
nothing half done. The cost is one passphrase entry, because the lock's vacate forgets the cached lease. The box listing's vacate
comes last, because it cannot be undone. The proof unlocks nothing here, because no lease follows it. The delete is made over the
revision `vault.del` hydrated to, not the attempt's `ante`. Another device receives the tombstone, and its Vault ends the same way. A rebirth is a new
Vault.

The vaultDB owns the cascade: removing a vault tombstones its box rows by scope and `vault_tok`, so no
client has to walk them. The `vault_tok` keeps a late or repeated cascade away from a rebirth's boxes, which have the
same scope but a different token. The tombstone and the cascade share a transaction in every adapter we implement. A repeated delete, step by step:

```text
vaultDB.delVault(tombstone, { prior })
stored is live, this vault_tok, at prior         the tombstone written, revision_tok and revision_seq moved; cascade; 'deleted'
stored is live, this vault_tok, revision moved   'stale_write'; no cascade
stored is the tombstone of this vault_tok        nothing written, whatever the revision; cascade; 'gone', `val` the old tombstone
stored is another vault_tok, or nothing          nothing written, whatever the revision; cascade; 'void', a shell tombstone
```

Repeated deletes do not advance the revision. Whoever repeats a delete may not have the current token, having lost the first
answer. Advancing the revision would wake every device's watch for nothing, and could cause a rebirth that has that
tombstone as its `prior` to be refused. The package does not retry: a repeat is the host calling the verb again,
which its Vault allows until the tombstone arrives. After that `vault.delVaultPrompt()` refuses, because the vault is not
present; `vault.del(vault.scope)` still repeats the delete, over the tombstone's revision, and the vaultDB answers `gone` and cascades.

A Box operation naming a stale or missing vault_tok will fail `vault_reborn` (or `vault_empty` or `vault_gone`). The damaged_row field will contain a generated tombstone if one is found with that scope *and vault_tok*, null otherwise. In both cases the value is forensic: do not instantiate, do not delivere. (Discovering a row is exceptionally unlikely as they were to have been transactionally removed with the vault deletion. `bank.doctor()` will establish comfort if needed)

## Required of the parts not yet drawn

* Storage's conditional put is atomic on `revision_tok`.
* The deviceDB's calls take effect in the order they were made (*The lease*).
* `lock()` removes the cached lease even on a vault already reporting locked.
* The deviceDB has `cache`, `peek` and `vacate`, by scope and `vault_tok`: `vacate` and `del_vault` both need a removal.
* Every put validates `prior.revision_tok` and `prior.revision_seq` against the row, and that the record's `revision_seq`
  is `prior.revision_seq` plus one. A birth where no row is stored sends `VS.NeverStored`, which has a known `revision_tok` and a
  `revision_seq` of -1. The shell is a value and not a null, so the invariant applies to it too.
* The deviceDB also has `leasesProvedBefore(cutoff)`, an index range scan over its cached leases, for `bank.autolock`.
* `adopt` ignores a record older by `revision_seq`.
* `Promptly`, a constant: the timeliness an attempt asks of `ensureTimely`. `maxMillis: 0` is the customer's to ask, as an
  override from the inside is one the customer cannot.
* `ifPresent` is customer-facing, and `putVault` and `putBox` take it alike in `PutOpts`, with `ifAbsent` ('add' or
  'fail'). Only `repl` saves, and only within the live row's own life: at its revision under another `vault_tok` or
  `box_tok` it refuses `camped`. `fail` refuses `camped` with the corpse (`dbhas`, the request), not as a `stale_write`;
  `get` answers the live row in place of the request, `declined`. `isVaultPutAllowed(ante, record, opts)` and
  `isBoxPutAllowed(ante, record, opts)` decide inside each adapter's transaction.
* Every box query names scope and `vault_tok`, and a box row under another `vault_tok` is treated as no row. Only a
  fetch of a vault record has a reason to go by scope alone.

## To fix

* **`identity_revoked`** vacates: any call into the VaultDB that is answered with it runs `bank.vacate`, then passes the
  refusal on to its caller. Built. `notes/security.md` says the old code locked there, and has to be brought into agreement.

## Areas of Concern

Eyebrow raisers from the Coach's replies in the sprint's Closer Look (`whiteboard/20261103-unrace/unrace-closerlook.md`).

* **The gating family:** `#concluded`, `#outcome` and their flags. "same family of design smells around gating". See `whiteboard/20261102-newdesign/unrace-gating-prompt.md`.
* **The cache and the forget on one control path:** `lease.tryCache()` before the align, the forget before the first await. "that sounds dangerous".
* **Cleartexts:** `spendCleartexts` and `checkedCleartexts` reach into the host's objects, and who owns a passkey answer's PRF bytes is open. "I assumed that the buffer exhaustion was best practice".
