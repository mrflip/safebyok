# 20261014-crypto: resolution

The crypto thread: real Argon2id/AES-256-GCM cryptography under the designed interface in [#5](https://github.com/mrflip/safebyok/pull/5), then the non-extractable session vaultKey in [#6](https://github.com/mrflip/safebyok/pull/6), with the Coach's decisions and rulings recorded here. Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

29 gripes: 6 unresolved, 23 resolved.

## Unresolved

- G268 **Decide:** whether `idb-keyval` stays a regular dependency of the core (only `safebyok/idb` loads it) or becomes an optional peer — old_gripes, humans_gripes, whiteboard_gripes
- G025 Reserve `whisper_codec` (default `json_v1`) and `whisper_schema_version` (default 1) in the lockbox record and its binding; Convex schema widens with them — todo_gripes, old_gripes, whiteboard_gripes, humans_gripes
- G124 Build natural expiry's timer: shut at `askPassphraseAt` + 60 s, re-armed within setTimeout's 2^31-1 ms reach, taking over from `ensureUnlocked()`, with a security note — todo_gripes, prs_60_80, whiteboard_gripes
- G133 Pass an abort signal into a long key derivation — old_gripes, whiteboard_gripes
- G141 Design the conflict-handler hook for erase-versus-update collisions after the retry limit (Coach: comes with the retry work, which exists) — todo_gripes, old_gripes, whiteboard_gripes
- G500 An opt-in `lockWhenHidden` prop on safebyok-react (and its naming clash with the README recipe) — ruled "not yet" (TODO side quest) — old_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G001 Replace the plaintext stub vault with real cryptography, and never publish the stub → Argon2id and AES-256-GCM, bound to context, landed before the first real publish (PR#5)
- G002 Keep the in-memory vaultKey non-extractable → done at the Coach's request (PR#6)
- G003 Get the Coach's yes for runtime deps `@noble/hashes`, `@scure/base`, `idb-keyval`, `safe-stable-stringify` → resolved with the Coach in chat; hand-rolled stableJsonify replaced (PR#5)
- G004 Confirm the KeyDeriver seam as the reading of "security first, pluggable second" → blessed in chat, made required in openVault (PR#40)
- G021 Type and visibility of `whisper_schema_version` → Coach: public metadata, an integer, defaults to 1 (Coach ruling, whiteboard/20261014-crypto/rulings.md)
- G076 Add compare-and-swap writes and a conflict kind (revision_id/epoch were stored but unused) → `versionedUpdate`, storage verbs, `stale_write` (PR#18)
- G077 Close the vault_id hole (a box from a destroyed vault landing in its recreation) → `vault_id` expectations on writes and erases (PR#18)
- G078 Retry a `store()` that loses a race → up to three attempts (PR#44) with a jittered doubling backoff (PR#45)
- G086 Build `lockSoon(grace)` and a screen-lock recipe; say that locking ends the remembered unlock → built, README recipe and sign-out recipe (PR#60)
- G186 VaultDB should be verbs adapters implement, not dumb primitives → Coach: smart verbs, `versionedUpdate`; built (Coach ruling, PR#18)
- G187 Erases need an expectation (erase-wins overturned) → Coach: `vault_id`-only expectation on `eraseBox`/`eraseVault` (Coach ruling, PR#18)
- G188 Storage contract integers: no BigInt → Coach: integers up to MAX_SAFE_INTEGER (Coach ruling, whiteboard/20261014-crypto/rulings.md)
- G216 Build a Convex VaultDB adapter (own package, typed columns, convex a peer) → component and `convexVaultDB(client, api.safebyok)` (PR#17-PR#20)
- G262 Make IndexedDB `versionedUpdate`, `doEraseVault` and `doUpdateBox` single transactions (orphaned lockboxes) → every write verb one readwrite transaction, four race tests (PR#77)
- G347 Ask for `navigator.storage.persist()` and say there is no recovery → done (PR#33)
- G391 Is zod a regular dependency or a peer? → peer `^4.0.0` (PR#5)
- G454 Give `Ciphered` a VOCABULARY line or a better name → blessed; VOCABULARY defines it (old_gripes, Addressed)
- G456 Bless commit prefixes `demos:` and the safebyok-react prefix (`api:`/`react:`) → PROCESS.md rows; `client:` for safebyok-react (old_gripes, Addressed; PROCESS.md)
- G460 Note that the unlock window is per-device client-side politeness → Coach NOTED (old_gripes, Addressed)
- G470 Land the renames that break after 0.1.0 before it: `keyDeriver` required, `rememberForMs` to `forcePassphraseReentryHours` (VaultProvider prop too), `expiresAt` to `askPassphraseAt` → done (PR#40)
- G471 Audit for late optional fields at critical boundaries (`Lockbox.note`, DeviceUnlock shape) → boundary audit (PR#43)
- G473 Provide a reader for the stub's stored formats → none needed, nothing was published (PR#12)
- G487 Fix the relic's 24 survey issues and retire its API dead ends → relic rewritten against src/, recovery kits stripped (PR#5)
