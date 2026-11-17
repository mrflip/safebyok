<!-- Exported 2026-10-22 from the contract doc, tab Primitives (https://claude.ai/artifact/J8ooBpFq7tyAAPFrxb3qRq#64b6b619-ee17), at rev 1574. The doc is the living copy; this file is the sprint's spec as issued. -->

# Primitives

The transactional primitives the vault is composed of, 2026-10-22, revised to the Coach's rules the same day. Brackets in a chain mark one parallel junction.

## The rules

- **Ground truth** is the stored lease in the pantry and all of the VaultDB. Everything on the Vault object is a picture of it. A write checks before it writes and succeeds transactionally; the picture is set after the write, from what the write returned, after a demand on it; then the snapshot swaps.
- **A thing ending in DB does exactly one thing**, transactionally: verify then read, or verify then modify and return what stands.
- **The world is always timely and consistent** between steps, and the one demand, `demandConsistentWith(thing)`, synchronous, insists on it rather than restoring it. Every thing carries the **stamp** it was made under, `{ ...scope, vault_tok, vault_epoch, gate_epoch }`, frozen; a box carries its `revision_tok` besides, which only the store checks, since a box write moves no epoch. The demand compares the thing's stamp to the vault's: the vault stands (`vault_gone`), the scope and `vault_tok` agree (`vault_remade`), the epochs agree (`gate_moved`). A proving compares its header against the gate's wayin at its slotlabel in place of the epochs, because its own chain moves them with `putGate` before `grantLease`, and it also asks that its gating still stands (`gating_landed`). A lease-bound thing adds the lease half: `vault.lease` stands and has not ended (`vault_locked`; a lease found ended is dropped as the expiry drops it). A primitive demands on what it was handed before its first junction and on what came back after each junction, so at least twice; the public method's `await ensureUnlocked()` is the one async ensure before it. What a write returned carries the picture's successor stamp, the epochs one up for a gate write and equal for a box write; it is taken into the picture even when a lock has landed, and the next primitive is the one that throws. A chain adds no demand between primitives: nothing awaits there, so nothing can change. The base a write was built on is the one state carried from earlier, and the store checks it too. A demand failure logs its kind and the call, never the thing's fields.
- **Each primitive has one async junction**, marked (!), unless a second is needed for transactionality or to keep a secret inside one method. Inside a primitive, throwing is fine.
- **Sensitive material stays inside Proving and Lease.** No method returns a vaultKey handle. What crosses a method boundary is an instance (a Proving, a Lease, a Gate, a Box, a Wayin) or a wrapped key as a string. Byte arrays are zeroed after use; a whisper's JSON string cannot be, and is not kept. `current === next` compares two strings the user typed into this tab, which no attacker observes, so it needs no constant time.
- **Three names for a record's parts**, VOCABULARY's: the **record** is the row storage holds, visible fields plus ciphertext plus format (`box.record`, `BoxRecord`, `LeaseRecord`, `VaultProps`); the **visible** fields are the unencrypted, authenticated ones, the sidecar among them, from which the **ctx** an encryption is bound to is rebuilt and never stored; the **view** is what the snapshot and `toJSON` show, the visible fields without the mechanics. `visible` is the name for what the Coach wrote as `ctxProps`.
- **Naming.** `of` is sync, for `thingOf` or where the thing is obvious. `Class.make(vault, record)` is the sync constructor facade. `seal` is the async making of a record from secrets, shaped `Class.seal(vault, props, cleartext)` with the cleartext on its own, last. Like for like gets a pair: `cipheredWith` / `decipherWith` on a lease turn serialized bytes into a ciphertext string bound to the visible fields and back; `wrappedWith` / `unwrap` on a proving do the same for a key. `extract` is for one thing becoming another: `box.extractWhisper()`. A method's name agrees with its arguments, which read largest to smallest. No `open`. **`current`** for the gate, proving or lease that stands at this instant.
- **Arguments read largest to smallest**: the vault, then the props as one object, then a cleartext on its own: `Box.seal(vault, { boxlabel, sidecar }, whisper)`, `PassphraseProving.seal(vault, { slotlabel }, passphrase)`.

## The mutexes

|  | what it is | who waits for whom | what your app sees |
| --- | --- | --- | --- |
| **Gating** | one at a time, per vault; they carry out the operation transactionally<br>• unlocking (generates lease) using given passphrase or passkey<br>• making a vault using a passphrase (and optional passkey)<br>• changing the passphrase (using the old one)<br>• changing or adding a passkey (using the passphrase)<br>• deleting the vault<br>These are the calls that write the gate and the lease, and they are rare | a second such call waits for the first to finish. Nothing else waits on them: not `hello`, not `lock()`, not a box read or write | pressing two  buttons at once runs them one after the other. Everything else is unaffected |
| **the refresh** | one fetch of storage at a time, per vault | a `hello` arriving while one is in flight shares its result; a `hello({ staleMinutes: 0 })` arriving then is satisfied by that same fetch: nothing starts a second | many hellos cost one round trip |
| **the dialog** | one gating at a time, per vault | every call that needs the vault unlocked waits on the same dialog; when it is answered, all of them proceed at once, in no particular order | one prompt, however many calls were waiting. If your app needs its calls in order, it awaits them in order |
| **birth** | one `ensureVault` per scope, in the bank | a second ask for the same scope while the first is in flight gets the same Vault | two components asking for one vault get one object |

`lock()` waits for nothing. A box read or write waits only for the dialog, when the vault is locked. The line is taken by a gating's attempt; `putGate`, `grantLease` and `delVault` run within that hold and never take it themselves.

Nothing blocks a refresh, and nothing needs to: a refresh that lands mid-chain either fetched the same `vault_tok` and `gate_epoch`, in which case every later demand still passes, or a different one, in which case the chain's next demand throws, which is right. Store-side, beneath the mutexes: the VaultDB's transactions with their expectations (`gate_epoch`, `vault_tok`, `revision_tok`), and the pantry applying one scope's calls in the order made.

## Proving

A Proving holds its vault, its slotlabel, the wayin header it derived under (the current wayin's visible fields, or a fresh header whose salt `seal` minted, its `device_id` from the bank's device record), the `vault_tok` and `gate_epoch` it was derived under, the gating that made it, and the wayinKey, non-extractable. Its demand throws `gating_landed` once that gating has settled, declined or been landed. Every junction in the rows below is followed by a demand, as the rule says; the rows name only the ones that matter to the order.

| primitive | does | returns |
| --- | --- | --- |
| `PassphraseProving.seal(vault, header, passphrase)`, `PasskeyProving.seal(vault, header, passkey)`; the header is the current wayin's visible fields, or `{ slotlabel }` alone for a fresh wayin | (!) derives the wayinKey under the header given: the current wayin's, to prove what stands, or a fresh one whose salt it mints. A passphrase goes through Argon2id; a passkey's answer carries the salt it was asked over | a Proving that has wrapped and unwrapped nothing |
| `vault.checkStrength(passphrase)` | (!) the host's strength policy, public (today's `checkPassphrase`), which a form calls for live feedback and a chain calls through its copy of the vault; beside `seal` in one parallel junction where a chain needs both | void; `weak_passphrase` |
| `proving.wrappedWith(key, visible)` | (!) wraps the key under the wayinKey, bound to the visible fields | a wrapped key, as a string |
| `proving.unwrap(wrapped, visible)` | (!) the inverse; `wrong_passphrase` or `wrong_passkey` when it will not; `demandConsistentWith(proving)` after. Private to the Proving: its result never leaves | a key handle, inside |
| `proving.checkWayin()` | `demandConsistentWith(proving)`; (!) unwraps the current wayin of its slotlabel and keeps nothing; `demandConsistentWith(proving)` after | void; `wrong_passphrase` or `wrong_passkey` |
| `passphraseProving.sealWayins(passkeyProving?)` | novel only. (!) generates a vaultKey, (!) `wrappedWith` it under its own header and, when given, the passkey proving's, in one method so the vaultKey never crosses; the vaultKey is not kept; `demandConsistentWith(proving)` after | the Wayins, one per proving |
| `currentProving.resealWayinFor(newProving)` | `demandConsistentWith(currentProving)`; (!) unwraps the vaultKey from the gate's wayin at its slotlabel, (!) `newProving.wrappedWith` it, bound to the new proving's header; the vaultKey is not kept; `demandConsistentWith(currentProving)` after, which is what refuses a passphrase another device has since replaced | a Wayin for the new proving's slotlabel |
| `proving.grantLease()` using its own wayin and vault | within an attempt's hold on the line<br>1. `demandConsistentWith(proving)`<br>2. (!) unwraps the vaultKey from its wayin<br>3. (!) makes a randomBytes leaseKey<br>4. (!) wraps the vaultKey under it<br>5. `demandConsistentWith(proving)`, with nothing awaited between it and the store: a lock or a decline landing before it throws here, one landing after it erases the lease behind it in the pantry's order<br>6. (!) `deviceDB.putLease` stores the record in one transaction<br>7. `demandConsistentWith(stored)`<br>8. `vault.lease` is set from what was stored and the expiry armed<br>9. `vault.replaceSnapshot()` | the Lease as stored |

A proving's demand compares its `vault_tok` and asks whether its wayin is in the current gate: the gate's wayin at its slotlabel carries the header the proving holds. It does not ask whether `gate_epoch` is unchanged: a chain moves the epoch with `putGate` and then grants the lease by the proving whose wayin survived, or by the new proving whose header the new gate now carries.

## Gate and Wayin

A Gate is a frozen value over a group of related ways in: its vault, its passphrase wayin, its passkey wayin or none, its `gate_epoch`, and the base epoch it was built on, one below its own. A Wayin is a frozen record: its header (the visible fields) and the wrapped vaultKey.

| primitive | does | returns |
| --- | --- | --- |
| `Wayin.make(vault, record)` | sync | a Wayin |
| `Gate.make(vault, { base, ...wayins })` | sync; `base` is the gate the chain captured at its start (none for a novel vault), whose epoch the new gate records as its base and exceeds by one; the wayins are the base's with the chain's changes | a Gate. A chain builds the next Gate from the current one's wayins |
| `vault.putGate(gate)` | within an attempt's hold on the line<br>1. `demandConsistentWith(gate)`: its base is the current gate<br>2. (!) `vaultDB.putVaultProps` expecting the `vault_tok` and the base epoch; stale as `gate_made_elsewhere` (from none) or `stale_write`; a tombstone meets no expectation but `delVault`'s<br>3. `demandConsistentWith(stored)`<br>4. `vault.gate` is set from what was stored<br>5. `replaceSnapshot()` | the Gate as stored |

## Lease

A Lease holds its vault, its `vault_tok` and `gate_epoch`, its leaseKey handle, its wrapped vaultKey and its deadline. A stored lease is usable as read: no unwrap at birth. The first call whose vaultKey will not unwrap names it `damaged_lease`, drops the lease as `lock()` drops it, and refuses; `hello` cannot cure that, a new proof can.

| primitive | does | returns |
| --- | --- | --- |
| `Lease.make(vault, record)` | sync; at birth and at the gating's pantry consult | a Lease |
| `lease.endsBy(instant)` | sync; the expiry's and the twilight's check | true past its deadline |
| `lease.cipheredWith(serialized, visible)` | `demandConsistentWith(lease)`; (!) unwraps the vaultKey (`damaged_lease` when it will not), makes a fresh boxKey, wraps it under the vaultKey, ciphers the bytes under the boxKey bound to the visible fields, as today; the byte arrays are zeroed; the vaultKey is not kept; `demandConsistentWith(lease)` after | `{ box_key_wrapped, whisper_ciphered }`, strings |
| `lease.decipherWith(ciphered, visible)` | `demandConsistentWith(lease)`; (!) the inverse: unwraps the vaultKey (`damaged_lease`), unwraps the boxKey and deciphers (`damaged_box` when it will not); `demandConsistentWith(lease)` after | the serialized bytes |
| `lease.sealProps(visible, { whisper: serialized })` | (!) `cipheredWith` on each named prop; the only junction | `{ ...visible, box_key_wrapped, whisper_ciphered }`, a record |
| `deviceDB.getLease(scope)`, `deviceDB.putLease(record)`, `deviceDB.delLease(scope)` | (!) one transaction each; the record carries its scope; one scope's calls land in the order made, an obligation the DeviceDB contract states and its conformance suite checks | the record or null; the record as stored (today it resolves void); void |

The lease's other operations live on their owners: `proving.grantLease()` makes one, `bank.ensureVault` and `vault.ensureUnlocked` take a stored one up, `vault.lock()` drops and erases it, and the expiry only drops it: a timer armed when a lease is granted or taken up, which sets `vault.lease` to null and swaps the snapshot, erasing nothing.

## Box

| primitive | does | returns |
| --- | --- | --- |
| `Box.make(vault, record)` | sync | a Box |
| `Box.seal(vault, { boxlabel, sidecar }, whisper)` | sync serializes the whisper; (!) `vault.lease.sealProps(visible, { whisper })`, the sidecar among the visible fields; `Box.make(vault, record)`. A box sealed from a box read carries that box's `revision_tok` as its base | a Box, not yet stored |
| `vault.sealAndPutBox({ boxlabel, sidecar? }, whisper?)`; `vault.putBox` is its public sugar | the props are a partial Box needing only `boxlabel`; the whisper is any JSON value. Sidecar or whisper omitted: (!) `vault.getBox(boxlabel)` first; the sidecar is the stored box's, else `{}`; the whisper is the stored box's, which (!) `box.extractWhisper()` opens, and none stored is `no_whisper`. `Box.seal(vault, { boxlabel, sidecar }, whisper)`, its base the box read; `demandConsistentWith(box)`; (!) `vaultDB.putBox` expecting the `vault_tok` and the base revision, the one the whisper and sidecar came from: that is what makes the copy safe to seal from; `demandConsistentWith(stored)`; the listing entry is set from what was stored; `replaceSnapshot()`. The listing stays summaries, without ciphertext | the Box as stored. A Box comes only from a put that succeeded or a read, and is immutable in between |
| `vault.getBox(boxlabel)` | `demandConsistentWith(lease)`; (!) `vaultDB.getBox`; `demandConsistentWith(fetched)`, the vault half: a box another device wrote is ground truth, not drift | a Box, or null |
| `vault.delBox(boxlabel)` | `demandConsistentWith(listed)`; (!) `vaultDB.delBox` expecting the `vault_tok` and the listed revision; `demandConsistentWith(tombstone)`; the listing entry is removed; `replaceSnapshot()` | the tombstone |
| `box.extractWhisper()` | `vault.lease.decipherWith(box.ciphered, box.visible)`, then deserialize | a Whisper |
| `vault.getWhisper(boxlabel)` | `getBox`; `box.extractWhisper()` | a Whisper, or null |
| `vault.useWhisper(boxlabel, callback)` | `getWhisper`; the callback with the whisper; the whisper is not kept | what the callback returned |

## Vault and bank

| primitive | does | returns |
| --- | --- | --- |
| `vault.refresh()` | joined; the VaultDB watch and the ring call it through the join. (!) `vaultDB.getVault` (props and listing, one transaction) beside `deviceDB.getLease`. Then, sync and not a demand, since taking up change is what a refresh is for: a fetched `vault_epoch` below the device record's highest is `vault_behind` and nothing is set; a picture older than the one in hand (same `vault_tok`, lower epoch: a late read of this tab's own write) is ignored, nothing set and nothing thrown; else the gate, listing and read time are set from what was fetched. The lease in memory is dropped when the stored one is absent or differs from it (a lock in another tab lands here), and dropped and erased when the `vault_tok` moved; none is taken up here; `replaceSnapshot()` | the Vault |
| `vault.hello({ staleMinutes })` | sync staleness check, then `refresh` | the Vault |
| `vault.ensureUnlocked({ renewMinutes? })` | sync: `vault.lease` stands and does not end within `renewMinutes` (0 when left out; the twilight): return. Else (!) `deviceDB.getLease(scope)`, taken up, the expiry armed, when its `vault_tok` and `gate_epoch` match the gate and its deadline stands; else joins the dialog's gating, raising `unlock_vault` (`initialize_gate` when novel) when none stands, and awaits its settle | this, unlocked; the gating's refusal when it declined or threw |
| `vault.lock()` | sync: the lease set to null, the expiry disarmed, the gating landed, `replaceSnapshot()`; (!) `deviceDB.delLease` | the erase's promise; everything observable has happened before it is returned |
| `vault.del()` | raises `del_vault` and awaits its settle: deleting a vault is proven like any change to it | void |
| `vault.putWayin(slotlabel)` | raises the gating and awaits its settle: `initialize_gate` when the vault is novel, else `change_passphrase` for the passphrase slot or `put_passkey` for the passkey slot | the Vault |
| `vault.delWayin(slotlabel)` | raises `del_passkey` and awaits its settle; the passphrase slot refuses at once as `passphrase_required`: a vault keeps its passphrase wayin | the Vault |
| `bank.ensureVault(draft)` | the scope's entry. (!) `vaultDB.ensureVault` beside `deviceDB.getLease` and the device record; a fetched `vault_epoch` below the record's highest is `vault_behind`; the lease taken up, the expiry armed, when its `vault_tok` and `gate_epoch` match and its deadline stands | a Vault |

**`vault_epoch`** is a counter on the vault, bumped by the store on every gate write and on `delVault`, carried by the tombstone into the next life. The bank's device record remembers the highest seen per scope; birth and refresh refuse a picture below it as `vault_behind`, and `bank.clearCachedVault(scope)` is the way out. **Store verbs** the sprint adds or changes, each across every adapter and its conformance suite: `vaultDB.getVault(scope)` (props and listing in one read), `vaultDB.ensureVault(draft)`, `vaultDB.putVaultProps(props, expected)` resolving the stored props, `vaultDB.delVault(scope, expected)` leaving the tombstone, `deviceDB.putLease(record)` resolving the record as stored, and the DeviceDB's per-scope ordering.

## Gating

A gating owns its chain, by the rule that whoever touches a secret owns it: it is where the cleartext becomes a proving, so it is where the provings make the gate. The vault offers it `putGate` and knows nothing of passphrases or passkeys; the provings do the cryptography. A gating is a discriminated union on `gatingkind`, one shape per kind, each carrying its one typed attempt beside `decline` and `lockLanded`. It is raised by `ensureUnlocked` (`unlock_vault`, or `initialize_gate` when the vault is novel), by `putWayin` and by `delWayin`, and handed to the host through the bank's `requestCleartext` callback; one gating stands per vault, and a call that needs one while it stands joins it. An attempt holds the dialog's slot (a second attempt while one runs is `attempt_in_flight`), runs the chain below, and settles the gating with the result or the throw, except that a refusal the user can correct (`wrong_passphrase`, `wrong_passkey`, `weak_passphrase`, `same_passphrase`) returns to the dialog and leaves the gating open. An attempt whose state no longer fits its kind, a gate made elsewhere while the user typed a first passphrase, settles with `gate_made_elsewhere`. Each chain is a straight line, branching only on the state in hand at its start, which it captures as the base its gate is built on; a demand sits inside every primitive, so none is written between them. Brackets mark one parallel junction.

| gatingkind | attempt | chain |
| --- | --- | --- |
| `initialize_gate`, novel only | `attempt(passphrase, passkey?)` | sync: a gate already standing is `vault_not_novel`. `[vault.checkStrength(passphrase), passphraseProving = PassphraseProving.seal(vault, { slotlabel }, passphrase), passkeyProving = PasskeyProving.seal(vault, { slotlabel }, passkey)]`, the last when given; `passphraseProving.sealWayins(passkeyProving)`; `Gate.make` with those wayins at epoch 1; `vault.putGate`; `passphraseProving.grantLease()` |
| `unlock_vault` | `attemptPassphrase(passphrase)`, `attemptPasskey(passkey)` | `proving = PassphraseProving.seal(vault, passphraseWayin.header, passphrase)` or `PasskeyProving.seal(vault, passkeyWayin.header, passkey)`, the gate's wayin of that slot; `proving.grantLease()` |
| `change_passphrase` | `attempt(current, next)` | sync: `current === next` is `same_passphrase`, before any junction. `[currentProving = PassphraseProving.seal(vault, passphraseWayin.header, current), newProving = PassphraseProving.seal(vault, { slotlabel }, next), vault.checkStrength(next)]`; `currentProving.resealWayinFor(newProving)`; `Gate.make` with the new passphrase wayin and no passkey, as today, at epoch + 1; `vault.putGate`; `newProving.grantLease()` |
| `put_passkey`, add or replace | `attempt(passphrase, passkey)` | `[passphraseProving = PassphraseProving.seal(vault, passphraseWayin.header, passphrase), passkeyProving = PasskeyProving.seal(vault, { slotlabel }, passkey)]`; `passphraseProving.resealWayinFor(passkeyProving)`; `Gate.make` with the passkey wayin at epoch + 1; `vault.putGate`; `passphraseProving.grantLease()` |
| `del_passkey` | `attempt(passphrase)` | sync: no passkey wayin is `absent_wayin`, as today. `proving = PassphraseProving.seal(vault, passphraseWayin.header, passphrase)`; `proving.checkWayin()`; `Gate.make` without the passkey at epoch + 1; `vault.putGate`; `proving.grantLease()`. The passphrase proves it: the passkey's wayin is the one leaving, and the lease is granted by a wayin that stays |
| `del_vault` | `attempt(passphrase)` | `proving = PassphraseProving.seal(vault, passphraseWayin.header, passphrase)`; `proving.checkWayin()`; within the hold: `demandConsistentWith(proving)`; (!) `vaultDB.delVault` expecting the `vault_tok`, leaving the tombstone with its `vault_epoch`; then `lock()`. The Vault is gone: every later demand throws `vault_gone` |

## The external interface

On `Vault`: `hello`, `refresh`, `ensureUnlocked`, `lock`, `checkStrength`, `getBox`, `getWhisper`, `useWhisper`, `putBox({ boxlabel, sidecar? }, whisper?)`, `delBox`, `putWayin(slotlabel)`, `delWayin(slotlabel)`, `del`, `unlocked`, `demandConsistentWith`, the snapshot pair and the getters. On a gating: `gatingkind`, the kind's typed attempt, `decline`, `lockLanded`. On `Box`: `extractWhisper`. Everything else in the tables is the composition inside; `putWayin`, `delWayin` and `del` only raise a gating whose attempt takes the proof and runs the chain.

**Try pairs.** Each public method is a pair: `putBox` throws its refusal, carrying its `kind`; `tryPutBox` returns an `Outcome`. A method named `try` always returns an `Outcome`; one whose result makes no sense as an outcome is renamed. A private function is either half or both. Where both exist, the doc block lives on the throwing one and the `try` one refers to it. The implementation lives on whichever half is easier to write; `valOf` or a plain try/catch derives the other. A method whose Outcome carries meta is implemented on the `try` side.

**Kinds this tab adds**, each named for what was observed and each owed a Contract entry: `vault_gone`, `vault_remade`, `gate_moved`, `box_moved`, `gating_landed`, `vault_locked`, `damaged_lease`, `vault_behind`, `vault_not_novel`, `attempt_in_flight`, `passphrase_required`, `same_passphrase`, `no_whisper`; `gate_made_elsewhere` replaces `created_elsewhere`. The sprint amends VOCABULARY to match: proving for proof, `vault_tok` for `vaultId` with the `_tok` rule reading "changes on every life", gate and gating defined, and the test helper `TH.makeGate` renamed out of the way.

## Races the contract tests own

Each is a single-concern test through the public surface, with two Vault objects where two devices are needed. The window between a cryptographic junction and its store call is empty by construction, the demand sitting immediately before the call, so a test holds only what is injectable today: the store verbs, the key deriver, the strength checker and the clock.

- A whisper-omitted `putBox` racing another device's write to the same box: hold `putBox`, write from the second Vault; expect `stale_write`, the other whisper kept.
- A gate change racing another device's gate change: hold `putVaultProps`, change the gate from the second Vault; expect `gate_moved`, the other change kept.
- A superseded passphrase proving a change: change the passphrase from the second Vault, then `putWayin('passkey')` here with the old one; expect `gate_moved` after the reseal.
- `lock()` and `decline` during `grantLease`: hold the key deriver, lock or decline; expect `gating_landed` and no lease in the pantry.
- A stale device writing a vault made anew: `del()` and remake from the second Vault, write the gate here; expect `vault_remade`, the new vault's boxes untouched.
- A renewal or passkey change during a box write in flight: hold `putBox`, renew; expect the write to succeed.
- A write that lands and then a lock: hold `putVaultProps` on its way back, lock; expect the picture at the new gate and the chain refusing `gating_landed`.
- A late read of this tab's own write: hold `getVault`, write the gate; expect the picture unchanged and nothing thrown.

## Composition

A public method on boxes and whispers is `await ensureUnlocked()`, then one named operation from the tables, then return. It adds no demand of its own, never catches, never branches after its first step, and never calls `refresh`. `hello`, `refresh`, `lock` and `ensureUnlocked` itself are their rows above; `putWayin`, `delWayin` and `del` are proven by their gating's attempt, which takes the proof, not by an unlock first. A method's `try` half is the method under one try/catch, or the method is `valOf` of its `try` half: never a second implementation.
