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
   │       none held                                 → build, held
   │       older than the one held                   → it loses
   │       new vault_tok, or alive over a tombstone  → build, held; old_vault.vacate, unlist
   │       same life                                 → vault.receive(record)
   │       a tombstone of its own vault_tok          → the vault stays in its slot and takes it in (locked, row erased, boxes vacated)
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

Every proving instance holds a strong key from birth, and only the statics below hear a clear. Key
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
├─ the gate holds a passkey wayin            else 'absent_wayin'
├─ credential_id and prf_salt_b64 match      else 'wrong_passkey', the answer left unspent
├─ deriveWrappingKey(prfBytes, ctx)
└─ the wrap opens                            else 'wrong_passkey'

proving.buildWayin(NOVEL | sourceProving)    a Wayin; the vaultKey made or unwrapped, wrapped, dropped
proving.buildLease(friend, gate_epoch?)      a Lease on friend's vault, under the epoch it proved or the one passed
```

A proving never holds the Vault. `vault.#leaseFriend()` is all a `Proving` or a `Lease` hears of one: the
stamp, `leaseMillis`, the clock, the logger, `lock`, `#attachLease`, and the deviceDB's lease verbs bound to its scope. All of
that is fixed for the vault's life, so `gate_epoch`, which moves, is passed where it is wanted. It holds no key, and
reaches neither the record nor the boxes. `buildLease` refuses a friend whose stamp is not the proving's.

A proving of the current gate is always wanted, not only its yes or no: it is the only thing that
can unwrap the vaultKey, for the next wayin and for the next lease. So there is no `demandMatch`.

`gating.checkStrength`, for the live check as the user types, calls the same `checkStrength`.

"May re-enter" below means a correctable refusal: the host hears it, and the gating stays open, so it
can shake its dialog and let the user enter again. Nothing retries.

## `send`

```text
box.send(patch)
├─ await ensureReadyToSend(timely)                   hydrates; locked → refused
├─ ante   = box.central, the record held
├─ record = await #edit(patch, ante)                 laid over ante, returned, held nowhere
├─ demandReadyToSend
└─ listing.put(record, ante, { ifPresent })          over ante's revision, not whatever is held by then
   ├─ tryPutRow(record, { prior, ifPresent })
   │    moved → 'stale_write': the stored record delivered, then thrown
   └─ deliver → receive → adopt, settle              send resolves at the end of receive
```

With nothing kept between `#edit` and the put, `#staged`, `#memoizedNextRevision` and `reconcileStaged`
have no job: a record laid over a revision that has since moved is
refused by storage. So a `send` refused leaves nothing behind, as a birth's put does, and a snapshot
shows a change only once it has landed.

`send` is the box's alone. A vault has no `send`, as nothing about its record changes but its gate, which has its own verbs
(*Changing the gate*). `VaultPatch` goes with it, and the patch hooks move down from `Storable` to `Box`.


## Notable Changes (that may be inconsistent)

* DeviceDB.cache/peek/vacate: directly hold/retrieve record by scope + vault_tok
* Unlist: remove from the listing's list
* A listing memoizes its children in a Map, and `deliver` has an instance in its slot before it yields, so
  overlapping answers land on one instance. Subscriptions are not counted on: a fetch answer builds where none, as a
  notice does
* The Bank is durable: `bank.sweep` sweeps its listing and children, and the next hello builds fresh ones (ruled: a swept bank is done, a host makes a new Bank; not built yet)
* A Vault instance is replaced only when vacated, swept, or created from gone or void. `vaultListing.ensureVault` is the
  separate entrypoint because it replaces the object; only a deleted vault stays in its slot, tombstoned, so a late
  fetch answer loses to it; its box listing and boxes are deleted
* No timers on a Storable or a lease: a JS timer on a page that may be suspended at any moment says nothing. Refresh
  timers belong to the listing or the bank. Autolock is a best-effort reminder, not a guarantee: `bank.autolock`, called by a host as it likes, after hello and on its own timer, and `Lease.peek` declining to load a row past it at the door, leaving it
* A lease records `proved_at` and the kind of proving. `bank.autolock` finds cached leases through a deviceDB index range
  scan, so a fresh page needs no instance, and locks each listed vault of the row's own `vault_tok`, which erases the row.
  It shouts: a refused scan is bad news, and a lock whose erase is refused panics
* The device caches only leases and the device record, not vault or box records, and no refresh timer runs
* The goal: when lock is called, nothing crosses it. We get there with simple code that can be analyzed in context, so a
  crossing is raised in one sentence (`whiteboard/20261102-newdesign/reference-timings.md`), not fine-tuned
* A box birth: `vault.putBox` with no box listed makes the record over the sentinel prior, seals it, puts (`born` or
  `reborn`), and the answer is delivered. A sidecar-only `send` unseals and reseals, as the box stamp binds the sidecar
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
an unlock    lease = await proved.buildLease(friend);            await lease.attach()
a birth      lease = await proving.buildLease(friend);           await lease.attach()
the cache    lease = await Lease.tryPeek(friend, gate_epoch);    await lease.attach()    refused → bad news; null → ask

friend is vault.#leaseFriend(): offers the deviceDB's lease verbs, vault.#attachLease, vault.lock

vault.#attachLease(lease)                            private: called by lease.attach as friend.attachLease(this)
├─ lease.isForgotten                                 → refused
├─ demandReadyToAttach                               swept, vacated or deleted → refused: the lease vacated, no put
├─ caching     = lease.tryCache()
├─ displaced   = this.#lease
├─ this.#lease = lease                               displaced.evict(), where another
├─ settle                                            reads unlocked; listeners run; snapshot re-made
├─ boxListing.settleThings
└─ await caching                                     refused → bad news; the lease is still held

vault.#vacateLease(onRefused = #panic)               private: called by lock and vacate, and by adopt of a tombstone
├─ #dropLease                                        lease.evict(); this.#lease = null
├─ vacating = friend.tryUncacheLease()               always, held or not: a vault reading locked still erases
├─ settle                                            reads locked; listeners run; snapshot re-made
└─ await vacating                                    refused → panic; from adopt, bad news
```

**A `lock()` before the attach, on an unlock or a birth,** loses by the enter-key rule. It leaves a vault
unlocked with its lease cached: a normal state, on show, that the next `lock()` ends. The vault was
locked already, so that `lock()` changed no state.

**A `lock()` after the attach** is an ordinary lock of an unlocked vault: it vacates the lease, which removes
it from the cache. This requires of the new deviceDB that calls land in the order they were made, so
that the vacate lands after the put. The put is called before `settle`, because a listener may call
`lock()`. So `await caching` needs no compare, and no second vacate.

**A `lock()` crossing a gate change** does not hold, as at an unlock: the proof says this user may have
the vault unlocked. The three gate changes end in one private `#landGate`, which leases the vault for a
full term under the epoch that landed.

**`sweep`, `vacate` and `delete`** leave a one-way state: every `demandReadyToX` refuses from then on, so
anything worth guarding stops working. A swept or vacated thing is also unlisted, a deleted vault stays, tombstoned, while its box listing and boxes go, and the refusals are for whoever
still holds a reference. `#attachLease` demands it too. It is the last step, so refusing there leaves only a
lease to vacate. That vacate can erase a row a sweep left, which costs a passphrase next session, a normal state.

**The cache:** a `lock()` during `Lease.peek`'s read loses too: the vault reads unlocked, the lock's
vacate stands, and the next session asks. A row for `notes/wontfix.md`.

Another tab's `lock()` is not syndicated.

## The discards

```text
lock     vacate the lease; lock children; settle
sweep    drop the lease private property, leaving the cached; disable watches; disable all calls; sweep children; unlist children
vacate   disable; vacate the lease and forget its cache; vacate children (disables, unlists them); settle its gating
delete   lock; vaultDB.del(vault; the store cascades its boxes, transactionally); forget cached lease; box listing vacates (boxes disable, unlist); only the vault stays, tombstoned
autolock bank: deviceDB.leasesProvedBefore(cutoff), an index range scan; lock each listed vault of the row, which erases it
```

**A `lock()` whose vacate is refused panics**: it is not bad news. The call
itself stays synchronous and does not throw, as the refusal comes later, from the deviceDB. A panic calls the
host's async `onPanic` with the refusal, and no secret material; a rejection of it is reported and goes no
further. With no `onPanic`, the refusal is reported by `reportToPlatform`, and the Vault is vacated as the refusal
arrives, with no timer. Disabled calls stop the reopening in this tab, even if the deviceDB still refuses. A
second refusal panics again and finds the vacate done, a no-op, so this needs no counter; a vacate marks itself
done before its erase.

**A `lock()` and the dialog.** A lock leaves an open gating open: it says the vault is locked, and
the dialog is still the user's to answer. An unlock it was asking for still unlocks, and a change of
the gate lands and unlocks. A valid request goes through if it was authorized at the
start of its critical section.

**A `dismiss()` and the dialog.** The package cannot close a host's dialog, so a gating says when to:
`gating.whenSettled`, a promise a dialog closes on. A Cancel, a sweep or a vacate dismisses:

```text
no attempt under way    settles it 'dismissed': the verb refuses, the dialog closes; a later attempt refuses 'gating_landed'
an attempt under way    the attempt runs through and its outcome settles the gating, so a wrong passphrase
                        crossed by a dismiss answers 'wrong_passphrase'; a re-entry refuses
```

## End-of-method invariants

Each method states what holds when it ends, whatever crossed it.

At all times, a lease held and reading unlocked are the same fact: `isLocked` is `#lease === null`, not a
second field.

| Method           | When it returns                                                                                                                                                                           | When it throws                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `lock`           | vacate the lease; lock children; settle
| `sweep`          | drop the lease private property, leaving the cached; disable watches; disable all calls; sweep children; unlist children
| `vacate`         | disable; vacate the lease and forget its cache; vacate children (disables, unlists them); settle its gating
| `del`            | lock; vaultDB.del(vault; the store cascades its boxes, transactionally); forget cached lease; box listing vacates (boxes disable, unlist); only the vault stays, tombstoned
| `send`           | The record held is what it put, or newer; snapshot and cache settled                                                                                                                      | Nothing stored; on `stale_write`, the stored record taken in                                         |
| `attachLease`    | Held and in force; its put called; settled                                                                                                                                                 | Past sweep: the lease vacated, no put                                                                |
| `ensureVault`    | A Vault held, the only one of its scope. Landed: unlocked, or locked by a `lock()` after the attach. Another won: locked                                                                  | Nothing stored; held only what the answer delivered                                                  |
| `ensureUnlocked` | Unlocked, a lease in force at its attach                                                                                                                                                  | `dismissed`: no lease held, none cached by this call                                       |
| A gate change    | The record holds the next gate, its epoch one up. Unlocked under that epoch, a fresh lease of full term, whatever lock came before or crossed                                                 | Nothing stored, unless the answer was lost; the lease as it was                                      |
| `delVault`       | A tombstone stored and its box rows tombstoned; nothing of it on this device; the Vault tombstoned in its slot                                                                           | Nothing stored, unless the answer was lost; the Vault locked, and otherwise as it was                |
| `gating.attempt` | At most one under way; its gate read once; no clear held                                                                                                                                  | The same; correctable: the gating still open; any other: settled                                     |

## `build_vault`

```text
bank.ensureVault(bag)
├─ bank.#demandReady                                 hello's own error, where it failed; 'bad_option' before any hello
├─ vaultListing.at(scope)                            what hello loaded: a present vault → answer it, nobody asked
└─ vaultListing.buildVault(scope) → Vault.launchBirth(listing, scope)
   ├─ prior = listing.demandBirthSlot(scope) ?? VS.NeverStored     the slot's tombstone, else the sentinel
   └─ Gating.launch('build_vault', { listing, scope, vault: null, run })
      ├─ no requestCleartext                         → 'bad_option', nobody asked
      ├─ listing.holdGating                          one open on this bank → 'already_asking'
      ├─ void #askHost → requestCleartext(gating)    ← host opens the dialog
      └─ await #settled
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear? })           a second while one runs: attempt_in_flight
│                                                    passkeyClear spent after, unless correctable (G2)
│                                                    no lock check: a lock does nothing to a birth
├─ stamp = MSX.vaultStamp.parse({ ...scope, vault_tok, registered_at: now })     pojo; one clock reading for the attempt
├─ PassphraseProving.buildNovel(stamp, passphraseClear, world)      weak → may re-enter
├─ PasskeyProving.buildNovel(stamp, passkeyClear, world)            where a passkeyClear is handed
└─ run({ passphraseProving, passkeyProving | null })   ── no clear goes past here ──
   Vault.#runBirth(listing, provings, prior)
   ├─ passphraseProving.buildWayin(NOVEL)            makeVaultKey; wrap; vaultKey dropped
   ├─ passkeyProving?.buildWayin(passphraseProving)  unwrap from the source; wrap; dropped
   ├─ gate = Gate.make(stamp, passphraseWayin, passkeyWayin | null)
   ├─ record = recordOfBirth(gate, prior, now)       sync pojo; its gate is gate.pickle()
   ├─ vault = vaultListing.ensureVault(record, prior)
   │    ├─ tryPutVault(record, { prior, ifPresent: 'get' })    ← the commit
   │    │    a live row → 'declined', the stored record its answer: another won
   │    │    a newer tombstone → 'stale_write', delivered, then thrown
   │    └─ deliver → new Vault(what is stored), held  locked
   ├─ vault's vault_tok is not the record's → another won: locked, still a success
   └─ vault.#unlockByProof(passphraseProving)
      ├─ lease = passphraseProving.buildLease(vault.#leaseFriend())    refused → the vault stays stored and held, locked
      └─ lease.attach()                              cached after it

run returns → gating settles ok → bank.ensureVault resolves    provings dropped with their keys
host closes dialog → requestCleartext resolves → settle is a no-op
```

`prior` is what crosses the dialog: it decides whether to ask, and the put needs it. It is always a value:
the tombstone's revision, or `VS.NeverStored` (*Required of the parts not yet drawn*).
Its staleness is safe: over a live row the put declines, and that answer is the "another won"
line above; over a newer tombstone it refuses 'stale_write'. A refused put holds only what its answer delivered, nothing on the device. `BirthLockSeq`,
`[UnlockAtBirth]` and `#closeSeqs` have no job. `run` tells a birth from another's by comparing the
record it sent with the one it got, before attaching a lease. The new Vault reads locked between the
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
   └─ await #settled
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

run returns → gating settles ok → ensureUnlocked resolves
```

## Changing the gate

A gate is the one thing about a vault record that changes, so a change has a vaultDB verb of its own, named for what
it does: `replacePassphrase`, `addPasskey` or `revokePasskey`. No client-side next gate exists: a `Gate` is a read-only
view of a record's gate, and adopt makes a new one from each record. Each verb lets the
vaultDB check more (`notes/design-vaultdb.md`, VG1 to VG3). Each change ends the same way, and needs nothing the vault
does not already carry:

```text
vault.#landGate(proved, commit)
├─ stored = await commit(): vaultListing.<gate verb>(params)    ← the commit; params spread from ante, the record the attempt read, its gate holding the wayin
│  ├─ ante's revision is the prior; moved → 'stale_write', nothing stored
│  ├─ the store refuses what its row rules out, such as an addPasskey over a passkey held
│  ├─ the vaultDB lays the wayin on the row, moves gate_epoch and the revision up, and leaves the rest as stored
│  └─ no lock: adopt never locks on a move
└─ vault.#unlockByProof(proved, stored.gate.gate_epoch)    a fresh lease of full term; a lock() crossing the change does not hold
```

* **The lease comes after the put**, so its `gate_epoch` is the one that landed, and a refused put
  has nothing to clean up. The old lease stays in force for the moments between, so the vault does
  not read locked. That is safe, as the vaultKey did not change. A crash between them leaves a cached
  lease under the old epoch, which `Lease.peek` forgets: a passphrase next session, a normal state.
* **One record through the attempt.** The attempt reads `ante`, the vault's record, after its timeliness request, and
  proves against `ante`'s gate. The params spread `ante`, not the live vault, so its revision is the prior. Whatever the
  watch delivers during the attempt therefore refuses the put: a passkey revoked elsewhere is not brought back, and a
  passphrase replaced elsewhere is not overwritten.
* **A write landing after the timeliness request.** The put refuses 'stale_write'. The gating settles with
  that refusal, and the vault has by then taken in the stored record. Nothing retries; a host may call
  the verb again.
* **No device locks on it.** Another device's session keeps its lease to its lock or next `bank.autolock`; its cached
  lease, of the older `gate_epoch`, is forgotten at its next session (Decided).
* **The vaultDB checks what it can see, and no more.** It refuses a verb that would touch the other wayin, and an
  `addPasskey` over a passkey held. It cannot tell whether a wrap opens, so a bad `vault_key_wayin_wrapped` still lands.

### `replace_passphrase`

```text
vault.replacePassphrase()
├─ await ensureTimely()
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
   └─ vault.#landGate(anteProving, commit)
      commit: vaultListing.replacePassphrase({ ...ante, gate: { passphrase_wayin: nextWayin } })    ← the commit
```

The current passphrase is proved before the next is judged, so the `strengthChecker` hears a next
passphrase only from someone who proved the current one.

### `add_passkey`

```text
vault.addPasskey()
├─ await ensureTimely(Promptly)                      the gate in hand is refreshed first
├─ gate.demandPasskeyAddable                         one held already → refused, nobody asked
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
   └─ vault.#landGate(proved, commit)
      commit: vaultListing.addPasskey({ ...ante, gate: { passkey_wayin: passkeyWayin } })           ← the commit
           one added before the enter key → refused; after it → 'stale_write'
```

### `revoke_passkey`

```text
vault.revokePasskey()
├─ await ensureTimely(Promptly)                      the gate in hand is refreshed first
├─ the gate holds no passkey                         answers the vault, nobody asked
└─ Gating.launch('revoke_passkey', { listing, scope, vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run({ ante, proved })                             ── no clear goes past here ──
   └─ vault.#landGate(proved, commit)
      commit: vaultListing.revokePasskey({ ...ante, gate: { passkey_wayin: null } })                ← the commit
           revoked before the enter key → 'revoked', nothing moved; after it → 'stale_write'
```

### `del_vault`

```text
vault.delVault()
├─ await ensureTimely()
└─ Gating.launch('del_vault', { listing, scope, vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })                  no lock check: a lock does not stop a delete
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = vault.fullRecord, gate = vault.gate        this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run({ ante, proved })                             ── no clear goes past here ──
   vault.#runDelVault(ante)
   ├─ vault.lock()                                   sync, no throw: the lease vacated, the children locked
   └─ vaultListing.del(ante), over ante's revision
      ├─ vaultDB: a tombstone, its boxes cascading   ← the commit
      │    moved → 'stale_write', nothing stored
      └─ deliver → receive → adopt(tombstone)
         ├─ vault.#vacateLease(bad news)             deviceDB refused → bad news; the tombstone stands
         └─ boxListing.vacate()                      boxes disabled and unlisted, nothing deleted; the vault stays in its slot, tombstoned
```

The lock comes first because it is synchronous and safe: from there no box opens under a lease while
the tombstone goes out. It is also a normal state, so a delete refused leaves a Vault reading locked and
nothing half done, and the cost is one passphrase, as the lock's vacate forgets the cached lease. The box listing's vacate
comes last, as it cannot be walked back. The proof is drawn to match the gate changes; it opens nothing here, as no
lease follows. Another device hears the tombstone, and its Vault goes the same way. A rebirth is a new
Vault.

The vaultDB owns the cascade: removing a vault tombstones its box rows by scope and `vault_tok`, so no
client walks them. The `vault_tok` keeps a late or repeated cascade off a rebirth's boxes, which share the
scope and not the token. The tombstone and the cascade share a transaction in every store we implement. A repeat:

```text
the vaultDB's del(scope, vault_tok, revision)
stored is live, this vault_tok, this revision    a tombstone, revision_tok and revision_seq moved; cascade
stored is live, this vault_tok, revision moved   'stale_write'; no cascade
stored is the tombstone of this vault_tok        nothing written, whatever the revision; cascade; `val` holds the old tombstone
stored is another vault_tok, or nothing          nothing written, whatever the revision; cascade; answers `void`, a sentinel tombstone
```

Repeated deletes do not advance the revision. Whoever repeats it may not hold the current token, having lost the first
answer. Moving it would wake every device's watch for nothing, and could refuse a rebirth holding that
tombstone as its `prior`. This is no retry by the package: a repeat is the host calling the verb again,
which its Vault can until the tombstone arrives. After that the front door cannot repeat it, as a
tombstone holds no gate; a direct call to the vaultDB still cascades.

A Box operation naming a stale or missing vault_tok will fail `vault_mismatch` (or `vault_empty` or `vault_gone`). The damaged_row field will contain a generated tombstone if one is found with that scope *and vault_tok*, null otherwise. In both cases the value is forensic: do not instantiate, do not delivere. (Discovering a row is exceptionally unlikely as they were to have been transactionally removed with the vault deletion. `bank.doctor()` will establish comfort if needed)

## Required of the parts not yet drawn

* A store's conditional put is atomic on `revision_tok`.
* The deviceDB's calls land in the order they were made (*The lease*).
* `lock()` removes the cached lease even on a vault already reading locked.
* The deviceDB has `cache`, `peek` and `vacate`, by scope and `vault_tok`: `vacate` and `del_vault` both need a removal.
* Every put validates `prior.revision_tok` and `prior.revision_seq` against the row, and that the record's `revision_seq`
  is `prior.revision_seq` plus one. A birth over no row sends `VS.NeverStored`, a known `revision_tok` and a `revision_seq` of -1: a
  value and not a null as its sentinel, so the invariant holds for it too.
* The deviceDB also has `leasesProvedBefore(cutoff)`, an index range scan over its cached leases, for `bank.autolock`.
* `adopt` ignores a record older by `revision_seq`.
* `Promptly`, a constant: the timeliness an attempt asks of `ensureTimely`. `maxMillis: 0` is the customer's to ask, as an
  override from the inside is one the customer cannot.
* `ifPresent` is customer-facing. Expect both `Storable` and the store to have a part in deciding it, as the implementer
  finds (the Coach, 2026-11-03). Only `repl` saves. `fail` refuses `camped` with the corpse (`dbhas`, the request), not as a `stale_write`; `get` answers the live
  row in place of the request, `declined`.
* Every box query names scope and `vault_tok`, and a box row under another `vault_tok` is no row. Only a
  fetch of a vault record has a reason to go by scope alone.

## To fix

* **`identity_revoked`** vacates: any call into the VaultDB answered with it runs `bank.vacate`, then passes it up. Built.
  `notes/security.md` says the old code locked there, and has to agree.

## Areas of Concern

Eyebrow raisers from the Coach's replies in the sprint's Closer Look (`whiteboard/20261103-unrace/unrace-closerlook.md`).

* **The gating family:** `ProveForGatingkind`, its kind-keyed type maps and the casts they force, and `#settled`, `#outcome` and their flags. "same family of design smells around gating". See `whiteboard/20261102-newdesign/unrace-gating-prompt.md`.
* **The cache and the erase on one control path:** `lease.tryCache()` before the settle, the erase before the first await. "that sounds dangerous".
* **Clears:** `spendClears` and `checkedClears` reach into the host's objects, and who owns a passkey answer's PRF bytes is open. "I assumed that the buffer exhaustion was best practice".
