# Interface

The seams of Box, Vault, Lease, Proving, Gate, Gating and Bank as they are meant to be, not as they are: `whiteboard/20261102-unrace/unrace-gating.md`, in the conventions of `vaultdb-invariants.md` (atoms first; entrypoints under Public). `lock`, `sweep` and `vacate` exist on each thing down the chain, a no-op where there is nothing to do. For this sprint the device caches only leases and the device record, not vault or box records, and no refresh timer runs. useWhisper, expose and the whisper a box holds are postponed this sprint, not gone. The goal: when lock is called, nothing crosses it.

Gone from the interface, so in no table: every `cleartexts` parameter (`ensureVault(bag, cleartexts)`, `ensureUnlocked(cleartexts)`, the gate verbs'), `takeUpLease`, `takeUpCachedLease`, `vaultListing.close`, `makeStaged` and the staged record, `UnlockAtBirth`, `BirthLockSeq`, `closeSeqs`, the lease mutex, the unlock join and the ensuring map, `hydrateAll`, `attemptPasskey` (an `attempt({ passkeyClear })`), `ensureFullAndTimely` and `buildCachedLease`.

*  💪 sound (always true): all records are valid and mutually consistent: vault, box, listing, lease, gate, wayins, gatings
* 🌀 misaligned: something is so wrong it's difficult to deliver a quality issue report
* ⏳  timely: refresh age was within limit at some point between call and first seam; parents are also 😎 timely
* 🎫 received: listing has memoized instance, sparse, full, or tombstoned
* 🗂️ listing: factory and index of storables; holds their subscriptions, delivers vaultDB responses; to unlist is to remove from its list
* ❗️ whole: record is either full or a tombstone
* 😎 whole and timely return value: the full record as stored in VaultDB at end of transaction
* 💯 full: record is listed and fully fetched
* ☑️ sparse: record is listed but **not** full
* 📥 staged: uncommitted whole record, returned and held nowhere
* 📌 present: record is known, as full or sparse (not tombstoned or void)
*  🔐 locked: lease deleted from vault and cache. Impossible to unseal until next proof
* 🎬 unlocked: vault was unlocked for critical period (see individual doc)
* ❌ vacated: locked, whisper cleared, all calls refused, unlisted, frozen
* 🧹 swept: all calls refused, unlisted; like vacated but cached lease not deleted
* 🪦 gone: locked, vacated, removed from VaultDB
* 🔲 void: absent (no row)
* 🛡️ no-throw: all errors caught;  `tryVerbNoun`  returns an Outcome<Noun>
* 💣 ok=refused: oops
* 👌 ok=success (general)
* 👍 ok=modified: modification was successfully transactionally applied, no changes since last update
* 💸 decrypted: whisper is authenticated against cached vault key, box key, vault, and its non-sidecar metadata
* 🫆 encrypted: whisper cannot be decrypted without device and prohibitively difficult even with device.
* 🛵 sidecar: 
* ☢️ hot stuff: secret key, cleartext or preimage
* 🥶 frozen: object's public properties cannot be modified, or new ones added, for its lifetime
* 📣 subscribed: full records push on changes.
* 1️⃣ one-at-a-time: overlapping callers wait on single request and share its result
* 💾  saved
* 🟰 no change
* 📸 snapshot: frozen pojo with public props for subscribers
* 🔑 wayin
* *️⃣ any 
* 🗳️ box: holds whisper, scoped by applabel/user_id/vaultlabel/boxlabel and for most things vault_tok
* 🏦 vault, scoped by applabel/user_id/vaultlabel and for most things vault_tok, often gate_epoch
* 🫥 disabled:  throws from every guard
* 📱 deviceDB: this device's store of cached leases and vaults

Given the seam and the row, everything to its right is guaranteed.

* Left of the seam, what holds on the way in, on the method's first row only: 🎬 unlocked; 🏦 or 🗳️, the object acted on, ⏳ where it must be timely; 1️⃣ one at a time. Blank: not required. A ? marks a sigil read in, where neither the old cell nor the gating file says so.
* Right of the seam: act, the outcome where it has a name; ok; post, the listing then the object, and whether each changed and to what; ret, the return or its properties where they matter; note.
* Only the rows and columns with something to say are here. Proving and Gate store nothing, so they have no post column.

## Preconditions

What a call can fail with before its own row is reached. Each table below shows a call's results when all of these preconditions are met: past a sweep everything throws, whatever its row says.

| call | act | ok | note |
| --- | --- | --- | --- |
| every call on 🫥 | disabled | 💣 | every guard throws, and nothing changes. Past a sweep, a vacate or a delete nothing works; this is all a reference still held reaches |
| `lock`, `sweep`, `vacate` on 🫥 | - | 🛡️ | a no-op: these do not throw, so a repeat finds the work done |
| `lease.attach` on a 🫥 vault | disabled | 💣 | `demandReadyToAttach` throws; the lease vacated, no cache call. A row the sweep left goes too, costing a passphrase next session |
| every 🎬 call, while locked | locked? | 💣 | the guard throws; nothing sealed or unsealed |
| every ⏳ call | its refresh's | 💣 | a refresh's refusal passes up; nothing changed |
| every `bank` call before ready | hello's own error | 💣 | a failed `hello` rethrows its own error, with no refusal of our own |
| every call into the VaultDB | `vault_gone`, `vault_empty`, `vault_full`, `box_too_large` | 💣 | passed up, as `vaultdb-invariants.md` VPA7 has them |
| every call into the VaultDB | `storage_error`, `not_permitted`, `damaged_record`, `newer_format` | 🌀 | passed up, as `vaultdb-invariants.md` VPA7 has them |
| every call into the VaultDB | `identity_revoked` | 💣 | bank.vacate, then passed up |
| a host function that hears a clear (strengthChecker, keyDeriver, requestCleartext), or WebCrypto | its throw | 💣 | replaced by a refusal naming no secret, its error never kept as a cause (guarantee G8) |
| every export | `invalid_input` | 🌀 | validated at the entrypoint, before any work |
| every method, at its end | - | 🌀 | an end-of-method invariant fails: throws as any data-integrity failure does, naming no secret |

## Box

Box's seams, atoms first. Left out of the analysis: `edit` as an entrypoint, `seal`, `useWhisper`, `expose`, the `whisper` setter and the counters under them.

absent: tombstoned or row missing

box timely: vault timely, box timely, consistent with vault, healthy

| 🏦 🎬 | 🗳️ | 1️⃣ | Seam | act | ok | 🗂️ 🗳️ | ret | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ⏳ 🎬 | ⏳ 💯 |  | `box.#unseal` | - | 👌 | 🟰 💯 | 💸 | returns timely whisper text |
| ⏳ 🎬 | ⏳ 💯 |  | `box.send(patch)=>#edit,#seal` | - | 👍 | 🟰 💯 | 📥 | returns staged data at next revision |
| ⏳ 🎬 | ⏳ 🎫 |  | `box.send(patch)=>listing.putBox` | `replaced` | 👍 | 💾 💯 | 💯 | 😎 current |
|  |  |  |  | `stale_write` | 💣 | 🟰 🎫 |  | VaultDB unchanged; stored record listed |
| ⏳ 🎬 | ⏳ 🎫 |  | `box.del=>listing.delBox` | `gone/void` | 👍 | 💾 🪦 | 🪦 | 😎 current |
|  |  |  |  | `stale_write` | 💣 | 🟰 🎫 |  | VaultDB unchanged; stored record listed |
| ⏳ 🎬 |  | 1️⃣ | `box.fetch=>listing.fetchBox` | `got` | 👌 | 🟰 💯 | 🗳️ | 😎 current |
|  |  |  | `ifAbsent:nil` | `gotgone/gotvoid` | 👌 | 🟰 🪦 | 🔲 | void/gone returns `null` |
|  |  |  | `ifAbsent:fail` | `gone/void` | 💣 | 🟰 🪦 |  | void/gone refuses with ifAbsent=fail; |
| ⏳ |  |  | `box.receive` | - | 👌 | 💾  🎫 | 🗳️ | 😎 current |
| ⏳ |  |  | `box.settle` | - | 🛡️ | 📸 📣 | 🗳️ | 😎 snapshot current, frozen, told to listeners |
|  |  |  | `box.lock` | - | 🛡️ | 🎫 🔐 | 🗳️ | exposed whisper not served (no other internal change). Postponed this sprint |
|  |  |  | `box.sweep` | - | 🛡️ | 🔲 🧹 | 🗳️ | whisper dropped. Postponed this sprint |
|  |  |  | `box.vacate` | - | 🛡️ | 🔲 ❌ | 🗳️ | locked; disabled |

## Box listing

| Seam | act | ok | 🗂️ 🗳️ | ret | note |
| --- | --- | --- | --- | --- | --- |
| `boxListing.build(record)` | - | 👌 | 🎫 📌 | 🗳️ | listing holds the durable box, consistent with vault and listing (may be partial and not timely); subscribed via listing |
| `boxListing.hello` | - | 👌 | 🎫 ☑️ |  | the box listing and damaged_records from vault.hello's vault.get, its boxes sparse; VaultDB watch on listing and box changes |
| `boxListing.lock` | - | 🛡️ | 🎫 🔐 |  | every box locked; a no-op where there is nothing to do |
| `boxListing.sweep` | - | 🛡️ | 🔲 🧹 |  | watch disarmed; every box swept and unlisted; a held reference is refused |
| `boxListing.vacate` | - | 🛡️ | 🔲 ❌ |  | watch disarmed; boxes disabled, unlisted; no further calls accepted |
| `boxListing.#deliver` | - | 👌 | 🎫 ⏳ |  | `box.receive` on the listed box, `build` where none; an instance is in the slot before any yield |

## Vault

A held vault is full and holds its gate; it is born locked.

| 🎬 | 🏦 | 1️⃣ | Seam | act | ok | 🗂️ 🏦 | ret | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  | `vault.hello` | - | 👌 | 🎫 ⏳ | 🏦 | calls vault.get, earning a timely vault, its box listing, and damaged_records. Runs on the first box call, not at bank.hello; a host wanting them sooner can run a task queue |
|  |  | 1️⃣ | `vault.fetch` | `got` | 👌 | 🟰 💯 | 🏦 | 😎 current; overlapping calls join, one at a time |
|  |  |  | `ifAbsent:nil` | `gotgone/gotvoid` | 👌 | 🟰 🪦 | 🔲 | void/gone returns `null` |
|  |  |  | `ifAbsent:fail` | `gone/void` | 💣 | 🟰 🪦 |  | void/gone refuses |
|  |  |  | `vault.ensureTimely(maxMillis)` | recent | 👌 | 🟰 ⏳ | 🏦 | refreshed within what the caller set: returns itself, no fetch. A gating attempt passes Promptly; maxMillis: 0 is the customer's alone |
|  |  |  |  | refreshed | 👌 | 🎫 ⏳ | 🏦 | otherwise fetches, as a refresh |
|  |  |  |  | `vault_gone` | 💣 | 🟰 🪦 |  | a vault found gone refuses here |
|  |  |  | `vault.receive` | - | 👌 | 💾 🎫 | 🏦 | 😎 current; adopt, the part of receive that decorates own props onto the vault, takes the record's gate as a new Gate; lock state unchanged on any gate move, own or another device's |
|  |  |  |  | `older` | 👌 | 🟰 🎫 | 🏦 | a record older by `revision_seq` is ignored |
|  |  |  | `vault.settle` | - | 🛡️ | 📸 📣 | 🏦 | 😎 snapshot current, frozen (lock state, `boxes, trouble), told to listeners` |
|  |  |  | `vault.leaseFriend()` | - | 👌 | 🟰 🟰 | friend | all a Proving or a Lease hears of the vault: the stamp, the clock, the logger, the deviceDB's lease verbs bound to its scope, and #attachLease, all fixed for the vault's life. Holds no key; reaches neither the record nor the boxes |
| 🎬 |  |  | `vault.sealStampedString` | - | 👌 | 🟰 🟰 | 🫆 | how a box seals: it never holds a lease |
| 🎬 |  |  | `vault.unsealStampedString` | - | 👌 | 🟰 🟰 | 💸 | how a box unseals: it never holds a lease |
|  |  |  | `vault.lock` | - | 🛡️ | 🎫 🔐 | 🏦 | sync; lease vacated; children locked; settled. Its panic is under `vault.#vacateLease` |
|  |  |  | `vault.sweep` | - | 🛡️ | 🔲 🧹 | 🏦 | lease dropped, the cached one left; watch disarmed; 🫥 from here on; children swept and unlisted. As vacate, but what is cached stays |
|  |  |  | `vault.vacate` | - | 🛡️ | 🔲 ❌ | 🏦 | lock; children vacated (disabled, unlisted); cached lease vacated; disabled. A vacate already done is a no-op |

## Vault listing

VaultListing's factory, lifecycle and commit seams. An instance is replaced only when vacated, swept, or created from gone or void. Only a deleted vault stays in its slot, tombstoned, so a late answer loses to it; its box listing vacates, boxes disabled and unlisted, as the vaultDB cascades the rows and no client walks them.

| 🏦 | Seam | act | ok | 🗂️ 🏦 | ret | note |
| --- | --- | --- | --- | --- | --- | --- |
|  | `vaultListing.at(scope)` | - | 👌 | 🟰 🟰 | 🏦 or prior | what `bank.hello` loaded: a vault, or else the prior a birth puts over |
|  | `vaultListing.build(vault or tombstone)` | - | 👌 | 🎫 🔐 | 🏦 | a full vault for the scope, born locked, subscribed via listing, box listing made. The listing's query answers full records, so no sparse vault exists |
|  |  | tombstone | 👌 | 🎫 🪦 | 🪦 | the tombstone listed |
| 🔲/🪦? | `vaultListing.ensureVault(record, prior)` | `landed` | 👍 | 💾 🔐 | 🏦 | the commit. `new Vault(record)` replaces the slot's tombstone or void, the only seam that does; held and answered |
|  |  | `another won` | 👌 | 🟰 🎫 | 🏦 | `new Vault(stored)` held and answered, locked, a success |
|  |  | refused | 💣 | 🟰 🔲 |  | a refused put leaves nothing, in memory or on device |
| ⏳ 💯 | `vaultListing.replacePassphrase(params), addPasskey(params), revokePasskey(params)` | - | 👍 | 💾 🔑 |  | the commit. The params are shaped exactly like a vault record holding a gate that holds the wayin: gate: { passphrase_wayin }, gate: { passkey_wayin }, or gate: { passkey_wayin: null } for a revoke. They spread the record the attempt read, so its revision is the prior and a record delivered since refuses the put. The answer's record gives the lease its gate_epoch. The vaultDB lays the wayin on the row, moves `gate_epoch` and the revision up, and leaves the rest as stored. No lock: adopt never locks on a move |
|  |  | `stale_write` | 💣 | 🟰 🎫 |  | prior is the revision the gate was read at; moved, nothing stored |
|  |  | `camped` | 💣 | 🟰 🎫 |  | a passkey added before the enter key. The vaultDB also refuses a verb that would touch the other wayin. It cannot tell whether a wrap opens, so a bad `vault_key_wayin_wrapped` still lands |
|  |  | `revoked` | 👍 | 🔲 🔑 |  | revokePasskey with no passkey held: idempotent, the row's passkey_wayin still null |
| ⏳ 🔐 | `vaultListing.del(scope, vault_tok)` | - | 👍 | 💾 🪦 | 🪦 | the commit, over the revision the gate was read at: a tombstone, its boxes cascading; its box listing vacated, boxes disabled and unlisted; only the vault stays, tombstoned in its slot, until a create replaces it |
|  |  | `stale_write` | 💣 | 🟰 🔐 |  | moved, nothing stored |
|  |  | deviceDB.vacate refused | 👍 | 💾 🪦 | 🪦 | bad news; the tombstone stands |
|  | `vaultListing.sweep` | - | 🛡️ | 🔲 🧹 |  | reads locked; no lease held, the cached one left; no watch open; open gating settled once any attempt has run; vaults and boxes swept and unlisted; a held reference is refused |
|  | `vaultListing.#deliver` | - | 👌 | 🎫 ⏳ |  | `vault.receive` on the listed vault, `build` where none; an instance is in the slot before any yield |
|  |  | tombstone in the slot | 👌 | 🟰 🪦 | 🪦 | a record older by revision_seq loses to it |
|  |  | tombstone over a live vault | 👌 | 🎫 🪦 | 🪦 | deleted elsewhere: a local delete's end state, established as it comes in. Locked, cached lease vacated, box listing vacated; the vault stays in its slot, tombstoned |

## Lease

A lease held and reading unlocked are the same fact: `isLocked` is `#lease === null`, not a second field. Each way to unlocked makes a lease its own way, then attaches it the same way. Only Proving, Gating and Vault touch a lease.

| 🏦 | Seam | act | ok | 📱 🏦 | ret | note |
| --- | --- | --- | --- | --- | --- | --- |
|  | `lease.peek(leaseFriend)` | - | 👌 | 🟰 🟰 | lease or null | the lease cached on this device, of this vault_tok and gate_epoch, by way of the deviceDB verb on leaseFriend |
|  |  | `damaged` | 💣 | 🟰 🟰 |  | bad news |
|  | `lease.attach()` | - | 👍 | 💾 🎬 |  | held and in force; cached before settle, nothing awaited between; settled |
|  |  | cache refused | 👌 | 🟰 🎬 |  | bad news; the lease is still held |
| 🎬 | `lease.cache()` | - | 🛡️ | 💾 🎬 |  | called, not yet awaited, by attach; one peeked from the cache has nothing to do. Calls land in the order they were made |
|  | `vault.#renewLease(proved, gate_epoch, heldLease)` | `renewed` | 👍 | 💾 🎬 |  | a lease under the epoch that landed attached; the old lease in force for the moments between, so the vault does not read locked |
|  |  | `was locked` | 👌 | 🟰 🔐 |  | `heldLease` is null: nothing |
|  |  | lock crossed | 👌 | 🔲 🔐 |  | heldLease forgotten, read after buildLease so it covers the put and the crypto: the new lease vacated unattached. The change has landed, so nothing is left half done |
|  | `vault.#vacateLease()` | - | 🛡️ | 🔲 🔐 |  | called by lock. lease.vacate(); with no lease held, vault.#vacateCachedLease, so a vault already reading locked still leaves the device locked; lands after every cache call; open gating handled as under gating.declineAtLock |
|  |  | `panic` | 💣 | 🟰 ❌ |  | the cached lease survives. Not bad news: the host's async `onPanic` hears the refusal and no secret material; a rejection of it is reported and goes no further. With no `onPanic`, `reportToPlatform`, and the Vault vacated as the refusal arrives, with no timer. A second refusal finds the vacate done, a no-op |
| in force | `lease.sealWith`, `lease.unsealWith` | - | 👌 | 🟰 🟰 | bytes | sealed or unsealed under the vaultKey against the stamp given; the key never leaves the lease; called by the vault alone |
|  | `lease.vacate()` | - | 🛡️ | 🔲 🔐 |  | removes itself from the cache, so the device is locked; its handles dropped; out of force |

## Proving

Every proving instance holds a strong key from birth, and only the statics hear a clear. A proving makes some ephemeral non-extractable handles, which go with it.

| 🏦 | Seam | act | ok | ret | note |
| --- | --- | --- | --- | --- | --- |
|  | `PassphraseProving.buildNovel(stamp, passphraseClear, world)` | - | 👌 | proving | strength checked; header minted (deriver label, salt, `device_id`, `registered_at`); wayinKey derived, bytes zeroed |
|  |  | `weak_passphrase` | 💣 |  | correctable |
|  | `PasskeyProving.buildNovel(stamp, passkeyClear, world)` | - | 👌 | proving | header minted (`credential_id`, `prf_salt_b64`); wayinKey derived from the PRF bytes over the stamp's ctx |
| ⏳ | `PassphraseProving.buildStored(gate, passphraseClear, world)` | - | 👌 | proving | proved against the gate in hand, no fetch; the attempt asked for timeliness once, before reading that gate |
|  |  | `unknown_key_deriver` | 💣 |  | deriver not the world's |
|  |  | `wrong_passphrase` | 💣 |  | correctable: the wrap does not open |
| ⏳ | `PasskeyProving.buildStored(gate, passkeyClear)` | - | 👌 | proving | as above |
|  |  | `absent_wayin` | 💣 |  | no passkey wayin |
|  |  | `wrong_passkey` | 💣 |  | correctable, the answer left unspent: `credential_id` or `prf_salt_b64` does not match, or the wrap does not open |
|  | `proving.buildWayin(NOVEL or sourceProving)` | - | 👌 | 🔑 | the vaultKey, made new or unwrapped from the source's wayin, wrapped under this proving's key, then dropped |
|  | `proving.buildLease(friend, gate_epoch?)` | - | 👌 | lease | on friend's vault, under the epoch it proved or the one passed: the vaultKey unwrapped from the gate's wayin, wrapped as the leaseKey; records proved_at and the kind of proving |
|  |  | stamp mismatch | 💣 |  | a friend whose stamp is not the proving's |

## Gate

| Seam | act | ok | ret | note |
| --- | --- | --- | --- | --- |
| `Gate.make(stamp, passphraseWayin, passkeyWayin or null)` | - | 👌 | gate | sync. The first gate, of `gate_epoch` 1 |
| `gate.demandPasskeyAddable` | - | 👌 |  | sync. The one check before anyone is asked; past the enter key, the store refuses |
|  | passkey held | 💣 |  | refused, nobody asked |
| `gate.pickle` | - | 👌 | record's gate | no gate or wayin table of its own; adapters lay it out as they like |

## Gating

One Gating per ask: a vault or the bank launches it with a `run`, the host's dialog drives it, it settles once. Its attempt hands the clears to the provings' statics as arguments, and hands `run` provings only.

| pre | Seam | act | ok | post | ret | note |
| --- | --- | --- | --- | --- | --- | --- |
|  | `Gating.launch(kind, { vault or scope, run })` | - | 👌 | settled | run's answer | the host's dialog shown with this gating; resolves once settled |
|  |  | `declined` | 💣 | settled |  | `requestCleartext` returned with the gating open and no attempt running |
|  |  | `request_cleartext_threw` | 💣 | settled |  | `requestCleartext` threw before an attempt |
|  |  | `already_asking` | 💣 |  |  | a gating open on this bank: a second launch refuses, no join |
| open | `gating.#attemptOnce(clears)` | - | 👌 | settled |  | settled with run's answer; at most one under way; its gate read once; no clear held, and none goes past the statics |
|  |  | `weak_passphrase`, `wrong_passphrase`, `wrong_passkey`, `same_passphrase` | 💣 | open |  | correctable: a passkey answer unspent |
|  |  | `locked_while_asking` | 💣 | settled |  | a lock since launch, checked here once, never again. Not on a build_vault or `del_vault` |
|  |  | any other | 💣 | settled |  |  |
|  | `gating.#settleOnce` | - | 👌 | settled |  | later settles ignored; launch resolves with the outcome; `whenSettled` resolves |
| open | `gating.declineAtLock()` | no attempt under way | 👌 | settled |  | `locked_while_asking`: the verb refuses, the dialog closes |
|  |  | an attempt under way | 👌 | open |  | sets the variable: the attempt runs through, and a re-entry refuses |
|  |  | a `build_vault` or `del_vault` | 👌 | open |  | nothing |

### The runs

What each kind's attempt and `run` leave. `run` hears provings only.

| 🏦 | kind | act | ok | 🗂️ 🏦 | ret | note |
| --- | --- | --- | --- | --- | --- | --- |
| 🔲/🪦 | `build_vault` | `landed` | 👍 | 💾 🎬 | 🏦 | the only Vault of its scope: unlocked, or locked by a `lock()` after the attach. A Bank's lock during the put or that await is past the enter key, so the birth runs through, unlocked |
|  |  | `another won` | 👌 | 🟰 🔐 | 🏦 | still a success; the passphrase just typed is not its |
|  |  | `weak_passphrase` | 💣 | 🟰 🔲 |  | may re-enter |
|  |  | any other | 💣 | 🟰 🔲 |  | nothing stored, nothing held |
| ⏳ 💯 | `unlock_vault` | - | 👍 | 🟰 🎬 |  | a lease in force at its attach, under the proved gate's epoch, whatever arrived since; cached |
|  |  | `wrong_passphrase`, `wrong_passkey` | 💣 | 🟰 🔐 |  | may re-enter |
|  |  | `locked_while_asking` | 💣 | 🟰 🔐 |  | no lease held, none cached by this call |
|  |  | `vault_gone` | 💣 | 🟰 🪦 |  | found gone by the attempt's timeliness request |
| ⏳ 💯 | `replace_passphrase`, `add_passkey`, `revoke_passkey` | - | 👍 | 💾 🔑 |  | the record holds the next gate, its epoch one up. Unlocked under that epoch if it was unlocked and no lock crossed; else locked, no lease |
|  |  | `same_passphrase`, `wrong_passphrase`, `weak_passphrase` | 💣 | 🟰 🟰 |  | may re-enter. The current passphrase is proved before the next is judged; `add_passkey`'s passkeyClear unspent |
|  |  | `locked_while_asking` | 💣 | 🟰 🟰 |  | a lock since launch; nothing stored; the lease as it was |
|  |  | `stale_write` | 💣 | 🟰 🎫 |  | nothing stored, unless the answer was lost; the lease as it was; the stored record listed. Nothing retries; a host may call the verb again |
| ⏳ 💯 | `del_vault` | - | 👍 | 💾 🪦 | 🪦 | `lock()` first; a tombstone stored and its box rows gone from the vaultDB; nothing of it on this device; its box listing vacated last, boxes disabled and unlisted; only the Vault stays, tombstoned in its slot |
|  |  | `wrong_passphrase` | 💣 | 🟰 🟰 |  | may re-enter. A lock does not stop a delete |
|  |  | `stale_write` | 💣 | 🟰 🔐 |  | nothing stored, unless the answer was lost; the Vault locked, and otherwise as it was |

## Bank

The vault factory seams are in Vault listing above.

| Seam | act | ok | 🗂️ 🏦 | ret | note |
| --- | --- | --- | --- | --- | --- |
| `bank.#hello` | - | 👌 |  |  | host plugins loaded (`keyDeriver`, `strengthChecker`) |
|  | load refused | 💣 |  |  | refuses hello; bank reads refused |
| `bank.#keepDeviceRecord` | - | 👍 |  |  | deviceDB holds one device record for the bank scope; the first `device_id` stored wins and is the bank's |
|  | `damaged` | 👍 |  |  | a damaged record written over is bad news |
| `bank.getBank()` | `same life` | 👌 | 🟰 ⏳ |  | `vault.receive(record)`. Full vaults, no boxes, `gone_vault` tombstones; does not fetch or sync with the deviceDB |
|  | `new vault_tok` | 👌 | 🎫 🔐 |  | the old vault vacated and unlisted; `build(vault)` added |
|  | a tombstone | 👌 | 🎫 🪦 |  | the old vault vacated and unlisted; `build(tombstone)` added |
|  | refused | 💣 | 🟰 🟰 |  | hello refuses, and the bank is not ready |
| `bank.tidy` | - | 🛡️ | 🟰 🔐 |  | `deviceDB.leasesProvedBefore(cutoff)`, an index range scan, finds the cached leases whose proved_at is older than the autolock duration, so a fresh page needs no instance: each vacated, its listed vault locked. A refused scan is bad news, and a lease it cannot vacate panics. No timer: a JS timer on a page that may be suspended at any moment says nothing |
| `bank.#hearBadNews` | - | 🛡️ | 🟰 🟰 |  | every news reaches `onBadNews`, else the logger |
|  | `identity_revoked` | 🛡️ | 🔲 ❌ |  | `bank.vacate` |
| `bank.#remakeSnapshot` | - | 🛡️ | 📸 📣 |  | snapshot current, frozen (stage, `device_id`, vaults), told to listeners |

## Public

The entrypoints, parked as they are: not yet in the columns above.

### Box

| Seam | Invariant, once it returns |
| --- | --- |
| `box.extractWhisper()` | returns timely whisper text |
| `vault.getBox()` | unlocked. ifAbsent defaults to fail, as box.get does: returns timely full box, or refuses; box/listing/cache agree |
| `vault.getBox(ifAbsent=nil)` | unlocked. returns timely full box or null; box/listing/cache agree |
| `vault.fetchBox(ifAbsent)` | *vault.getBox({ifAbsent, maxMillis=0})* |
| `box.fetch(ifAbsent)` | *<=> **vault.fetch* |
| `vault.putBox(patch, ifPresent=repl)` | Was unlocked. listing's box is timely&whole @ actual VaultDB stored record. OK: whisper sealed, stored |
| `vault.putBox(patch, ifPresent=fail)` | Was unlocked. listing's box is timely&whole @ actual VaultDB stored record. OK: whisper sealed, stored, box was absent |
| `vault.putBox(patch, ifPresent=get)` | Was unlocked. listing's box is timely&whole @ actual VaultDB stored record. OK: whisper sealed, stored, box was absent OR prior record fetched unchanged, whisper discarded |
| `box.send(patch)` | Was unlocked. listing's box is timely&whole @ actual VaultDB stored record. OK: whisper sealed, stored |
| `box.del()`, `vault.delBox()` | As `del=>listing.del`, or refuses |

### Vault

| Seam | Invariant, once it returns |
| --- | --- |
| `vault.ensureUnlocked()` | Was full. A`nswers no lease. With a lease in force, done. Else one cached, of this vault_tok and gate_epoch, is attached, nobody asked. Else asks through an unlock_vault gating: unlocked, a lease` in force at its attach. A gating open on this bank refuses `already_asking`. `locked_while_asking`: no lease held, none cached by this call |
| `vault.lock()=>boxListing.lock=>box.lock` | Reads locked, synchronously; no lease held; `tryUncacheLease` called after every put called; its children locked; its open gating settled, or its variable set under an attempt, unless it is a `del_vault`. Never throws: a refused `tryUncacheLease` panics after it returns, and a listener's throw goes to the platform |
| `vault.vacate()=>boxListing.vacate=>box.vacate` | `Locked; its children vacated and unlisted; every call refus`ed; nothing of it on this device; the vaultDB untouched. A vacate already done is a no-op. On a throw, its local objects still disabled |
| `vault.replacePassphrase()`, `addPasskey()`, `revokePasskey()` | Each launches its gating (see The runs); add checks the gate in hand before asking; a revoke with no passkey answers revoked, nobody asked. Whatever the watch delivers during the attempt refuses the put: a passkey revoked elsewhere is not brought back, and a passphrase replaced elsewhere is not overwritten. No other device is locked by it: its session lease runs to lock or next bank.tidy, its cached lease of the older epoch is forgotten next session |
| `vault.delVault()` | Launches a `del_vault` gating (see The runs) |
| `vault.fetch(ifAbsent)` | <=> `listing.fetch` |

### Gating

| Seam | Invariant, once it returns |
| --- | --- |
| `gating.checkStrength=>Proving.checkStrength` | verdict on the passphrase; nothing changes |
| `gating.attempt({ passphraseClear, passkeyClear? })` or `({ passkeyClear })` or `({ antePassphraseClear, nextPassphraseClear })` | the one door for a cleartext. OK: the verb done, the dialog may close. Correctable: still open. One running already: refuses `attempt_in_flight`, nothing queued. Landed already: refuses `gating_landed` |
| `gating.decline()` | with no attempt under way, settled declined and the verb refuses declined. An attempt under way runs on, and its outcome settles the gating. A default only: we have no opinion on this crossing, so the implementer takes whatever is cleanest to reason about |
| `gating.whenSettled` | a promise a dialog closes on; the package cannot close a host's dialog |
| `gating.isOpen`, `kind`, `passkeyHeader`, `toJSON` | reads; passkeyHeader is the gate in hand's at launch |

### Bank

| Seam | Invariant, once it returns |
| --- | --- |
| `bank.hello()` | a forced reset; a host may call it again, on its own timer. ready: plugins loaded, device record kept, `getBank`'s vaults and tombstones listed, subscribed to the VaultDB; tidied. Refused: the bank is not ready |
| `bank.lock()=>vault.lock`, each | every listed vault locked; the bank unchanged. A `lock does nothing to a birth's open gating` |
| `bank.vacate()=>vault.vacate`, each | every listed vault vacated; the bank unchanged, ready |
| `bank.tidy()` | every lease on this device past its autolock duration vacated, and its listed vault locked. Called by hello; a host may call it more often, on its own dime |
| `bank.sweep()=>vaultListing.sweep` | cleanup while the page lives. The Bank stays; its listing is swept: watch ended, timers stopped, lease keys dropped; cached leases and cache stay. The next hello builds a fresh listing and instances |
| `bank.ensureVault(bag)` | Was ready, or refuses with hello's own error. A vault listed for the bag is answered, nobody asked, locked unless the host unlocks it. Else asks through a `build_vault` gating (see The runs). A second call while asking refuses `already_asking` |
| `bank.vaultOf(bag)` | the listed vault or null; no fetch |
| `bank.snapshot`, `getSnapshot`, `subscribe` | reads; frozen snapshot, useSyncExternalStore shape |

