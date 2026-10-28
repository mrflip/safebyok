# Security flags: decisions a reviewer should look at

Each entry here briefs a security expert who knows what questions to ask: a decision that could
merit closer review, or could meet a later decision and make an issue. It says what the code does
today and what a user, a host or a backend could do with it. It does not argue the decision was
right, and it does not predict what might heighten the concern.

**What this file is not.** `notes/guarantees.md` says where secret material lives and what the
package promises of it; a flag here never restates a guarantee. `notes/wontfix.md` holds behaviour
left undefined on purpose. VOCABULARY.md names the cast; this file uses those names and no others.
The file is a current advisory, not a history: an entry describes the code on `main` as of its
latest date, and what stood before is in git (`git log -- notes/security.md` for entries up to
2026-10-28, this file after).

**Adding an entry.** The agent that made the decision hands it to a `sonnet` subagent with this
file's path, the caution in a sentence or two, the date, and the PR or branch, and commits what the
subagent wrote. The subagent searches the headings and the entries for the same mechanism
(`grep -n` for its names), reading only what it finds. Where an entry already says it, the subagent
amends that entry in place, marking the amendment inline, `(amended YYYY-MM-DD, thread)`, and
changes no other entry. Otherwise it writes a new entry under the heading it belongs to, dated and
naming its PR or thread, in the voice above, and returns the lines it changed. An entry that later
work overtakes is rewritten to say what holds now, never left beside a newer one that contradicts it.

**Regrouped 2026-10-28 (thread security_flags).** The dated list that stood here since 2026-10-14
was consolidated by topic under the headings below: entries that said one thing in several places
became one, retired names became today's, and sentences that described only what once stood were
dropped. Small matters still true but too fine for a reviewer's briefing moved to
`whiteboard/20261028-gripeoween/gripeoween-security_nitpicks.md` (later under `winboard/`). The
questions this file leaves with the Coach are gathered at the end.

## Trust lines

* **Storage and the backend are hostile, and are defended by cryptography alone**: AES-GCM with the
  record's stamp bound as additional data. **The host app is trusted but fallible**: its inputs are
  checked once at each public entry and refused as misuse, and code past that boundary does not
  defend against it, since it shares the JS realm. **Other tabs and devices are concurrent, not
  hostile**, and are met by conflict detection (`revision_tok`, `vault_epoch`, `gate_epoch`,
  `stale_write`, `vault_mismatch`), never by a lock across tabs. (trust_lines, #239, 2026-10-21)
* **A non-extractable vaultKey is no defence against code in the page while the vault is unlocked.**
  Injected code (an XSS, an extension) can call every box open through the vault's own API
  (`getWhisper`, `useWhisper`), as any page script can. The same holds while a lease is in force on
  the device, the vault open or not: the lease record in this browser's IndexedDB holds the leaseKey
  (non-extractable, but with `unwrapKey` among its usages) and the vaultKey wrapped under it, so
  whoever can use the browser profile can unwrap the vaultKey *extractable* and export its bytes.
  Non-extractability keeps the leaseKey, not the vaultKey, from being carried off. A host's own
  pluggable `DeviceDB` is handed every lease record likewise. Host mitigations: a short
  `leaseHours`, `lock()` on sign-out and screen lock, a strict Content-Security-Policy, and no
  third-party script in a page that holds an unlocked vault. (#6, 2026-10-17; lease_box, 2026-10-22)
* **A second copy of safebyok in the page is a stranger.** `isVaultError` is `instanceof` plus the
  kind, so a `VaultError` from another copy (two versions, or the ESM and CJS builds side by side),
  a lookalike `Error`, JSON, a `structuredClone` or a plain object is no refusal: from a storage
  adapter's `do*` hook it becomes `storage_unavailable`, elsewhere `unexpected_error`, the throw its
  `cause`; it is never told to `onBadNews` and a foreign `identity_revoked` locks nothing. So a
  backend cannot choose a refusal's kind, or the message the app shows, through an error it sends,
  except through the package's own clients: `graphqlVaultDB` and `convexVaultDB` deliberately
  rebuild a real `VaultError` from their server's kind and message. `Bank.make` takes a `VaultDB`
  and a `DeviceDB` by `instanceof` plus shape, never a duck, so the base classes' checks of every
  record and answer cannot be skipped. Each copy has its own held-lease registry and its own
  `DefaultLogger`. The Coach's ruling: "It's a weird dangerous situation that should be dealt with
  brutally." (a_fixes, a_sec2 #206, 2026-10-19; b_simplify, 2026-10-21)

## The construction: what each ciphertext binds, and what it does not

`notes/guarantees.md`, *The construction*, has the key hierarchy. These are the choices in it a
reviewer should weigh.

* **Argon2id is unaudited on both paths.** The core runs it through `@noble/hashes` (pure JS, no
  WASM, about half a second a derivation in V8); the library's one audit (Cure53, 2022) left its
  `argon2` out of scope. `safebyok-fastkey` runs the same specs through `hash-wasm` (C compiled to
  WebAssembly, no published audit), in one synchronous call that holds the thread, needing
  `'wasm-unsafe-eval'` in the page's CSP; it refuses `bad_option` where WebAssembly will not compile
  and never falls back on its own. That the two derive the same bytes is a test (Argon2id's reference
  vector, and each other across the supplied spec and edge specs), not a claim; a difference would
  strand vaults across devices rather than weaken them. `hash-wasm` leaves its working memory (the
  spec's whole `memory_kib`, and in Node the passphrase's UTF-8 bytes in a pooled Buffer) for the
  garbage collector, where `@noble/hashes` zeroes its blocks. AES-256-GCM, key wrapping and
  randomness come from WebCrypto. (2026-10-14, 2026-10-15)
* **What a ctx binds** (`cipherCtx`, `crypto.ts`; the stamps parsed from their shapes before any
  bytes are built). A wayin's wrap, and a passkey's HKDF `info`, bind the `VaultStamp` (`format`,
  `applabel`, `user_id`, `vaultlabel`, `vault_tok`, `registered_at`), the purpose
  (`vault_key_passphrase_wrapped` or `vault_key_passkey_wrapped`) and the wayin's whole visible
  header (`wayinkind`, `device_id`, `registered_at`, and `key_deriver_label` and `salt_b64`, or
  `credential_id` and `prf_salt_b64`). A box's two ciphertexts bind the vault's stamp without its
  `format` and the box's `BoxStamp`: every field of the record but the two ciphered ones, the
  sidecar as its key-sorted JSON. A lease's wrap binds the vault's stamp without `format` and
  `LeaseStamp` (`format`, scope, `vault_tok`, `gate_epoch`, `ask_passphrase_at`). The encoding is
  UTF-8 of `stableJsonify` (`safe-stable-stringify`, so that dependency is in the crypto path) of the
  stamps, then the purpose, then the header. (cipher_ctx, 2026-10-26; box_seal, 2026-10-22)
* **Left unbound, and why.** The vault's `format` is left out of a box's and a lease's ctx so a vault
  format bump leaves them readable. `gate_epoch` and which records fill the two gate slots are bound
  into nothing, because each wayin's key is held only by its own wayin and a change to one must not
  rewrap the other: so **storage can splice an older wayin of the same vault back into the current
  record, and that replaced passphrase or removed passkey opens the vault again** (the same vaultKey,
  see *Ways in*). `vault_epoch` is in no ciphertext either (it counts). The passphraseKey's
  derivation takes no context: its salt is fresh per wayin and bound in the wrap, and binding it
  further would put Argon2's associated data into the host-pluggable `KeyDeriver` seam. The PRF salt
  is random and already bound; IVs are covered by the tag; an adapter's own columns are never in a
  record. Were an Argon2 setting ever bound, it would be as a difficulty floor, not as ctx (the Coach,
  2026-10-16). (2026-10-15 to 2026-10-26)
* **Binding `registered_at` reverses an earlier choice.** Until 2026-10-26 the vault record's
  `registered_at` was left out of a wayin's ctx so that a backend altering it would not stop a way in
  opening. The restyle binds every field fixed for a vault's life, and the Coach confirmed the
  reversal (2026-10-27). Now a backend that changes a vault record's `registered_at` under the same
  `vault_tok` stops every wayin, box and lease of that vault from opening, as altering `vault_tok`
  already did, and the refusal for the right passphrase reads `wrong_passphrase` ("the stored vault
  may be damaged"), which misleads. Nothing in `packages/safebyok/src` rewrites `registered_at`
  after birth (`draftOf`, `bank.ts`, sets it once). (#280)
* **The vault's stamp is taken by a strip parse from whatever carries it**, so a Box or a box record,
  which carries the vault's scope and `vault_tok` and a `registered_at` of its own, would pass as the
  vault's stamp and bind the box's `registered_at` as the vault's. No caller passes one. A guard was
  built and withdrawn: the Coach's direction is that a shape taken from a thing accepts what is
  legitimately offered, with strict checks only where genuinely needed. (validator_ducks, 2026-10-27)
* **A wrong passphrase is learned from AEAD failure, never a comparison**; there is no verifier
  field. So a passphrase that opens no wayin and a wayin altered in storage look alike:
  `wrong_passphrase` and `wrong_passkey` say the stored vault may be damaged and claim no tampering.
  Considered and refused: telling them apart by re-encrypting a held vaultKey under the derived key
  with the stored IV and comparing ciphertexts (a construction of our own, needing the vaultKey's
  bytes). Told apart, each its own kind: a record failing its schema or naming another scope
  (`damaged_vault`), a wayin whose salt its deriver could not have made (`damaged_wayin`, passed
  over while the other slot opens), a box that fails its schema or will not open under the proven
  vaultKey (`damaged_box`). (2026-10-14, 2026-10-16)
* **What a passkey wayin rests on.** The PRF answer (WebAuthn PRF extension; a security key's
  `hmac-secret`) is a long-term secret as strong as a passphrase for that vault and needs no key
  derivation to try, so a captured answer opens the vault, and every copy of its record, for good.
  The passkeyKey is HKDF-SHA256 over the 32-byte answer with an empty salt and the wayin's ctx as
  `info`. The authenticator answers only after user verification (`userVerification: 'required'`,
  which also keeps the answer stable). A platform passkey synced by iCloud Keychain or Google
  Password Manager answers on any device signed in to that account, so the vault rests on that
  account's security too. Any script on a page under the passkey's RP ID can ask for the answer with
  the user's touch, as it could read a typed passphrase. The challenge is random and never verified;
  no attestation is checked. (2026-10-15)
* **No padding.** A box's ciphertext length reveals its whisper's length to the backend, and the
  sidecar is in the clear beside it. `whisper_codec` (`json_v1`) and `whisper_schema_version` (1) are
  reserved and bound so a later codec (padding) changes no bound field set. (2026-10-14; TODO.md)
* **Zeroing is best effort, as in any JavaScript crypto.** The 32 bytes a `KeyDeriver` hands back
  are zeroed once imported, on every path, whether or not the import succeeded (`passphraseKeyOf`,
  `proving.ts`); a passkey answer's PRF bytes are zeroed in a `finally` once the HKDF key is imported,
  so a `PasskeyAnswer` works once and an all-zero answer is refused `bad_option` before any seal; a
  whisper's serialized bytes are zeroed after ciphering and after parsing on open (`box.ts`,
  `lease.ts`). Not reached: the passphrase string, the whisper's JSON string, the deriver's own
  working memory, the engine's copies, and a copy the host kept of a `Uint8Array` it handed in. An
  **all-zero passphraseKey is refused** `bad_option` (every byte OR-ed, no early exit; no engine
  promises constant time, but nothing in it branches on a byte), since a deriver that handed back a
  buffer it had since wiped would have the vault seal under a key anyone can rebuild. A result over a
  `SharedArrayBuffer` is refused before it is touched; a result of any length but 32 is refused,
  since WebCrypto would import 16 or 24 as a weaker AES key. (secure_floor, 2026-10-16; proving_gate,
  2026-10-23)
* **Brands exist only for the compiler.** `PassphraseSalt`, `PrfSalt`, `WhisperCiphered`,
  `BoxKeyWrapped`, `VaultKeyWayinWrapped`, `VaultKeyLeaseWrapped` and `PassphraseCleartext` are
  Zod `.brand()`s earned by a parse; nothing at runtime refuses one role's salt or wrap where another's
  is wanted. The one function that hands a passphrase to the key deriver takes a
  `PassphraseCleartext`; the host's `deriveKeyBytes` still takes a plain string. (brands, 2026-10-26)
* **The key deriver is a seam, and a label is a promise the host keeps.** `Bank.make` requires a
  `keyDeriver` (no default; `browserOpts()` supplies the pinned `Argon2idWebV1`); a stored vault
  records its deriver's label and refuses to open under any other (`unknown_key_deriver`). A label
  beginning `argon2id_web_` must be a supplied spec carrying exactly its parameters, so a WebAssembly
  or native stand-in cannot quietly derive under others; any deriver declaring `algorithm:
  'argon2id'` passes the spec check (`parseKeyDeriverSpec`: a salt of 8 to 65536 bytes, 8 KiB a lane
  to 1 GiB of memory, at least one pass and lane, a 32-byte key; anything weaker within those bounds
  is allowed as foolish but workable). This checks what a deriver declares, not the bytes it derives.
  A host's own label is checked against nothing: the host must never change a label's parameters.
  A label beginning `test_` is **warned of through the logger, never refused**: the published
  `safebyok/testing` entry's `testDeriver` (one SHA-256 of passphrase and salt, `test_digest_v0`)
  works on a real vault, and a host with a silent logger hears nothing. (2026-10-15, 2026-10-16)
* **Formats and old records.** Today's tags: `safebyok-vault-v6`, `safebyok-box-v8`,
  `safebyok-lease-v1`, `safebyok-device-v1`, `safebyok-tombstone-v1`. Until 1.0.0 a stored-shape
  change carries no migration and no shim (the Coach's ruling): a record in an older format reads
  as `damaged_vault` or `damaged_box` (the older tags are listed, so never `newer_format`), a
  lease or device record as none, and nothing old is ever decrypted or rewritten. The rule under
  this: **any change to what a stored record may hold bumps `format`**, so an older build can tell
  newer from damaged, and where it cannot it refuses (`newer_format`, a message to update the app,
  nothing deleted). (2026-10-15 to 2026-10-27)

## Keys in memory, and what an object shows

* **Every piece of a Vault object's state is an ES private field**, and the object is frozen; its
  own enumerable fields are the six stamp fields, so a spread, `JSON.stringify` or a log line shows
  those and nothing else. The host reads changing state through `vault.snapshot`, which carries the
  gate in sparse form (no salt, `key_deriver_label`, wrap or `vault_tok`; a passkey's `credential_id`
  and `prf_salt_b64` still show), the box listing with sidecars, and the deadline. The vault never
  reads its own state back through a public property, so a host writing over one changes nothing
  inside. (vault_class, 2026-10-19; vault_object #282, 2026-10-26)
* **A Lease holds no unwrapped vaultKey between calls.** Each `cipheredWith` and `decipherWith`
  unwraps the vaultKey from the lease record under the leaseKey, as a non-extractable handle limited
  to `wrapKey` or `unwrapKey`, in a local of that one call, and drops it. `KeptLease` keeps the
  record (leaseKey and wrap among it) in a private field and shows only the sparse fields. No `Lease`
  is reachable from a Vault object without a method call: the package reads it through a
  module-private WeakMap (`held-lease.ts`), and a test walks every field and symbol-keyed getter of
  an unlocked Vault object and finds no `CryptoKey` and no wrapped key. (lease_box, box_seal,
  2026-10-22; guarantees.md, *Open items*)
* **A Box shows its stamp and visible fields, never its ciphertext.** Its own enumerable frozen
  fields are the scope, the `vault_tok`, `vault_epoch` and `gate_epoch` it was made under, and every
  record field but the two ciphered ones, which stay in a private `#record`; a log line of a Box so
  carries the vault's `vault_tok` and two epochs, all stored unencrypted anyway. A Box's stamp is no
  part of its record and is not authenticated; it is read only for the vault's consistency demand.
  (vault_object, 2026-10-26)
* **A host holding a Vault object can reach `ProvingTools`.** `Object.getOwnPropertySymbols(Vault.
  prototype)` finds the Symbol-keyed getter (`provingTools`, a local Symbol in `proving.ts`, exported
  by no entry point) through which a proving reaches `vaultRecord()` (the record in hand, gate wraps
  included), `demand`, `keyDeriver`, `logger`, `leaseMillis`, `now()`, `deviceId()`, `tryPutLease`
  and `holdLease`: the power to write a lease record to the host's own `DeviceDB` and have the vault
  hold it. `GatingTools` (`putGate`, `delVault`, `takeUp`) is handed to each gating by its
  constructor and kept apart from it on purpose, so neither bundle has the other's powers. This sits
  inside the trust of the host's realm. The test-only exports `vaultRecordHeldBy` (`proving.ts`) and
  `leaseRecordOf` (`lease.ts`) hand back a stored record whole; no entry point exports them and
  nothing in `src/` calls them. (proving_tidy #311, 2026-10-27)
* **A proving lives in a call's locals and no object keeps the passphrase.** A `PassphraseProving`
  or `PasskeyProving` holds the wayinKey as a non-extractable `CryptoKey` in a private field and hands
  it out never; the vaultKey it unwraps never crosses out of its methods. A change to the ways in
  unwraps the vaultKey extractable (`wrapKey` usage only) twice, each confined to one proving method.
  That nothing keeps a proving after a gating settles is not tested: a test would depend on garbage
  collection (the Coach: "don't write a test we can't write"). (a_sec2, 2026-10-19; proving_gate,
  2026-10-23)

## The lease, the lock and the device store

* **The lease is client-side politeness.** `leaseHours` (default 168, at most 588 finite, or
  `Infinity`, which arms no timer) is chosen by the app at each `Bank.make`; two devices on one vault
  may hold different lengths, nothing stored enforces it, and a modified client may choose any. The
  real bounds are the passphrase and the device-bound leaseKey. The lease renews only when a gating
  proves (every gating kind, a passkey unlock included); reads, stores, deletions and refreshes never
  move it. (2026-10-14, 2026-10-16)
* **The lease has a hard edge, and one timer.** Every call that starts work checks the deadline
  against the clock and past it refuses `vault_locked`; a `setTimeout` at `ask_passphrase_at`,
  `unref`'d where the platform has it, drops the lease and reckons the snapshot at that deadline
  without reading the host's clock, so a clock that throws cannot leave the snapshot showing unlocked
  after the key was dropped; a timer that runs late (a device asleep) is not depended on, as every
  look drops a lease past its deadline. (locks_and_expiry, 2026-10-16; bank, 2026-10-22)
* **The host's clock is checked once.** `Bank.make` reads it once and refuses a reading outside epoch
  milliseconds 1981 to 2255 (`FarPast` to `FarFuture`), or a throw, as `bad_option`. After that its
  readings are floored and used unchecked; lease deadlines and stored timestamps rest on it, and a
  clock in bounds but wrong (a year ahead) is not detected. A stored time outside those bounds or
  with a fraction of a millisecond fails its schema. (clean_times, 2026-10-15; trust_lines,
  2026-10-21)
* **One lock rule** (#304, the Coach: "yes one rule please"). `lock()` acts before it returns, with
  nothing awaited between: the lease in memory is dropped and its expiry disarmed, a gating up is
  landed on, the snapshot swaps to locked; only then is the device store's erase (`delLease`) issued,
  and that is what `lock()` awaits. A lock landing mid-call, in a call that needs the vault unlocked,
  refuses `vault_locked` at the call's next step, writing nothing more, unless a gating has unlocked
  the vault again meanwhile; a write already sent to storage (`putBox`, `delBox`, a gate write) lands
  or refuses as storage decides. Because a device store applies one scope's calls in the order made,
  a lease write already issued by an unlock under way is erased behind it. (demand, 2026-10-22;
  gating, 2026-10-23; #304)
* **Drops are memory-only; only a lock erases the device store's lease.** The expiry, a let-go
  (`bank.closeVault`), a demand that finds the lease ended and a read that finds it revoked (the store
  holding none or one under another `vault_tok` or `gate_epoch`, the ways in changed, the vault gone
  or remade) each drop the lease from memory and erase nothing, because an unconditional erase on a
  judgment could take another tab's fresh lease. `lock()`, `del()` and a lock for storage the vault
  cannot trust (`identity_revoked`, `vault_behind`) erase. A birth refused for either of those two
  erases this device's lease too; a lease a birth judges unfit (another life's, or ended) is left
  where it lies. (demand, bank, 2026-10-22)
* **A stored lease is taken up only if it fits, and its wrap is not tried.** One predicate
  (`#fitsTakeUp`, `vault.ts`): the gate's `vault_tok` and `gate_epoch`, a deadline past now plus the
  call's `renewMinutes`, and no later than now plus `leaseHours` (so lowering `leaseHours`, or a
  clock stepped back, honours no longer lease). A lease that fails is never erased (it may be another
  tab's). The wrap is first tried at the lease's first cipher or decipher; one that will not open
  refuses `damaged_lease` (bad news) and the vault drops that lease as `lock()` does, only when it is
  the lease the vault holds now. (bank, lease_box, 2026-10-22; gating, 2026-10-23)
* **Cross-tab coordination is not built** (the Coach: "note your concern and carry on"); the mutexes
  are per tab, and races between tabs are settled by the store's expectations and the next read.
  Accepted loosenings: a `lock()` and an unlock both done in another tab before this tab's next read
  leave this tab unlocked, since a refresh no longer compares deadlines (the store holds a lease under
  the same ways in, which this tab cannot tell from a renewal); a lock in another tab landing in the
  same clock millisecond as this tab's grant is seen only at the next read; a change-bell ring during
  a refresh in flight joins it and its change waits for the next ring or hello (nothing disagrees,
  the picture is only old); a Vault object held through `bank.clearCachedVault` can write a lease
  while the erase runs. (primitives sprint, 2026-10-22 to 2026-10-24)
* **Cancel declines this prompt only.** A cancel landing after an attempt's last demand before its
  lease write leaves the lease the write stores in the device store: this tab stays locked in memory
  and the next `ensureUnlocked()` takes it up without a prompt. A lock landing then erases it behind
  the write; a lock or decline landing during the write refuses `gating_landed`, never the device
  store's own refusal. A `storage_unavailable` or `storage_blocked` from the lease write after a gate
  change already landed is a logger warning, the vault left locked on this device, the gate changed.
  (demand, 2026-10-22; gating, gating_followups #262, 2026-10-23)
* **The device store is no stronger a boundary than the browser's site data**, which anyone at the
  device can clear; `bank.clearCachedVault` rests on that. `DeviceDB` is an abstract base class
  (host stores extend it) that parses every lease and device record a store hands back; one that
  fails reads as none and is discarded through the store's `doDelUnreadable`, which deletes the row
  only if it is still unreadable as read inside the same transaction (closing the race in which an
  unconditional discard erased a device record raised meanwhile). Each public verb has a `try` form
  resolving an Outcome and a throwing form; both map a store's throw to `storage_blocked` (a
  `SecurityError`, `QuotaExceededError` or `NotSupportedError`, told by `name`, so a `DOMException`
  from another frame is told alike) or `storage_unavailable`, the throw its `cause`, naming no scope
  and quoting no record. `idbDeviceDB` sweeps, unread, every row it did not file, a lease or device
  record under a malformed scopepath among them, which no read could reach and so no lock could
  revoke. (device_db_class, 2026-10-27; store_trynames #321, 2026-10-28)

## Gatings: the host's hands on cleartext

* **Cleartext has one door.** No vault call takes a passphrase or a passkey's answer; the user's text
  reaches the package only as the argument of the typed attempt (`attemptPassphrase`,
  `attemptPasskey`) the host calls on the gating `Bank.make`'s `requestCleartext` handed it, which
  seals it into a proving. A `requestCleartext` that throws or rejects refuses every waiting call
  `unexpected_error` with **no `cause`** (it heard the passphrase); the logger hears only `{ call:
  'requestCleartext', refusalkind }`. A gating still open when it resolves is declined
  (`vault_locked`); with no `requestCleartext` every gating is declined. One gating is pending per
  vault (`attempt_in_flight` for a second attempt while one runs). (gating, gating_followups #262,
  2026-10-23)
* **Each attempt reads storage afresh first** (`hello({ staleMinutes: 0 })`), then demands the Vault
  object is not gone and the gating has not landed, so a passphrase another device replaced opens
  nothing here, and a first gate another device set while the user typed is refused
  `gate_made_elsewhere` without the typed text being tried against the winner's gate; the refusal
  carries none of the stored record. The order inside a chain: `change_passphrase` proves the current
  passphrase (`demandOpens`) before deriving the next; `put_passkey` proves the passphrase before it
  seals, and zeroes, the new passkey's answer; the strength check runs before any derivation;
  `same_passphrase` compares the two strings typed in this tab with `===` (no attacker observes it;
  no constant time, as the spec has it). (gating, 2026-10-23)
* **The strength checker hears the passphrase, and is held to a contract.** Only
  `guardStrengthChecker` calls the host's checker: a blank passphrase is weak before the host hears
  it; the checker is handed a frozen copy of the scope; a verdict that breaks the contract is
  `bad_option` and a throw `unexpected_error`, each carrying nothing (no `cause`, `meta`, text or
  kind), never logged, never told to `onBadNews`. Its `load`, which hears no passphrase, runs at
  `bank.hello()` and its failure rides as `cause`. Strength is checked for a new passphrase only
  (never at unlock, so a stricter checker locks no one out). The default where a host chose none
  refuses every passphrase, telling the makers to choose one. The browser default
  (`zxcvbnStrengthChecker`) asks 12 code points then a zxcvbn score of 3 of 4, loading its
  dictionary by dynamic import from the host's own origin, and keeps nothing between calls.
  **Open**: a checker's verdict `reason` becomes the `weak_passphrase` message as given, so a checker
  that quoted the passphrase in its reason would put it into the refusal, the dialog and the host's
  error path; the doc tells hosts not to, and the core cannot check. (checker, checker2, 2026-10-21;
  strength_principles #142, 2026-10-17)
* **Nothing of a key deriver's throw is kept.** `deriverThrewRefusal` (`proving.ts`) builds a fresh
  `VaultError`: a `condition`-family `VaultError` keeps only its `refusalkind` under a fixed message
  (a kind off `RefusalKindVals` is dropped), anything else is `unexpected_error` under a fixed
  message; no `cause`, no `meta`. The logger hears `{ call: 'deriveKeyBytes', refusalkind }`. The
  cost: a deriver's own text is lost, so `safebyok-fastkey`'s refusal asking for
  `'wasm-unsafe-eval'` reaches the host as `unexpected_error` with the kind only in the log. On
  unlock, a wayin's `wrong_passphrase` is the vault's own wording. The TODO *"Add "sensitive" and
  "host" flags to refusals"* is the Coach's audit of these wraps. (core_cleanups, 2026-10-23)
* **A declined gating is `vault_locked`, worded by kind**, quoting nothing typed. A refusal the core
  leaves the gating open for (`CorrectableKindVals`: `wrong_passphrase`, `wrong_passkey`,
  `weak_passphrase`, `same_passphrase`, `absent_wayin`, `damaged_wayin`, `passkey_unavailable`) is
  shown in place by the React dialog and nothing retries; any other refusal settles the gating.
  (react, 2026-10-24)
* **Deleting a vault is proven by its passphrase.** `del()` raises a `del_vault` gating; the
  passphrase is sealed and checked, then `delVault` expects `{ vault_tok, gate_epoch }` (a stale
  tab's old passphrase cannot delete), the gating settles, the vault locks and the Vault object goes.
  A forgotten passphrase can no longer delete a sound vault from the client. (gating, 2026-10-23)
* **`bank.delDamagedVault` is the one delete without a passphrase**, open only to a vault record that
  fails its checks; a sound vault, a novel one included, refuses `bad_option`. Its expectation is the
  `vault_tok` read from a record that is by definition untrusted, with `gate_epoch` null; it can only
  aim the deletion at the row it read, in the caller's own scope, so a forged `vault_tok` in a
  damaged row deletes that row and nothing else, and a vault replaced meanwhile survives as
  `stale_write`. It is as strong as the backend's authorization of who may delete that user's rows
  (VAULTDB.md 5.4). It refuses `newer_format` (nothing deleted) for a `format` this build does not
  know, so an old build never offers to delete what a newer one wrote. Nothing on the device gates it:
  it may be issued for a vault the bank does not report, and `bank.clearCachedVault` (this device's
  record and lease only, no `VaultDB` verb) for any scope; a bag naming other stores acts on those
  stores (the Coach declined a stores check: letting a Vault object go erases nothing). It raises the
  device record to the tombstone's `vault_epoch`; a damaged record whose `vault_epoch` it cannot read
  counts from zero (see *Standing questions*). (2026-10-16; bank_clears, 2026-10-24)
* **The `put_passkey` dialog makes the passkey before the passphrase is checked**, straight from the
  submit's user gesture as WebAuthn requires; the core then checks the passphrase before sealing. A
  typo leaves an unused credential on the authenticator (useless to the vault) and the next submit
  makes another; one submit runs at a time. The relying party is named for the vault's `applabel`
  at the page's own domain; the user handle is random, so the credential cannot replace a sign-in
  passkey on the same RP; the user entry is `passphraseUsername`, never the host's sign-in name.
  (react, 2026-10-24)

## Ways in: slots, removal, and no rotation

* **Two slots; only the passphrase proves a change** (the Coach's ruling, slots, 2026-10-19). A vault
  record holds `gate: { passphrase, passkey | null }`; a passkey opens and reads the vault but cannot
  change who may; the passphrase can never be removed; a new passphrase removes the passkey (the
  gate is written with `passkey: null`), so the user adds it again by proving the new passphrase. So
  a forgotten passphrase cannot be reset with the passkey, and a passphrase wayin stored damaged
  cannot be replaced. Every change moves `gate_epoch` and is written conditionally on `vault_tok` and
  `gate_epoch`; the server-side adapters (Postgres, Convex) refuse an update that does not move
  `gate_epoch` forward even from a modified client, so devices unlocked under the old gate lock at
  their next look. (slots, put_wayin, 2026-10-19; wayin_rules, 2026-10-21; core_tidy #144)
* **Removal is not revocation, and no rotation is built.** The vaultKey is static for the vault's
  life (a vault made anew has a new `vault_tok`, bound into every box). Whoever knew a replaced
  passphrase and kept any earlier vault record holds the vaultKey; storage can splice that older
  wayin back (above); Convex's and Postgres's backups and snapshot exports retain superseded records
  for as long as they are kept; a host that removes a compromised wayin has nothing to call to
  replace the vaultKey (TODO.md, *Which wayins a rotation keeps*). (2026-10-14, 2026-10-16)
* **`device_id`.** Every wayin carries, bound in its header, the `device_id` of the device that
  added it and its `registered_at`, so a user can spot a wayin they did not make (the sparse summary
  shows both). The id is a random UUID a device mints per vault and keeps in its device record,
  never derived from the device (no fingerprint, hardware or advertising identifier); the server sees
  it in the clear and learns which wayins one device added to one vault, nothing more. Clearing site
  data mints a new id; wayins keep the old. (2026-10-16; proving_gate, 2026-10-23)
* **A salt's shape is judged per wayin, not in the record schema**, so a stored salt of the wrong
  length or form leaves that wayin `damaged_wayin` while the other slot opens, where a record-level
  check would damage the whole vault. The supplied derivers refuse a salt of another length than
  the spec's before deriving (`bad_option`, never quoting it); a new passkey's salt is checked
  (`freshPasskeyAnswer`, inside `PasskeyProving.seal`'s try, so the PRF bytes are zeroed on refusal).
  There is no list of salts and nothing checks freshness: the host mints the salt. (brands,
  2026-10-26; validator_ducks, 2026-10-27)
* **The first unlock is two writes.** `ensureVault` stores the vault gateless (no wrapped vaultKey,
  no secret) and `putVaultRecord` expecting `gate_epoch` 0 writes the first gate over it, so of two
  devices setting the first passphrase at once exactly one lands. Between the writes, or for good if
  the second never lands, the gateless record stays stored and reads as no vault yet. (store_verbs,
  bank, 2026-10-22)
* **A passphrase costs exactly one derivation to try**; the vault picks the slot by the attempt's
  kind, so stored data cannot multiply the cost. (slots, 2026-10-19)

## Storage is the ground truth: expectations, tombstones and the rollback watermark

* **Every write is conditional, refused once, never retried, never caught up.** `putVaultRecord`
  expects `{ vault_tok, gate_epoch }`; `putBox` expects `{ vault_tok, revision_tok | null }`;
  `delVault` expects `{ vault_tok, gate_epoch }`; `delDamagedVault` the `vault_tok` alone;
  `delBox` expects the `vault_tok` only, so **within its vault a deletion wins over any concurrent
  write** (the Coach's ruling): the adapter reports `deleted`, `deleted_other` (another record stood,
  written over the box meanwhile) or `absent`, and the vault honours `deleted_other` with a logger
  warning naming neither revision nor boxlabel. A `stale_write` is refused as it came and the vault
  reads nothing after it; a write whose vault record is no longer the stored one is
  `vault_mismatch`, which the vault reads as `vault_gone` or `vault_remade`. A Vault object holds one
  `vault_tok` for its life: a read that finds the vault deleted or under another `vault_tok` makes
  the object gone for good, every call refusing, the lease dropped (not erased), the watch ended;
  the bank births a new object when asked and the old one is never repaired (the Coach: "same scope,
  other vault_tok is a new life: reload"). (no_retry, 2026-10-18; delete_revision, 2026-10-19;
  demand, bank, 2026-10-22)
* **A stale session's box writes rely on the expectation alone.** `putBox` and `delBox` do not read
  the vault record first; a session holding a lease for a vault since deleted or remade elsewhere
  cannot write into the successor (the `vault_tok` expectation, checked by the backend in the same
  atomic step). A change to the ways in elsewhere does not stop a stale session's `putBox` or
  `delBox` (box expectations carry no epoch, and boxes bind none); the session relocks at its next
  look at the vault record. (2026-10-15; trust_lines, 2026-10-21)
* **A deleted vault leaves a tombstone, and `vault_epoch` is the record of a life.** The store, never
  the writer, moves `vault_epoch` up on every gate write and on `delVault`; no box write moves it.
  The tombstone (`format`, scope, `vault_epoch`) holds no `vault_tok`, so no expectation can name it
  and a stale writer cannot revive a deleted vault; the next `ensureVault` starts a new life with the
  counter carried on. (store_verbs, 2026-10-22)
* **The rollback watermark.** Per scope, across the vault's lives, the device record holds
  `{ device_id, highest_vault_epoch }`, raised as a store-side max in one transaction at birth, after
  each refresh, after this device's own gate writes and after `del()` (to the tombstone's counter),
  so a tab that saw less never lowers it. A read whose `vault_epoch` is below it is refused
  `vault_behind` and the vault locks (the lease erased); a birth below it births nothing. The refresh
  judges `vault_behind` **before** it ignores a read older than the picture in hand (a late read of
  this tab's own write), and reads the record before it issues the fetch, so this device's own raise
  is never held against a read served before it. The only way out is `bank.clearCachedVault`: a
  deliberate host action (never offered to the user as a prompt; `useBank()` hands it to React hosts),
  which weakens the check until the next birth. Residuals: **a lagging read replica serving a copy
  below the record locks a tab that holds the newer copy** (a false alarm, cured by the next `hello`
  once the replica catches up; a replica briefly serving an older copy makes every device that saw
  the newer one ask for the passphrase again); a device whose record was cleared, or that never saw
  the newer copy, cannot tell; a failed raise is a logger warning, not a refusal, so detection is
  weaker until a later read raises it; the device record is strict, so a field added later, or a
  format bump, costs older builds the watermark until their next read (whoever can add a field to a
  device record can delete its row). (2026-10-16; bank, 2026-10-22; refresh_rulings, 2026-10-24;
  #274, #279, 2026-10-27)
* **A restored backup that rolls back boxes alone goes unnoticed**, since `vault_epoch` moves only on
  gate writes and deletions: storage serving older boxes under the same gate is accepted by every
  device. If it proves blocking, bind `vault_epoch` into each box's ctx; otherwise left for the audit
  (the Coach: "don't let rollback protection drive any large revisions"). The README tells a server
  that restores a backup to wipe the restored vaults (records, boxes, tombstones) rather than serve
  them, and a host deleting a user's data to sign the user out first and remove tombstones with the
  rows; nothing enforces either. A refresh that began before a local box write and lands after it
  puts the old entry back until the next write refuses `stale_write` and a hello cures it. (primitives
  sprint, 2026-10-22)
* **Postgres: a vault deleted and ensured in the same instant can restart its counter.** Under READ
  COMMITTED an `ensureVault` statement that began before a `delVault` committed reads no tombstone
  and finds the old row gone, so it starts a new life at `vault_epoch` 0 with the fresh tombstone
  beside it. It fails safe: a device that saw a higher epoch refuses the new life as `vault_behind`
  until the host calls `bank.clearCachedVault`. Convex, IndexedDB and the local store are unaffected.
  The cure, if it shows: keep the tombstone as a state of the vault row, so one `INSERT ... ON
  CONFLICT DO UPDATE` decides. (#251 review, 2026-10-22)
* **One rule for storage the vault cannot trust.** `identity_revoked` (the backend no longer serves
  this user: signed out, or another user signed in) and `vault_behind` lock the vault at once
  wherever they are met, a background refresh included, with no host option (`RefusalPolicy`).
  An adapter that says `identity_revoked` for a passing fault locks the vault needlessly
  (VAULTDB.md 5.5 says `storage_unavailable` for those); a vault opened before its backend's auth is
  ready meets `identity_revoked` and its user retypes the passphrase. The mismatched-user case is
  `identity_revoked` too, since a server cannot tell "the user changed" from "a host opened the wrong
  user's vault". (2026-10-16; bank, 2026-10-22)
* **Reads are atomic, and the vault argues with none of it.** `getVault` and `ensureVault` read the
  vault record and the box listing in one step (one Postgres statement, one Convex function, one
  IndexedDB transaction); nothing compares or repairs the two afterwards. Postgres's `ensureVault`,
  when another device's record lands after its snapshot began, returns that record with a listing as
  of the snapshot filtered to its `vault_tok`: the listing may lag by milliseconds, never names
  another vault. `getBox` names the vault it expects (`vault_tok`, compared in the same step).
  Every thing the vault hands out carries the stamp it was made under, and
  `vault.demandConsistentWith` refuses it `vault_gone`, `vault_remade`, `gate_moved` or
  `vault_locked` before and after each wait; a demand failure is logged by kind and call only.
  (get_vault #244, lease_box, demand, 2026-10-22)
* **The adapter battery (`describeVaultDB`) races every compare-and-write from two devices**,
  holding one before each round trip while the other moves, so no check is split from its write
  across awaits and no in-process lock makes the devices take turns. It cannot split one round
  trip: Postgres's one-statement atomicity under concurrent connections is reasoned, not proven by
  the battery (its own race self-tests run over an in-memory backend, and its Postgres runs are on
  PGlite, one statement at a time); `e2e/tests/postgres/races.test.ts` runs the races against a real
  server in CI. (2026-10-16)

## Records, names and what storage can put in front of the UI

* **Stored records parse strict, and are checked where they cross.** Every stored-record shape is a
  strict object: a field this version does not write is refused on the way in (`bad_record`,
  `invalid_box`, before the adapter sees it) and reads back as damage; a lease or device record with
  an unknown field is discarded and reads as none. Every `VaultDB` write verb validates its record and
  expectation against the shapes its reads use, so the core never writes what its own read would
  refuse. A damaged refusal's `cause` is the record check's `bad_record` `VaultError`, which names
  failing fields and quotes no value; a test checks that each damaged refusal's message, stack,
  `cause` and JSON hold no ciphertext and no sidecar text. (2026-10-15; zod_classic, 2026-10-26)
* **A read's damage is judged by the package, and a server's word is re-checked.** `doGetVault` and
  `doEnsureVault` hand up the record as stored and the box rows split by the exported
  `splitStoredBoxes`; a box whose record fails its strict check, or names another boxlabel than the
  row it is filed under, is a `BoxDamaged` `{ boxlabel, revision_tok, damage }` listed apart, the
  boxlabel from where the row is filed, never from the record, and nothing else of it kept. The base
  class checks every read again, a server's relay included; a server's damaged entries are parsed
  strictly and one that fails refuses the whole read `corrupt_record`. The worst a lying server does
  with that word is offer the user to delete or overwrite a box it could delete or overwrite anyway.
  (reads #281, 2026-10-26)
* **A damaged box is replaced in one conditional write.** One naming a revision is written over
  under that revision, carrying nothing forward, so a sound box another device wrote meanwhile
  refuses the write; one naming no revision is refused `damaged_box` until the user calls `delBox`.
  The residual race runs through an explicit `delBox`: both devices list the box damaged with
  `revision_tok` null, A deletes and writes, B's `delBox` naming null removes A's fresh write, B warned
  only through the logger, because a deletion within the vault wins over any revision. Planting junk
  under a boxlabel shows the user a damaged box where a refused open used to show, and the user's
  next `putBox` to it clears the junk. (no_clear, 2026-10-19; refusals_and_catchup, 2026-10-16)
* **A whole `putBox` adopts the listing's `registered_at` unopened** (the Coach's ruling): with both
  whisper and sidecar given, `putBox` reads nothing and takes the listing's revision and
  `registered_at` as its base, so a `registered_at` altered in storage, which makes the old revision
  refuse to open, is sealed and authenticated into the new one. This is the one exception to "a box's
  ctx signs all its immutable fields"; whether to close it is open (see *Standing questions*). A
  partial put (whisper or sidecar left out) reads and opens the stored box first, so a sidecar or
  time planted in storage is never re-sealed into a revision that reads clean, at the cost of a
  decipher per partial put (the Coach: note it as "see if this is really needed"). (written_at #141,
  2026-10-17; lease_box, box_seal, 2026-10-22; #254)
* **The sidecar is in the clear and unverified until the box opens.** A JSON object (`{}` for none),
  never interpreted, its size counted with the whisper's; it reveals everything in it, and its size,
  to anyone who reads storage. It has no floor of its own: control or bidirectional characters in it
  are the host's to mind. One nested too deep for the schema check fails its call as
  `unexpected_error`: availability against a hostile backend is not defended there. A sidecar
  Postgres refuses (`\u0000`) surfaces as `storage_unavailable` with the driver's error as cause.
  (push_to_100_a, 2026-10-16; trust_lines, 2026-10-21)
* **The snapshot of a locked vault is unauthenticated.** Boxlabels, sidecars, times and the wayin
  summaries are shown as stored; nothing checks them before a box is opened. A name outside the rules
  below is the one thing the listing never shows. (2026-10-15)
* **Names are the package's own rules, at every layer.** A label (`applabel`, `vaultlabel`,
  `boxlabel`) is `^(?!.*__)[a-z][a-z0-9_]*[a-z0-9]$`, 2 to 40 characters; a `user_id` is 1 to 100
  ASCII characters from `[A-Za-z0-9_.~:@+|%-]`, never dots alone. The rules hold at a vault's entry,
  in every `VaultDB` verb (so server side too) and in every record read back; a stored record holding
  a name outside them reads as damaged, and a box row stored under one is skipped from listings and
  unreachable by any verb (`del()` or `delDamagedVault` still removes it). The refusal is `bad_scope`.
  The key-value stores (`localVaultDB`, `idbVaultDB`, `idbDeviceDB`, `memoryDeviceDB`) file rows
  under `kind^applabel^user_id^vaultlabel[^boxlabel]` (`Scopepath`), injective only because no name
  holds `^`, which the name rules forbid and the maker checks again; prefix tests end in the
  delimiter so `main` never matches `main2`'s rows. Each adapter declares `maxNameBytes` (Postgres
  640, so a box's four-name key fits a btree entry). (2026-10-16; validator #273, scopepath,
  2026-10-26)
* **A host handing an unparsed bag to a consistency check could put an input's own key into a
  refusal.** `verifyConsistent`, `demandConsistent` and a validator's `parseConsistent` name the
  fields that disagree between two bags (`meta.fieldnames`); the names compared are the parsed bag's
  own keys, which are schema field names where the first bag is a parse's output. (parse_consistent,
  2026-10-27)

## Limits and sizes

* **`maxWhisperBytes`** (default 40,444) weighs the whisper with its box's sidecar, as JSON
  (`whisper_too_large`); `box_too_large` is a box over the adapter's `maxRecordBytes`;
  `vault_full` is a new box past the vault's `maxBoxes`, or one that would pass the adapter's
  `maxVaultBytes` with each box reckoned at twice `maxWhisperBytes` plus 1 KiB (the bound that
  keeps a vault erasable whole in one Convex transaction), counted from this device's last look at
  storage, so stores racing on several devices overshoot it. (2026-10-15; core_tidy #144)
* **A box limit is an alarm bell, not an abuse quota** (VAULTDB.md 4.2): writes one after another
  never pass it, racers for the last places may, and a client that bypasses the library is the host's
  to meter. `localVaultDB` and `idbVaultDB` enforce nothing. **Convex** holds every vault to 8,000
  boxes and about 7 MiB of rows (constants derived from Convex's per-transaction limits so `delVault`
  always fits; neither client nor host can change them) through a per-vault tally row updated in the
  same transaction as each write; the tally is trusted as kept, and a rollback to a component without
  tallies, then forward, leaves tallies stale for vaults written meanwhile. **Postgres** counts in the
  insert's own snapshot with no lock (racers overshoot by at most one less than their number; some
  races above READ COMMITTED fail `40001`, refused `storage_unavailable`), and sets **no limit unless
  told**: `maxBoxes` defaults to `Infinity`, and nothing bounds a vault's bytes, so one signed-in user
  through a modified browser grows their own vault without bound; a host's own hard-cap trigger is
  the host's to verify, and surfaces as `storage_unavailable`. `graphqlVaultDB` declares what its
  host says the server enforces. (2026-10-15, 2026-10-16; store_base, 2026-10-17)

## What a refusal carries, and what crosses a wire

* **No refusal repeats a value from its input; it may name fields.** A `Validator`-made refusal
  names each failing field by its Zod path with Zod's English sentence, forced through a per-parse
  error map so a host's `z.config` error map (which could quote input) never shapes it; a field an
  object does not take is counted, and the fields the object *takes* are listed, never the names it
  was handed (the earlier key-shape heuristic leaked: a lowercase secret of 32 characters passed it).
  A path holds only our field names and indices: the kit hands out no Zod record maker, and the
  whisper/sidecar bag is a `custom` check judged whole. A host's own `Validator` that imports Zod's
  `record` sees that record's keys in its refusals. `safeParse` is Zod's own (a `ZodError`, carrying
  no `input` unless asked). Tested: every exported validator and the main entries are handed marker
  inputs as keys and values at two depths, and no refusal's message, stack, meta or cause holds
  the marker. Importing safebyok sets Zod's global locale to English. (restyle thread 14 #287,
  parse_consistent, 2026-10-27; zod_classic, 2026-10-26)
* **A stale write's refusal carries what is stored, ciphertext included.** `meta.box_stored` on a
  stale `putBox` is the whole stored box (wrapped boxKey and ciphered whisper, under the random
  vaultKey, so not offline-guessable); `meta.vault_stored` on a stale `putVaultRecord` is the whole
  stored vault record, **both wayins' salts and wrapped vaultKeys: offline-guessing material**. The
  vault strips `vault_stored` at its own surface (`#gateWriteRefusal` rethrows `stale_write` with no
  meta), so no host-facing refusal carries it; it stands at the `VaultDB` layer and in the wire
  bodies below, to the signed-in owner of that vault only. A host that logs or reports a whole
  `VaultError` with its `meta`, or logs response bodies, logs that material. The audit of where
  refusal `meta` can leak is the Coach's (see *Standing questions*; TODO.md, *Redaction, batteries
  included*). `meta.box_listed` carries a damaged box's boxlabel and revision; `meta.wayin_listed`
  a wayin's sparse summary; `capacity` numbers only. (C1 putbox_store, 2026-10-21; get_vault
  #244, 2026-10-22)
* **GraphQL**: a refusal crosses as a fresh `GraphQLError` holding the message and `extensions.kind`
  alone; what a refused write learned (`box_stored`, `vault_stored`, `capacity`) travels in the
  mutation's response `data` (`SafebyokPutBoxAnswer`, `SafebyokPutVaultRecordAnswer`, with
  `landed`), never in `extensions`, which servers, gateways and APM tools commonly log; a host's
  response logging can still write the body down. The `VaultError`, and through it the driver's
  error, is the GraphQL error's unenumerable `cause` set after construction, never its
  `originalError`: Yoga masks an error whose original is not a `GraphQLError`, and in development
  would send the original's message, stack and `cause` to the browser. In the browser,
  `BAD_USER_INPUT` and `GRAPHQL_VALIDATION_FAILED` (which may quote the variables, which are records)
  are `bad_option` with a fixed message and no cause; `FORBIDDEN` is `not_permitted`;
  `UNAUTHENTICATED` stays `storage_unavailable` on purpose (a token expired mid-refresh is a passing
  fault). A `vaultDBFor` that throws crosses as a generic `bad_option`, its own message (which may
  name the host's setup or secret env var names) kept server-side, except a `not_permitted` or
  `identity_revoked` the host threw, which crosses as it is. (store_base, 2026-10-17; wire_meta,
  2026-10-22)
* **The Postgres route recipe** (`packages/safebyok-postgres/README.md`, run by its test) answers
  `{ result, meta }` or `{ refusal: { kind, message, meta }, meta }`. The refusal's own `meta` is
  rebuilt by an allowlist (`answerOf`, `boxShown`, `wayinShown`: a damaged box listing is boxlabel,
  damage and revision; a wayin listing is what a locked snapshot already shows); a new field crosses
  only by being added to it (a denylist of `*_wrapped`/`*_ciphered` was rejected as failing open).
  The `cause` never crosses. The browser's `checkedAnswer` believes an answer only whole. (route_meta,
  2026-10-22)
* **Convex**: the component's own refusals are `ConvexError`s of fixed kind and text, and its
  functions log nothing; but Convex's argument and return validation errors quote the value refused,
  so a malformed call writes its arguments (`user_id`, scope, sidecars, ciphertext; never plaintext
  or keys) into the host's Convex logs, and on a dev deployment back to the client. `convexVaultDB`
  keeps a `ConvexError` carrying a safebyok kind as the refusal's `cause` (its text written by our
  server or the host's `getUserId`), and refuses every other Convex failure as `storage_unavailable`
  **carrying nothing** (`Sanitizer.refusalFor`), since the client cannot tell a validator's error from
  any other but by its text. Residual: a host that puts something sensitive in its own `ConvexError`
  data sees it ride. (2026-10-15; outcome_adapters, 2026-10-19)
* **A Postgres driver's error rides as `cause` on the server** and may quote a statement's
  parameters, or, for a row refused by a `NOT NULL`, the whole failing row with its ciphertext; a
  `42501` (insufficient privilege, or an RLS `WITH CHECK` violation) is `not_permitted` with that
  cause. (2026-10-15; outcome_adapters, 2026-10-19)
* **`unexpected_error` keeps its `cause` but is never logged.** A throw inside a vault call that is no
  `VaultError` (a bug, or a host function's throw) becomes `unexpected_error` with the thrown value as
  `cause`, reaching the caller and nothing else: not the logger, not the platform's `reportError`,
  since it may quote secret material. `outcomeOf` is exported for an app wrapping its own calls and
  keeps a body's throw as `cause` likewise, so an app must not throw secret material from a body it
  wraps. `safebyok-react`'s `forBoundary` strips the `cause` before React's `onCaughtError`. The
  exceptions that carry nothing at all are the strength checker's and the key deriver's throws and
  `requestCleartext`'s (above). (A4 try_twins, a_sec, 2026-10-19; outcome_default, 2026-10-27)
* **`onBadNews` is told synchronously, once per error object**, for every bad-news refusal a call
  meets or a background read meets, and once per box a listing newly shows damaged. What the handler
  throws becomes the vault's `trouble` (a `bad_option` whose `cause` is the host's thrown value) and
  goes to the logger and `reportError`; during a vault's birth, with no Vault object yet, it is only
  logged and reported (TODO: the bank as the trouble pipeline). The news carries a boxlabel in
  `meta.box_listed`, never in a message. (fields_and_make, 2026-10-19; #303)

## Logging

* **What safebyok logs carries no secret material by the `VaultLogger` contract**: fixed messages, a
  story of `{ call }` (and a `refusalkind`), and an `err` that is a `VaultError` or an adapter's own
  error, never a record, scope, label, option value or validator issue. A host's own error passes as
  the host made it, unread and unscrubbed, and the default console logger prints it, though a
  storage client's error may quote the request it failed. A test sweeps every logger call for the
  fake passphrase, whisper, sidecar, ciphertexts and salts, down through each error's causes. With
  no `logger` the vault logs to the console (`console-logger.ts`, the one module in `src/` that
  touches it). (2026-10-15)
* **The default logger is one page-wide mutable object.** `DefaultLogger` forwards at call time to a
  target any code on the page that imports the same copy of safebyok can replace with
  `setDefaultLogger`, and so receive what safebyok logs where no logger was given: it widens who can
  read log lines, not what they contain. An adapter's logger is fixed when it is made and kept in a
  private field; a vault with no logger of its own uses its adapter's. Every logger is guarded, so a
  logger that throws cannot break a verb or escape a microtask. (store_base, logger_contract,
  2026-10-17)
* **A host listener's throw goes to the platform's `reportError` as it was thrown**, and to a logger
  as an error (`subscribe`, `ChangeBell`, the string stores): the error is the host's own, and a
  listener that puts a secret in its own error has chosen to. (store_base #139, 2026-10-17)

## Adapters and servers

* **Convex authorizes in the host, not in the component.** `SafebyokComponent.api({ getUserId })`
  builds the public functions the host re-exports, each refusing unless the host's `getUserId(ctx)`
  returns a non-empty id equal to the call's flat `user_id` argument (`identity_revoked` for another
  user's existing vault; `not_permitted` when `getUserId` says so, locking nothing). The component's
  own functions check no caller and trust their `user_id`; Convex lets only the host app call them,
  so a host that wraps them itself without the check exposes every user's rows. Its validators are
  made from the core's Zod shapes by `zodToConvex` (`convex-helpers`, a peer whose code runs inside
  the component's server functions, bundled by the host's Convex CLI; it shapes validators and holds
  no key material) but are looser where Convex has no check: names and tokens any text, epochs any
  number, the gate-and-`gate_epoch` rule dropped, a sidecar `v.any()`; a signed-in user can store
  malformed rows in their own vaults, which their own clients read as damaged. Expectations are
  checked inside the writing mutation (serializable transactions); the indexes are not unique, so a
  second record row for one scope would make every later call throw rather than pick one.
  `putVaultRecord` requires the stored `vault_tok` and a greater `gate_epoch` even from a modified
  client. `convexVaultDB` sets no timeout: offline, a call waits for the socket, and Convex resends an
  unacknowledged mutation on reconnect, so a write can land after its caller stopped waiting. Signing
  out locks the vault (`identity_revoked`; the client's watch rings on a failed `watchVault`).
  (2026-10-15; convex_helpers, 2026-10-27)
* **Postgres authorizes per request, and that check is the whole of it.** `postgresVaultDB` is made
  with the `user_id` the host's auth verified and refuses any other scope `not_permitted` before
  querying. Row-level security is enabled with no policy: the owner role bypasses it and every other
  role reaches no row; a host's `USING` policy that hides rows refuses nothing (a vault reads as
  absent, a write over a hidden row as `stale_write`). The `NOTIFY` payload is the scope, which any
  role able to connect may `LISTEN` for; the notify trigger is opt-in (`VaultNotifySql`). A box write
  locks the vault row `FOR SHARE`, then the box `FOR UPDATE`, and "landed" is the write's own
  condition (`xmax = 0`, a Postgres implementation detail; a misread would hand back a rival's box,
  which the base class refuses `corrupt_record`); a `23503` foreign-key violation is
  `vault_mismatch`. A birth writes, so the server's role needs `INSERT` and `UPDATE` on the vaults
  table and `DELETE` on tombstones; a read-only role is refused `not_permitted` at birth. (2026-10-15,
  2026-10-16; store_rulings #217, 2026-10-21; bank, 2026-10-22)
* **GraphQL authorizes nothing itself.** Each resolver calls the `VaultDB` that `vaultDBFor(context)`
  makes for the request, so the rule is that VaultDB's. Wayins and records cross as opaque JSON
  scalars (`SafebyokStoredRecord`, `SafebyokWayin`) that GraphQL does not check; only the core's
  `VaultDB` validation does, so a user can write a malformed wayin into their own vault and no one
  else's. The browser adapter rebuilds each relayed record from its own fields, dropping `__typename`,
  before the strict parse. The browser's urql client may keep vault records (ciphertext and visible
  fields) in its document cache, though every vault query is `network-only`. A subscription's user is
  fixed when it starts, so a session revoked meanwhile keeps hearing the vault's scope, never a
  record, until the subscription ends. (2026-10-15; reads #281, 2026-10-26)
* **IndexedDB**: each `idbVaultDB` write verb is one readwrite transaction that reads, compares and
  writes, aborting whole on any failure; the guarantee rests on the work inside awaiting only
  IndexedDB's own requests (`inOneTransaction`, `shelf.ts`). Its change bell is a `BroadcastChannel`
  per database carrying no scope and no record. `localVaultDB` checks and saves in one synchronous
  step and reports a full `localStorage` as `storage_unavailable` (the README says
  `storage_blocked`: an open row of the gripeoween triage). (2026-10-15)

## The browser: React, fields, passkeys

* **`BankProvider` makes one Bank per signed-in user** and lets every vault go (`bank.closeVaults()`)
  on sign-out, a user change, a shaping prop change and unmount; its `onBadNews` and
  `requestCleartext` are held through refs gated per bank, so a vault of a bank let go tells no news
  and asks no one, and the next user's handler never hears the last user's vault. The hooks see the
  held bank only while its `user_id` equals the prop. A child mounting in the same commit as a user
  change renders with the old bank and may start a birth on it that nobody lets go (an unusual
  tree). **A refused entry stays refused until the app asks again**: `vault_gone` and `vault_remade`
  are never re-ensured automatically, so a deletion on another device never births a new, gateless
  vault here unasked; the one automatic re-ask follows the dialog's explicit start over, which is off
  (`allowStartOver` is taken and offers nothing) pending a ruling. `useBank()` hands the host
  `ensureVault`, `delDamagedVault` and `clearCachedVault`, the last for the user's or host's say
  only. (bank_provider #259, 2026-10-22; bank_per_user, 2026-10-26; #278)
* **`GatingModal` asks every gating kind through the provider's own dialog**, shown only while the
  user's gesture is in hand (`navigator.userActivation`, true where the browser does not say), so a
  timer's or background call is declined unasked. A call waiting behind a change's dialog raises its
  own prompt once that dialog is cancelled: with the Cancel button, a user activation, it pops up at
  once; with Escape, which gives none, the transient activation (about five seconds) may lapse and
  the waiting call is declined silently. Misuse, or a non-`VaultError`, reaches React's
  `onCaughtError` through `forBoundary`, which drops any `cause` (it may quote what the user typed)
  and says so in the message; the dialog's form and the passphrase typed into it unmount with the
  failure. (react, 2026-10-24; #265)
* **The whisper and passphrase fields are uncontrolled**, so React writes neither into a `value`
  attribute and neither is in `outerHTML` for a CSS attribute selector (`input[value^="sk-"]`), an
  extension or a session recorder to read; `WhisperField` takes no `value` or `defaultValue` and sets
  both undefined after the host's props. `WhisperFieldAttributes` names the field `whisper_text`,
  sets `autocomplete="off"`, and turns off capitalizing, autocorrect and spell-check (a browser's
  enhanced spell-check sends a text field's content to its maker's servers, and with the whisper
  shown nothing else stops it); each password manager honours only its own flag, and Chrome ignores
  `off` on a password-type field (wontfix). **The passphrase field invites managers**
  (`new-password` while creating, `current-password` while unlocking) beside a hidden username
  field (`passphraseUsername`, default `<user_id> (<vaultlabel> vault)`, so a manager never takes
  the vault passphrase for the user's sign-in password). (2026-10-16)
* **Host code hears the passphrase in plain text as the user types.** `passphraseAdvice`, if the host
  gives one, is called at every change while choosing a passphrase; with none, the dialog asks the
  vault's guarded strength check on every keystroke, so a host checker that does anything off the
  device (a breach API, logging) does it on every prefix of the passphrase. The doc blocks say to
  keep it on the device, keep nothing and send nothing; nothing enforces it. (strength_principles,
  2026-10-17)
* **Passkeys in the browser.** `createPasskey` mints the PRF salt (32 random bytes) and a random
  user handle (so a vault's credential cannot replace a sign-in passkey on the same RP), asks
  `residentKey: 'discouraged'` and `userVerification: 'required'`; the core never calls WebAuthn and
  never stores the answer, which passes through host JavaScript as a `Uint8Array` the core zeroes
  once sealed (a copy the host kept is not). (2026-10-15)
* **The demo app calls Anthropic from the browser with the user's own key**
  (`dangerouslyAllowBrowser: true`), by design: the key is deciphered on the device inside
  `vault.useWhisper(...)` and sent only to `api.anthropic.com`. (2026-10-14)

## Dependencies and the build

* **Nothing younger than seven days installs** (`minimumReleaseAge: 10080`,
  `minimumReleaseAgeStrict`), transitive dependencies included, and the frozen-lockfile install in CI
  verifies the lockfile against it; the exceptions are `minimumReleaseAgeExclude` entries by name and
  exact version, each to be listed here until removed (none today; PROCESS.md, *Dependencies*).
  Dependabot's cooldown matches. Install scripts: `unrs-resolver` (a native resolver, development
  only) may run; `esbuild`'s is denied and it runs from its platform binary. (2026-10-14, 2026-10-15)
* **Runtime dependencies in or near the crypto path.** `@noble/hashes` (Argon2id, unaudited, above);
  `safe-stable-stringify` (the ctx encoding); `es-toolkit` (`deepFreeze` of records and sidecars);
  `@zxcvbn-ts/core` and `language-common` (loaded on demand from the host's own origin, about 214 kB
  shipped); `zod` `^4.6.7` as a peer the host supplies, whose classic build sets its global locale on
  import; `convex-helpers` as a peer running inside the Convex component; `hash-wasm` in
  `safebyok-fastkey` (unaudited, above). (2026-10-14 to 2026-10-27)
* **Argon2id stays out of a host's bundle only where a bundler tree-shakes it**: the main entry
  re-exports `argon2idWebV1Deriver` (the package is `sideEffects: false`), so a plain `require` or an
  unbundled import carries it. (2026-10-15)
* **The `safebyok/testing` entry ships `testDeriver`**, which any host can pass to a real vault (the
  `test_` warning above). It imports vitest, an optional peer, and no other entry imports it. The
  public packages' `exports` carry a `@safebyok/source` condition for the workspace's own tooling,
  stripped at `pnpm pack`; `scripts/release.ts` refuses a tarball still carrying it or a `workspace:`
  range, and each package's `prepublishOnly` refuses a publish not run by pnpm. (2026-10-15)

## CI and release

* **Release runs on push to main, on `workflow_dispatch`, and nightly.** Anyone with write access
  can dispatch it. `pack` runs `pnpm justify` and builds the tarballs without any token; `publish`, in
  the `npm` environment, is the only job that can mint an npm OIDC token (trusted publishing, with
  provenance, no stored token), installs with `--ignore-scripts`, and installs npm itself from a
  tarball checked offline against the `dist.integrity` recorded in `release.yml`, so a changed
  tarball on the registry stops the job rather than running beside the token. Neither runs on the
  nightly schedule, so a staged version the Coach rejected is not re-staged unattended. The trusted
  publisher allows `npm stage publish` and `npm dist-tag`, not `npm publish`: **a run could repoint
  `latest` or `next` at any public version with no 2FA approval** (the workflow runs no `dist-tag`
  today); a maintainer's 2FA makes a staged version public, and CI cannot. (2026-10-14, 2026-10-15;
  ci_pacing, 2026-10-27)
* **The `version` job holds a GitHub App's power.** It runs only on the nightly run and on dispatch
  (never on a push), in the `releasing` environment, which only `main` may deploy to, and mints an
  installation token (contents and pull requests, write, short-lived) from the App's private key, a
  secret of that environment. **Whoever holds the key can mint tokens with every permission the App
  was granted; the key never expires** and is revoked only by generating a new one. The token goes to
  the changesets action, which also runs `pnpm release:version`, repository code from main's tip, in
  the same job, so what merges to main can use that token when it next runs; whether the App can
  push to or merge `main` depends on branch protection, which the repository's files do not record.
  The Version PR is not put back in draft (`pr-draft: create`): the nightly run rebuilds a ready
  Version PR the Coach has already read, unattended, and may leave out what merged after it; the
  Coach rereads before merging (PROCESS.md, *Releases*). (2026-10-15, 2026-10-16; ci_pacing)
* **A workflow with the App's key runs on Dependabot's pull requests**
  (`dependabot-changeset.yml`, `pull_request_target`: main's copy of the file, with the `releasing`
  environment's secrets, whatever the pull request holds). It never runs anything the pull request
  wrote: it checks out main, installs main's lockfile with `--frozen-lockfile --ignore-scripts`
  before the token step, and main's `scripts/dependabot.ts` reads the branch's `package.json` files
  out of git as data, writing a changeset only when every commit on the branch is Dependabot's by
  author email; the token is cut to `contents: write`. One third-party module
  (`safe-stable-stringify`, a runtime dependency we ship) loads in a job that later holds the token.
  **Unproven as of 2026-10-28**: every run so far was skipped, so whether the environment's secret
  reaches a run Dependabot started, and whether the App's push re-runs CI, has not been seen.
  (2026-10-16; dependabot_changeset_install, 2026-10-21)
* **Pushes to main share one CI and one CodeQL concurrency group**, one run at a time; a run waiting
  is replaced by a newer push, so **a commit merged while another waited gets no CI or CodeQL run of
  its own**, the next commit's run covering it. Pull requests cancel their own run in progress. The
  group key holds the event name, so a fork pull request from a branch named `main` cannot join or
  cancel main's group. (ci_pacing, 2026-10-27)
* **CI trusts by login and by hash.** The changeset check is skipped only for a pull request on a
  `changeset-release/` branch opened by `safebyok[bot]`; renaming the App would have CI ask the
  Version PR for a changeset. Every action is pinned to a full commit SHA (Dependabot's weekly group
  proposes new ones); actionlint is fetched as a release tarball and checked against its recorded
  sha256 before it runs; the Postgres images are pinned by digest. The e2e Postgres container runs
  with no password (`POSTGRES_HOST_AUTH_METHOD: trust`), reachable on the contributor's loopback or
  the CI runner alone, holding only ciphertext the tests make: no credential to leak or to copy into
  a deployment. (2026-10-14, 2026-10-16)

## Standing questions for the Coach

Each is open as of 2026-10-28; the gripeoween triage (`whiteboard/20261028-gripeoween/`) tracks them
by id.

1. **A strength checker's `reason` is the `weak_passphrase` message verbatim** (GW-70), so a host
   checker that quotes the passphrase puts it in the refusal and the dialog.
2. **A whole `putBox` seals the listing's `registered_at` unopened** (GW-71): the one exception to
   "sign all immutable fields"; whether to close it.
3. **Where refusal `meta` can leak** (GW-72): `vault_stored` carries both wayins' salts and wrapped
   vaultKeys at the `VaultDB` layer and in the GraphQL and Postgres response bodies; `box_stored`
   carries ciphertext; TODO.md's *Redaction, batteries included* and *"sensitive" and "host" flags*
   are the two threads of the same audit.
4. **A damaged vault's tombstone can carry a counter lower than devices have seen** (GW-24), since
   `delDamagedVault` counts a `vault_epoch` it cannot read from zero.
5. **What "rollback" means** (GW-61): a restored backup rolling back boxes alone goes unnoticed; a
   lagging replica is a false alarm; the watermark, the tombstone counter, the device-record format
   rule and `stale_write` each guard a different "going backwards".
6. **The `dependabot-changeset` workflow is unproven** (GW-73): no run has done anything yet.
7. **"See if this is really needed"**: a partial `putBox` opens the stored box before re-sealing it,
   a decipher per partial put, so nothing tampered in storage is re-sealed under this device's key.
