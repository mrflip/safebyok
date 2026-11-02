# Unrace: a new vault

Design for vault birth and the other gatings in the models, built from the bottom up. Nothing here
is built. Read against `origin/main` (`bac1d45b`) and PR #442's tip (`48b16571`). The Coach,
2026-11-02: the v6bank PRs (#426 to #442) "are likely to be thrown out or at best scavenged", so
their shapes are not settled.

## Decided

* Storable loses the staged draft: you just run `send()`, drawn below. `edit` folds into it as
  `#edit`, whose only caller it is.
* Nothing is committed until `vaultListing.ensureVault`, or a gate change's put.
* `ensureVault` means "create this or return what's there, considering either a success". Another
  device winning the put is not a failure, and the race is exceptionally unlikely.
* `bank.ensureVault` requires `bank.ready`, so `device_id` and the key deriver are settled before
  anyone is asked. A failed `hello` rethrows its own error, with no refusal of our own over it.
* A vault held is always full and holds its gate; the listing's query answers full records, so no
  sparse vault exists. A vault is born locked.
* No gated verb fetches at its start. An attempt proves against the gate in hand, and a gate change's
  put refuses over a moved revision: that is the freshness check. The Trigger keeps the held copy
  timely in the background, within `vaultRefreshMinutes` (5 by default); we force no narrower
  window, as a customer could not then widen it.
* A gate change locks no session anywhere: the vaultKey never changes. The device that made it
  re-takes its lease after the put. Another device's session lease runs to its lock or expiry, at
  most `leaseMillis`; its cached lease is of the older `gate_epoch`, which `Lease.get` forgets next
  session. That forgetting is `gate_epoch`'s one job, so nothing tells a vault's own gate change from
  another device's, and `adopt` never locks on a move. A row for `notes/wontfix.md`, with the bound.
* One gating open per bank. A second launch while one is open refuses `already_asking`: no unlock
  join, no ensuring map, no asking mutex. The host owns the one dialog, and dedupes. More can come if
  people complain; offering a little of it would own us.
* One attempt at a time on a gating. A second `attempt` while one runs refuses `attempt_in_flight`,
  nothing queued; the dialog disables its button meanwhile. The PR tip's in-turn queue goes.
* A cached lease is taken up in `ensureUnlocked` alone, where it answers without asking. `hello` and
  `fetch` take up nothing.
* The deviceDB writes of a verb are awaited inside its `run`: the lease's `tryPutLease`, the cache
  save. One refused is bad news, the lease is still held, and the verb still succeeds. Nothing runs
  after the outcome.
* Every lease goes the same way: make it, attach it, cache it. A proving makes one from its proof, and
  the vault fetches one from the cache; `vault.attachLease(lease)` is the only way a vault comes to hold
  one. No lease is made before a put.
* A proving knows the `gate_epoch` of the gate it proved, and `buildLease` uses that, so a proof of an
  old gate cannot earn a lease that `Lease.get` accepts next session. A gate change alone passes one,
  the next gate's.
* A Vault instance is replaced only when it is deleted, so one exists per scope for its whole life. A
  record the watch delivers ahead of a put's answer goes to that same instance.
* Lock wins, and the enter key is the line. A `lock()` before the enter key settles the open gating
  `locked_while_asking`, and the host closes its dialog on `gating.whenSettled`, drawn under the
  discards. A `lock()` crossing an attempt does not change that attempt's course: it runs through. It
  sets a private variable of the gating, which an attempt checks once, at its start, and never again,
  so a re-entry after that attempt's correctable refusal refuses `locked_while_asking`. A `del_vault`
  gating ignores a `lock()`, as a lock does not stop a delete. An unlock or a birth crossed by a lock
  ends unlocked, as we hold proof that this user intends and is permitted to have the vault unlocked,
  and the next `lock()` ends that session. A gate change still lands, and takes no new lease, as its
  proof asked for a change and not for a session.
* No lock counter. A local serves in a gate change, `heldLease`. The window is very small, so the effect
  on a user's experience can be discounted, not that the case does not matter; and one rule stated
  plainly costs less to explain and reason through than cases. Past the enter key, nothing turns back
  midway and leaves a half-done run.
* `replace_passphrase` keeps the passkey (the Coach, 2026-11-02). Dropping it is less of a hard rule
  than it seemed: Apple asks for the passphrase on the next login after a change, but also has recovery
  mechanisms, which we do not, and a user would find it annoying. A vault must always have a passphrase;
  the passkey is optional.
* Nothing retries. A refusal goes to the host. A correctable one leaves the gating open, so the host can
  shake its dialog and the user can enter again; any other settles the gating, 'stale_write' among them.
* `bank.hello` called twice just runs twice: no join, as it is idempotent.
* Methods keep their `ensureReadyToX` and `demandReadyToX` pair where most do, and some of those can
  be no-ops.
* Every method states and checks its end-of-method invariants, drawn below.
* `send` does not hydrate. From the enter key on, an attempt works from one gate: it reads it once,
  and proves, makes the next gate and puts against that one, whatever the watch delivers meanwhile.
  The next attempt reads again.
* The discards cascade, each larger one calling the smaller, drawn below: `lock`, `goodbye`, `vacate`,
  `delete`. Each exists on each thing down the chain, Bank to Box, and calls its children's; one with
  nothing to do is a no-op, and answers the question before it is asked.
* An attempt proves against the gate in hand. So a wayin revoked on another device can unlock a
  session here until this vault hears of it, seconds with a working watch and at worst the window;
  that session then runs to its lock or expiry, as above. This is a row for `notes/wontfix.md`, and
  the PR tip's test pinning a fetch in each attempt goes. Revoking is a refusal by honest code: the vaultKey does not change.
* Before the dialog goes only what decides whether to ask. After the enter key goes everything that
  ends up in the record: the stamp, the gate, the clock, the lease held. Minutes or more can pass
  between the two.
* A check the attempt could outlive runs twice: before launch, so nobody is asked for nothing, and
  again immediately before the `send`, against the attempt's gate. Neither fetches.
* The provings own the strength check and the deriver.
* The gating holds the clears: it calls the provings' statics, then hands `run` the provings. `run`
  is written in the Vault or the Bank, and never hears a clear.
* The clear passphrase never goes through a Gate. A gate is made from wayins.
* Names follow STYLE.md's `make` and `build`.
* An attempt lampshades what it carries: `gating.attempt({ passphraseClear, passkeyClear? })`.
* A cleartext has one door. `ensureVault(bag, cleartexts)`, `ensureUnlocked(cleartexts)` and the gate
  verbs' cleartext parameters go. VOCABULARY.md's *cleartext* already says "Only a gating's attempt
  takes it: no vault call does." A host's own form answers through `requestCleartext`, and a test
  through a stub of it.
* Rebirth over a tombstone is written correctly, not left as a refusal.

## Instances, and the one record

Only the `Vault` instance has to be absent at birth, because no vault exists until its put lands.
Nothing keeps a `Wayin` or a `Gate` from existing, and each already knows what the record form makes
a caller pass along:

| In hand  | Knows                                    | So the call needs no                       |
|----------|------------------------------------------|--------------------------------------------|
| `Gate`   | its `stamp`, its wayins                  | `stamp` or stored wayin at `buildStored`   |
| `Gate`   | the wayin a change leaves as it was      | `makeGateRecord(next, gate.passkey_wayin)` |
| `Vault`  | stamp, `gate_epoch`, clock, `leaseMillis`, its lease's database | any of them at a lease's grant |
| `Vault`  | the gate it holds                        | `ante`                                     |

The one record is the vault record, built by `makeVaultRecord` at birth and laid by `send` after, as
what storage holds. A gate becomes its part of that record by `gate.pickle()`.

`Gate`'s verbs, scavenged from the PR tip without their clears:

```text
Gate.make(stamp, passphraseWayin, passkeyWayin | null)   sync; a new gate
gate.withPassphraseWayin(wayin)                          sync; the next gate, its epoch one up, knowing the revision this one was read at
gate.withPasskeyWayin(wayin)                             sync; one held already → refused (the second check)
gate.withPasskeyRevoked()                                sync; none held → refused (the second check)
gate.demandPasskeyAddable(), gate.demandPasskeyRevocable()   before asking the user
gate.pickle()                                            the record's `gate`
```

## What a vault record needs

No `Vault`, listing, storage or lease.

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

A proving never holds the Vault. `vault.vaultFriend()` is all a `Proving` or a `Lease` hears of one: the
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
storable.send(patch)
├─ ante = the record held; for a gate patch, the revision its gate came from
├─ record = #edit(patch)                             laid over ante, returned, held nowhere
├─ listing.put(record, ante)                         over ante's revision, not whatever is held by then
│    moved → 'stale_write': the stored record delivered, then thrown
└─ the answer → receive → adopt, settle              send resolves at the end of receive
```

With nothing kept between `#edit` and the put, `#staged`, `#memoizedNextRevision`, `reconcileStaged`
and the PR tip's `movedUnderEdit` have no job: a record laid over a revision that has since moved is
refused by storage. So a `send` refused leaves nothing behind, as a birth's put does, and a snapshot
shows a change only once it has landed.

## The lease: make, attach, cache

Each way to unlocked makes a lease its own way, then attaches it the same way. No counter and no compare.

```text
an unlock    lease = await proved.buildLease(friend);  await vault.attachLease(lease)
a birth      lease = await proving.buildLease(friend); await vault.attachLease(lease)
the cache    lease = await vault.#fetchLease();        await vault.attachLease(lease), where there is one
a gate change, the only one that can skip:
             heldLease is null                         nothing: it was locked before the change
             lease = await proved.buildLease(friend, nextGate.gate_epoch)
             heldLease forgotten                       lease.evict(): a lock crossed the change
             await vault.attachLease(lease)

friend is vault.vaultFriend()

vault.#fetchLease()                                  Lease.get(friend, this.gate_epoch); only ensureUnlocked calls it

vault.attachLease(lease)                             not private: only a proving or the cache makes a Lease
├─ past goodbye → lease.evict(), refused             no put made; the evict disarms its autolock
│                                                    ── nothing awaited from here to the put's call ──
├─ hold lease; the lease displaced is evicted        its autolock would lock at its old autolock_at
├─ cached = lease.tryCache()                         tryPutLease called, not yet awaited; one from the cache has nothing to do
├─ settle                                            reads unlocked; listeners run
└─ await cached                                      refused → bad news; the lease is still held
```

**A `lock()` before the attach, on an unlock or a birth,** loses by the enter-key rule. It leaves a vault
unlocked with its lease cached: a normal state, on show, that the next `lock()` ends. The vault was
locked already, so that `lock()` changed no state.

**A `lock()` after the attach** is an ordinary lock of an unlocked vault: it evicts the lease and calls
`tryDelLease`. This requires of the new deviceDB that calls land in the order they were made, so
that erase lands after the put. The put is called before `settle`, because a listener may call
`lock()`. So `await cached` needs no compare, and no second erase.

**A `lock()` crossing a gate change** does change state, as the vault was unlocked, so it wins. A local
shows it: `heldLease`'s forgotten flag, read after `buildLease` so that it covers the put and the
crypto. By then the change has landed, so skipping the attach leaves nothing half done. The three gate
changes share these lines as one private `#renewLease(proved, gate_epoch, heldLease)`.

**`goodbye`, `vacate` and `delete`** leave a one-way state, which `attachLease` checks. It is the last
step, so refusing there leaves only a lease to evict.

**The cache:** a `lock()` during `#fetchLease`'s read loses too: the vault reads unlocked, the lock's erase
stands, and the next session asks. A row for `notes/wontfix.md`.

Another tab's `lock()` is not syndicated.

## The discards

```text
lock     drop the lease, and erase the one cached; lock its children; the open gating, below
goodbye  drop the lease from memory, leaving the one cached; disable timers and watches; goodbye its children;
         settle the open gating of any kind, once any attempt has run
vacate   lock; goodbye; disable all calls; vacate its children; remove its children
delete   the del_vault gating: lock; remove it from the vaultDB, its boxes cascading, and the deviceDB; vacate
```

A `vacate` already done is a no-op, as a delete's own tombstone can come back through the watch while
its `run` is still going.

**A `lock()` and the dialog.** The package cannot close a host's dialog, so a gating says when to:
`gating.whenSettled`, a promise a dialog closes on. Every lock of a vault goes through `vault.lock()`: a
host's, the lease's autolock, and each one `bank.lock` calls. It does one of three things to the gating
open on that vault:

```text
no attempt under way    settles it 'locked_while_asking': the verb refuses, the dialog closes
an attempt under way    sets the variable: the attempt runs through, and a re-entry refuses
a del_vault gating      nothing
```

A host that does not listen leaves its dialog up, and the next enter key refuses 'gating_landed', so the
lock wins either way. The one gating with no `vault.lock()` to reach it is a birth's, as no Vault exists
yet, so `bank.lock` does the same to that one itself.

## End-of-method invariants

Each method states what holds when it ends, whatever crossed it, and checks it: a private check at the
method's end, throwing as any data-integrity failure does and naming no secret, with a test for each
row. A check that cannot be written marks an invariant that is not one.

At all times, a lease held and reading unlocked are the same fact: `isLocked` is `#lease === null`, not a
second field.

| Method | When it returns | When it throws |
|--------|-----------------|----------------|
| `lock` | Reads locked; no lease held; the erase called after every put called; its children locked; its open gating settled, or its variable set under an attempt, unless it is a `del_vault` | Never: a refused erase is bad news, and a listener's throw goes to the platform |
| `goodbye` | Reads locked; no lease held, the cached one left; no timer armed, no watch open; its children gone by; none can be attached after; its open gating settled once any attempt has run | Never |
| `vacate` | As `goodbye`; every call refused; its children vacated and removed; nothing of it on this device; the vaultDB untouched | Its local objects still disabled |
| `send` | The record held is what it put, or newer; snapshot and cache settled | Nothing stored; on `stale_write`, the stored record taken in |
| `attachLease` | Held and in force; the displaced lease evicted; its put called; settled | Past goodbye: the lease evicted, no put |
| `ensureVault` | A Vault held, the only one of its scope. Landed: unlocked, or locked by a `lock()` after the attach. Another won: locked | Nothing stored, nothing held |
| `ensureUnlocked` | A lease answered, in force at its attach | `locked_while_asking`: no lease held, none cached by this call |
| A gate change | The record holds the next gate, its epoch one up. Unlocked under that epoch if it was unlocked and no lock crossed; else locked, no lease | Nothing stored, unless the answer was lost; the lease as it was |
| `del_vault` | A tombstone stored and its box rows gone from the vaultDB; nothing of it on this device; the Vault vacated | Nothing stored, unless the answer was lost; the Vault locked, and otherwise as it was |
| `gating.attempt` | At most one under way; its gate read once; no clear held | The same; correctable: the gating still open; any other: settled |

## `build_vault`

```text
bank.ensureVault(bag)
├─ bank.ready, or refused                            hello's own error, where it failed
├─ vaultListing.fetch(scope, { ifAbsent: 'nil' })    a vault → answer it, nobody asked; else → prior
└─ Gating.launch('build_vault', { scope, run })
   ├─ void #askHost → requestCleartext(gating)       ← host opens the dialog
   └─ await #settled
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear? })           a second while one runs: attempt_in_flight
│                                                    passkeyClear spent after, unless correctable (G2)
├─ a lock since launch → 'locked_while_asking'        checked here once, never again
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
   ├─ lease = passphraseProving.buildLease(vault.vaultFriend())
   └─ vault.attachLease(lease)                       cached after it

run returns → gating settles ok → bank.ensureVault resolves    provings dropped with their keys
host closes dialog → requestCleartext resolves → settle is a no-op
```

`prior` is the one read that crosses the dialog: it decides whether to ask, and the put needs it.
Its staleness is safe, as the put refuses over anything newer, and that answer is the "another won"
line above. A refused put leaves nothing behind, in memory or on the device. `BirthLockSeq`,
`[UnlockAtBirth]` and `#closeSeqs` have no job. `run` tells a birth from another's by comparing the
record it sent with the one it got, before attaching a lease. The new Vault reads locked between the
put and the attach, with no listener yet to see it. A Bank's `lock` during the put or that await is past
the enter key, so the birth runs through, unlocked.

## `unlock_vault`

```text
vault.ensureUnlocked()
├─ a lease in force → answer it
├─ #fetchLease → vault.attachLease → answer it, where one is cached; of this vault_tok and gate_epoch
├─ a gating open on this bank → refuses already_asking
└─ Gating.launch('unlock_vault', { vault, run })
   ├─ void #askHost → requestCleartext(gating)
   └─ await #settled
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear }) or attempt({ passkeyClear })
├─ a lock since launch → 'locked_while_asking'        checked here once, never again
├─ gate = vault.gate                                 this attempt's, from here on
├─ PassphraseProving.buildStored(gate, passphraseClear, world)
│    or PasskeyProving.buildStored(gate, passkeyClear)
│    wrong → may re-enter
└─ run({ proved })                                   ── no clear goes past here ──
   ├─ lease = proved.buildLease(vault.vaultFriend())   the proved gate's epoch, whatever arrived since
   └─ vault.attachLease(lease)                       cached after it

run returns → gating settles ok → ensureUnlocked answers the lease
```

## Changing the gate

A gate is part of the vault record, so changing one is a `send` like any other, with a next gate as
its patch. Each change ends the same way, and needs nothing the vault does not already carry:

```text
heldLease = the vault's lease, or null
nextGate = gate.withThing(...)                       gate is the one the attempt read
├─ the second check: withThing refuses
vault.send({ gate: nextGate })                       ← the commit
├─ laid over the record: nextGate's gate_epoch, nextGate.pickle()
├─ put over the revision that gate was read at; moved → 'stale_write', nothing stored
└─ no lock: adopt never locks on a move
vault.#renewLease(proved, nextGate.gate_epoch, heldLease)    a lock() crossing the change wins: no new lease
```

* **The lease comes after the put**, so its `gate_epoch` is the one that landed, and a refused put
  has nothing to clean up. The old lease stays in force for the moments between, so the vault does
  not read locked. That is safe, as the vaultKey did not change. A crash between them leaves a cached
  lease under the old epoch, which `Lease.get` forgets: a passphrase next session, a normal state.
* **One gate through the attempt, and no `ante` argument.** The attempt proves against the gate it
  read at the enter key, makes the next from that same gate, and the put goes over the revision it was
  read at. The next gate knows that revision, so no caller passes it. Whatever the watch delivers
  during the attempt therefore refuses the put: a passkey revoked elsewhere is not brought back, and a
  passphrase replaced elsewhere is not overwritten.
* **A stale gate at the enter key.** With no working watch, an attempt proves against an old gate, and
  the put refuses 'stale_write'. The gating settles with that refusal, and the vault has by then taken
  in the stored record. Nothing retries; a host may call the verb again.
* **No device locks on it.** Another device's session keeps its lease to lock or expiry; its cached
  lease, of the older `gate_epoch`, is forgotten at its next session (Decided).
* **`{ gate }` is a plain patch**, where the PR tip's unexported `GateStaging` kept hosts out. The
  checker takes only a `Gate` instance. A host could still call
  `vault.send({ gate: vault.gate.withPasskeyRevoked() })` and skip the passphrase. That is a refusal
  by honest code: a host holds its store adapter, and can write what it likes there anyway.

### `replace_passphrase`

```text
vault.replacePassphrase()
└─ Gating.launch('replace_passphrase', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ antePassphraseClear, nextPassphraseClear })
├─ a lock since launch → 'locked_while_asking'        checked here once, never again
├─ the two clears equal → 'same_passphrase', may re-enter
├─ gate = vault.gate                                 this attempt's, from here on
├─ anteProving = PassphraseProving.buildStored(gate, antePassphraseClear, world)
│    wrong → may re-enter
├─ nextProving = PassphraseProving.buildNovel(gate.stamp, nextPassphraseClear, world)
│    weak → may re-enter
└─ run({ gate, anteProving, nextProving })           ── no clear goes past here ──
   ├─ nextWayin = nextProving.buildWayin(anteProving)    unwrap the vaultKey; wrap; dropped
   ├─ heldLease = the vault's lease, or null
   ├─ nextGate = gate.withPassphraseWayin(nextWayin)
   ├─ vault.send({ gate: nextGate })                 ← the commit
   └─ vault.#renewLease(anteProving, nextGate.gate_epoch, heldLease)
```

The current passphrase is proved before the next is judged, so the `strengthChecker` hears a next
passphrase only from someone who proved the current one. The PR tip checks strength first.

### `add_passkey`

```text
vault.addPasskey()
├─ gate.demandPasskeyAddable                         one held already → refused, nobody asked
└─ Gating.launch('add_passkey', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear })
│                                                    passkeyClear spent after, unless correctable (G2)
├─ a lock since launch → 'locked_while_asking'        checked here once, never again
├─ gate = vault.gate                                 this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter, passkeyClear unspent
├─ passkeyProving = PasskeyProving.buildNovel(gate.stamp, passkeyClear, world)
└─ run({ gate, proved, passkeyProving })             ── no clear goes past here ──
   ├─ passkeyWayin = passkeyProving.buildWayin(proved)   unwrap the vaultKey; wrap; dropped
   ├─ heldLease = the vault's lease, or null
   ├─ nextGate = gate.withPasskeyWayin(passkeyWayin)
   ├─ vault.send({ gate: nextGate })                 ← the commit
   │    one added before the enter key → refused; after it → 'stale_write'
   └─ vault.#renewLease(proved, nextGate.gate_epoch, heldLease)
```

### `revoke_passkey`

```text
vault.revokePasskey()
├─ gate.demandPasskeyRevocable                       none held → refused, nobody asked
└─ Gating.launch('revoke_passkey', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })
├─ a lock since launch → 'locked_while_asking'        checked here once, never again
├─ gate = vault.gate                                 this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run({ gate, proved })                             ── no clear goes past here ──
   ├─ heldLease = the vault's lease, or null
   ├─ nextGate = gate.withPasskeyRevoked()
   ├─ vault.send({ gate: nextGate })                 ← the commit
   │    revoked before the enter key → refused; after it → 'stale_write'
   └─ vault.#renewLease(proved, nextGate.gate_epoch, heldLease)
```

### `del_vault`

```text
vault.delVault()
└─ Gating.launch('del_vault', { vault, run })
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })                  no lock check: a lock does not stop a delete
├─ gate = vault.gate                                 this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, world)
│    wrong → may re-enter
└─ run({ gate, proved })                             ── no clear goes past here ──
   ├─ vault.lock()                                   sync, no throw: the lease dropped, its erase called, the children locked
   ├─ vaultListing.del(scope, vault_tok), over the revision gate was read at
   │  ├─ vaultDB: a tombstone, its boxes cascading   ← the commit
   │  │    moved → 'stale_write', nothing stored
   │  └─ deviceDB: what is cached of it, removed     refused → bad news; the tombstone stands
   └─ vault.vacate()                                 goodbye; calls disabled; the children removed
```

The lock comes first because it is synchronous and safe: from there no box opens under a lease while
the tombstone goes out. It is also a normal state, so a delete refused leaves a Vault reading locked and
nothing half done, and the cost is one passphrase, the cached lease being erased. The vacate comes last, as
it cannot be walked back. `vacate` also removes what is cached on the device, as a plain vacate has no
delete before it; after `vaultListing.del` that part finds nothing, as on any repeat. The proof is drawn to match the gate changes; it opens nothing here, as no
lease follows. Another device hears the tombstone, and its Vault goes the same way. A rebirth is a new
Vault.

The vaultDB owns the cascade: removing a vault removes its box rows by scope and `vault_tok`, so no
client walks them. The `vault_tok` keeps a late or repeated cascade off a rebirth's boxes, which share the
scope and not the token. The tombstone and the cascade share a transaction where the backend can, and
nothing depends on that, so a delete can land with its cascade unfinished. A second delete does the rest:

```text
the vaultDB's del(scope, vault_tok, revision)
stored is live, this vault_tok, this revision    a tombstone, revision_tok and revision_seq moved; cascade
stored is live, this vault_tok, revision moved   'stale_write'; no cascade
stored is the tombstone of this vault_tok        nothing written, whatever the revision; cascade; answers the tombstone
stored is another vault_tok, or nothing          'stale_write'; no cascade
```

A repeat moves no revision. Whoever repeats it may not hold the current token, having lost the first
answer. Moving it would wake every device's watch for nothing, and could refuse a rebirth holding that
tombstone as its `prior`. This is no retry by the package: a repeat is the host calling the verb again,
which its Vault can until the tombstone arrives. After that the front door cannot repeat it, as a
tombstone holds no gate; a direct call to the vaultDB still cascades.

The vaultDB refuses a `putBox` under a `vault_tok` that is not the live vault's, a tombstone's among
them, as `vault_gone`. Without a transaction, one crossing the tombstone can still land: a row of
ciphertext that nothing reads.

## Guarantees to amend when this is built

`notes/guarantees.md` describes the code as it stands, so these land with the code, not before.
Read so far: G1 to G4 and G9. Read the whole of *The guarantees* before changing `proving.ts`,
`lease.ts` or `gating.ts`.

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

Those drawn above: a gate change leaving another device's session lease to run (*Decided*), a wayin
revoked elsewhere still unlocking here until this vault hears of it (*Decided*), and a `lock()` during
`#fetchLease`'s read (*The lease*). Besides those:

* A failed delete still locks the vault on this device, as `del_vault` locks first. So it logs the user
  out here, and they log back in to try again. That is unpleasant, and could leave them thinking the vault
  is gone from their other devices. The verb does refuse, so a host can say so. Already in `notes/wontfix.md`.
* A vault too damaged to prove is deleted by hand, in the vaultDB's own tools (psql, say). The package
  offers no verb for it.
* Rows left by an unfinished cascade stay once the tombstone has arrived. The front door cannot repeat
  that delete, and a rebirth does not sweep them. They are ciphertext that nothing reads.
* A `putBox` crossing the tombstone, on a backend without a transaction, leaves the same kind of row.
* Tab A's `lock()` leaves tab B unlocked: it is not syndicated.
* "At worst the window" holds only while refreshes are working.
* A put can land though its answer is lost.

## Required of the parts not yet drawn

* A store's conditional put is atomic on `revision_tok`.
* The deviceDB's calls land in the order they were made (*The lease*).
* `lock()` erases a cached lease even on a vault already reading locked.
* `adopt` ignores a record older by `revision_seq`.
