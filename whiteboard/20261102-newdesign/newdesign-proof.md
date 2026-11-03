# Unrace: a new vault

Design for vault birth and the other gatings in the models, built from the bottom up. Nothing here
is built. Read against `origin/main` (`bac1d45b`) and PR #442's tip (`48b16571`). The Coach,
2026-11-02: the v6bank PRs (#426 to #442) "are likely to be thrown out or at best scavenged", so
their shapes are not settled.

## `bank.hello`

```text
bank.hello()                                         a forced reset; a host may call it again, on its own timer
├─ keyDeriver.load, strengthChecker.load
├─ bank.getBank()                                    vaultDB.getBank: full vaults, no boxes, gone_vault tombstones (does not fetch or sync with DeviceDB)
  │    refused → hello refuses, and the bank is not ready
  ├─ listing: each vault by scope
  │    same life      → vault.receive(record)
  │    new vault_tok  → old_vault.vacate, unlist; add build(vault)
  ├─ listing: each gone_vault by scope
  │    a tombstone    → a vault listed of its vault_tok stays in its slot and takes it in (locked, row erased, boxes vacated); of another, it replaces that vault; else add build(tombstone)
  ├─ bank.#keepDeviceRecord
  └─ subscribe to VaultDB                              no autolock here: the host calls bank.autolock() after hello, and on its own timer

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

A proving never holds the Vault. `vault.leaseFriend()` is all a `Proving` or a `Lease` hears of one: the
stamp, `leaseMillis`, the clock, the logger, and the deviceDB's lease verbs bound to its scope. All of
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
├─ ante   = the record held
├─ record = #edit(patch)                             laid over ante, returned, held nowhere
├─ listing.put(record, ante)                         over ante's revision, not whatever is held by then
│    moved → 'stale_write': the stored record delivered, then thrown
└─ the answer → receive → adopt, settle              send resolves at the end of receive
```

With nothing kept between `#edit` and the put, `#staged`, `#memoizedNextRevision`, `reconcileStaged`
and the PR tip's `movedUnderEdit` have no job: a record laid over a revision that has since moved is
refused by storage. So a `send` refused leaves nothing behind, as a birth's put does, and a snapshot
shows a change only once it has landed.

`send` is the box's alone. A vault has no `send`, as nothing about its record changes but its gate, which has its own verbs
(*Changing the gate*). `VaultPatch` goes with it, and the patch hooks move down from `Storable` to `Box`.


## Notable Changes (that may be inconsistent)

* DeviceDB.cache/peek/vacate: directly hold/retrieve record by scope + vault_tok
* Unlist: remove from the listing's list
* A listing memoizes its children in a Map, and `#deliver` has an instance in its slot before it yields, so
  overlapping answers land on one instance. Subscriptions are not counted on: a fetch answer builds where none, as a
  notice does
* The Bank is durable: `bank.sweep` sweeps its listing and children, and the next hello builds fresh ones
* A Vault instance is replaced only when vacated, swept, or created from gone or void. `vaultListing.ensureVault` is the
  separate entrypoint because it replaces the object; only a deleted vault stays in its slot, tombstoned, so a late
  fetch answer loses to it; its box listing and boxes are deleted
* No timers on a Storable or a lease: a JS timer on a page that may be suspended at any moment says nothing. Refresh
  timers belong to the listing or the bank. Autolock is a best-effort reminder, not a guarantee: `bank.autolock`, called by a host as it likes, after hello and on its own timer, and `lease.peek` uncaching a row past it at the door
* A lease records `proved_at` and the kind of proving. `bank.autolock` finds cached leases through a deviceDB index range
  scan, so a fresh page needs no instance, and locks each listed vault of the row's own `vault_tok`, which erases the row.
  It shouts: a refused scan is bad news, and a lock whose erase is refused panics
* For this sprint the device caches only leases and the device record, not vault or box records, and no refresh timer runs
* The goal: when lock is called, nothing crosses it. We get there with simple code that can be analyzed in context, so a
  crossing is raised in one sentence (`reference-timings.md`), not fine-tuned
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
an unlock    lease = await proved.buildLease(friend);  await lease.attach()
a birth      lease = await proving.buildLease(friend); await lease.attach()
the cache    lease = await lease.peek(leaseFriend);    await lease.attach()

friend is vault.leaseFriend(): offers the deviceDB's lease verbs, vault.#attachLease

vault.#attachLease(lease)                            private: called by lease.attach as friend.attachLease(this)
├─ demandReadyToAttach                               swept, vacated or deleted → refused: the lease vacated, no put
├─ tasks       = [lease.cache()]
├─ this.#lease = lease
├─ settle                                            reads unlocked; listeners run; snapshot re-made
└─ await tasks                                       refused → bad news; the lease is still held

vault.#vacateLease()                                 private: called by lock
├─ tasks       = [lease.vacate()]                    with no lease held, vault.#vacateCachedLease(): a vault reading locked still erases
├─ this.#lease = null
├─ settle                                            reads locked; listeners run; snapshot re-made
└─ await tasks                                       refused → panic
```

**A `lock()` before the attach, on an unlock or a birth,** loses by the enter-key rule. It leaves a vault
unlocked with its lease cached: a normal state, on show, that the next `lock()` ends. The vault was
locked already, so that `lock()` changed no state.

**A `lock()` after the attach** is an ordinary lock of an unlocked vault: it vacates the lease, which removes
it from the cache. This requires of the new deviceDB that calls land in the order they were made, so
that the vacate lands after the put. The put is called before `settle`, because a listener may call
`lock()`. So `await cached` needs no compare, and no second vacate.

**A `lock()` crossing a gate change** does change state, as the vault was unlocked, so it wins. A local
shows it: `heldLease`'s forgotten flag, read after `buildLease` so that it covers the put and the
crypto. By then the change has landed, so skipping the attach leaves nothing half done. The three gate
changes share these lines as one private `#renewLease(proved, gate_epoch, heldLease)`.

**`sweep`, `vacate` and `delete`** leave a one-way state: every `demandReadyToX` refuses from then on, so
anything worth guarding stops working. A swept or vacated thing is also unlisted, a deleted vault stays, tombstoned, while its box listing and boxes go, and the refusals are for whoever
still holds a reference. `#attachLease` demands it too. It is the last step, so refusing there leaves only a
lease to vacate. That vacate can erase a row a sweep left, which costs a passphrase next session, a normal state.

**The cache:** a `lock()` during `lease.peek`'s read loses too: the vault reads unlocked, the lock's
vacate stands, and the next session asks. A row for `notes/wontfix.md`.

Another tab's `lock()` is not syndicated.

## The discards

```text
lock     vacate the lease; lock children; settle
sweep    drop the lease private property, leaving the cached; disable watches; disable all calls; sweep children; unlist children
vacate   lock; vacate children (disables, unlists them); vacate cached lease; disable
delete   lock; vaultDB.del(vault; the store cascades its boxes, transactionally); vacate cached lease; box listing vacates (boxes disable, unlist); only the vault stays, tombstoned
autolock bank: deviceDB.leasesProvedBefore(cutoff), an index range scan; lock each listed vault of the row, which erases it
```

**A `lock()` whose vacate is refused panics**: it is not bad news. The call
itself stays synchronous and does not throw, as the refusal comes later, from the deviceDB. A panic calls the
host's async `onPanic` with the refusal, and no secret material; a rejection of it is reported and goes no
further. With no `onPanic`, the refusal is reported by `reportToPlatform`, and the Vault is vacated as the refusal
arrives, with no timer. Disabled calls stop the reopening in this tab, even if the deviceDB still refuses. A
second refusal panics again and finds the vacate done, a no-op, so this needs no counter; a vacate marks itself
done before it calls `lock()`.

**A `lock()` and the dialog.** The package cannot close a host's dialog, so a gating says when to:
`gating.whenSettled`, a promise a dialog closes on. On lock, a gating:

```text
no attempt under way    settles it 'locked_while_asking'. On attempt, the verb refuses, the dialog closes
an attempt under way    sets the variable: the attempt runs through and its outcome settles the gating, so a wrong
                        passphrase crossed by a lock answers 'wrong_passphrase'; a re-entry refuses
a birth vault gating    nothing
a del_vault gating      nothing
```

## End-of-method invariants

Each method states what holds when it ends, whatever crossed it, and checks it: a private check at the
method's end, throwing as any data-integrity failure does and naming no secret, with a test for each
row. A check that cannot be written marks an invariant that is not one.

At all times, a lease held and reading unlocked are the same fact: `isLocked` is `#lease === null`, not a
second field.

| Method           | When it returns                                                                                                                                                                           | When it throws                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `lock`           | vacate the lease; lock children; settle
| `sweep`          | drop the lease private property, leaving the cached; disable watches; disable all calls; sweep children; unlist children
| `vacate`         | lock; vacate children (disables, unlists them); vacate cached lease; disable
| `del`            | lock; vaultDB.del(vault; the store cascades its boxes, transactionally); vacate cached lease; box listing vacates (boxes disable, unlist); only the vault stays, tombstoned
| `send`           | The record held is what it put, or newer; snapshot and cache settled                                                                                                                      | Nothing stored; on `stale_write`, the stored record taken in                                         |
| `attachLease`    | Held and in force; its put called; settled                                                                                                                                                 | Past sweep: the lease vacated, no put                                                                |
| `ensureVault`    | A Vault held, the only one of its scope. Landed: unlocked, or locked by a `lock()` after the attach. Another won: locked                                                                  | Nothing stored, nothing held                                                                         |
| `ensureUnlocked` | Unlocked, a lease in force at its attach                                                                                                                                                  | `locked_while_asking`: no lease held, none cached by this call                                       |
| A gate change    | The record holds the next gate, its epoch one up. Unlocked under that epoch if it was unlocked and no lock crossed; else locked, no lease                                                 | Nothing stored, unless the answer was lost; the lease as it was                                      |
| `delVault`       | A tombstone stored and its box rows gone from the vaultDB; nothing of it on this device; the Vault vacated                                                                                | Nothing stored, unless the answer was lost; the Vault locked, and otherwise as it was                |
| `gating.attempt` | At most one under way; its gate read once; no clear held                                                                                                                                  | The same; correctable: the gating still open; any other: settled                                     |

## `build_vault`

```text
bank.ensureVault(bag)
├─ bank.ready, or refused                            hello's own error, where it failed
├─ vaultListing.at(scope)                            what hello loaded: a vault → answer it, nobody asked; else → prior
└─ Gating.launch('build_vault', { scope, run })
   ├─ void #askHost → requestCleartext(gating)       ← host opens the dialog
   └─ await #settled
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear? })           a second while one runs: attempt_in_flight
│                                                    passkeyClear spent after, unless correctable (G2)
│                                                    no lock check: a lock does nothing to a birth
├─ stamp = makeVaultStamp(scope, now)                pojo; one clock reading for the attempt
├─ PassphraseProving.buildNovel(stamp, passphraseClear, world)      weak → may re-enter
├─ PasskeyProving.buildNovel(stamp, passkeyClear, world)            where a passkeyClear is handed
└─ run({ passphraseProving, passkeyProving | null })   ── no clear goes past here ──
   ├─ passphraseProving.buildWayin(NOVEL)            makeVaultKey; wrap; vaultKey dropped
   ├─ passkeyProving?.buildWayin(passphraseProving)  unwrap from the source; wrap; dropped
   ├─ gate = Gate.make(stamp, passphraseWayin, passkeyWayin | null)
   ├─ makeVaultRecord(stamp, gate, prior, now)       sync pojo; its gate is gate.pickle()
   ├─ vault = vaultListing.ensureVault(vaultRecord, prior)
   │    ├─ store.put(vaultRecord, prior)             ← the commit
   │    └─ new Vault(what is stored), held           locked
   ├─ vault's vault_tok is not the record's → another won: locked, still a success
   ├─ lease = passphraseProving.buildLease(vault.leaseFriend())    refused → the vault stays stored and held, locked
   └─ lease.attach()                                 cached after it

run returns → gating settles ok → bank.ensureVault resolves    provings dropped with their keys
host closes dialog → requestCleartext resolves → settle is a no-op
```

`prior` is what crosses the dialog: it decides whether to ask, and the put needs it. It is always a value:
the tombstone's revision, or `birth_rev_tok` and -1 (*Required of the parts not yet drawn*).
Its staleness is safe, as the put refuses over anything newer, and that answer is the "another won"
line above. A refused put leaves nothing behind, in memory or on the device. `BirthLockSeq`,
`[UnlockAtBirth]` and `#closeSeqs` have no job. `run` tells a birth from another's by comparing the
record it sent with the one it got, before attaching a lease. The new Vault reads locked between the
put and the attach, with no listener yet to see it. A Bank's `lock` during the put or that await is past
the enter key, so the birth runs through, unlocked.

## `unlock_vault`

```text
vault.ensureUnlocked()
├─ await ensureTimely                                asked first: it makes the vault recent enough to know if it deserves a lease
├─ a lease in force → done
├─ lease.peek → lease.attach → done, where one is cached; of this vault_tok and gate_epoch, and not past autolock, which is uncached and reads as no row
├─ a gating open on this bank → refuses already_asking
└─ Gating.launch('unlock_vault', { vault, run })
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
   ├─ lease = proved.buildLease(vault.leaseFriend())   the proved gate's epoch, whatever arrived since
   └─ lease.attach()                                 cached after it

run returns → gating settles ok → ensureUnlocked resolves
```

## Changing the gate

A gate is the one thing about a vault record that changes, so a change has a vaultDB verb of its own, named for what
it does: `replacePassphrase`, `addPasskey` or `revokePasskey`. No client-side next gate exists: a `Gate` is a read-only
view of a record's gate, and adopt makes a new one from each record. Each verb lets the
vaultDB check more (`newdesign-vaultdb.md`, VG1 to VG3). Each change ends the same way, and needs nothing the vault
does not already carry:

```text
heldLease = the vault's lease, or null
stored = vaultListing.<gate verb>(params)            ← the commit; params spread from ante, the record the attempt read, its gate holding the wayin
├─ ante's revision is the prior; moved → 'stale_write', nothing stored
├─ the store refuses what its row rules out, such as an addPasskey over a passkey held
├─ the vaultDB lays the wayin on the row, moves gate_epoch and the revision up, and leaves the rest as stored
└─ no lock: adopt never locks on a move
vault.#renewLease(proved, stored.gate.gate_epoch, heldLease)    a lock() crossing the change wins: no new lease
```

* **The lease comes after the put**, so its `gate_epoch` is the one that landed, and a refused put
  has nothing to clean up. The old lease stays in force for the moments between, so the vault does
  not read locked. That is safe, as the vaultKey did not change. A crash between them leaves a cached
  lease under the old epoch, which `lease.peek` forgets: a passphrase next session, a normal state.
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
└─ Gating.launch('replace_passphrase', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ antePassphraseClear, nextPassphraseClear })
├─ the two clears equal → 'same_passphrase', may re-enter
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = the vault's record, gate = vault.gate       this attempt's, from here on
├─ anteProving = PassphraseProving.buildStored(gate, antePassphraseClear, world)
│    wrong → may re-enter
├─ nextProving = PassphraseProving.buildNovel(gate.stamp, nextPassphraseClear, world)
│    weak → may re-enter
└─ run({ ante, anteProving, nextProving })           ── no clear goes past here ──
   ├─ nextWayin = nextProving.buildWayin(anteProving)    unwrap the vaultKey; wrap; dropped
   ├─ heldLease = the vault's lease, or null
   ├─ stored = vaultListing.replacePassphrase({ ...ante, gate: { passphrase_wayin: nextWayin } })    ← the commit
   └─ vault.#renewLease(anteProving, stored.gate.gate_epoch, heldLease)
```

The current passphrase is proved before the next is judged, so the `strengthChecker` hears a next
passphrase only from someone who proved the current one. The PR tip checks strength first.

### `add_passkey`

```text
vault.addPasskey()
├─ await ensureTimely(Promptly)                      the gate in hand is refreshed first
├─ gate.demandPasskeyAddable                         one held already → refused, nobody asked
└─ Gating.launch('add_passkey', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear })
│                                                    passkeyClear spent after, unless correctable (G2)
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = the vault's record, gate = vault.gate       this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter, passkeyClear unspent
├─ passkeyProving = PasskeyProving.buildNovel(gate.stamp, passkeyClear, world)
└─ run({ ante, proved, passkeyProving })             ── no clear goes past here ──
   ├─ passkeyWayin = passkeyProving.buildWayin(proved)   unwrap the vaultKey; wrap; dropped
   ├─ heldLease = the vault's lease, or null
   ├─ stored = vaultListing.addPasskey({ ...ante, gate: { passkey_wayin: passkeyWayin } })           ← the commit
   │    one added before the enter key → refused; after it → 'stale_write'
   └─ vault.#renewLease(proved, stored.gate.gate_epoch, heldLease)
```

### `revoke_passkey`

```text
vault.revokePasskey()
├─ await ensureTimely(Promptly)                      the gate in hand is refreshed first
├─ the gate holds no passkey                         answers 'revoked', nobody asked
└─ Gating.launch('revoke_passkey', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ ante = the vault's record, gate = vault.gate       this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run({ ante, proved })                             ── no clear goes past here ──
   ├─ heldLease = the vault's lease, or null
   ├─ stored = vaultListing.revokePasskey({ ...ante, gate: { passkey_wayin: null } })                ← the commit
   │    revoked before the enter key → 'revoked', idempotent; after it → 'stale_write'
   └─ vault.#renewLease(proved, stored.gate.gate_epoch, heldLease)
```

### `del_vault`

```text
vault.delVault()
└─ Gating.launch('del_vault', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })                  no lock check: a lock does not stop a delete
├─ await vault.ensureTimely(Promptly)                at most one fetch; a vault found gone refuses here
├─ gate = vault.gate                                 this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run({ gate, proved })                             ── no clear goes past here ──
   ├─ vault.lock()                                   sync, no throw: the lease vacated, the children locked
   ├─ vaultListing.del(ante), over the revision gate was read at
   │  ├─ vaultDB: a tombstone, its boxes cascading   ← the commit
   │  │    moved → 'stale_write', nothing stored
   │  └─ deviceDB.vacate(scope, vault_tok)           refused → bad news; the tombstone stands
   └─ boxListing.vacate()                            boxes disabled and unlisted, nothing deleted; the vault stays in its slot, tombstoned
```

The lock comes first because it is synchronous and safe: from there no box opens under a lease while
the tombstone goes out. It is also a normal state, so a delete refused leaves a Vault reading locked and
nothing half done, and the cost is one passphrase, as the lock's vacate removed the cached lease. The box listing's vacate
comes last, as it cannot be walked back. The proof is drawn to match the gate changes; it opens nothing here, as no
lease follows. Another device hears the tombstone, and its Vault goes the same way. A rebirth is a new
Vault.

The vaultDB owns the cascade: removing a vault removes its box rows by scope and `vault_tok`, so no
client walks them. The `vault_tok` keeps a late or repeated cascade off a rebirth's boxes, which share the
scope and not the token. The tombstone and the cascade share a transaction in every store we implement. A repeat:

```text
the vaultDB's del(scope, vault_tok, revision)
stored is live, this vault_tok, this revision    a tombstone, revision_tok and revision_seq moved; cascade
stored is live, this vault_tok, revision moved   'stale_write'; no cascade
stored is the tombstone of this vault_tok        nothing written, whatever the revision; cascade; answers the tombstone
stored is another vault_tok, or nothing          nothing written, whatever the revision; cascade; answers `void`, a sentinel tombstone
```

A repeat moves no revision. Whoever repeats it may not hold the current token, having lost the first
answer. Moving it would wake every device's watch for nothing, and could refuse a rebirth holding that
tombstone as its `prior`. This is no retry by the package: a repeat is the host calling the verb again,
which its Vault can until the tombstone arrives. After that the front door cannot repeat it, as a
tombstone holds no gate; a direct call to the vaultDB still cascades.

The vaultDB refuses a `putBox` under a `vault_tok` that is not the live vault's, a tombstone's among
them, as `vault_mismatch`; every VaultDB already does (`newdesign-vaultdb.md`, V4).

## Guarantees to amend when this is built

`notes/guarantees.md` describes the code as it stands, so these land with the code, not before.
Read so far: G1 to G4 and G9. Read the whole of *The guarantees* before changing `proving.ts`,
`lease.ts` or `gating.ts`.

* **G4:** a held lease is no longer dropped at a time: it runs to its lock or the next `bank.autolock`.
* **G1:** the chain is the gating's `attempt` and the provings' statics, as function arguments and
  locals. No gate, vault or `run` hears a passphrase.
* **Passkey on a new passphrase:** VOCABULARY.md's *passphrase* and the core README's change-passphrase
  passages say a new passphrase removes the passkey. They change with the code.
* **`passkeyClear`** in VOCABULARY.md, for today's `PasskeyAnswer`, with the code.
* **`notes/security.md`:** the enter-key rule, and the passkey retained, are decisions a reviewer should see.
* **G9:** **Only `Gating`, `Proving` and `Lease` hold or use a key or its cleartext pre-image.** A
  passkey's PRF bytes count as a pre-image. A `Lease` is held closed by the Vault, which holds no
  lease record.

## Rows for `notes/wontfix.md` when this is built

Those drawn above: a gate change leaving another device's session lease to run (*Decided*), and a
`lock()` during `lease.peek`'s read (*The lease*). Besides those:

* A failed delete still locks the vault on this device, as `del_vault` locks first. So it logs the user
  out here, and they log back in to try again. That is unpleasant, and could leave them thinking the vault
  is gone from their other devices. The verb does refuse, so a host can say so. Already in `notes/wontfix.md`.
* A `lock()` whose vacate is refused panics, and the cached lease survives. The next `ensureUnlocked`
  gets it from `lease.peek` and attaches it, asking nothing, so a vault the user locked reopens with no
  passphrase. A panic's vacate stops that in the tab that locked, but the row can survive for other tabs and
  later sessions. The Coach, 2026-11-02: won't fix, but "one I worry about".
* A damaged row stays until the customer names it for deletion. It still counts toward `maxBoxes`.
* Cross-tab complications, all of them: tab A's `lock()` or vacate leaves tab B unlocked, and nothing tells it.
* A put can land though its answer is lost.

## Required of the parts not yet drawn

* A store's conditional put is atomic on `revision_tok`.
* The deviceDB's calls land in the order they were made (*The lease*).
* `lock()` removes the cached lease even on a vault already reading locked.
* The deviceDB gains `cache`, `peek` and `vacate`, by scope and `vault_tok`: on main `Cache` has only `load` and `save`,
  and `vacate` and `del_vault` both need a removal.
* Every put validates `prior_rev_tok` and `prior_rev_seq` against the row, and that the record's `revision_seq`
  is `prior_rev_seq` plus one. A birth over no row sends a known `birth_rev_tok` and a `prior_rev_seq` of -1: a
  value and not a null as its sentinel, so the invariant holds for it too.
* The deviceDB also gains `leasesProvedBefore(cutoff)`, an index range scan over its cached leases, for `bank.autolock`.
* `adopt` ignores a record older by `revision_seq`.
* `Promptly`, a constant: the timeliness an attempt asks of `ensureTimely`. `maxMillis: 0` is the customer's to ask, as an
  override from the inside is one the customer cannot.
* `ifPresent` is customer-facing. Expect both `Storable` and the store to have a part in deciding it, as the implementer
  finds (the Coach, 2026-11-03). Only `repl` saves. `fail` refuses `camped` with the corpse (`dbhas`, the request), not as a `stale_write`; `get` answers the live
  row in place of the request, `declined`.
* Every box query names scope and `vault_tok`, and a box row under another `vault_tok` is no row. Only a
  fetch of a vault record has a reason to go by scope alone. No VaultDB fully does
  this today (`newdesign-vaultdb.md`), and `models/listing.ts:238` throws on such a row.

## To fix

* **`identity_revoked`** vacates: any call into the VaultDB answered with it runs `bank.vacate`, then passes it up.
  `notes/security.md` says the old code locked there, and has to agree.
