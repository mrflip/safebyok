# primitives: the preplan

What the vault's code must do when the primitives sprint is done, in one document meant to be
enough. `primitives.md` is the spec of each primitive (every demand, junction and refusal) and
wins on what a primitive does; `primitives-plan.md` says which thread builds what and wins on
scope and order; `primitives-progress.md` wins over both once a thread has found something.

**How to read the folder.** This preplan is meant to be enough. The other files are searched by
section, not read through: `grep -n '^## ' <file>` lists a file's sections, and `sed -n
'<from>,<to>p'` reads one. The sections worth knowing exist:

* `primitives.md`: *The rules*, *The mutexes*, then one table per class (*Proving*, *Gate and
  Wayin*, *Lease*, *Box*, *Vault and bank*), *Gating* (the chains), *The external interface*,
  *Races the contract tests own*, *Composition*. The per-primitive detail (every demand, every
  junction, every refusal) is there and is not repeated here.
* `revised-outcomes.md`: *Lock* (the order of `lock()`, and what each call under way does when a
  lock lands), *Tests* (the deterministic-order tests).
* `whiteboard/20261021-streamline/streamline-progress.md`: *What the threads found* for threads 1
  (renames) and 2 (get_vault), the base this sprint builds on; `streamline-plan.md`'s thread
  glosses for the files each area touches.
* `whiteboard/20261021-better_paths/better_paths-plan.md`: *Libraries* and *Later, not here*.
  Its *Turns* section and everything built on a queue do not apply (see *Not in this design*).
* The sprint doc (https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4): *Open Matters* for what
  is unruled; its *Resolved* tab is history except on tombstones and `vault_epoch`.

## What the base has

The line starts at the tip of the restacked [#243](https://github.com/mrflip/safebyok/pull/243),
[#244](https://github.com/mrflip/safebyok/pull/244) and
[#246](https://github.com/mrflip/safebyok/pull/246), left open for the sprint to build on.
[#245](https://github.com/mrflip/safebyok/pull/245) is not in the line.

* From trust_lines and fault_kinds (merged): `vault_key_epoch` gone; the vaultKey held only by an
  opened `Lease`; Box, Wayin and Lease holding their stored record once and taking the vault they
  are of; a way in's ctx binding scope and `vault_tok`; a stored record that fails its checks is
  `damaged_box` or `damaged_vault`; `corrupt_record` only for an adapter's answer in the wrong
  shape; `getWhisper()` refuses `damaged_box` at once.
* From #243: `unlock_epoch` is `gate_epoch`, `vault_id` is `vault_tok`, everywhere, with the
  camelCase and wire forms; ctx bytes unchanged.
* From #244: `vaultDB.getVault(scope)` and `vaultDB.ensureVault(scope, draft)` resolve
  `{ vaultProps, boxes }` from one consistent read; `VaultProps` is gated or gateless (a union;
  `isGated` narrows); a stale `putVaultProps` carries the winner in `meta.vault_props_stored`;
  the vault strips that meta at its surface. Interim code for the sprint to replace: gateless
  props read as `absent`, and a first unlock over gateless props made elsewhere refuses
  `created_elsewhere`.
* From #246: over GraphQL, what a write's answer carries travels in the response body, never in
  error extensions.
* Still in, and out by this preplan: `#refreshOnStale`, `#catchUp`, `#refuseCreatedElsewhere`'s
  re-read, every `#refresh()` inside a call, every after-wait `#checkUnlocked()`, every
  `AbortController`, `#greeting`, `#greeted`, `#forgetHello`, `#takeUp`, `#createsStandDown`,
  every `isOvertaken`-shaped predicate, the device mark and `rolled_back`, `lease_ending`,
  `carry_on` and the renew path, Ask's `#over` and `#landed` controllers, `Vault.make` and the
  first-hello memo, `opening`, `UnreadVaultProps`, `currentVaultProps`, `close()` and
  `vault_closed`, `syncing`, `Lease.grant`, `wrapBoxKey`, `unwrapBoxKey`, `planSeal`,
  `sealPlanned`, Box's and Wayin's `tryOpen`, `open` and `seal`, `VaultKeyPair`, `wayinKeyFor`,
  `checkPassphrase` (renamed) and `decryptWhisper` (moved).

## The rules

1. **No back-compat, no migrations, no format bumps.** A stored field that is renamed or
   reshaped changes in place under the format string its record carries today. An old record
   fails validation and fails safe (absent, or damaged), and each changeset says what a host
   will see.
2. **Ground truth** is the stored lease in the pantry and all of the VaultDB. Everything on the
   Vault object is a picture of it. A write checks before it writes and succeeds
   transactionally; the picture is set after the write, from what the write returned, after a
   demand on it; then the snapshot swaps.
3. **The demand model.** Sync calls guarantee the world is consistent. Before every async
   junction and before every return, demand consistency. No check that an operation's start
   matches its end, only at each step. Every operation on ground truth is one store
   transaction with an expectation. The primitives compose stronger guarantees. Throw whenever
   things disagree: nothing in the core catches, reconciles, refreshes, re-reads, retries or
   falls back. The one demand is the synchronous `demandConsistentWith(thing)`; what it asks is
   under *The stamp and the demand*.
4. **One junction per primitive**, marked (!) in `primitives.md`, unless a second is needed for
   transactionality or to keep a secret inside one method. Inside a primitive, throwing is fine.
   A chain of primitives adds no demand between them: nothing awaits there.
5. **Crypto gravity.** Everything that smells of a secret, or of key and wrap, lives in Proving
   or Lease, even at the price of feature envy. No method returns a vaultKey handle; what
   crosses a method boundary is an instance (a Proving, a Lease, a Gate, a Box, a Wayin) or a
   wrapped key as a string. Whoever touches a secret owns the operation: the gating owns its
   chain, the provings do the cryptography, the vault offers `putGate` and knows nothing of
   passphrases or passkeys. Byte arrays are zeroed after use; a JSON string cannot be, and is
   not kept. Never store a passphrase, wrapped or not: the lease is the stored capability.
6. **Hello defines timely.** "Timely" is hello's word and nobody else's: the picture was read
   within `staleMinutes`, or it is read now. A call's precondition is hello; a call that needs
   more asks `hello({ staleMinutes: 0 })`, and that is the only knob. No call reads on its own,
   re-reads after a prompt, or re-checks the lock after its work.
7. **Four mutexes and no other mechanism**: the gating line, the refresh join, the dialog, and
   birth (*The mutexes*). No `p-limit`, no turn queue, no abort controller, no wait state, flag,
   signal, counter, era, re-read, re-check, retry or fallback. `oneAtATime` stays, for the
   refresh. `lockLanded` stays as a promise the dialog awaits. When tempted to add a guard after
   an await, name the thing in hand and demand on it.
8. **Flag races; never solve them with a mechanism.** A scenario that seems to need more than
   the demand and a store's expectation is written up as the scenario and what the user would
   see, in the PR's open questions and `primitives-toldjaso.md`, and nothing is built. What is
   wrong in the field is reported and fixed from both ends later.
9. **Validate once, at the door.** A call's arguments at its entry point, a stored record in its
   class's `make`, the app's answer where it is heard. Past the door a value is what its type
   says: no second check, no defensive branch, no impossible case handled for completeness.
   A record vouches for itself: validated, frozen, and where it carries a secret, bound by its
   ctx.
10. **Name the operation.** A name says which operation is meant, never a generic read or write
    (CLAUDE.md, [#247](https://github.com/mrflip/safebyok/pull/247)). The naming conventions are
    under *Names*.
11. **Try pairs.** Every public method is `x` (throws its refusal, carrying its `kind`) and
    `tryX` (returns an `Outcome`). The doc block lives on the throwing one and the `try` one
    refers to it; the implementation goes on whichever half is easier to write, and `valOf` or
    one try/catch derives the other; a method whose Outcome carries meta is implemented on the
    `try` side. A method named `try` that makes no sense as an outcome is renamed. VaultDB
    adapters keep returning `Outcome`; the core's wrapper offers both halves.
12. **Refusal kinds are granular and specific**, named for what was observed, in the user's
    language for a condition and the customer's for a misuse that will be caught. A new kind
    over a stretched one. Each goes in the Contract (*Names*, the list).
13. **The bank refuses to open without its parts.** The deriver, the strength checker and the
    device store load and answer at `bank.hello()`; one that fails refuses the hello, no vault is
    born, and the host shows it. Nothing loads lazily at first use.
14. **Stores live on the Vault.** `vault.vaultDB` and `vault.deviceDB` are the Vault's own, given
    at birth; the bank holds the defaults.
15. **Library first.** A hand-roll a thread touches is replaced in that thread by a library where
    one fits, with the Coach's yes for a new dependency; thread 11 sweeps the rest (*Libraries*).
16. **Fluid design, no feature jealousy.** Where a method lives in `primitives.md` is a guess the
    Coach flips once the code is seen. Build it as written and say in the PR where it fought you.
17. **Call out, don't route around.** A rule that looks wrong for the case at hand is said so in
    chat and the PR, with the case; and a directive that would remove a guarantee a caller
    relies on stops that part of the thread.

## The cast

| Class | Lifetime | Owns | Secret held |
|---|---|---|---|
| `Bank` | the app | the shared libraries (key deriver, strength checker), logger, clock, limits, the default vaultDB and deviceDB, the device record; one Vault per scope and its lifecycle | none |
| `Vault` | from its birth of one read until the bank lets it go | one stored vault as a picture: its stamp, gate, listing, capacity, lease, read time; its vaultDB and deviceDB; the four mutexes | none (the Lease's) |
| `Proving` | one gating | one entered secret, turned into a non-extractable wayinKey at once; its header, stamp and gating; wraps and unwraps the vaultKey, seals and reseals wayins, checks a wayin, grants a lease | its wayinKey |
| a gating | one dialog | a discriminated union on `gatingkind`, one shape per kind, with its typed attempt, `decline`, `lockLanded`; the attempt holds the dialog's slot and runs the kind's chain | its provings, until it settles |
| `Wayin` | durable (VaultDB) | one stored way in: its header (the visible fields) and the wrapped vaultKey; record only | none (the wrap) |
| `Gate` | durable (VaultDB) | a frozen value over one identity's ways in: the passphrase wayin, the passkey wayin or none, `gate_epoch`, the base epoch it was built on | none |
| `Lease` | durable (pantry) | its stamp, the leaseKey handle, the vaultKey wrapped under it, its deadline; ciphers and deciphers under the vaultKey | leaseKey, the vaultKey while a call uses it |
| `Box` | durable (VaultDB) | its record: visible fields (the sidecar among them), ciphertext, format; the base revision it was sealed from | none |
| the device record | durable (pantry) | per scope: `device_id`, the highest `vault_epoch` seen | none |
| a tombstone | durable (VaultDB) | what `delVault` leaves: the scope and `vault_epoch` | none |

The **pantry** is the part of this device's store that holds what the vault may use but never
see: the lease and the device record. The **stamp** is `{ ...scope, vault_tok, vault_epoch,
gate_epoch }`, carried frozen by every thing the vault hands out.

## Names

**Tokens and epochs.** The scope (`applabel`, `user_id`, `vaultlabel`) is the vault's identity.
`vault_tok` is minted at each birth of a vault for the scope and tells one life from the next:
bound into every box, wayin and lease, compared in every expectation, never what anything is
found by. `gate_epoch` moves on every addition, removal or change of a wayin and is what voids
every other device's lease. `vault_epoch` is a counter on the vault, bumped by the store on every
gate write and on `delVault`, carried by the tombstone into the next life; the device record
remembers the highest seen. A box's `revision_tok` turns on each write of the box. VOCABULARY's
`_tok` rule reads "changes on every life".

**The conventions.** `of` is sync, for `thingOf` or where the thing is obvious.
`Class.make(vault, record)` is the sync constructor facade. `Class.seal(vault, props, cleartext)`
is the async making of a record from a secret, the cleartext on its own, last, arguments
reading largest to smallest. Like for like gets a pair: `cipheredWith` / `decipherWith` on a
lease (bytes to ciphertext string and back), `wrappedWith` / `unwrap` on a proving (a key);
`extract` is for one thing becoming another (`box.extractWhisper()`). `current` for the gate,
proving or lease that stands at this instant. No `open`. `slotlabel` names a slot as a string.
A record carries its scope: `deviceDB.putLease(record)`. Stored fields are underbar_case,
everything else camelCase; `kind`, `label` and `bag` smush (`gatingkind`, `boxlabel`).

**Three names for a record's parts.** The **record** is the row storage holds, visible fields
plus ciphertext plus format (`BoxRecord`, `LeaseRecord`, `VaultProps`); the **visible** fields
are the unencrypted, authenticated ones, the sidecar among them, from which the **ctx** an
encryption is bound to is rebuilt and never stored; the **view** is what the snapshot and
`toJSON` show, the visible fields without the mechanics.

**The classes and kinds.** `Bank`, `Vault`, `Gate`, `Wayin`, `Lease`, `Box`, `Proving` with
`PassphraseProving` and `PasskeyProving`; a gating with `gatingkind` in `initialize_gate`,
`unlock_vault`, `change_passphrase`, `put_passkey`, `del_passkey`, `del_vault`. The app's dialog
callback is `requestCleartext` (host and guarded). A Vault the bank has let go is `vault_gone`.

**State words**, each defined once in VOCABULARY: a Vault is **novel** (no gate), **locked** or
**unlocked**, and once let go **gone**; its freshness is **timely**, **aged** or **refused**
(`freshness`, not `syncing`). The bank is made, starting, timely or refused; a scope's entry
starting, timely or refused.

**Refusal kinds this sprint adds**, each owed a Contract entry: `vault_gone`, `vault_remade`,
`gate_moved`, `box_moved`, `gating_landed`, `vault_locked`, `damaged_lease`, `vault_behind`,
`vault_not_novel`, `attempt_in_flight`, `passphrase_required`, `same_passphrase`, `no_whisper`,
`stale_refresh` is not one (a late read is ignored, not thrown); `gate_made_elsewhere` replaces
`created_elsewhere`; `absent_wayin`, `weak_passphrase`, `wrong_passphrase`, `wrong_passkey`,
`stale_write`, `damaged_box`, `damaged_vault` stay.

**Retired names**, for `notes/old_vocabulary.md`: Proof, Ask, AskWhy, ProofAnswer, getProof,
unlock_epoch, vault_id, lease_ending, carry_on, the device mark, rolled back, vault_closed,
opening, checkPassphrase, decryptWhisper, turn, demandUnlocked, demandGating, ensureLease.

## The stamp and the demand

Every thing the vault hands out carries the stamp it was made under, frozen; a box carries its
`revision_tok` besides, which only the store checks, since a box write moves no epoch.
`demandConsistentWith(thing)`, synchronous, compares the thing's stamp to the vault's and throws
on the first disagreement:

* the vault stands: `vault_gone`;
* the scope and `vault_tok` agree: `vault_remade`;
* the epochs agree: `gate_moved`; except that a **proving** compares its header against the
  gate's wayin at its slotlabel in place of the epochs, because its own chain moves them with
  `putGate` before `grantLease`, and it also asks that its gating still stands: `gating_landed`;
* for a lease-bound thing, `vault.lease` stands and has not ended: `vault_locked`; a lease found
  ended is dropped as the expiry drops it.

A primitive demands on what it was handed before its first junction and on what came back after
each junction, so at least twice; the public method's `await ensureUnlocked()` is the one async
ensure before it. What a write returned carries the picture's successor stamp, the epochs one up
for a gate write and equal for a box write; it is taken into the picture even when a lock has
landed, and the next primitive is the one that throws. The base a write was built on (a gate's base epoch, a box's base revision) is the one
state carried from earlier, and the store checks it too. A demand failure logs its kind and the
call, never the thing's fields.

## Birth

* `Bank.make(opts)` is synchronous and touches nothing: **made**.
* `bank.hello()` loads the deriver and the strength checker and answers the default device
  store, once: **starting**, then **timely**; **refused** with a retry if any fails, and no vault
  is born until it succeeds. Idempotent.
* `bank.ensureVault(draft)` births the Vault for the draft's scope, under the birth mutex: in
  parallel, `vaultDB.ensureVault(draft)` (fetch the props and listing, or create the props from
  the gateless draft in one transaction; over a tombstone, a new life with a fresh `vault_tok`
  and `vault_epoch` carried on) and the pantry's lease and device record. Then one synchronous
  judgment: a fetched `vault_epoch` below the device record's highest is `vault_behind`
  (`bank.clearCachedVault(scope)` is the way out); the lease is taken up, and the expiry armed,
  when its `vault_tok` and `gate_epoch` match the gate and its deadline stands, else discarded
  and erased; no gate is novel. The entry is **starting**, then **timely** holding the Vault, or
  **refused** with a retry.
* A **novel** Vault has its `vault_tok` and `registered_at`, a presence in the VaultDB and the
  pantry, and no gate. Its first `ensureUnlocked()` raises `initialize_gate`. Two devices
  ensuring the same new scope get one `vault_tok`; the first to write a gate wins by the
  expectation and the other's attempt refuses `gate_made_elsewhere`.
* On a Vault nothing is optional but by meaning: `gate` is empty while novel, `lease` is null
  unless unlocked, `gate.passkey` is null by policy, `trouble` null when none.
* `bank.reopenVault(scope)` lets the Vault go and ensures the scope anew. `bank.closeVault(scope)`
  lets it go: no lock, no erase, the lease stays. `bank.closeVaults()` at sign-out. A Vault let go
  is **gone**: every call on it refuses `vault_gone`. A vault deleted elsewhere comes back novel
  on a device still open, through the tombstone's new life.
* The bank's snapshot, for `useSyncExternalStore`: `{ status, err?, vaults: { [scopeKey]: {
  status, vault?, err? } } }`, each entry frozen and kept until it changes.
* `safebyok-react`: `<BankProvider bank={bank}>` made once at module level, `useBank()`, and
  `useVault(vaultlabel)` for the signed-in user; `openError` and `retryOpen` go, the entry
  carries the refusal and the retry.
* The device store is a precondition of the bank: one the browser withholds (`storage_blocked`)
  refuses `bank.hello()`.

**A Vault's birth**, from one read of storage and the pantry together:

| # | storage holds | pantry holds | the read judges | born as |
|---|---|---|---|---|
| V1 | no vault, or a tombstone | nothing, or a lease of a life that is gone (erased) | gateless props are created, the counter carried on past a tombstone | `novel` |
| V2 | a vault | nothing | | `locked` |
| V3 | a vault | a lease of that `vault_tok` and `gate_epoch`, not ended | taken up, the expiry armed | `unlocked` |
| V4 | a vault | a lease ended, at another epoch, or of another `vault_tok` | discarded and erased | `locked` |
| V5 | a vault whose `vault_epoch` is below the device record's highest | anything | refused `vault_behind`; nothing born | the entry `refused` |

## The states

| axis | word | meaning |
|---|---|---|
| state | `novel` | `gate_epoch` 0: no way in yet; the first `ensureUnlocked` makes the gate |
| state | `unlocked` | `vault.lease` stands and has not ended |
| state | `locked` | otherwise |
| freshness | `timely` | the last refresh succeeded within `staleMillis` |
| freshness | `aged` | the last refresh succeeded, `staleMillis` ago or more |
| freshness | `refused` | the last refresh failed; `trouble` says why |

The snapshot is rebuilt only by `replaceSnapshot()`, synchronous: it rebuilds the immutable
snapshot from the fields and, if it changed, swaps it and calls the listeners, which run
synchronously and may call back in. `unlocked` reads from the lease in hand; a lease found ended
by a demand is dropped then. Not in the snapshot: gone, and a gating up (the host hears those
through `requestCleartext` and the bank's entry).

## The mutexes

| | what it is | who waits for whom | what the app sees |
|---|---|---|---|
| **the gating line** | one at a time, per vault: unlocking, initializing a gate, changing the passphrase, putting or deleting a passkey, deleting the vault. The calls that write the gate and the lease; rare | a second such call waits for the first. Nothing else waits on them: not `hello`, not `lock()`, not a box read or write | two buttons pressed at once run one after the other |
| **the refresh** | one fetch of storage at a time, per vault (`oneAtATime`) | a `hello` at any staleness arriving while one is in flight is satisfied by that fetch; nothing starts a second | many hellos cost one round trip |
| **the dialog** | one gating at a time, per vault | every call that needs the vault unlocked waits on the same dialog; when it is answered, all proceed at once, in no order | one prompt, however many calls were waiting |
| **birth** | one `ensureVault` per scope, in the bank | a second ask for the scope while the first is in flight gets the same Vault | two components asking for one vault get one object |

The line and the dialog are one hold: a gating's attempt takes it, runs its chain inside it, and
`putGate`, `grantLease` and `delVault` run within that hold and never take it themselves.
`lock()` waits for nothing. A box read or write waits only for the dialog, when the vault is
locked. Nothing blocks a refresh, and nothing needs to: a refresh that lands mid-chain either
fetched the same stamp, so every later demand passes, or a different one, so the chain's next
demand throws. Beneath the mutexes: the VaultDB's transactions with their expectations, and the
pantry applying one scope's calls in the order made.

## Each call

A public method on boxes and whispers is `await ensureUnlocked()`, then one named operation
from `primitives.md`'s tables, then return. It adds no demand of its own, never catches, never
branches after its first step, and never calls `refresh`. `hello`, `refresh`, `lock` and
`ensureUnlocked` itself are their own rows; `putWayin`, `delWayin` and `del` are proven by their
gating's attempt, which takes the proof, not by an unlock first.

* **`hello({ staleMinutes })`**: a synchronous staleness check, then `refresh()` or nothing.
* **`refresh()`**, joined; the VaultDB watch and the change bell's ring call it through the join.
  (!) `vaultDB.getVault` (props and listing, one transaction) beside `deviceDB.getLease`. Then,
  synchronously and not a demand, since taking up change is what a refresh is for: a fetched
  `vault_epoch` below the device record's highest is `vault_behind`, nothing set; a picture
  older than the one in hand (same `vault_tok`, lower epoch: a late read of this tab's own
  write) is ignored, nothing set and nothing thrown; else the gate, listing and read time are set
  from what was fetched. The lease in memory is dropped when the pantry's is absent or differs
  (a lock in another tab lands here), and dropped and erased when `vault_tok` moved; none is
  taken up here. `replaceSnapshot()`.
* **`ensureUnlocked({ renewMinutes? })`**: sync, `vault.lease` stands and does not end within
  `renewMinutes` (0 when left out; this is the twilight): return. Else (!) `deviceDB.getLease`,
  taken up and the expiry armed when its stamp matches the gate and its deadline stands; else
  join the dialog's gating, raising `unlock_vault` (`initialize_gate` when novel) when none
  stands, and await its settle. Resolves `this`, unlocked; the gating's refusal when it declined
  or threw.
* **`lock()`**, synchronous and waiting for nothing, in order: `vault.lease = null`; the expiry
  disarmed; the gating landed on, so its attempt throws `gating_landed` at its next demand and its
  waiters refuse `vault_locked`; `replaceSnapshot()`; then (!) `deviceDB.delLease`, whose promise
  it returns, everything observable having happened before. Gone lands on the gating the same way.
* **The expiry** is a timer armed when a lease is granted or taken up, firing at the deadline: it
  sets `vault.lease` to null and swaps the snapshot, erasing nothing (another tab may hold a
  renewed lease under the same scope) and landing on no gating (an attempt made in the twilight
  completes). `close` and `bank.closeVault` use the same memory-only drop.
* **Box calls** run free, under the lease in hand, with the store's expectation as the only
  arbiter: `getBox(boxlabel)` (async, (!) `vaultDB.getBox`, the fetched box demanded on the vault
  half only, since a box another device wrote is ground truth), `getWhisper`, `useWhisper(boxlabel,
  callback)`, `putBox({ boxlabel, sidecar? }, whisper?)` as sugar for `sealAndPutBox`, `delBox`.
  No order is promised among them, not across boxes, not between a get and a put, not for two
  calls on one label; a client that wants order awaits its own calls, and a stale write's message
  says "another call, here or on another device". A whisper-omitted `putBox` reads the box first
  (`getBox` then seal, expecting that box's revision); an app wanting to change only the sidecar
  does `getBox` then `putBox`, and the ergonomics improve after the sprint.
* **`putWayin(slotlabel)`** raises `initialize_gate` when novel, else `change_passphrase` for the
  passphrase slot or `put_passkey` for the passkey slot, and awaits its settle. **`delWayin(slotlabel)`**
  raises `del_passkey`; the passphrase slot refuses `passphrase_required` at once. **`del()`**
  raises `del_vault`. The app reaches a change only through the dialog it registered: it invokes
  the call, the gating is raised, the dialog's output becomes provings, and the attempt makes
  the change. No vault call takes cleartext, and the app never holds a proving.
* **`checkStrength(passphrase)`**, public, today's `checkPassphrase`: the host's strength policy,
  which a form calls for live feedback and a chain calls through its copy of the vault.

**Work under way when a lock lands** completes or throws by its own contract, which is not
uniform (`revised-outcomes.md`, *Lock*): `putBox` refuses
`vault_locked` when the lock lands before the seal and lands when it comes during the seal or
the write; `delBox` lands; `getBox`, `getWhisper` and `useWhisper` refuse `vault_locked` after
their read or open. A call that has not yet passed `ensureUnlocked()` does not commence: it
prompts. An attempt past its demand before `putLease` completes; one not yet there throws
`gating_landed` and stores nothing. A lease counts until a lock lands or a demand finds its
deadline passed; cancelling a gating declines that prompt and is not a lock.

## Gatings

A gating owns its chain, by the rule that whoever touches a secret owns it: it is where the
cleartext becomes a proving, so it is where the provings make the gate. It is a discriminated
union on `gatingkind`, one shape per kind, each carrying its one typed attempt beside `decline`
and `lockLanded`. One gating stands per vault; a call that needs one while it stands joins it.
It is raised by `ensureUnlocked`, `putWayin`, `delWayin` and `del`, and handed to the host through
the bank's `requestCleartext` callback: `hostRequestCleartext` as the app gave it,
`guardedRequestCleartext` ours around it, catching throws, one at a time. A naked client answers
the `requestCleartext` it registered; tests get a helper that does.

An attempt holds the dialog's slot (a second attempt while one runs is `attempt_in_flight`),
runs its kind's chain, and settles the gating with the result or the throw, except that a
refusal the user can correct (`wrong_passphrase`, `wrong_passkey`, `weak_passphrase`,
`same_passphrase`) returns to the dialog and leaves the gating open. An attempt whose state no
longer fits its kind (a gate made elsewhere while the user typed a first passphrase) settles
with `gate_made_elsewhere`. `decline` declines this prompt only: it never locks, never stands an
attempt down, and releases the waiters with `vault_locked`. A landed lock or gone settles the
gating so its attempt throws `gating_landed` at its next demand.

Each chain is a straight line, branching only on the state in hand at its start, which it
captures as the base its gate is built on; a demand sits inside every primitive, so none is
written between them. The kinds and their attempts, the chains spelled out in `primitives.md`,
*Gating*:

| gatingkind | attempt | in one line |
|---|---|---|
| `initialize_gate`, novel only | `attempt(passphrase, passkey?)` | strength check and seal the provings in one parallel junction; `sealWayins`; `Gate.make` at epoch 1; `putGate`; the passphrase proving grants |
| `unlock_vault` | `attemptPassphrase(passphrase)`, `attemptPasskey(passkey)` | seal the proving under the gate's wayin header; it grants |
| `change_passphrase` | `attempt(current, next)` | `current === next` is `same_passphrase` first; seal both and check strength in one junction; `resealWayinFor`; `Gate.make` with the new wayin and no passkey; `putGate`; the new proving grants |
| `put_passkey`, add or replace | `attempt(passphrase, passkey)` | seal both; `resealWayinFor`; `Gate.make` with the passkey; `putGate`; the passphrase proving grants |
| `del_passkey` | `attempt(passphrase)` | no passkey is `absent_wayin` first; seal; `checkWayin`; `Gate.make` without it; `putGate`; grants |
| `del_vault` | `attempt(passphrase)` | seal; `checkWayin`; within the hold, `delVault` expecting `vault_tok`; `lock()`; the Vault is gone |

A passphrase proving is sealed under the current wayin's header to prove what stands, or under
`{ slotlabel }` for a fresh wayin whose salt `seal` mints, the passphrase through Argon2id; a
passkey's answer carries the salt it was asked over, and the PRF answer is imported as a
non-extractable HKDF key at seal and its bytes zeroed. Only the standing passphrase proves a
change; a passphrase another device has since replaced is refused by the demand after the
reseal (`gate_moved`), never `wrong_passphrase`. `initialize_gate` takes an optional passkey
beside the passphrase in one gating; a create that comes back without the PRF answer is made
on the passphrase alone.

## The primitives, by class

The tables in `primitives.md` are the spec; this is the shape to hold in mind.

* **Proving**: `PassphraseProving.seal(vault, header, passphrase)` and
  `PasskeyProving.seal(vault, header, passkey)`, each subclass declaring its own static; a
  Proving holds its vault, slotlabel, header, stamp, gating and non-extractable wayinKey.
  `wrappedWith(key, visible)`, the private `unwrap`, `checkWayin()` (void), `sealWayins(passkeyProving?)`
  (novel only; one method so the vaultKey never crosses), `currentProving.resealWayinFor(newProving)`,
  `grantLease()` (within the hold: unwrap the vaultKey, make a leaseKey, wrap, demand with
  nothing awaited before `putLease`, demand the stored, set `vault.lease`, arm the expiry,
  `replaceSnapshot()`).
* **Gate and Wayin**: `Wayin.make(vault, record)`; `Gate.make(vault, { base, ...wayins })`
  recording the base epoch and exceeding it by one; `vault.putGate(gate)` within the hold,
  (!) `putVaultProps` expecting `vault_tok` and the base epoch (`gate_made_elsewhere` from none,
  else `stale_write`), the stored gate demanded and set, `replaceSnapshot()`. The gate's fields
  stay flat in the stored props; the policy is one passphrase, at most one passkey, passphrase
  first, the passphrase stays.
* **Lease**: `Lease.make(vault, record)`, `endsBy(instant)`, `cipheredWith(serialized, visible)`
  (a fresh boxKey wrapped under the vaultKey, the bytes ciphered under the boxKey bound to the
  visible fields: `{ box_key_wrapped, whisper_ciphered }`), `decipherWith(ciphered,
  visible)` (`damaged_lease` when the vaultKey will not unwrap, which drops the lease as `lock()`
  drops it; `damaged_box` when the box will not), `sealProps(visible, { whisper })`;
  `deviceDB.getLease(scope)`, `putLease(record)` resolving the record as stored,
  `delLease(scope)`, one scope's calls landing in the order made. A stored lease is usable as
  read: no unwrap at birth.
* **Box**: `Box.make(vault, record)`, `Box.seal(vault, { boxlabel, sidecar }, whisper)` with the
  sidecar bound into the ctx and server-side immutable, `box.extractWhisper()`; `vault.sealAndPutBox`
  (a partial Box needing only `boxlabel`, the whisper any JSON, (!) `putBox` expecting `vault_tok`
  and the base revision, the listing entry set from what was stored), `getBox`, `delBox`
  (expecting the listed revision; the tombstone demanded), `getWhisper`, `useWhisper`. A Box comes
  only from a put that succeeded or a read, and is immutable in between. The listing stays
  summaries without ciphertext.
* **Vault and bank**: `refresh`, `hello`, `ensureUnlocked`, `lock`, `del`, `putWayin`, `delWayin`,
  `bank.ensureVault(draft)`, as under *Each call*.

## The stores

**VaultDB.** Every verb does exactly one thing, transactionally: verify then read, or verify
then modify and return what stands. `getVault(scope)` (props and listing, one read);
`ensureVault(draft)` (fetch or create; over a tombstone a new life with the counter carried on);
`putVaultProps(props, expected)` expecting `{ vault_tok, gate_epoch }` and resolving the stored
props, the store bumping `vault_epoch`; `getBox`; `putBox` and `delBox` expecting `{ vault_tok,
revision_tok }` and resolving the stored record or the tombstone; `delVault(scope, expected)`
expecting `vault_tok`, leaving a tombstone holding the scope and `vault_epoch`, and bumping it;
`delDamagedVault` likewise. A tombstone meets no expectation but `delVault`'s. A stale write
carries the winner in its meta (`vault_props_stored`, `box_stored`), in the body over the wire.
Consistency between props and listing is the store's to check, in its transaction, reported as
`damaged_vault`; the core does not look for it. `getVaultProps`, `ensureVaultProps`, `listBoxes`
and their `do*` hooks go. Each adapter (local, IndexedDB, Postgres, Convex, GraphQL) and
`VAULTDB.md` and the conformance suite change together; a check an adapter cannot make is a TODO.

**DeviceDB (the pantry).** `getLease(scope)`, `putLease(record)` resolving the record as stored,
`delLease(scope)`; one scope's calls land in the order made, stated in the interface and checked
by the conformance suite (so `idb.ts`'s `getLease` must not delete a row it found unparseable
after a newer `putLease`). The device record, per scope: `{ format: 'safebyok-device-v1',
...scope, device_id, highest vault_epoch seen }`, minted at first need, written so a lower value
never replaces a higher one; every way in this device seals carries the `device_id`. The
README says a server that restores a backup must wipe the restored vaults, and a host deleting a
user's data signs them out first.

## The lifecycle

Three places hold information: the user (the passphrase, the passkey), the pantry (the lease,
the device record; readable by anyone with the device), and central storage (the gate, the
boxes, the tombstone; ciphertext and visible fields). Other devices, tabs and timers change two
of them at any moment. The refresh sees storage and the pantry together and judges them; the
user is asked only when the two cannot open the vault alone.

| # | happens | becomes |
|---|---|---|
| A1 | `ensureUnlocked` on `novel`: `initialize_gate`, the gate written at epoch 1 expecting none | `unlocked`, the gate made here |
| A2 | the same, but another device wrote the gate first | `gate_made_elsewhere`; the next refresh shows `locked` under that gate; the user unlocks with the passphrase chosen there |
| A3 | `unlock_vault` on `locked`: the proving's wayin opens, a lease is granted and stored | `unlocked` |
| A4 | a gate change: the standing passphrase proves, the gate is rewritten expecting its base, a lease regranted | `unlocked` under the new epoch; a stale write refuses with what won, nothing reread |
| A5 | `lock()` | `locked` at once; the lease erased after |
| A6 | the expiry at the deadline, or a demand finding it passed | `locked`; the lease stays in the pantry for the next grant to overwrite |
| A7 | a refresh: a box changed elsewhere | the listing replaced; state unchanged |
| A8 | a refresh: the gate's epoch moved up elsewhere | the gate replaced; the lease dropped when the pantry's differs |
| A9 | a refresh: the pantry's lease is gone (a lock in another tab) | `locked` |
| A10 | a refresh: another `vault_tok` (deleted and remade elsewhere) | the lease dropped and erased; the picture is the new life's, `novel` or `locked` |
| A11 | a refresh: the same `vault_tok` at a lower epoch (a late read of this tab's own write) | ignored |
| A12 | a refresh: `vault_epoch` below the device record's highest | `vault_behind`; nothing set; `clearCachedVault` is the way out |
| A13 | a refresh refused: storage unreachable, damaged props, newer format | as it was, freshness `refused`, `trouble` set |
| A14 | `del_vault`: the tombstone left, then `lock()` | **gone**; the next `ensureVault` lands `novel` past the tombstone |
| A15 | `bank.closeVault`, `reopenVault`, `closeVaults` | **gone**; the lease stays |

## Trust, checks and races

The code as it stands is paranoid, and an agent that reads it learns paranoia: a check after
every await, a second look at a record because it can be looked at again, a branch for a case
the door already refused. Each thread is held to these, and the reviewer reads with them in hand.

1. **Validate once, at the door**; a record vouches for itself (*The rules*, 9).
2. **Things are judged by their stamp, in a demand**, synchronously, before a junction and after
   one; by the refresh's judgment, synchronously, between its read and its commit; and by the
   store's expectation, in its transaction. Nowhere else.
3. **Flag races; do not solve them** (*The rules*, 8). Settled: a picture within
   `staleMinutes` is what hello promises, not a bug; storage that disagrees with what is in hand
   throws, and is never argued with or repaired; a late read of this tab's own write is ignored;
   a refresh that began before a local box write and lands after it may put the old entry back
   (the next write refuses `stale_write`, a hello cures it; no bookkeeping until later); a hello
   joined on a fetch that began before another device's write gets the older picture, and the
   app may call it twice.
4. **Tests pin the rule, not the race**: waiters' outcomes are asserted as a set, never in order;
   a test never pins an annoyance.
5. **The races the contract tests own** (`primitives.md`, *Races the contract tests own*), each a
   single-concern test through the public surface with two Vault objects where two devices are
   needed: a whisper-omitted put racing another device's write (`stale_write`); a gate change
   racing another device's gate change (`gate_moved`); a superseded passphrase proving a change
   (`gate_moved`); `lock()` and `decline` during `grantLease` (`gating_landed`, nothing stored); a
   stale device writing a vault made anew (`vault_remade`); a renewal or passkey change during a
   box write in flight (succeeds); a write that lands and then a lock (the picture at the new
   gate, the chain refusing `gating_landed`); a late read of this tab's own write (ignored). The
   window between a cryptographic junction and its store call is empty by construction, the
   demand sitting immediately before the call, so a test holds only what is injectable: the
   store verbs (`TH.holdNextCall`), the key deriver, the strength checker and the clock, plus
   `TH.holdNextAnswer` promoted from `vault-hello.test.ts`.
6. **Everything relaxed is written down** in `primitives-toldjaso.md`, one entry per guarantee
   given up or narrowed, with what a user would see.

## Tests

* **The ledger.** No test is deleted without a line in `tests-retired.md` naming its file, its
  title, and the ruling that retired it (in-call refresh, abort controller, lease take-up outside
  birth, turn-queue order, Outcome shape, primitive moved). A test of behaviour that survives is
  rewritten, not retired. The PR body carries per-file counts (before, after, retired); the
  thread reviewer checks the ledger against the diff. The core has 1472 `it(` cases at the start;
  the vault themes this sprint touches hold 575 (lease 114, wayins 94, races 66, hello 79, boxes
  107, make 73, del 25, twins 17), plus wayin 47, box 43, proof 35, lease 27.
* **What dies:** in-call catch-ups and refreshes, abort controllers, lease take-up outside birth,
  tests pinning a queue order, `Outcome` shapes that changed. **What survives:** single-concern
  contract tests through the public surface, rewritten to the new names.
* **Chain tests**: the happy path plus one injected failure per step, for every gatingkind.
* **Order tests, written as contracts** (`revised-outcomes.md`, *Tests*): two hellos sharing one
  refresh; a ring during a refresh satisfied by it; two `ensureUnlocked()` sharing one gating;
  several puts in flight resolving in storage's order; each box call's own outcome when a lock
  lands mid-call; a lock during an attempt; a cancel that declines and does not lock; the expiry
  during a twilight attempt, which completes; a late read of this tab's own write, ignored.
* `tests/vault/` keeps a theme per file; helpers live in `tests/test-helpers/timing.ts` and
  `tests/vault/world.ts`, star-imported as `TH`; every `@example` has a test whose title points
  back to it.

## Security notes

Each goes to `notes/security.md` through a `sonnet` subagent, in the thread that makes the
decision; the subagent may bring an entry it touches up to today's terms where certain, and
does not bulk-rewrite the file; the Coach audits it after the sprint.

* store_verbs: the tombstone and `vault_epoch` as the record of a life; a restored backup that
  rolls back boxes alone goes unnoticed (toldjaso 1).
* demand: storage is the ground truth; a disagreement throws; what a demand failure logs.
* lease_box: the unwrap-rewrap on a whisper-omitted put; where the vaultKey lives during
  `cipheredWith`; the whisper's string not zeroed.
* bank: the device record remembering the highest `vault_epoch`; `vault_behind`.
* proving_gate: the wayinKey's lifetime; the header a fresh proving mints; where passkey bytes
  are zeroed; the demand immediately before `putLease`; only the standing passphrase proves.
* gating: cleartext's one door; `current === next` compared in the clear, in this tab, benign.

## Libraries

* No `p-limit`: there is no queue. `oneAtATime` stays, for the refresh.
* TanStack `query-core` is not in the core; the react entry point and batteries may use it.
* Candidates for a library, each decided in the thread that touches it or in thread 11's sweep:
  `stable-jsonify.ts` (`safe-stable-stringify`, or es-toolkit), `adorn.ts`, `mask.ts`,
  `sanitizer.ts`, `string-store.ts`, `utils.ts`, `report-error.ts`, `change-bell.ts`, `idb.ts`
  (`idb-keyval` or `idb`). `outcome.ts`'s `outcomeOf` stays: it is the Outcome contract. A
  dependency added needs the Coach's yes first; the sweep proposes and does not add.

## Review

Per thread: the `thread-reviewer` on sonnet, medium, briefed with *Trust, checks and races* and
four questions: did the thread remove what its line says and add no guard; does every junction
have its demand before and after, and no demand sit between primitives; do its tests pin rules,
not races, and does `tests-retired.md` account for every deletion; do its doc blocks and tests
follow STYLE.md. It fixes style, doc blocks and test titles. Anything in control flow it reports
and does not fix; a race it notices is a scenario in its report.

End of sprint: one opus, high pass with the same brief over the whole line: vestiges of the
removed machinery (the "out" lines of threads 5, 7 and 9), the security notes, the Contract, the
ledger against the counts. Its findings are matters for the Coach, not fixes.

## Threads

`primitives-plan.md` is the authority on scope and order; one line each here. Every PR is
stacked on the one before, base `main`, and the line starts at the tip of the restacked #243,
#244 and #246, which stay open.

1. **renames** (#243), 2. **get_vault** (#244), 3. **wire_meta** (#246): filed, the base.
4. **store_verbs**: the VaultDB and DeviceDB verbs, expectations, tombstones and `vault_epoch`,
   across every adapter and the conformance suite.
5. **demand**: the queue, abort controllers and in-call refreshes out; the stamp, the demand,
   `replaceSnapshot`, the joined refresh, the synchronous lock, the expiry.
6. **lease_box**: the Lease and Box primitives and the box calls.
7. **bank**: birth, the device record, `vault_behind`, `clearCachedVault`, the React provider.
8. **proving_gate**: the Proving subclasses, Gate, `putGate`, `checkStrength`.
9. **gating**: the union, the kinds, the chains, `requestCleartext`, cleartext off the vault.
10. **react**: the dialogs per gatingkind.
11. **docs**: README, VOCABULARY, the Contract, old_vocabulary, the ledger roll-up, the sweep.

## Not in this design

Older documents in `whiteboard/` describe some of these; none is built.

* A turn queue, `p-limit`, or a lock that lands after work in flight: a lock lands at once.
* A second demand (`demandUnlocked`, `demandGating`): one demand, whose proving clause covers
  the gating.
* A lower epoch read as *gone*: a late read of this tab's own write is ignored; *behind* is
  judged against the device record's highest `vault_epoch`.
* A device mark, `rolled_back`, `heedMark`, `raiseMarkAfter`: the device record instead.
* A lease taken up by a refresh: taken up at birth and at `ensureUnlocked`'s pantry consult only.
* A refresh that leaves a stale lease in the pantry when `vault_tok` moved: it erases it.
* A lease ending within the staleness window read as locked: `ensureUnlocked({ renewMinutes })`
  is the twilight, the caller's choice.
* A listing carrying whole box records: a whisper-omitted put reads the box first.
* A sidecar outside the ctx: it stays bound and server-side immutable.
* The kinds `add_passkey` and `new_vault`: `put_passkey` (add or replace) and `initialize_gate`.
  `ensureLease`: `ensureUnlocked`. `unlock(proof)` or any vault call taking cleartext.
* A public surface without `try` pairs.
* `gate_changed_during`: the demand after the reseal refuses `gate_moved`.
* `checkPassphrase` and `decryptWhisper`: `checkStrength` and `box.extractWhisper()`.
* A refresh noting a box this tab wrote while it ran.

## Later, not here

* The ergonomics of a whisper-omitted or sidecar-only `putBox` (the read first), and the listing's
  shape.
* A refresh noting a box this tab wrote while it ran, which needs bookkeeping.
* Synchronizing gated operations against a late read of this tab's own write, if reports show it.
* One-time recovery, once the gatingkinds stand. A device-capability split, only if a certain
  signal exists. Per-device invalidation.
* Argon2id in SubtleCrypto, once it ships. A host hook for resolving a data-integrity failure
  from local state. The change bell carrying a lock between tabs at once (today it reaches the
  other tab at its next refresh).
* A client that needs ordered box calls needs a queue of its own; the README's tradeoffs section
  says so.
