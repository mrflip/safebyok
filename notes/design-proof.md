# Unrace: a new bank

The design for bank birth and the other gatings in the models, built from the bottom up. It is built
in `src/models/`, and reached through `Device` and `Bank`, which `src/index.ts` exports; the diagrams show
the code as it is now. A bank has one gate, `main`, one lease and one lock: its vaults and boxes are locked
when it is.

## `device.ensureBank`

```text
device.ensureBank()                                  the bank listed is returned; after a refusal, a host may call it again
├─ demandEnabled                                     a swept or vacated device refuses 'disabled'
└─ device.#bringUp()                                 refused → ensureBank refuses, and the device is not ready; 'helloed' announced either way
   ├─ deviceDB.ensureCachedDevice(scope)             the device row, made with a fresh device_tok where no sound one is stored
   ├─ demandEnabled                                  a sweep crossing it refuses here
   ├─ keyDeriver.load, strengthChecker.load
   ├─ the bank listed, if enabled, else device.#fetchBank()
   │  ├─ bankDB.tryEnsureBank({ op: 'ensure', ...scope, gates: ['main'] })
   │  │    the bank row, its main gate row, full vaults and their tombstones, no boxes (does not fetch or sync with the deviceDB)
   │  │    refused → 'identity_revoked': device.vacate; then thrown
   │  ├─ demandEnabled
   │  ├─ #bankListingInHand                           a bank listed but disabled is let go with its listing; a fresh listing makes the next
   │  ├─ no live bank → Bank.launchBirth(listing, answer.parent, askUser)    a build_bank gating (*build_bank*)
   │  └─ bankListing.deliverRecord(answer.parent) → the Bank; bank.vaultListing.deliverEnsured(answer)
   │     ├─ bank.receiveParent(answer.parent), gateListing.deliverRecord(main)
   │     └─ each vault or tombstone, by scope: vaultListing.deliverRecord(record)
   │          none listed                            → made, enlisted
   │          older than the one listed              → ignored
   │          a newer record, of either life         → the vault listed receives it; another vault_tok ends its old box listing
   │          a tombstone                            → the vault stays listed at its scope and adopts it; its old box listing ends
   └─ bank.vaultListing.hello()                      the bank's one BankDB watch, on the bank's scope
                                                     no autolock here: the host calls bank.autolock() after ensureBank, and on its own timer
```

## What a bank's birth needs

A bank's birth stores two rows together: the bank row, and its `main` gate row, which carries the wayins. Neither
has anything encrypted but the wayins' wraps. A vault is born later, by `bank.ensureVault`, and holds no key.

| Part                | Fields                          | Comes from                                           |
|---------------------|---------------------------------|------------------------------------------------------|
| Bank stamp          | `user_id`, `banklabel`          | Device                                               |
|                     | `bank_tok`                      | Random                                               |
|                     | `registered_at`                 | Clock                                                |
| Bank row            | `fmt`, `am: 'a'`                | Fixed                                                |
|                     | `revision_tok`, `written_at`    | Random, clock                                        |
|                     | `revision_seq`                  | 0, or the tombstone's plus one                       |
| Gate stamp          | `user_id`, `banklabel`          | Device                                               |
|                     | `gatelabel: 'main'`, `gate_tok` | Fixed, random                                        |
|                     | `registered_at`                 | The bank stamp's                                     |
| Gate row            | `fmt`, `am: 'a'`, `bank_tok`    | Fixed, the bank stamp's                              |
|                     | `revision_tok`, `revision_seq`, `written_at` | The revision after the void one          |
|                     | `auth`, `sigs`, `meta`          | Empty                                                |
| Passphrase wayin    | `wayinkind`, `wayinlabel`       | Fixed                                                |
|                     | `key_deriver_label`             | Key deriver                                          |
|                     | `salt_b64`                      | Random, of the deriver's `salt_size`                 |
|                     | `device_tok`, `registered_at`   | Device, clock                                        |
|                     | `bank_key_wayin_wrapped`        | New random bankKey, wrapped under the passphraseKey  |
| Passkey wayin (opt) | `credential_id`, `prf_salt_b64` | `passkeyClear`                                       |
|                     | `device_tok`, `registered_at`   | Device, clock                                        |
|                     | `bank_key_wayin_wrapped`        | Same bankKey, wrapped under the passkeyKey           |

The ordering rules:

1. The stamps (`listing.stampsOfBirth()`: the bank stamp and the gate stamp) come before any key: a wayin's ctx binds
   `[bankStamp, gateStamp]`, its purpose and its header, and a passkeyKey's HKDF `info` is that same ctx.
2. A header comes before its key: a passphraseKey is derived from the header's salt.
3. The passphrase wayin comes before the passkey wayin: it is where the bankKey comes from.

The lease is not an input. It is a second output of the same bankKey.

## The provings

Every proving instance has a strong key from the moment it is made, and only the static methods below
are given a cleartext. Key bytes stay inside `passphraseKeyOf`, which keeps the deriver's bytes in a local
variable and zeroes them. A stored wayin is read from the gate, which also supplies the bank stamp and the gate stamp.
A novel proving is given both stamps.

```text
PassphraseProving.buildNovel(bank, gate, passphraseClear, world)
├─ judgeStrength(passphraseClear, scope)     weak → 'weak_passphrase'
├─ mintPassphraseHeader                      key_deriver_label, salt_b64, device_tok, registered_at
└─ passphraseKeyOf(keyDeriver, cleartext, salt)  bytes zeroed; non-extractable #wayinKey

PasskeyProving.buildNovel(bank, gate, passkeyClear, world)
├─ mintPasskeyHeader                         credential_id, prf_salt_b64, device_tok, registered_at
└─ deriveWrappingKey(prfBytes, ctx)          non-extractable #wayinKey; ctx of the bank and gate stamps and the header

PassphraseProving.buildStored(gate, passphraseClear, world)
├─ key_deriver_label is the world's          else 'newer_format'
├─ passphraseKeyOf(keyDeriver, cleartext, stored salt)
└─ the wrap opens                            else 'wrong_passphrase'

PasskeyProving.buildStored(gate, passkeyClear)
├─ the gate has a passkey wayin              else 'absent_wayin'
├─ credential_id and prf_salt_b64 match      else 'wrong_passkey', the answer left unspent
├─ deriveWrappingKey(prfBytes, ctx)
└─ the wrap opens                            else 'wrong_passkey'

proving.buildWayin(NOVEL | sourceProving)    a Wayin; the bankKey made or unwrapped, wrapped, dropped
proving.buildLease(friend, gate)             a Lease on friend's bank, citing the gate revision passed
```

A proving never has the Bank. All that a `Proving` or a `Lease` gets of a bank is the bank's lease friend: the
bank stamp, `leaseMillis`, the logger, `lock`, `tellBadNews`, and the deviceDB's lease verbs bound to its scope and
`bank_tok`. All of that is fixed for the bank's life, so the gate revision, which changes, is passed in where it is needed:
`buildLease` cites the gate it is given (`gate_tok` and `gate_revision_tok`). The friend has no key, and gives access to
neither the record nor the vaults. `buildLease` refuses `unexpected_error` for a friend whose bank stamp, or a gate whose
gate stamp, is not the proving's.

A caller always needs the proving of the current gate itself, not only whether it succeeded: it is the only
thing that can unwrap the bankKey, for the next wayin and for the next lease. So there is no `demandMatch`.

`gating.judgeStrength`, for the live check as the user types, calls the same `judgeStrength`.

"May re-enter" below means a correctable refusal: the host receives the refusal, and the gating stays open,
so the host can shake its dialog and let the user try again. Nothing retries.

## `put`

```text
box.put(patch, opts)                                 vault.putBox comes here, through boxListing.puttable
└─ box.tryPut(patch, opts)
   ├─ await ensurePuttable(patch, timely)            hydrates, unless the box is sparse and patch carries whisper and sidecar
   ├─ given = demandPuttable(patch, { ifPresent })   the box itself: enabled, unlocked, whole only for a patch missing a half
   ├─ { record, expected } = await #editAndSeal(given)    laid over the current record, sealed, returned, kept nowhere
   ├─ demandPuttable(patch, { ifPresent })           again, past the seal: locked → refused
   └─ listing.tryPut(record, { expected, ifAbsent, ifPresent })    over the revision #editAndSeal read, not whatever the instance has by then
      ├─ doTryPut(record, { expected, ifAbsent, ifPresent })
      │    moved → 'stale_write'; a live row and ifPresent 'fail', or a live row of another box_tok at expected → 'camped':
      │    the stored record delivered, then thrown
      └─ deliverAnswer(answer, record) → receiveRecord → adopt, align      checked against what it sent; put resolves at the end of receive
```

Nothing is kept between `#editAndSeal` and the put: storage refuses a record built on a revision that has since
changed. So a refused put leaves nothing behind, like a refused birth's build, and a snapshot shows a change
only once it has been written. A sparse box given a patch with both halves needs no fetch, because the put's
revision check catches a stale record.

Only a box has a `put` of its own. A vault row has nothing in it that changes, so a vault has none: `bank.ensureVault`
puts a vault's birth, `ifPresent: 'get'`, and a `passed` answer is the vault another device stored. The gate has its own
verbs (*Changing the gate*). The patch hooks belong to `Box`.


## Notable Changes (that may be inconsistent)

* DeviceDB `tryStow`/`peek`/`forget`: directly keep/retrieve a lease by bank scope + `bank_tok`
* Unlist: remove from the listing's list
* A listing memoizes its children in a Map, and `deliverAnswer` has an instance listed at its scope before it yields, so
  overlapping answers land on one instance. Subscriptions are not relied on: a fetch answer builds an instance where
  there is none, as a notice does
* The Device is durable: one per bank scope, for the page's life. `device.sweep` disables it and its bank for good, and
  a host makes a new Device. A Bank is one life of the bank: a bank deleted, or built again elsewhere, ends it, and the
  device's next `ensureBank` makes the next with a fresh bank listing
* A Vault instance stands for its scope through its lives: a newer record of another `vault_tok` is received by the vault
  listed, and its box listing is made anew. When a birth's `vaultListing.put` is delivered, the vault listed receives it.
  A deleted vault stays listed, tombstoned, so a late fetch answer loses to it. When the tombstone is delivered, the old
  box listing no longer answers, and its boxes drop their exposed whispers
* No timers on a Storable or a lease: a JS timer on a page that may be suspended at any moment guarantees nothing.
  Autolock is a best-effort reminder, not a guarantee. It has two parts: `bank.autolock`, which a host calls when it
  likes, after ensureBank and on its own timer; and `Lease.buildFromCache`, which declines to load a row that is past
  autolock, and leaves the row where it is
* A lease records `proved_at`, the kind of proving, and the gate revision it cites. `bank.autolock` peeks the bank's
  cached lease (`Lease.tryExpiresAt`), so a fresh page needs no instance, and locks the bank when it is past its autolock
  duration; the lock forgets the row. A refused peek is bad news, and a lock whose forget is refused announces
  `lease_revoke_failed`
* The device caches only leases and the device row, not bank, gate, vault or box records, and no refresh timer runs
* The goal: when lock is called, nothing crosses it. We get there with simple code that can be analyzed in context, so a
  crossing is stated in one sentence (`whiteboard/20261102-newdesign/reference-timings.md`), not fine-tuned
* A box birth: when no box is listed, `vault.putBox` lists a void box (`boxListing.puttable`). That box's `box.put` makes
  the record with the shell as its `expected`, seals it and puts it (`born` or `reborn`), and the answer is delivered. A
  `box.put` of only a sidecar unseals and reseals, because the box stamp binds the revision
* A cached lease that clearly must be removed is never left in place quietly. When a user who has proved authority and
  intent to unlock crosses something that says lock, the case is ambiguous, and we settle it with clear code and a stated
  rule: `#attachLease` checks at its start and then carries through
* A crossing unlikely enough may just throw, and the host deals with it
* Each update, as it comes in, transactionally establishes its invariants. Where those invariants don't commute, it takes a
  higher-level coordinator, resolution by the host, or most likely advice to the host on making the ordering predictable
* `bankDB.tidyGone` is for hosts: nothing in the package calls it
* No guarantee of the ordering of simultaneous gets, puts and dels of a box, or even of how many will succeed
* Only Proving, Gating and Bank touch a lease. A box seals and unseals through `vault.sealStampedString` and
  `vault.unsealStampedString`, which go through `bank.sealWith` and `bank.unsealWith`, and `ensureUnlocked` returns no lease

## The lease: make, attach, cache

Each way of unlocking makes a lease in its own way, then attaches it in the same way. There is no counter and no compare.

```text
an unlock    lease = await proved.buildLease(friend, maingate);                 await bank.#attachLease(lease)
a birth      lease = await passphraseProving.buildLease(friend, maingate);      await bank.#attachLease(lease)
a gate verb  lease = await proved.buildLease(friend, written);                  await bank.#attachLease(lease)
the cache    lease = await Lease.buildFromCache(friend, maingate);              await bank.#attachLease(lease)    null → ask

friend is the bank's lease friend: the bank stamp, the deviceDB's lease verbs bound to its scope and bank_tok, bank.lock

bank.#attachLease(lease)                             private: by #unlockByProving, and by ensureUnlocked for a cached lease
├─ demandAttachable                                  swept, vacated or deleted → refused, nothing cached
├─ this.#lease = lease
├─ await lease.cacheAsCacheCan()                     refused → bad news; the lease is still granted
└─ align                                             reports unlocked; listeners run; snapshot re-made; then its gate and
                                                     vault listings, each vault, box listing and box aligned, each box's
                                                     own listeners notified once

bank.#revokeLease(where)                             private: called by lock, and by adopt of a tombstone or a row of another life
├─ this.#lease = null                                the lease goes first, so a refused forget leaves none
├─ revoking = granted?.tryRevoke() ?? Lease.tryForget(friend)    always, granted or not: a bank reporting locked still forgets
└─ await revoking                                    refused → announced 'lease_revoke_failed', with where
                                                     it does not align: lock aligns after calling it, and adopt's receiveRecord aligns
```

**A `lock()` before the attach, on an unlock or a birth,** has no effect, by the enter-key rule. The bank ends
up unlocked with its lease cached: a normal, visible state that the next `lock()` ends. The bank was
already locked, so that `lock()` changed no state.

**A `lock()` after the attach** is an ordinary lock of an unlocked bank: it revokes the lease, which removes
it from the cache. This requires the deviceDB to apply calls in the order they were made, so
that the forget is written after the stow. The stow is awaited before `align`, because a listener may call
`lock()`. So the attach needs no compare, and no second forget.

**A `lock()` that crosses a gate change** does not stay in effect, as with an unlock: the proof shows that this
user may have the bank unlocked. Each of the three gate changes ends in `#unlockByProving`, which gives the bank a
lease for a full term citing the gate row that was written.

**`device.sweep`, `device.vacate` and `del_bank`** leave a one-way state: every guard refuses from then on, so
anything worth guarding stops working. A deleted vault stays listed, tombstoned, while its old box listing no longer
answers. The refusals are for whoever still has a reference. `#attachLease` makes the same check (`demandAttachable`)
as its first step, so a refusal there leaves nothing cached.

**The cache:** a `lock()` during `Lease.buildFromCache`'s read has no effect on the bank either: the bank reports
unlocked. The lock's forget of the cached lease does take effect, so the next session asks. This is a row for
`notes/wontfix.md`.

Another tab's `lock()` is not passed on to this tab.

## The discards

```text
lock          bank: on an enabled bank, revoke the lease and forget its cache; on a disabled one, evict the lease, leaving the
              cached row; align the bank, its gate and vault listings, each vault, box listing and box
sweep         device: disable it; lock its bank, which is disabled by then, so the cached lease is left; the watches stop;
              dismiss its open gating
vacate        device: as sweep; then forget every lease of the bank scope cached on this device, and its device row; tell
              the host 'vacated'
del_bank      bank, through a gating: proved; lock; bank.listing.del(ante): the bank's tombstone, storage deleting its gate,
              vaults and boxes, transactionally; delivered, the Bank disabled for good, its open gating dismissed
vault.del     vault, unlocked: vaultListing.del(vault.sparse): a tombstone under a new vault_tok, storage deleting its boxes,
              transactionally; delivered, the old box listing no longer answers; only the vault stays, tombstoned. Nothing locks
autolock      bank: Lease.tryExpiresAt peeks the bank's cached lease; past its autolock duration, lock, which forgets it
```

**A `lock()` whose forget is refused announces `lease_revoke_failed`**: it is not bad news. The call
itself stays synchronous and does not throw, because the refusal comes later, from the deviceDB. The announcement goes
to the host's `onLifecycle`, with the refusal, `where` it came from, and no secret material. `DefaultOnLifecycle`, the
default: from a lock or a vacate, the refusal is logged at error and reported by `reportToPlatform`, and the Device is
vacated as the refusal arrives, if it is still enabled, with no timer; from a tombstone, or a forget during
`Lease.buildFromCache`, a warning. Because the vacated Device's calls are disabled, its bank cannot be reopened in this
tab, even if the deviceDB still refuses. A second refusal finds the vacate already done, which makes it a no-op, so this
needs no counter; a vacate disables before its forgets.

**A `lock()` and the dialog.** A lock leaves an open gating open: the lock says the bank is locked, and
the user can still answer the dialog. If the gating was asking for an unlock, it still unlocks, and if it was
asking for a change of the gate, the change is written and unlocks. A valid request goes through if it was authorized at
the start of its critical section.

**A `dismiss()` and the dialog.** The package cannot close a host's dialog, so a gating says when to close it:
`gating.whenConcluded` is a promise that a dialog can close on. A Cancel, a sweep, a vacate or the bank's tombstone
dismisses the gating:

```text
no attempt under way    concludes it 'dismissed': the verb refuses, the dialog closes; a later attempt refuses 'gating_concluded'
an attempt under way    the attempt runs through and its outcome concludes the gating, so a wrong passphrase
                        crossed by a dismiss still refuses 'wrong_passphrase'; a re-entry refuses
```

## End-of-method invariants

Each method states what stays true when it ends, whatever crossed it.

At all times, having a lease attached and reporting unlocked are the same fact: `bank.isLocked` is `#lease === null`,
not a second field.

| Method           | When it returns                                                                                                                                                                           | When it throws                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bank.lock`      | No lease attached; the forget called after every stow called; the bank, its gate and vault listings, each vault, box listing and box aligned                                              | Never throws: a refused forget is announced `lease_revoke_failed` after it returns                   |
| `device.sweep`   | The device and its bank disabled; no lease attached, the cached row left; the watches stopped; its open gating dismissed                                                                 | Never throws                                                                                          |
| `device.vacate`  | As sweep; each lease of the bank scope cached on this device, and the device row, forgotten or announced as not; `vacated` told                                                          | Never rejects                                                                                         |
| `box.put`        | The record kept is what it put, or newer; snapshot and cache aligned                                                                                                                      | Nothing stored; on `stale_write` or `camped`, the stored record taken in                             |
| `attachLease`    | Attached and in force; cached as the cache can; the bank and everything under it aligned                                                                                                 | Past a discard: refused, nothing cached                                                              |
| build_bank       | A Bank listed, the only one of its scope: unlocked, or locked by a `lock()` after the attach                                                                                              | Nothing stored; has only what the answer delivered. Another won: `gate_made_elsewhere`, its Bank listed, locked |
| `ensureUnlocked` | Unlocked, a lease in force at its attach                                                                                                                                                  | `dismissed`: no lease granted, none cached by this call                                              |
| `ensureVault`    | A Vault listed, the only one of its scope, this device's or another's                                                                                                                     | Nothing stored; has only what the answer delivered                                                   |
| A gate change    | The gate row at its next revision. Unlocked citing that row, a fresh lease of full term, whatever lock came before or crossed                                                              | Nothing stored, unless the answer was lost; the lease as it was                                      |
| del_bank         | The bank's tombstone stored, its gate, vaults and boxes deleted; the Bank locked and disabled, its cached lease forgotten                                                                  | Nothing stored, unless the answer was lost; the Bank as it was, but locked if the proof passed       |
| `vault.del`      | A tombstone stored under a new `vault_tok`, its box rows deleted; the Vault tombstoned, still listed; the bank as it was                                                                  | Nothing stored, unless the answer was lost; the Vault as it was                                      |
| `gating.attempt` | At most one under way; its gate read once; no cleartext kept                                                                                                                              | The same; correctable: the gating still open; any other: settled                                     |

## `build_bank`

```text
device.ensureBank() → device.#fetchBank()            no live bank stored: answer.val is null, answer.parent the tombstone or void row
└─ Bank.launchBirth(listing, expected, askUser)      expected is answer.parent, as BankSparse
   └─ Gating.launchBirth(listing, expected, Bank.#unlockBankByProving, askUser)
      ├─ device.attachGating                         one open on this device → 'already_asking'
      ├─ void #askHost → requestCleartext(gating)    ← host opens the dialog; with no requestCleartext, it opens and waits
      └─ await #concluded
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear? })   a second while one runs: attempt_in_flight
│                                                    passkeyClear spent after, unless correctable (G2)
│                                                    no lock check: a lock does nothing to a birth
├─ { bank, gate } = listing.stampsOfBirth()          a fresh bank_tok and gate_tok, registered_at now; one pair per attempt
├─ PassphraseProving.buildNovel(bank, gate, passphraseClear, world)      weak → may re-enter
├─ PasskeyProving.buildNovel(bank, gate, passkeyClear, world)            where a passkeyClear is handed
└─ then the change, from { passphraseProving, passkeyProving | null }   ── no cleartext is used past here ──
   the build_bank act's change
   ├─ passphraseProving.buildWayin(NOVEL)            makeBankKey; wrap; bankKey dropped
   ├─ passkeyProving?.buildWayin(passphraseProving)  unwrap from the source; wrap; dropped
   ├─ gateRecord = Gate.recordOfBirth(bank, gate, passphraseWayin, passkeyWayin | null)    sync pojo at the revision after the void one
   ├─ built = listing.build(listing.recordOfBirth(bank, expected), gateRecord, expected)
   │    ├─ bankDB.tryBuildBank({ op: 'build', ...scope, expected, record, gate })    ← the commit: bank row and gate row together
   │    │    a live row → 'passed', the stored bank and its main gate its answer: another won
   │    │    a newer tombstone → 'stale_write', thrown
   │    └─ deliverRecord(answer.parent), gateListing.deliverRecord(answer.val) → the Bank of what is stored, listed, locked
   ├─ built's bank_tok is not the stamp's → another won: refused 'gate_made_elsewhere', its Bank listed, locked
   └─ bank.#unlockByProving(passphraseProving)
      ├─ lease = passphraseProving.buildLease(friend, bank.maingate)    refused → the bank stays stored and listed, locked
      └─ bank.#attachLease(lease)                    cached as it attaches

the act returns → gating concludes ok → device.ensureBank resolves    provings dropped with their keys
host closes dialog → requestCleartext resolves → conclude is a no-op
```

`expected` is carried across the dialog: the build needs it. It is always a value: the tombstone's revision, or the
void row's (*Required of the parts not yet drawn*). A stale `expected` is safe: over a live row the build answers with
the stored bank, and that answer is the "another won" line above; over a newer tombstone the build refuses with
'stale_write'. A refused build leaves only what its answer delivered, and nothing on the device.
The act tells its own birth from another's by comparing the `bank_tok` it minted with the one it got back, before
attaching a lease. The new Bank reports locked between the build and the attach, with no listener yet to see it. A
`lock()` during the build or that await comes after the enter key, so the birth runs to its end and the bank is unlocked.

A vault's birth asks nobody: `bank.ensureVault(scope)` returns the vault listed, if present, and otherwise puts
`vaultListing.recordOfBirth(scope, expected)` over the tombstone or shell, `{ expected, ifAbsent: 'add', ifPresent: 'get' }`.
A `passed` answer is another device's vault, and is returned: a vault holds no key of its own.

## `unlock_bank`

```text
bank.ensureUnlocked()
├─ gate = await maingate.ensureTimely(Promptly); demandPromptable    asked first: the gate must be recent enough to know which lease it deserves
├─ a lease in force → done
├─ Lease.buildFromCache(friend, gate) → #attachLease → done, where one is cached; of this bank stamp, gate_tok and gate revision, and not past autolock
│    another gate or revision: forgotten, reads as no row;  another bank stamp: forgotten, bad news;  past autolock or damaged: left, reads as no row;  refused: bad news, no row
└─ bank.unlock() → bank.prompt('unlock_bank') → Gating.launchOn(bank, 'unlock_bank', Bank.#unlockBankByProving, askUser)
   ├─ a gating open on this device → refuses already_asking
   ├─ void #askHost → requestCleartext(gating)       with no requestCleartext, it opens and waits, as device.openGating
   └─ await #concluded
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear }) or attempt({ passkeyClear })
├─ gate = await maingate.ensureTimely(Promptly); bank.demandPromptable    at most one fetch; a bank found deleted refuses 'disabled' here
├─ PassphraseProving.buildStored(gate, passphraseClear, bank)
│    or PasskeyProving.buildStored(gate, passkeyClear)
│    wrong → may re-enter
└─ then the change, from { proved }                                   ── no cleartext is used past here ──
   bank.#unlockByProving(proved)
   ├─ lease = proved.buildLease(friend, bank.maingate)   the main gate's revision as it stands then
   └─ bank.#attachLease(lease)                       cached as it attaches

the act returns → gating concludes ok → ensureUnlocked resolves
```

`bank.unlock()` takes the same path from its second step, asking even with a lease attached or cached.

## Changing the gate

A bank's gate changes through its own bankDB verbs, named for what each does: `replacePassphrase`, `addPasskey` or
`revokePasskey`. No `Gate` is made for the next gate row: the gate listing mints the whole next record, and each verb lets
the bankDB check it against the row (`notes/answer-contract.md`). Each change ends the same way, and needs nothing that the
bank does not already have:

```text
each gate change's act, past its provings
├─ written = await gateListing.<gate verb>(ante, wayin)    ← the commit; ante, the gate record the attempt read
│  ├─ expected = ante; record = ante at nextRevisionOf(expected), the moved wayin laid on its wayins
│  ├─ the bankDB's verb, called with { expected, record }    a put of the gate row; moved → 'stale_write', nothing stored
│  └─ the answer delivered                           checked against what it sent
│     no lock: adopt never locks on a gate's next revision
└─ unlockByProving(bank, proved, written)            a fresh lease of full term citing written; a lock() crossing the change does not stay in effect
```

* **The lease comes after the put**, so it cites the gate revision that was written, and a refused put
  has nothing to clean up. The old lease stays in force in between, so the bank does
  not report locked. That is safe, because the bankKey did not change. A crash between the two leaves a cached
  lease citing the old revision, which `Lease.buildFromCache` forgets, so the next session asks for a passphrase: a normal state.
* **One record through the attempt.** The attempt reads `ante`, the gate's record (`gate.pickle()`), after its timeliness
  request, and proves against that gate. The next record is minted from `ante`, not the live gate, so `ante` is the put's
  `expected`. Anything the watch delivers during the attempt therefore makes the put refuse: a passkey revoked elsewhere is
  not brought back, and a passphrase replaced elsewhere is not overwritten.
* **A write made after the timeliness request.** The put refuses with 'stale_write'. The gating concludes with
  that refusal, and the gate has by then taken in the stored record. Nothing retries; a host may call
  the verb again.
* **A gate change locks no device.** Another device's session keeps its lease until its own lock or next `bank.autolock`; its
  cached lease, citing the older gate revision, is forgotten at its next session (Decided).
* **The bankDB stores a gate verb's record as it stores any put.** The record is built from `ante`, so it changes only
  its verb's wayin. `add_passkey` refuses before proving when the gate the attempt read has a passkey (`bad_option`).
  The bankDB cannot tell whether a wrap opens, so a bad `bank_key_wayin_wrapped` is still written.

Each prompt is the gate's, and starts the same way:

```text
bank.maingate.<verb>Prompt()
├─ await ensureTimely(Promptly); bank.demandPromptable    the gate refreshed first; a disabled or absent bank refuses
└─ bank.prompt(gatingkind) → Gating.launchOn(bank, gatingkind, Bank.#unlockBankByProving, askUser)
```

### `replace_passphrase`

```text
gate.replacePassphrasePrompt()
└─ bank.prompt('replace_passphrase')
   →→→ user hits enter key →→→
gating.attempt({ antePassphraseClear, nextPassphraseClear })
├─ the two cleartexts equal → 'same_passphrase', may re-enter
├─ { ante, gate } = timelyAnte(bank)                 ensureTimely(Promptly), demandPromptable; ante = gate.pickle(); this attempt's, from here on
├─ anteProving = PassphraseProving.buildStored(gate, antePassphraseClear, bank)
│    wrong → may re-enter
├─ nextProving = PassphraseProving.buildNovel(bank.stamp, gate.stamp, nextPassphraseClear, bank)
│    weak → may re-enter
└─ then the change, from { ante, anteProving, nextProving }           ── no cleartext is used past here ──
   ├─ nextWayin = nextProving.buildWayin(anteProving)    unwrap the bankKey; wrap; dropped
   └─ gateListing.<gate verb>, then unlockByProving(bank, anteProving, written)
      commit: gateListing.replacePassphrase(ante, main)    ← the commit; main is nextWayin.pickle()
```

The current passphrase is proved before the next is judged, so the `strengthChecker` is given a next
passphrase only from someone who has proved the current one.

### `add_passkey`

```text
gate.addPasskeyPrompt()
├─ gate.demandPasskeyAddable                         one already there → refused 'bad_option', without asking
└─ bank.prompt('add_passkey')
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear, passkeyClear })
│                                                    passkeyClear spent after, unless correctable (G2)
├─ { ante, gate } = timelyAnte(bank)                 this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, bank)
│    wrong → may re-enter, passkeyClear unspent
├─ passkeyProving = PasskeyProving.buildNovel(bank.stamp, gate.stamp, passkeyClear, bank)
└─ then the change, from { ante, proved, passkeyProving }             ── no cleartext is used past here ──
   ├─ passkeyWayin = passkeyProving.buildWayin(proved)   unwrap the bankKey; wrap; dropped
   └─ gateListing.<gate verb>, then unlockByProving(bank, proved, written)
      commit: gateListing.addPasskey(ante, passkey0)                  ← the commit; passkey0 is passkeyWayin.pickle()
           one added before the attempt read ante → 'bad_option', nothing proved; after it → 'stale_write'
```

### `revoke_passkey`

```text
gate.revokePasskeyPrompt()
├─ the gate has no passkey                           returns the gate, without asking
└─ bank.prompt('revoke_passkey')
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })
├─ { ante, gate } = timelyAnte(bank)                 this attempt's, from here on
├─ proved = PassphraseProving.buildStored(gate, passphraseClear, bank)
│    wrong → may re-enter
└─ then the change, from { ante, proved }                             ── no cleartext is used past here ──
   └─ gateListing.<gate verb>, then unlockByProving(bank, proved, written)
      commit: gateListing.revokePasskey(ante)                              ← the commit
           revoked before the attempt read ante → the next revision stored, with no passkey still; after it → 'stale_write'
```

## `del_bank`

Deleting the bank asks for its passphrase: it ends every vault and box under it.

```text
bank.delPrompt()
├─ await maingate.ensureTimely(Promptly); demandPromptable
└─ bank.prompt('del_bank')
   →→→ user hits enter key →→→
gating.attempt({ passphraseClear })
├─ gate = timelyGate(bank)                           at most one fetch; a bank found deleted refuses 'disabled' here
├─ ante = bank.sparse                                the bank row the gate came with
├─ PassphraseProving.buildStored(gate, passphraseClear, bank)
│    wrong → may re-enter
└─ then the change                                                    ── no cleartext is used past here ──
   ├─ bank.lock()                                    first: no box unseals under a lease while the tombstone goes out
   └─ bank.listing.del(ante)
      ├─ bankDB.tryDelBank({ op: 'del', ...scope, expected: ante, record: tombstone })    ← the commit: the bank's tombstone, under a
      │    new bank_tok; every gate, vault and box row under it deleted
      │    moved → 'stale_write', nothing stored; the bank stays locked
      └─ the tombstone delivered → bank.adopt
         ├─ bank.#revokeLease('tombstone')           the bank already locked: forgets again; refused → announced 'lease_revoke_failed'
         └─ device.dismissGatingAtDiscard(bank)      the bank disabled for good; the device has no bank until the next ensureBank
```

### `vault.del`

Deleting a vault asks nobody (bank_world, ruling R5): an unlocked bank's vault is the user's to delete.

```text
vault.del(asked)                                     Storable's, under an unlocked bank
├─ await ensureDeletable()                           hydrates
├─ demandDeletable                                   enabled and unlocked: a locked bank refuses 'bank_locked', nothing sent
├─ vault.sparse consistent with what was asked       scope, vault_tok and revision; moved → 'stale_write', nothing sent
└─ vaultListing.del(vault.sparse) → tryDel
   ├─ a vault listed of another vault_tok            → 'vault_reborn', nothing sent
   └─ Listing.tryDel: the tombstone at nextRevisionOf(the sparse record's revision), under a new vault_tok
      ├─ bankDB.tryDelVault(tombstone, { expected })    ← the commit: a tombstone, the boxes of the old vault_tok deleted with it
      │    moved → 'stale_write', nothing stored
      └─ deliverAnswer(answer, tombstone) → receiveRecord → adopt(tombstone)
         └─ align                                    the old box listing no longer answers: its watch stops, its boxes drop their exposed
                                                     whispers, nothing deleted on the device; the vault stays listed, tombstoned
```

Nothing locks first, so a box may be unsealed under the bank's lease until the tombstone lands, as during a box's
delete, and a refused delete leaves the vault as it was. Another device receives the tombstone, and its Vault ends its
life the same way. A rebirth is received by the same Vault, under another `vault_tok`, with a new box listing.

The bankDB owns the cascade: removing a vault deletes its box rows by scope and `vault_tok`, so no client has to walk
them. The `vault_tok` keeps a late cascade away from a rebirth's boxes, which have the same scope but a different token.
The tombstone and the cascade share a transaction in every adapter we implement. A repeated delete, step by step, as the
classifier sees it:

```text
bankDB.delVault(tombstone, { expected })
stored is live, at expected                      the tombstone written; cascade; 'deleted'
stored is live, revision moved                   'stale_write'; no cascade
stored is a tombstone, at another revision       nothing written; no cascade; 'gone', refused 'absent_vault', the tombstone delivered
stored is the tombstone at expected              nothing written; no cascade; 'dubdel', refused 'absent_vault'
nothing stored                                   nothing written; no cascade; 'void', refused 'absent_vault'
```

Repeated deletes do not advance the revision. Whoever repeats a delete may not have the current token, having lost the
first answer. Advancing the revision would wake every device's watch for nothing, and could cause a rebirth that has that
tombstone as its `expected` to be refused. The package does not retry: a repeat is the host calling the verb again,
which its Vault allows until the tombstone arrives. After that `vault.del()` finds the vault absent.

A Box operation naming a stale or missing vault_tok will fail `vault_reborn` (or `absent_vault` or `vault_gone`). The damaged_row field will contain a generated tombstone if one is found with that scope *and vault_tok*, null otherwise. In both cases the value is forensic: do not instantiate, do not deliver. (Discovering a row is exceptionally unlikely as they were to have been transactionally removed with the vault deletion. `bank.doctor()` will establish comfort if needed)

## Required of the parts not yet drawn

* Storage's conditional put is atomic on `revision_tok`.
* The deviceDB's calls take effect in the order they were made (*The lease*).
* `lock()` removes the cached lease even on a bank already reporting locked.
* The deviceDB has `tryStow`, `peek` and `forget`, by bank scope and `bank_tok`: `lock`, `vacate` and `del_bank` all need a removal.
* Every put validates `expected.revision_tok` and `expected.revision_seq` against the row, and that the record's
  `revision_seq` is `expected.revision_seq` plus one. A birth where no row is stored sends `VoidRevision`, which has a known
  `revision_tok` and a `revision_seq` of -1. The shell is a value and not a null, so the invariant applies to it too.
* `adopt` ignores a record older by `revision_seq`.
* `Promptly`, a constant: the timeliness an attempt asks of `ensureTimely`. `maxMillis: 0` is the customer's to ask, as an
  override from the inside is one the customer cannot.
* `ifPresent` is customer-facing, and `putVault` and `putBox` take it alike in `PutOpts`, with `ifAbsent` ('add' or
  'fail'). Only `repl` saves, and only within the live row's own life: at its revision under another `vault_tok` or
  `box_tok` it refuses `camped`. `fail` refuses `camped` with the corpse (`dbhas`, the request), not as a `stale_write`;
  `get` answers the live row in place of the request, `passed`. `isVaultPutAllowed(ante, record, opts)` and
  `isBoxPutAllowed(ante, record, opts)` decide inside each adapter's transaction.
* Every box query names scope and `vault_tok`, and a box row under another `vault_tok` is treated as no row. Only a
  fetch of a vault record has a reason to go by scope alone.

## To fix

* **`identity_revoked`** vacates: any call into the BankDB that is answered with it runs `device.vacate`, then passes the
  refusal on to its caller. Built. `notes/security.md` says the old code locked there, and has to be brought into agreement.

## Areas of Concern

Eyebrow raisers from the Coach's replies in the sprint's Closer Look (`whiteboard/20261103-unrace/unrace-closerlook.md`).

* **The gating family:** `#concluded`, `#outcome` and their flags. "same family of design smells around gating". See `whiteboard/20261102-newdesign/unrace-gating-prompt.md`.
* **The cache and the forget on one control path:** `lease.cacheAsCacheCan()` before the align in `bank.#attachLease`, the forget before the first await in `bank.#revokeLease`. "that sounds dangerous".
* **Cleartexts:** `spendCleartexts` and `checkedCleartexts` reach into the host's objects, and who owns a passkey answer's PRF bytes is open. "I assumed that the buffer exhaustion was best practice".
