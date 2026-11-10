# Unrace: a new vault

Design for vault birth and the other gatings in the models, built from the bottom up. Built in
`src/models/`, behind no public entry point yet; the diagrams show the code as it stands. The Coach,
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
   │       older than the one listed                 → it loses
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
|                     | `salt_b64`                      | Random, of the deriver's `salt_bytes`                |
|                     | `device_id`, `registered_at`    | Bank, clock                                          |
|                     | `vault_key_wayin_wrapped`       | New random vaultKey, wrapped under the passphraseKey |
| Passkey wayin (opt) | `credential_id`, `prf_salt_b64` | `passkeyClear`                                       |
|                     | `device_id`, `registered_at`    | Bank, clock                                          |
|                     | `vault_key_wayin_wrapped`       | Same vaultKey, wrapped under the passkeyKey          |

The ordering rules:

1. The stamp (scope, `vault_tok`, `registered_at`) comes before any key: a wayin's ctx binds
   `[stamp, purpose, header]`, and a passkeyKey's HKDF `info` is that same ctx.
2. A header comes before its key: a passphraseKey is derived over the header's salt.
3. The passphrase wayin comes before the passkey wayin: it is where the vaultKey comes from.

The lease is not an input. It is a second output of the same vaultKey.

## The provings

Every proving instance has a strong key from birth, and only the statics below hear a clear. Key
bytes stay in `passphraseKeyOf`, which keeps the deriver's bytes local and zeroes them. A stored
wayin is read from the gate, which also gives the stamp and the `gate_epoch`. A novel proving's epoch
is the first.

```text
PassphraseProving.buildNovel(stamp, passphraseClear, world)
├─ checkStrength(passphraseClear, scope)     weak → 'weak_passphrase'
├─ mintPassphraseHeader                      key_deriver_label, salt_b64, device_id, registered_at
└─ passphraseKeyOf(keyDeriver, clear, salt)  bytes zeroed; non-extractable #wayinKey

PasskeyProving.buildNovel(stamp, passkeyClear, world)
├─ mintPasskeyHeader                         credential_id, prf_salt_b64, device_id, registered_at
└─ deriveWrappingKey(prfBytes, ctx)          non-extractable #wayinKey

PassphraseProving.buildStored(gate, passphraseClear, world)
├─ key_deriver_label is the world's          else 'unknown_key_deriver'
├─ passphraseKeyOf(keyDeriver, clear, stored salt)
└─ the wrap opens                            else 'wrong_passphrase'

PasskeyProving.buildStored(gate, passkeyClear)
├─ the gate has a passkey wayin            else 'absent_wayin'
├─ credential_id and prf_salt_b64 match      else 'wrong_passkey', the answer left unspent
├─ deriveWrappingKey(prfBytes, ctx)
└─ the wrap opens                            else 'wrong_passkey'

proving.buildWayin(NOVEL | sourceProving)    a Wayin; the vaultKey made or unwrapped, wrapped, dropped
proving.buildLease(friend, gate_epoch?)      a Lease on friend's vault, under the epoch it proved or the one passed
```

A proving never has the Vault. `vault.#leaseFriend()` is all a `Proving` or a `Lease` hears of one: the
stamp, `leaseMillis`, the clock, the logger, `lock`, and the deviceDB's lease verbs bound to its scope. All of
that is fixed for the vault's life, so `gate_epoch`, which moves, is passed where it is wanted. It has no key, and
reaches neither the record nor the boxes. `buildLease` refuses a friend whose stamp is not the proving's.

A proving of the current gate is always wanted, not only its yes or no: it is the only thing that
can unwrap the vaultKey, for the next wayin and for the next lease. So there is no `demandMatch`.

`gating.checkStrength`, for the live check as the user types, calls the same `checkStrength`.

"May re-enter" below means a correctable refusal: the host hears it, and the gating stays open, so it
can shake its dialog and let the user enter again. Nothing retries.

## `put`

```text
box.put(patch, opts)                                 vault.putBox comes here, through boxListing.puttable
└─ box.tryPut(patch, opts)
   ├─ await ensurePuttable(patch, timely)            hydrates, unless the box is sparse and patch carries whisper and sidecar
   ├─ given = demandPuttable(patch, { ifPresent })   the box itself: enabled, unlocked, whole only for a patch missing a half
   ├─ { record, prior } = await #edit(given)         laid over the record in hand, sealed, returned, captured nowhere
   ├─ demandPuttable(patch, { ifPresent })           again, past the seal: locked → refused
   └─ listing.tryPut(record, { prior, ifAbsent, ifPresent })    over the revision #edit read, not whatever the instance has by then
      ├─ doTryPut(record, { prior, ifAbsent, ifPresent })
      │    moved → 'stale_write'; a live row and ifPresent 'fail', or a live row of another box_tok at prior → 'camped':
      │    the stored record delivered, then thrown
      └─ deliver(answer, record) → receive → adopt, align      checked against what it sent; put resolves at the end of receive
```

Nothing is kept between `#edit` and the put: a record laid over a revision that has since moved is
refused by storage. So a put refused leaves nothing behind, as a birth's put does, and a snapshot
shows a change only once it has landed. A sparse box under a patch of both halves needs nothing fetched,
as the put's revision check is what catches a stale one.

`put` is the box's alone. A vault has no `put`, as nothing about its record changes but its gate, which has its own verbs
(*Changing the gate*). The patch hooks are `Box`'s.


## Notable Changes (that may be inconsistent)

* DeviceDB.cache/peek/vacate: directly keep/retrieve record by scope + vault_tok
* Unlist: remove from the listing's list
* A listing memoizes its children in a Map, and `deliver` has an instance in its slot before it yields, so
  overlapping answers land on one instance. Subscriptions are not counted on: a fetch answer builds where none, as a
  notice does
* The Bank is durable: `bank.sweep` sweeps its listing and children, and the next hello builds fresh ones (ruled: a swept bank is done, a host makes a new Bank; not built yet)
* A Vault instance is replaced only when vacated, swept, or created from gone or void: a birth's `vaultListing.put`,
  delivered, replaces the object; only a deleted vault stays in its slot, tombstoned, so a late
  fetch answer loses to it; the tombstone delivered vacates its box listing and boxes
* No timers on a Storable or a lease: a JS timer on a page that may be suspended at any moment says nothing. Refresh
  timers belong to the listing or the bank. Autolock is a best-effort reminder, not a guarantee: `bank.autolock`, called by a host as it likes, after hello and on its own timer, and `Lease.peek` declining to load a row past it at the door, leaving it
* A lease records `proved_at` and the kind of proving. `bank.autolock` finds cached leases through a deviceDB index range
  scan, so a fresh page needs no instance, and locks each listed vault of the row's own `vault_tok`, which forgets the row.
  It shouts: a refused scan is bad news, and a lock whose forget is refused panics
* The device caches only leases and the device record, not vault or box records, and no refresh timer runs
* The goal: when lock is called, nothing crosses it. We get there with simple code that can be analyzed in context, so a
  crossing is raised in one sentence (`whiteboard/20261102-newdesign/reference-timings.md`), not fine-tuned
* A box birth: `vault.putBox` with no box listed lists a void box (`boxListing.puttable`), whose `box.put` makes the record
  over the sentinel prior, seals it, puts (`born` or `reborn`), and the answer is delivered. A sidecar-only `box.put` unseals
  and reseals, as the box stamp binds the sidecar
* A cached lease is never shrugged off when it clearly must not stand. Where a user proving authority and intent to
  unlock crosses something saying lock, the ambiguity settles for clear code and a stated rule: `#attachLease` checks at
  its start and carries through
* A crossing unlikely enough may just throw, and the host deals with it
* Each update, as it comes in, transactionally establishes its invariants. Where those invariants don't commute, it takes a
  higher-level coordinator, resolution by the host, or most likely advice to the host on making the ordering predictable
* `vaultDB.tidyGone` is for hosts: nothing in the package calls it
* No guarantee of the ordering of simultaneous gets, puts and dels of a box, or even of how many will succeed
* Only Proving, Gating and Vault touch a lease. A box seals and unseals through `vault.sealStampedString` and
  `vault.unsealStampedString`, and `ensureUnlocked` answers no lease

## The lease: make, attach, cache

Each way to unlocked makes a lease its own way, then attaches it the same way. No counter and no compare.

```text
an unlock    lease = await proved.buildLease(friend);                  await vault.#attachLease(lease)
a birth      lease = await passphraseProving.buildLease(friend);       await vault.#attachLease(lease)
the cache    lease = await Lease.buildFromCache(friend, gate_epoch);   await vault.#attachLease(lease)    null → ask

friend is vault.#leaseFriend(): the stamp, the deviceDB's lease verbs bound to its scope, vault.lock

vault.#attachLease(lease)                            private: by #unlockByProof, and by ensureUnlocked for a cached lease
├─ demandAttachable                                  swept, vacated or deleted → refused, nothing cached
├─ this.#lease = lease
├─ await lease.cacheAsCacheCan()                     refused → bad news; the lease is still granted
├─ align                                             reports unlocked; listeners run; snapshot re-made
└─ #alignBoxes                                       each box listed aligned: its snapshot's isLocked moves, its own listeners told once

vault.#revokeLease(where)                            private: called by lock and vacate, and by adopt of a tombstone
├─ this.#lease = null                                the lease goes first, so a refused forget leaves none
├─ revoking = granted?.tryRevoke() ?? Lease.tryForget(friend)    always, granted or not: a vault reporting locked still forgets
├─ align                                             reports locked; listeners run; snapshot re-made
├─ #alignBoxes                                       each box listed aligned, as at the attach
└─ await revoking                                    refused → announced 'lease_revoke_failed'
```

**A `lock()` before the attach, on an unlock or a birth,** loses by the enter-key rule. It leaves a vault
unlocked with its lease cached: a normal state, on show, that the next `lock()` ends. The vault was
locked already, so that `lock()` changed no state.

**A `lock()` after the attach** is an ordinary lock of an unlocked vault: it vacates the lease, which removes
it from the cache. This requires of the new deviceDB that calls land in the order they were made, so
that the vacate lands after the put. The put is awaited before `align`, because a listener may call
`lock()`. So the attach needs no compare, and no second vacate.

**A `lock()` crossing a gate change** does not stand, as at an unlock: the proof says this user may have
the vault unlocked. Each of the three gate changes ends in `#unlockByProof`, which leases the vault for a
full term under the epoch that landed.

**`sweep`, `vacate` and `delete`** leave a one-way state: every guard refuses from then on, so
anything worth guarding stops working. A swept or vacated thing is also delisted, a deleted vault stays, tombstoned, while its box listing and boxes go, and the refusals are for whoever
still has a reference. `#attachLease` demands it too (`demandAttachable`), as its first step, so refusing there
leaves nothing cached.

**The cache:** a `lock()` during `Lease.buildFromCache`'s read loses too: the vault reports unlocked, the lock's
vacate stands, and the next session asks. A row for `notes/wontfix.md`.

Another tab's `lock()` is not syndicated.

## The discards

```text
lock     revoke the lease and forget its cache; align; align each box listed
sweep    drop the lease private property, leaving the cached; disable watches; disable all calls; sweep children; delist children
vacate   disable; vacate the lease and forget its cache; vacate children (disables, delists them); conclude its gating
delete   lock; vault.del → vaultListing.del(vault.sparse): a tombstone, storage cascading its boxes, transactionally; delivered, it forgets the cached lease and vacates the box listing (boxes disable, delist); only the vault stays, tombstoned
autolock bank: deviceDB.leasesProvedBefore(cutoff), an index range scan; lock each listed vault of the row, which forgets it
```

**A `lock()` whose vacate is refused panics**: it is not bad news. The call
itself stays synchronous and does not throw, as the refusal comes later, from the deviceDB. A panic calls the
host's async `onPanic` with the refusal, and no secret material; a rejection of it is reported and goes no
further. With no `onPanic`, the refusal is reported by `reportToPlatform`, and the Vault is vacated as the refusal
arrives, with no timer. Disabled calls stop the reopening in this tab, even if the deviceDB still refuses. A
second refusal panics again and finds the vacate done, a no-op, so this needs no counter; a vacate marks itself
done before its forget.

**A `lock()` and the dialog.** A lock leaves an open gating open: it says the vault is locked, and
the dialog is still the user's to answer. An unlock it was asking for still unlocks, and a change of
the gate lands and unlocks. A valid request goes through if it was authorized at the
start of its critical section.

**A `dismiss()` and the dialog.** The package cannot close a host's dialog, so a gating says when to:
`gating.whenConcluded`, a promise a dialog closes on. A Cancel, a sweep or a vacate dismisses:

```text
no attempt under way    concludes it 'dismissed': the verb refuses, the dialog closes; a later attempt refuses 'gating_concluded'
an attempt under way    the attempt runs through and its outcome concludes the gating, so a wrong passphrase
                        crossed by a dismiss answers 'wrong_passphrase'; a re-entry refuses
```

## End-of-method invariants

Each method states what stays true when it ends, whatever crossed it.

At all times, a lease granted and reporting unlocked are the same fact: `isLocked` is `#lease === null`, not a
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
| `gating.attempt` | At most one under way; its gate read once; no clear kept                                                                                                                                  | The same; correctable: the gating still open; any other: settled                                     |

## `build_vault`

```text
bank.ensureVault(bag)
├─ bank.#demandReady                                 hello's own error, where it failed; 'bad_option' before any hello
├─ vaultListing.at(scope)                            what hello loaded: a present vault → answer it, nobody asked
└─ vaultListing.buildVault(scope) → Vault.launchBirth(listing, scope)
   ├─ prior = the slot's tombstone's revision, else VoidRevision     a present vault listed → 'bad_option'
   └─ Gating.launch('build_vault', { listing, scope, vault: null, run })
      ├─ no requestCleartext                         → 'bad_option', nobody asked
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
└─ run({ passphraseProving, passkeyProving | null })   ── no clear goes past here ──
   the build_vault run
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
   └─ vault.#unlockByProof(passphraseProving)
      ├─ lease = passphraseProving.buildLease(vault.#leaseFriend())    refused → the vault stays stored and listed, locked
      └─ vault.#attachLease(lease)                   cached as it attaches

run returns → gating concludes ok → bank.ensureVault resolves    provings dropped with their keys
host closes dialog → requestCleartext resolves → conclude is a no-op
```

`prior` is what crosses the dialog: it decides whether to ask, and the put needs it. It is always a value:
the tombstone's revision, or `VoidRevision` (*Required of the parts not yet drawn*).
Its staleness is safe: over a live row the put declines, and that answer is the "another won"
line above; over a newer tombstone it refuses 'stale_write'. A refused put has only what its answer delivered, nothing on the device.
`run` tells a birth from another's by comparing the record it sent with the one it got, before attaching a lease. The new Vault reports locked between the
put and the attach, with no listener yet to see it. A Bank's `lock` during the put or that await is past
the enter key, so the birth runs through, unlocked.

## `unlock_vault`

```text
vault.ensureUnlocked()
├─ await ensureTimely()                              asked first: it makes the vault recent enough to know if it deserves a lease
├─ a lease in force → done
├─ not full → fetch
├─ #attachCachedLease: Lease.tryPeek → lease.attach → done, where one is cached; of this vault_tok and gate_epoch, and not past autolock
│    another epoch or stamp: uncached, reads as no row;  past autolock: left, reads as no row;  refused: bad news, no row
├─ no requestCleartext → 'vault_locked'
└─ Gating.launch('unlock_vault', { listing, scope, vault, run })
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
└─ run({ proved })                                   ── no clear goes past here ──
   vault.#unlockByProof(proved)
   ├─ lease = proved.buildLease(vault.#leaseFriend())   the proved gate's epoch, whatever arrived since
   └─ lease.attach()                                 cached after it

run returns → gating concludes ok → ensureUnlocked resolves
```

## Changing the gate

A gate is the one thing about a vault record that changes, so a change has a vaultDB verb of its own, named for what
it does: `replacePassphrase`, `addPasskey` or `revokePasskey`. No `Gate` is made for the next gate: a `Gate` is a read-only
view of a record's gate, and adopt makes a new one from each record. The vault listing mints the whole next record, and each
verb lets the vaultDB check it against the row (`notes/design-vaultdb.md`, VG1 to VG3). Each change ends the same way, and
needs nothing the vault does not already carry:

```text
each gate change's run
├─ stored = await vaultListing.<gate verb>(ante, wayin)    ← the commit; ante, the record the attempt read
│  └─ #gateVerbAnswered(ante, moved, call, { isScopePinned })
│     ├─ record = ante at nextRevisionOf(prior), gate_epoch one up, the moved wayin laid on its gate
│     ├─ call(record, { prior })                     the vaultDB's verb; prior is ante's revision; moved → 'stale_write', nothing stored
│     │    the vaultDB checks registered_at unchanged, gate_epoch one up, only its own wayin moved, then puts the record whole
│     │    and refuses what its row rules out, such as an addPasskey over a passkey already stored ('camped')
│     └─ deliver(answer, record)                     checked against what it sent; a revoke pins only the scope
│        no lock: adopt never locks on a move
└─ vault.#unlockByProof(proved, stored.gate.gate_epoch)    a fresh lease of full term; a lock() crossing the change does not stand
```

* **The lease comes after the put**, so its `gate_epoch` is the one that landed, and a refused put
  has nothing to clean up. The old lease stays in force for the moments between, so the vault does
  not read locked. That is safe, as the vaultKey did not change. A crash between them leaves a cached
  lease under the old epoch, which `Lease.buildFromCache` forgets: a passphrase next session, a normal state.
* **One record through the attempt.** The attempt reads `ante`, the vault's record, after its timeliness request, and
  proves against `ante`'s gate. The next record is minted from `ante`, not the live vault, so its revision is the prior. Whatever the
  watch delivers during the attempt therefore refuses the put: a passkey revoked elsewhere is not brought back, and a
  passphrase replaced elsewhere is not overwritten.
* **A write landing after the timeliness request.** The put refuses 'stale_write'. The gating concludes with
  that refusal, and the vault has by then taken in the stored record. Nothing retries; a host may call
  the verb again.
* **No device locks on it.** Another device's session keeps its lease to its lock or next `bank.autolock`; its cached
  lease, of the older `gate_epoch`, is forgotten at its next session (Decided).
* **The vaultDB checks what it can see, and no more.** It refuses a record whose `registered_at` moved, whose `gate_epoch`
  is not one up, or that moves the other wayin (`gate_issue`), and an `addPasskey` over a passkey already stored (`camped`).
  It cannot tell whether a wrap opens, so a bad `vault_key_wayin_wrapped` still lands.

### `replace_passphrase`

```text
vault.replacePassphrasePrompt()
├─ await ensureTimely(); demandPromptable
└─ Gating.launch('replace_passphrase', { listing, scope, vault, run })
   →→→ user hits enter key →→→
gating.attempt({ antePassphraseClear, nextPassphraseClear })
├─ the two clears equal → 'same_passphrase', may re-enter
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ anteProving = PassphraseProving.buildStored(gate, antePassphraseClear, world)
│    wrong → may re-enter
├─ nextProving = PassphraseProving.buildNovel(gate.stamp, nextPassphraseClear, world)
│    weak → may re-enter
└─ run({ ante, anteProving, nextProving })           ── no clear goes past here ──
   ├─ nextWayin = nextProving.buildWayin(anteProving)    unwrap the vaultKey; wrap; dropped
   └─ vaultListing.<gate verb>, then vault.#unlockByProof(anteProving, stored.gate.gate_epoch)
      commit: vaultListing.replacePassphrase(ante, passphrase_wayin)    ← the commit; passphrase_wayin is nextWayin.pickle()
```

The current passphrase is proved before the next is judged, so the `strengthChecker` hears a next
passphrase only from someone who proved the current one.

### `add_passkey`

```text
vault.addPasskeyPrompt()
├─ await ensureTimely(Promptly); demandPromptable    the gate in hand is refreshed first
├─ gate.demandPasskeyAddable                         one already there → refused, nobody asked
└─ Gating.launch('add_passkey', { listing, scope, vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear })
│                                                    passkeyClear spent after, unless correctable (G2)
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter, passkeyClear unspent
├─ passkeyProving = PasskeyProving.buildNovel(gate.stamp, passkeyClear, world)
└─ run({ ante, proved, passkeyProving })             ── no clear goes past here ──
   ├─ passkeyWayin = passkeyProving.buildWayin(proved)   unwrap the vaultKey; wrap; dropped
   └─ vaultListing.<gate verb>, then vault.#unlockByProof(proved, stored.gate.gate_epoch)
      commit: vaultListing.addPasskey(ante, passkey_wayin)                  ← the commit; passkey_wayin is passkeyWayin.pickle()
           one added before the enter key → 'camped'; after the attempt read ante → 'stale_write'
```

### `revoke_passkey`

```text
vault.revokePasskeyPrompt()
├─ await ensureTimely(Promptly); demandPromptable    the gate in hand is refreshed first
├─ the gate has no passkey                           answers the vault, nobody asked
└─ Gating.launch('revoke_passkey', { listing, scope, vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run({ ante, proved })                             ── no clear goes past here ──
   └─ vaultListing.<gate verb>, then vault.#unlockByProof(proved, stored.gate.gate_epoch)
      commit: vaultListing.revokePasskey(ante)                              ← the commit
           revoked before the attempt read ante → 'revoked', nothing moved; after it → 'stale_write'
```

### `del_vault`

```text
vault.delVaultPrompt()
├─ await ensureTimely(); demandPromptable
└─ Gating.launch('del_vault', { listing, scope, vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })                  no lock check: a lock does not stop a delete
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run(proved)                                       ── no clear goes past here ──
   ├─ vault.lock()                                   sync, no throw: the lease revoked, the boxes aligned
   └─ vault.del()                                    Storable's
      ├─ await ensureDeletable()                     hydrates
      ├─ demandDeletable                             enabled only: a lock does not stop a delete
      └─ vaultListing.del(vault.sparse) → tryDel
         ├─ a vault listed of another vault_tok      → 'vault_mismatch', nothing sent
         └─ Listing.tryDel: the tombstone at nextRevisionOf(the sparse record's revision)
            ├─ vaultDB.tryDelVault(tombstone, { prior })    ← the commit: a tombstone, its boxes cascading
            │    moved → 'stale_write', nothing stored
            └─ deliver(answer, tombstone) → receive → adopt(tombstone)
               ├─ vault.#revokeLease('tombstone')    refused → announced 'lease_revoke_failed'; the tombstone stands
               └─ boxListing.vacate()                boxes disabled and delisted, nothing deleted; the vault stays in its slot, tombstoned
```

The lock comes first because it is synchronous and safe: from there no box opens under a lease while
the tombstone goes out. It is also a normal state, so a delete refused leaves a Vault reporting locked and
nothing half done, and the cost is one passphrase, as the lock's vacate forgets the cached lease. The box listing's vacate
comes last, as it cannot be walked back. The proof opens nothing here, as no lease follows: the delete goes over the
revision `vault.del` hydrated to, not the attempt's `ante`. Another device hears the tombstone, and its Vault goes the same way. A rebirth is a new
Vault.

The vaultDB owns the cascade: removing a vault tombstones its box rows by scope and `vault_tok`, so no
client walks them. The `vault_tok` keeps a late or repeated cascade off a rebirth's boxes, which share the
scope and not the token. The tombstone and the cascade share a transaction in every adapter we implement. A repeat:

```text
vaultDB.delVault(tombstone, { prior })
stored is live, this vault_tok, at prior         the tombstone written, revision_tok and revision_seq moved; cascade; 'deleted'
stored is live, this vault_tok, revision moved   'stale_write'; no cascade
stored is the tombstone of this vault_tok        nothing written, whatever the revision; cascade; 'gone', `val` the old tombstone
stored is another vault_tok, or nothing          nothing written, whatever the revision; cascade; 'void', a sentinel tombstone
```

Repeated deletes do not advance the revision. Whoever repeats it may not have the current token, having lost the first
answer. Moving it would wake every device's watch for nothing, and could refuse a rebirth with that
tombstone as its `prior`. This is no retry by the package: a repeat is the host calling the verb again,
which its Vault can until the tombstone arrives. After that `vault.delVaultPrompt()` refuses, as the vault is not
present; `vault.del()` still repeats it, over the tombstone's revision, and the vaultDB answers `gone` and cascades.

A Box operation naming a stale or missing vault_tok will fail `vault_mismatch` (or `vault_empty` or `vault_gone`). The damaged_row field will contain a generated tombstone if one is found with that scope *and vault_tok*, null otherwise. In both cases the value is forensic: do not instantiate, do not delivere. (Discovering a row is exceptionally unlikely as they were to have been transactionally removed with the vault deletion. `bank.doctor()` will establish comfort if needed)

## Required of the parts not yet drawn

* Storage's conditional put is atomic on `revision_tok`.
* The deviceDB's calls land in the order they were made (*The lease*).
* `lock()` removes the cached lease even on a vault already reporting locked.
* The deviceDB has `cache`, `peek` and `vacate`, by scope and `vault_tok`: `vacate` and `del_vault` both need a removal.
* Every put validates `prior.revision_tok` and `prior.revision_seq` against the row, and that the record's `revision_seq`
  is `prior.revision_seq` plus one. A birth over no row sends `VS.NeverStored`, a known `revision_tok` and a `revision_seq` of -1: a
  value and not a null as its sentinel, so the invariant stays true for it too.
* The deviceDB also has `leasesProvedBefore(cutoff)`, an index range scan over its cached leases, for `bank.autolock`.
* `adopt` ignores a record older by `revision_seq`.
* `Promptly`, a constant: the timeliness an attempt asks of `ensureTimely`. `maxMillis: 0` is the customer's to ask, as an
  override from the inside is one the customer cannot.
* `ifPresent` is customer-facing, and `putVault` and `putBox` take it alike in `PutOpts`, with `ifAbsent` ('add' or
  'fail'). Only `repl` saves, and only within the live row's own life: at its revision under another `vault_tok` or
  `box_tok` it refuses `camped`. `fail` refuses `camped` with the corpse (`dbhas`, the request), not as a `stale_write`;
  `get` answers the live row in place of the request, `declined`. `isVaultPutAllowed(ante, record, opts)` and
  `isBoxPutAllowed(ante, record, opts)` decide inside each adapter's transaction.
* Every box query names scope and `vault_tok`, and a box row under another `vault_tok` is no row. Only a
  fetch of a vault record has a reason to go by scope alone.

## To fix

* **`identity_revoked`** vacates: any call into the VaultDB answered with it runs `bank.vacate`, then passes it up. Built.
  `notes/security.md` says the old code locked there, and has to agree.

## Areas of Concern

Eyebrow raisers from the Coach's replies in the sprint's Closer Look (`whiteboard/20261103-unrace/unrace-closerlook.md`).

* **The gating family:** `ProveForGatingkind`, its kind-keyed type maps and the casts they force, and `#concluded`, `#outcome` and their flags. "same family of design smells around gating". See `whiteboard/20261102-newdesign/unrace-gating-prompt.md`.
* **The cache and the forget on one control path:** `lease.tryCache()` before the align, the forget before the first await. "that sounds dangerous".
* **Clears:** `spendClears` and `checkedClears` reach into the host's objects, and who owns a passkey answer's PRF bytes is open. "I assumed that the buffer exhaustion was best practice".
