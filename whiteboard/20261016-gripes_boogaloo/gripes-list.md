# Gripes remaining

Every gripe from the gripes_boogaloo harvest still wanting work or a decision, as of 2026-10-16; ids are shared with gripes-done.md. `**Decide:**` marks an item awaiting the Coach; *Deferred by the Coach* holds what the Coach shelved.

264 remaining: 244 open (54 of them awaiting a Coach decision) and 20 deferred by the Coach. 265 more are answered in gripes-done.md.

## Crypto & key derivation

- G023 **Decide:** drop `note` for a reserved, bound `sidecar` (any JSON, default `{}`), or keep label-plus-note and let hosts keep their own table — todo_gripes, old_gripes, whiteboard_gripes
- G024 **Decide:** whether `deriveKeyBytes` refuses a salt whose length differs from the spec's (a corrupt stored salt reaches hash-wasm/noble as a plain Error) — bigfeats_doc, prs_60_80, whiteboard_gripes
- G025 Reserve `whisper_codec` (default `json_v1`) and `whisper_schema_version` (default 1) in the lockbox record and its ctx; Convex schema widens with them — todo_gripes, old_gripes, whiteboard_gripes, humans_gripes
- G026 Build padding: a pluggable stringifier padding serialized JSON inside the encryption (PADME or power-of-two buckets, 64-byte minimum) — todo_gripes, old_gripes
- G027 Survey standard payload sizes (API keys, OAuth tokens, service-account JSON, PKCS#8 keys) so no kind sits alone in a padding bucket — todo_gripes
- G028 Ship built-as-a-whole recommended KDF configurations plus functions to roll your own, following `argon2idDeriver(spec)` — todo_gripes, humans_gripes, prs_60_80, whiteboard_gripes
- G029 Reserve a label namespace for supplied KDF specs (refuse host labels like `argon2id_web_*`) — humans_gripes, prs_60_80, whiteboard_gripes
- G030 Run the Argon2id schema at `Vault.make` for any hand-built deriver declaring `algorithm: 'argon2id'`, so an unrunnable spec fails with a kind, not at unlock — humans_gripes, prs_60_80, whiteboard_gripes
- G031 Split the `KeyDeriver` type by algorithm (today `Partial<KeyDeriverSpec>` gives every deriver Argon2id's fields) before 1.0 — humans_gripes, prs_60_80, whiteboard_gripes
- G032 Zero the passphraseKey bytes after `importKey` in `unlock()` and `changePassphrase()` — prs_60_80, whiteboard_gripes
- G033 `argon2idDeriver`: name bounds once instead of repeated literals, and report an oversized `parallelism` under its own field, not `memory_kib` — prs_60_80, whiteboard_gripes
- G034 Refuse with a kind a `deriveKeyBytes` result backed by a `SharedArrayBuffer` (today it fails at `importKey` with none) — prs_60_80, whiteboard_gripes
- G035 Stop the 1 GiB Argon2id refusal naming `@noble/hashes` when the wasm deriver shares the bound; let `parseKeyDeriverSpec` take `unknown` — bigfeats_doc, prs_60_80, whiteboard_gripes
- G036 `safebyok-argon2-wasm`: survive hash-wasm caching a failed compile (CSP refusal persists until reload); check older Safari's `'unsafe-eval'` need in real browsers — bigfeats_doc, prs_60_80, whiteboard_gripes
- G037 Have a security reviewer look at hash-wasm (no published audit; C compiled to wasm) — bigfeats_doc, whiteboard_gripes
- G038 Measure the Argon2id derivation on real browsers and mobile, not only Node/V8 — old_gripes
- G039 Say in notes/security.md that injected code (XSS, an extension, a stolen unlocked device) can still use the non-extractable vaultKey to read whispers — old_gripes
- G040 `CipherBindingPart` silently drops a field set to `undefined` by mistake; the lockbox format tag is bound twice — prs_80_main, whiteboard_gripes

## Ways in: wayins, passkeys, revocation & rotation

- G061 **Decide:** whether `wayinlabel` is checked only where a way in is added (built), not where a stored wayin's label is read; rec entry-only — gripes_1_doc, todo_gripes, prs_open, whiteboard_gripes
- G062 **Decide:** rotation's open names and shapes: `rolled_back` kind, `vault_key_epoch`, `prior_vault_key`, `DeviceMark`, `device_id`; `retireWayin({ rotate })` vs separate `rotateVaultKey` — prs_80_main, whiteboard_gripes
- G063 **Decide:** whether the listing marks damaged a lockbox under an unknown `vault_key_epoch`, and whether the snapshot counts boxes still to re-encrypt — prs_80_main, whiteboard_gripes
- G513 **Decide:** a way out of `rolled_back` after a legitimate restore: keep the `deviceDB.eraseMark(scope)` recipe for 1.0, a hatch (`retireDamagedVault` accepting `rolled_back`, or a sibling) only if a host asks; rec keep — matters
- G514 **Decide:** a failed device-mark write after a wayin change landed rejects a change that landed (`grantLease`'s device write likewise); rec best-effort, log and don't reject — matters
- G064 Build rotation_shape (thread 14): `vault_key_epoch`/`prior_vault_key` on vault props, epoch and random `device_id` on wayins, epoch on lockbox, `DeviceMark` rollback check — bigfeats_doc, prs_80_main, whiteboard_gripes, humans_gripes
- G065 Build rotation_adapters (thread 18): the `vault_key_epoch` comparison in IndexedDB, Convex, Postgres (vault props row FOR SHARE in the insert) and GraphQL — bigfeats_doc, prs_80_main, whiteboard_gripes
- G066 Build rotation_verb (thread 19): `rotateVaultKey(keep)` with its resumable lockbox walk, reads through the prior key, fault-injecting tests — bigfeats_doc, whiteboard_gripes
- G067 Build rotation_docs (thread 20): README "Rotating the vaultKey", adapter-author note, demo "remove and lock out" button, VOCABULARY rows, notes/security.md entries — bigfeats_doc, whiteboard_gripes
- G068 Detect rollback: a device should refuse the vault props whose epoch went backwards (today `refresh()` takes up any changed epoch) — bigfeats_doc, prs_80_main, whiteboard_gripes
- G069 Try passkeys on real authenticators (Chrome platform passkey, Safari, a security key), incl. addPasskey's prompt after Argon2 on slow devices/older Safari — todo_gripes, bigfeats_doc, prs_60_80, prs_80_main, humans_gripes, whiteboard_gripes
- G070 `addPasskey`: a `lock()` during the WebAuthn prompt still lands the passkey, and a `stale_write` orphans it with no retry reusing the made passkey — prs_80_main, whiteboard_gripes
- G071 Offer a relabel verb for `wayinlabel` (bound into the wrap, so it needs a proof) — bigfeats_doc
- G072 Let `changePassphrase` take a passkey proof (today `bad_option`; recovery is addPassphrase then retireWayin) if wanted — bigfeats_doc
- G073 Plain `wrong_passphrase` beside wayins another deriver made does not mention the deriver — prs_60_80, prs_80_main, whiteboard_gripes
- G074 Move the wayin `salt_b64` decode check from unlock into the record schema at read (once schemas tree-shake) — prs_60_80
- G075 Clean up wayin/vault helpers: unused `sessionKey` from seal helpers, duplicated `absent_wayin` message, an errors.ts comment promising an unthrown case (status unclear) — prs_60_80, whiteboard_gripes
- G515 Show `device_id` and `registered_at` in the snapshot's `wayins` (#120 left them out) so a host can show which device added which wayin — handed on to a new sprint (thread 20) — matters
- G516 #120 rollback-check leftovers: a background refresh meeting `rolled_back` leaves the vault unlocked; the message names `eraseMark`; two tabs may each mint a `device_id` after the recipe; a decoy `vault_id` clears a mark; `keptMark` warns only for a host's DeviceDB; redundant reads and parses — matters

## Vault core: make, hello, unlock, lock, storeBox, retireBox, expiry, errors, logger

- G115 **Decide:** #60's four `lockSoon()` calls (snapshot flips at once, unlock in grace wins, 60 s cap, `close()` throws `vault_closed`) and #55's `vault_locked` for a lost unlock; rec keep — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G116 **Decide:** `retire()` on a handle that never saw the vault props resolving without retiring, a retry after a refused `retire()` taking the reborn vault, and `retire()` needing no unlock — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G117 **Decide:** whether retire-wins needs a kind apart from an exhausted retry's `stale_write`, and `vault_locked` vs `stale_write` when a retry finds the device relocked — old_gripes, humans_gripes, whiteboard_gripes
- G118 **Decide:** group several offending values into one refusal ("Group error messages?"); Coach said fine-grained until there are too many — todo_gripes, whiteboard_gripes
- G119 **Decide:** whether `whenIdentityRevoked: 'stay'` should exist, and whether a lock withholds a whisper already on its way out of `readBox()` — prs_80_main, whiteboard_gripes
- G120 **Decide:** whether "may be newer" (retireDamagedVault refusal) and "sound vault" (`bad_option`) want kinds of their own apart from `damaged_vault` — prs_80_main, whiteboard_gripes
- G121 **Decide:** whether the listing should detect damage it cannot see today (altered ciphertext, missing whisper show only at `readBox()`) — gripes_1_doc
- G122 **Decide:** whether `Vault.make` keeps duck-typing `vaultDB` (a hand-written object skips the base class's checks) or checks a brand — prs_60_80, humans_gripes, whiteboard_gripes
- G123 **Decide:** whether `maxWhisperBytes` being checked on write only is intended — old_gripes
- G474 **Decide:** confirm #40's calls: the entry is `safebyok/browser` (the Coach had said `basic`), one frozen `browserOpts` bag per `dbName`, `SevenDaysMs` removed — old_gripes, whiteboard_gripes
- G124 Build natural expiry's timer: shut at `askPassphraseAt` + 60 s, re-armed within setTimeout's 2^31-1 ms reach, taking over from `ensureUnlocked()`, with a security note — todo_gripes, prs_60_80, whiteboard_gripes
- G125 `lockSoon()` leftovers: an already-expired held key gets a full grace; `ensureUnlocked()` can take a key from a store in hand; grace timer not `unref`'d — prs_60_80, whiteboard_gripes
- G126 `close()` during an unlock's record write loses the older lease that write overwrote; `close()` does not move the shut counter — prs_60_80, whiteboard_gripes
- G127 A clock that goes bad mid `storeBox()`/`retireBox()`/`changePassphrase()` lets the write land, then throws `bad_option` from the closing refresh — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G128 A backward clock step erases a fresh lease — todo_gripes, humans_gripes, whiteboard_gripes
- G129 Tabs opening with different settings erase each other's leases — todo_gripes, humans_gripes, whiteboard_gripes
- G130 Wrap a `deviceDB.readLease` failure at open as `storage_unavailable` so it reaches `openError`, not the error boundary — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G131 A lock in one tab does not stop an unlock under way in another (needs a shared signal); DeviceDB has no compare-and-erase — whiteboard_gripes
- G132 A lock during a wrong-passphrase check surfaces `wrong_passphrase` rather than `vault_locked` — whiteboard_gripes
- G133 Pass an abort signal into a long key derivation — old_gripes, whiteboard_gripes
- G134 Logger leftovers: rate-limit warnings from a watch on broken storage; log a failed catch-up after `stale_write` as such, not "a background refresh" — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G135 Give `VaultLogger.log` a call site, or stop requiring it — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G136 Serialize the core's refreshes (every open runs two at once, which can interleave after a write) — old_gripes, whiteboard_gripes
- G137 Make `quietRefresh` surface a failed catch-up read after a stale refusal, so the device relocks and the retirement reaches the snapshot — old_gripes
- G138 Restore a look before writing in `storeBox()`/`retireBox()`: a session stale from a passphrase change elsewhere can write before relocking (status unclear: expectations may now cover it) — old_gripes
- G139 Retry `changePassphrase()` and `retire()` on `stale_write` so a concurrent change elsewhere does not reach the user — old_gripes
- G140 `readBox()`/`useBox()` report a misleading damaged/corrupt kind on a box the successor vault rewrote (status unclear since #108) — old_gripes
- G141 Design the conflict-handler hook for retire-versus-update collisions after the retry limit (Coach: comes with the retry work, which exists) — todo_gripes, old_gripes, whiteboard_gripes
- G142 Reduce refresh cost growing with the vault (every refresh reads every lockbox; a whisper sits in memory several times) — old_gripes
- G143 Avoid a full refresh on every refused `storeBox()` in a vault at its limit — old_gripes, whiteboard_gripes
- G144 `storage_unavailable` also wraps an adapter's own programming errors (TypeError) under "try again shortly" — old_gripes, humans_gripes, whiteboard_gripes
- G145 `retireDamagedVault` aims at `vault_id` alone, so a same-id rewrite between its read and retirement is retired too (fix touches VAULTDB.md 3.5) — prs_80_main
- G146 The damaged-vault props hatch cannot reach Convex, Postgres or GraphQL, and a local vault props that is not JSON cannot be cleared — prs_80_main, whiteboard_gripes
- G147 `damagedAs` maps only a rejected promise (a synchronously throwing VaultDB still says `corrupt_record`); decipher messages quote the stored boxlabel — prs_80_main
- G148 `heed` waits on the device store's erase before rethrowing, so a never-settling device store hangs the refused call — prs_80_main, whiteboard_gripes
- G149 Reduce duplication in vault-db validation: `checkOutgoing`/`checkRecord`, four listener checks, scope comparison, double parse per write — prs_60_80
- G522 #106 leftovers: a closed handle's in-flight `identity_revoked` still erases the remembered unlock; every `ConvexClient` watch error refreshes; opening before auth is ready erases the remembered unlock — matters

## Validation, labels & names

- G172 **Decide:** write the table of what each validator guarantees (database limit, canary, constraint; client/server; read/send/write/entry) and place each check by it — todo_gripes, whiteboard_gripes
- G173 **Decide:** re-examine the validators interface: deposit validators on a dispatch object built once instead of passing a bag per verb; should a bare verb refuse or admit — prs_open, humans_gripes, whiteboard_gripes
- G174 **Decide:** whether well-formed text is a floor beneath a host's own schema too (a host `z.string()` admits a lone surrogate Convex then refuses) — todo_gripes, prs_open, whiteboard_gripes
- G175 **Decide:** whether `AnyTextValidators` admitting control characters in labels (which reach `snapshot.boxes`) is acceptable — todo_gripes, prs_open
- G176 **Decide:** whether server-side names as any text (Postgres route, `listBoxRecords`, GraphQL resolvers) is the guarantee for a host serving several clients — todo_gripes, bigfeats_doc, prs_60_80
- G177 **Decide:** whether the note's control-character rule must also hold on the server, in the listing, and under a host validator — todo_gripes
- G178 **Decide:** stored-field underbar_case at the facades (`key_deriver_label`) or only at the adapter, and `keyDeriverLabel` vs STYLE's smush rule — old_gripes, humans_gripes
- G475 **Decide:** approve #117's new public surface: `Sanitizer.refusalFor` on the main entry and the `wayinlabel` field of the validator bags — prs_open
- G179 Record "label grammar on the server" in TODO's validator-guarantees section (thread 17), and move the label/user-id entries under it — bigfeats_doc, whiteboard_gripes
- G180 Verify Convex's real refusal text for a lone surrogate in a stored string (convex-test admits it) — todo_gripes, prs_open, whiteboard_gripes
- G181 Sort `listBoxes` by code point instead of runtime-locale `localeCompare` (vault-db.ts, idb.ts), matching Convex byte order — old_gripes, humans_gripes, whiteboard_gripes
- G182 Tell hosts allowing non-ASCII labels to require NFC, and to widen a grammar only after every client upgraded — old_gripes, humans_gripes
- G183 `OurChecks` recognises our schemas by identity, so two copies of the core fall back to vaguer refusal wording — prs_open, whiteboard_gripes
- G184 Measure the cost of `checkValidators` on every verb call and every VaultProvider render — prs_open, whiteboard_gripes
- G185 `Ckeys` does not check its inputs at runtime — prs_80_main
- G476 The host's validator can run up to four times per verb (`checkStandingBoxlabel` calls `Names.check` only for its refusal) (status unclear after #117) — gripes_1_doc, prs_80_main, humans_gripes

## Storage contract, VaultDB base & battery

- G203 **Decide:** add a CI job against a real Postgres (service container, a `pg` Pool per device) to test lines 3.x under concurrent statements; rec yes, own thread — prs_open, prs_80_main, whiteboard_gripes
- G204 **Decide:** keep #119's 6.1 change (a watch calls once as it goes live: one extra `onChange` a host may count); rec keep — prs_open, whiteboard_gripes
- G205 **Decide:** whether a write should return a best-effort count (contract deviation; changes every adapter's `updateBox` and the GraphQL wire) — prs_80_main, whiteboard_gripes
- G206 **Decide:** whether VAULTDB.md ships in the npm tarball (it does now) or lives on GitHub — prs_80_main, whiteboard_gripes
- G478 **Decide:** rule on the adapter `do*` hook naming (mechanical rename if another rule is preferred) — old_gripes, whiteboard_gripes, humans_gripes
- G511 **Decide:** a host `onChange` that throws at Postgres's watch start becomes an unhandled rejection (#119's fire-and-forget start call; no adapter guards `onChange`); rec fold into the logger sweep (G210) — matters
- G207 Write the store base-class design in whiteboard/ and build it: a connector implements only list, replace and delete; fetch/update built on them (Coach: LGTM, design first) — todo_gripes, bigfeats_doc
- G208 Move `listBoxRecords` into the VaultDB base, built from common verbs and overridden where one query does it (Coach yes; Postgres and GraphQL hand-write it today) — todo_gripes, bigfeats_doc, prs_60_80, humans_gripes, whiteboard_gripes
- G209 Catch a throwing listener once in the shared `subscribe` (`reportError` where available); the core memory store lets it escape a landed write — todo_gripes, bigfeats_doc, prs_80_main, whiteboard_gripes
- G210 Logger everywhere (Coach: ready to start): report swallowed failures to `VaultLogger` — Convex watch (`convexVaultDB` logger option), Postgres listen, GraphQL subscription, IndexedDB, React — todo_gripes, bigfeats_doc, prs_60_80, humans_gripes, whiteboard_gripes
- G211 Decide who hands a store the logger (the vault owns it today) as part of the logger sweep — bigfeats_doc
- G212 Offer `live: false` (or similar) in the snapshot for a "not syncing" UI when a store's watch fails — bigfeats_doc, humans_gripes
- G213 Give the base shared refusal constructors (`storage_unavailable`, `stale_write`, `not_permitted`, `vault_full`) with a never-null cause, so adapters stop copying core messages — bigfeats_doc, prs_60_80, whiteboard_gripes
- G214 Make it simple to add and test a new adapter: no-op defaults only for truly optional verbs (a watch on a store that cannot push) — bigfeats_doc
- G215 Race tests made core tests ~2 s → ~17 s and Convex ~5 s → ~11 s by waiting out 2 s deadlines on purpose — prs_open, whiteboard_gripes
- G523 Battery leftovers: the capped Postgres/GraphQL factories omit `listen`; `MapVaultDB` counts by copying every row; IndexedDB's stray-field check is a base-class test, not a battery test over `idbVaultDB` — matters

## Convex adapter

- G232 **Decide:** keep dropping every foreign Convex error's cause (built), or sniff `ArgumentValidationError`/`ReturnsValidationError` and keep the rest; rec drop all — gripes_1_doc, prs_open, whiteboard_gripes
- G233 **Decide:** demand a host function named `getUserId`, or make identity a core seam every adapter takes (it may not go through the database); "soonish" — todo_gripes, prs_open, whiteboard_gripes, old_gripes
- G234 **Decide:** the demo over Convex needs a deployment and an auth story for `getUserId`, both the Coach's to choose — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G235 **Decide:** approve `vite` as a dev dependency of `safebyok-convex` (added off the approved list) — old_gripes
- G236 **Decide:** keep the hand-written unsubscribe once-guard in `convexVaultDB`, or take a library — old_gripes, humans_gripes, whiteboard_gripes
- G237 **Decide:** Convex agent tooling: re-sync plan for vendored skills, nested-skill visibility for subagents, `guidelines.md`, installing Convex's own plugin — old_gripes, humans_gripes, whiteboard_gripes
- G238 Rebuild #111 as the Coach's option (b): client-pairing tests back in `safebyok-convex` via a `/testing` entry; settle `fakeDeployment(host)` and convex-test as optional peer — bigfeats_doc, prs_80_main, whiteboard_gripes
- G239 Write the Convex client-pairing loop bodies once (not per client), and make a coverage report measure `convex-vault-db.ts` again — bigfeats_doc, whiteboard_gripes
- G240 Convex battery follow-ups: pass `pushes: true` and `makeVaultDBFor`, drop tests repeating lines 1.1-3.5, 5.4, 6.1 — prs_80_main, whiteboard_gripes
- G241 Give Convex a capped battery factory (MaxVaultLockboxes 8,000 is a server constant no test can lower) — prs_80_main, whiteboard_gripes
- G242 The Coach walks the Convex README cold in another app as the acceptance test; what trips becomes a TODO — todo_gripes, old_gripes
- G243 Run against a real Convex deployment: concurrency, invalidation, `setAuth`/JWT refresh, reconnect, resend, error redaction, the big-vault retirement — old_gripes, whiteboard_gripes
- G244 Run a real Convex dev deployment's error text through the sanitizer and the "never quotes" leak test — prs_open, prs_60_80, whiteboard_gripes
- G245 Check production Convex read accounting against `getDocumentSize`, and a rollback deploy beside the leftover tally table — humans_gripes, whiteboard_gripes
- G246 Add timeouts to Convex calls (offline calls wait; an abandoned write can land on reconnect) — old_gripes
- G247 Make the component check rows beyond structure: empty ids, `vault_id` constancy, epoch increase, `revision_tok` freshness — old_gripes, whiteboard_gripes
- G248 `watchVault` reads whole lockbox documents to emit revision pairs (Convex cannot project fields) — old_gripes, whiteboard_gripes
- G249 Make the `./test` entry stop assuming Vite/vitest (`import.meta.glob`) and importing devDependency `convex-test`; stop wrappers restating validators — old_gripes, todo_gripes, prs_60_80, whiteboard_gripes
- G250 Guard the fake socket that follows convex 1.46.0's wire protocol against a convex bump — old_gripes, whiteboard_gripes
- G251 Run Convex codegen against a real deployment (`ComponentApi` is derived, `_generated/` from templates) — old_gripes, whiteboard_gripes
- G252 Decide on Convex revision history (only current rows kept; no recovery from a bad overwrite) — old_gripes
- G253 Give `Lease` a JSON form, or accept only structured-clone stores can hold one — old_gripes
- G254 `boxes` validated as `string[][]` since Convex has no tuple validator — old_gripes, whiteboard_gripes
- G255 PR#102 leftovers: `getUserId` relying on `this` passes the check; setup tests repeat `hostWith` and pin exactly 9 functions; `checkedApiOpts` cast; test counts disagree — prs_open, whiteboard_gripes
- G256 Measure importing `VaultError` into Convex `server.ts` with a real `convex deploy`, not only esbuild — prs_open
- G257 Sanitizer leftovers: safebyok's own Convex refusals still carry the `ConvexError` as cause; the two storage-trouble messages are near-copies; a client-side failure points at deployment logs — prs_open
- G258 `convexVaultDB` declares `maxVaultBytes` half the transaction read limit while the component holds 7 MiB less 1 KiB; an honest client can meet the component limit first — whiteboard_gripes
- G259 Update whiteboard/20261014-convex/design.md's header, which still says "Intent, not yet code." — old_gripes

## IndexedDB adapter & browser stores

- G268 **Decide:** whether `idb-keyval` stays a regular dependency of the core (only `safebyok/idb` loads it) or becomes an optional peer — old_gripes, humans_gripes, whiteboard_gripes
- G269 Add a size-limit entry for `safebyok-indexeddb` (root `pnpm size` measures only the core and argon2-wasm) — bigfeats_doc, whiteboard_gripes
- G270 Bring the core device-store bell up to date: post before anyone subscribes, call listeners on their own microtask — bigfeats_doc, prs_60_80, whiteboard_gripes
- G271 Test IndexedDB across two connections (two tabs) and transaction lifetime in a real browser; race tests share one connection — old_gripes, prs_60_80, whiteboard_gripes
- G272 Check across tabs that memory/localStorage stores with no conditional write are atomic — old_gripes
- G273 IndexedDB leftovers: `settle` replaces any non-Error rejection; `doListBoxes` makes two requests where one cursor would do; a listenerless tab opens a channel per write — prs_80_main, whiteboard_gripes
- G274 `inspectIdbVaultDB` still uses idb-keyval `entries`/`clear` directly — whiteboard_gripes
- G491 Guard the local adapters' `Infinity` byte cap against browser storage quotas — old_gripes

## Postgres adapter

- G285 **Decide:** whether 1000 is the right default `maxLockboxes` for Postgres and GraphQL (big_feats recommended no practical limit) — bigfeats_doc, prs_80_main, whiteboard_gripes
- G286 **Decide:** what the Postgres equivalent is of Convex's deployment test file (migration-like, with all its functions) — the Coach's question — bigfeats_doc
- G287 Test `safebyok-postgres` against Supabase (the section is written from docs) — bigfeats_doc, prs_60_80, whiteboard_gripes
- G288 Run Postgres races (overshoot, 23503, hard-cap trigger per isolation level) on a real multi-connection Postgres; PGlite runs one statement at a time — prs_60_80, prs_80_main, prs_open, whiteboard_gripes
- G289 Route-borne vault props, lockboxes and expectations are validated server-side only as far as the core's VaultDB does (past scope and boxlabel) — bigfeats_doc, prs_60_80, whiteboard_gripes
- G290 `placeholderOf` throws a plain Error at module load for a column-list mistake — bigfeats_doc, prs_60_80, whiteboard_gripes
- G291 Hard-cap trigger docs: old tables keeping the count trigger can deadlock `retireBox` against `retireVault` (changeset should say "must" drop it); its refusal is `storage_unavailable` — prs_80_main, whiteboard_gripes
- G292 README leftovers: `listen` without `VaultNotifySql` is silent by design (say so); miss reasons computed on a landed write; a `kind as 'vault_full'` cast — prs_80_main
- G293 The pending `20261015-store_vault_cap` changeset still announces `lockbox_count`, which #113 removed — prs_80_main

## GraphQL adapter

- G300 **Decide:** keep opaque JSON for `wayins` in the schema rather than a typed union (GraphQL has no input unions) — bigfeats_doc, prs_60_80, whiteboard_gripes
- G301 Export `VaultOperations` (the client's documents) from the package entry for hosts with persisted-operation allowlists — bigfeats_doc, prs_60_80, whiteboard_gripes
- G302 `unlock_epoch` is a GraphQL `Int` (32-bit), narrower than the core's safe integer; past 2^31 it reads as `storage_unavailable` — bigfeats_doc, prs_60_80, whiteboard_gripes
- G303 GraphQL validation/coercion errors carry no kind and reach the browser as retryable `storage_unavailable` — bigfeats_doc, prs_60_80, whiteboard_gripes
- G304 A misconfigured `vaultDBFor` crosses to the browser with its own kind, `bad_option` — bigfeats_doc, prs_60_80
- G305 A listed record missing a non-null field crosses as `storage_unavailable` rather than `corrupt_record` — bigfeats_doc
- G306 Mismatched client and server versions fail on an unknown field as retryable-sounding `storage_unavailable`; say they must move in step — prs_80_main, whiteboard_gripes
- G307 Try `safebyok-graphql` with graphql 16, Apollo Server, Mercurius, graphql-ws and a real HTTP disconnect — bigfeats_doc, prs_60_80, whiteboard_gripes

## React binding & dialog

- G321 **Decide:** add an `onError` prop to the dialog components (React 19's `onCaughtError` is the one place today); rec none until a host asks — prs_80_main, whiteboard_gripes
- G322 **Decide:** guard a `logger` (or validators) written inline in JSX that reopens the vault every render, beyond the README warning — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G323 Add i18n string helpers: a host supplies its own strings and locale (one messages bag on VaultProvider or per-component props); sentence frames are English literals — todo_gripes, gripes_1_doc, prs_80_main, whiteboard_gripes
- G324 Dialog wording leftovers: a window just under `ForeverMs` reads "in 288,000,000,000 minutes"; an engine without `Intl.RelativeTimeFormat` throws to the boundary — gripes_1_doc, prs_80_main, humans_gripes, whiteboard_gripes
- G325 Test every window unit in the "Locks again" wording, not only the creating wording — gripes_1_doc, prs_80_main, whiteboard_gripes
- G326 Accessibility: the gripe's `role="alert"` mounts with text (not re-announced); Escape on the notice does not stop propagation; focus check misses shadow roots — prs_80_main, whiteboard_gripes
- G327 Give the passphrase form itself dialog semantics, and drop a passkey gripe once a later passkey press is dismissed — prs_80_main, whiteboard_gripes
- G328 `withUnlockedVault` races: a lock between the shared unlock and retries throws `vault_locked` to every waiter; a rejection just after unlock opens a second dialog — prs_80_main, whiteboard_gripes
- G329 Tie each dialog to its vault: a stale action's late `vault_locked` joins a dialog over the next vault; one between `vault_locked` and its catch opens over an unlocked vault — prs_80_main, whiteboard_gripes
- G330 A late unlock silently closes a dialog the user is typing in — prs_80_main, whiteboard_gripes
- G331 Reset the Boundary when a hand-rendered dialog's vault changes — whiteboard_gripes
- G332 `PasskeyUnlockButton` (like `PassphraseModal`) reads the snapshot without subscribing — bigfeats_doc, prs_60_80, whiteboard_gripes
- G333 VaultProvider reopens on any `bad_option`, misuse included — prs_80_main
- G334 Say in the React README that "never put secrets in state" conflicts with a reveal/view feature that puts whispers into React state — old_gripes, whiteboard_gripes
- G335 Move the passkey helper out of safebyok-react into its own package if a Vue binding wants it — bigfeats_doc, whiteboard_gripes

## mask & utils

- G343 Review `mask`'s commits after the reviewer's last: second NFC pass, U+FFFC strip, caps, widened property test — old_gripes
- G344 Check `mask` rendering in real terminals, fonts and Unicode versions other than Node 24's — old_gripes

## Demo

- G355 **Decide:** the wording of the demo's "Erase and start over" confirm text and button (placeholders for the Coach) — prs_80_main
- G356 Click through the demo's passphrase dialog in a real browser (set, enter, mistype, dismiss); no one has since safebyok-react became a built package — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G357 Fix demo copy: `persist()` asked before a gesture, no "only in this browser" line, a new-vault dead end, no error boundary, blank note clears (status unclear: partly done by #33/#61) — old_gripes
- G358 The demo LockChip prints a 2255 date for the clamped Infinity deadline; show "never" when `askPassphraseAt === FarFuture` — whiteboard_gripes
- G359 The demo's "saved" label shows `changed_at`, which stands still on an identical re-save — prs_60_80
- G360 Demo `createAuth` does not validate its `clock` — prs_60_80, whiteboard_gripes

## Tests & helpers

- G373 **Decide:** what level of e2e testing is appropriate, and whether to automate the Coach's by-hand acceptance tests on real authenticators and backends — todo_gripes
- G510 **Decide:** rename `vaultDBTimingChecks`'s snake_case handles (`rival_first_writes` ...) to camelCase before release, in one commit (thread 5b); rec rename — matters
- G374 Make code refuse the weak `test_digest_v0` testing deriver for a real vault (today recorded in notes/security.md only) — old_gripes
- G375 `stateOnOpen` in the core's vault.test.ts leaves its vault open (one test counts on that watch) — prs_60_80, prs_open, humans_gripes, whiteboard_gripes
- G376 Amend the pending `20261015-thin_tests` changeset, which says `expectRefusal` checks "by name and kind rather than class" (status unclear: #103 may amend it) — prs_open
- G377 `beforeNextCall` restore writes an own property that shadows a prototype-level spy after restore — prs_open, whiteboard_gripes
- G378 The demo's two ordered tests in test-helpers.test.tsx break under `-t`, `.only` or shuffle — prs_open, whiteboard_gripes
- G379 Move the passphrase-modal test's local helpers (`vaultUnlockingWith`, `submitPassphrase`, `Catcher`, `wrong`) into a React `tests/test-helpers.ts` — prs_60_80, whiteboard_gripes
- G380 Helpers sweep: adapters' `refusalOf` to `TH.expectRefusal` (argon2-wasm duplicates it), plus `eventually`, `changeCounter`, `aWhile` into `safebyok/testing` — bigfeats_doc, prs_60_80, prs_80_main, whiteboard_gripes
- G381 The Convex leak sweep counts public constant leaves (format literals, `test_digest_v0`, fake salt) and could fail falsely — prs_60_80, whiteboard_gripes
- G382 The demo's 5 s / 15 s ceilings can mask slowdowns and misreport a hang as a timeout; the layout-effect test relies on a refusal within microtasks — prs_80_main
- G482 Add a snapshot test rendering each stored-record schema (toJSONSchema) keyed by its `format` literal, failing with "bump format" when one changes unbumped — bigfeats_doc, prs_80_main
- G483 `perUser`'s `@example` is not a call core tests make and omits `listen`; the test `servingOnly` lets a blank `user_id` through where a server says `not_permitted` — prs_80_main, whiteboard_gripes
- G517 #119 race-driver leftovers: one counted turnstile pass per write; `push_from_the_start` gives up after 20 ticks silently; no deadlines in `holding`/`crowding`; `expectHeard` credits by timing; two device-factory shapes — matters
- G518 #111 leftovers: e2e's `test:coverage` measures one file (the packages come from `dist/`); a filtered install of `safebyok-convex` still downloads `react` — matters
- G519 Trim the three Postgres cap tests that repeat battery lines 4.3 and 4.4 — handed on to a new sprint (thread 5a) — matters

## Tooling, CI, size & dependencies

- G399 **Decide:** turn off `unicorn/prefer-iterator-to-array` while the lib target is ES2023 (it fights `prefer-spread`); rec off — todo_gripes, prs_60_80, humans_gripes, bigfeats_doc
- G400 **Decide:** review `pnpm-workspace.yaml` denying esbuild's install script while esbuild arrives through convex — old_gripes
- G401 **Decide:** whether the size-budget rule may lower budgets as well as raise them — prs_80_main, whiteboard_gripes
- G402 Remove the `convex-test@0.0.61` `minimumReleaseAgeExclude` after 2026-10-16T23:01Z: delete it, pin `^0.0.61`, strike the notes/security.md line — prs_80_main, whiteboard_gripes
- G403 Bump dependency floors to the newest mature releases once tsdown 0.23.1 ages (deprecated `@yuku-*` subdependencies warn) — whiteboard_gripes
- G404 Fold `pnpm size` into `justify` (~2 s) — whiteboard_gripes, old_gripes
- G405 Size caveats: CI and `pnpm size` build the core twice; only ESM measured; size-limit's Node range vs engines `>=22` — old_gripes, bigfeats_doc, prs_60_80, whiteboard_gripes
- G406 Fix the ci.yml comment that says the size budget covers "each way of importing the core" now that other packages are measured — bigfeats_doc
- G407 Stop tsdown needing a hand-kept `typesVersions` line per new entry (attw fails otherwise) — old_gripes
- G408 Build layout: modules land under `dist/src/`; published helpers in `tests/` get test lint rules; `makeGate`'s lint disable ships; no source maps — todo_gripes, humans_gripes, whiteboard_gripes
- G409 Add `/* @__PURE__ */` to each schema to save `idbDeviceDB` ~0.5 kB — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G410 Resolve `pnpm peers check` warnings (eslint 10 unmet by jsx-a11y and react plugins) and `settings.react.version` pinned to '19.3' because 'detect' crashes — old_gripes, whiteboard_gripes
- G411 Catch aligned-literal column drift (DDL, validators, SDL, types) that the linter misses, as after the `unlock_epoch` rename — prs_80_main
- G412 Make `pnpm changeset` usable without a terminal (interactive, exits 13) so agents need not hand-write changesets — old_gripes
- G413 In the root `test`, a build failure skips every package's tests, not only its own — todo_gripes, prs_60_80, whiteboard_gripes
- G414 CI's `test-build` builds twice; tests do not all run side by side (fix the pnpm-workspace comment or add `--no-sort`) — prs_60_80
- G415 Check `dist/` is byte-identical after the tsdown move to 0.23.0 — prs_80_main
- G416 Run actionlint on the workflows — old_gripes, whiteboard_gripes
- G417 Identify and pin minimum platform support (oldest browsers, Node 22, Bun, Hermes `Intl` and `\p{}` escapes); CI checks it and the README states it — todo_gripes, prs_open, prs_80_main, whiteboard_gripes
- G520 Re-set the `validators` (8.5 kB) and `DefaultValidators` (4 kB) size budgets by the written rule, and note the rule's 5 kB cliff (argon2idWebV1Deriver) — matters
- G521 The tsconfig lib stops at ES2023, so #118 added an `eslint-disable-next-line unicorn/prefer-promise-with-resolvers` in a VaultProvider test (reported; see G399) — matters

## Release & npm

- G435 **Decide:** release levels: several changesets bump minor where patch might do (adding `lockSoon`/`reentryWindowMs` breaks hosts' `Vault` fakes); rec minor pre-1.0 — todo_gripes, prs_60_80, humans_gripes
- G436 **Decide:** Version PR `pr-draft: create` instead of `always`, so a PR already marked ready is not re-drafted — prs_60_80
- G437 **Decide:** whether a README-only package change carries an empty or a patch changeset (patch bumps the whole lockstep group) — prs_80_main
- G438 Approve the staged 0.2.0 on npm (npm shows 0.1.0 latest) and land the 0.3.0 Version PR (#56) — old_gripes
- G439 Deprecate `safebyok@0.0.0` (npm shows it not deprecated) — todo_gripes, old_gripes, whiteboard_gripes
- G440 Verify "already staged" detection, which rests on npm's "previously published" wording only — old_gripes, humans_gripes, whiteboard_gripes
- G441 Find out whether a staged version keeps its `--tag` on approval (a non-`latest` tag never tried) — todo_gripes, old_gripes, humans_gripes
- G442 Retry a failed GitHub release creation on a re-run (the tag case is tested, the release case is not) — old_gripes, whiteboard_gripes
- G443 Check the release script's quoting of npm's error summary can never carry a token — old_gripes
- G444 Confirm the changesets action rebuilds the Version PR branch from main's tip on every push — old_gripes
- G445 Decide whether to use the trusted publisher's dist-tag permission (on, unused) — todo_gripes
- G446 Tighten the Version PR changeset skip, which trusts the `changeset-release/` branch name (needs the App's bot login) — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G447 Make the Dependabot changeset gate check every commit is Dependabot's, not only the PR author — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G448 Give Dependabot runtime-dependency PRs their changeset without the Coach (today they fail CI until one is pushed, then stop rebasing) — prs_80_main, prs_60_80, humans_gripes, whiteboard_gripes
- G449 `runtime-deps.ts` does not compare a removed/privatized package, `peerDependenciesMeta` or `bundledDependencies` — todo_gripes, prs_60_80, whiteboard_gripes

## Docs & process

- G464 **Decide:** split VOCABULARY's `userId` (options) and `user_id` (records) into separate entries, or keep the one camel/underbar pair — prs_60_80, whiteboard_gripes
- G512 **Decide:** make `scripts/git-survey.sh` (`/branch-sweep`) skip any worktree whose branch has an open PR or unpushed commits (a sweep unregistered four live sprint worktrees); rec yes — matters
- G465 Strike TODO.md's stale entries: "A lockbox row that breaks the listing" (#93, #115), Roadmapped 1-3 items since done (switches, Convex peer, size cap, wayins) — todo_gripes, bigfeats_doc, whiteboard_gripes
- G466 Widen VOCABULARY's "damaged" row from lockboxes to a way in and the vault props — prs_80_main
- G467 Turn on GitHub's "Automatically delete head branches" (off; 89 finished branches remain on origin) — prs_80_main
- G468 Test git-survey's compare-and-swap failure path, and run git-survey.sh and clear-ds-store.sh on macOS bash 3.2 / BSD find — prs_80_main
- G469 Rename the devcontainer `byok-*` volumes at the next container rebuild (renaming orphans the old ones) — old_gripes, humans_gripes, whiteboard_gripes
- G488 Review the three post-review changes no reviewer saw: #102's component check and trimmed message, #103's per-method `beforeNextCall` queue, #104's regex rewrite — humans_gripes
- G489 The `vault_locked` message, the unlock doc and notes/security.md still say "a new passphrase" where any change to the wayins applies (status unclear: not re-checked) — prs_80_main
- G490 The core README's screen-lock recipe's `.catch` also swallows a failed `eraseLease` — prs_60_80

## Deferred by the Coach

- G336 `safebyok-vue`: a `shallowRef` plus `onScopeDispose` binding, so Nuxt hosts get a store — side quest, "not needed yet" — old_gripes, todo_gripes
- G492 Recovery keys: a second high-entropy wayin, waiting on the host's UX (show once, warn, use flow) — NOT YET — todo_gripes, old_gripes
- G493 A PBKDF2 key deriver (native, fast, not memory-hard), its own package with the iteration count in the label — NOT YET — todo_gripes, old_gripes
- G494 A key pair per way in (HPKE) so rotation does not sign every other device out — NOT YET, Coach moved it to TODO — todo_gripes, bigfeats_doc, whiteboard_gripes
- G495 Lock out a lost device (every way in it added; device list, UX) and decide what may be retained to name a device under Apple/Google privacy rules — NOTYET, data stored meanwhile — todo_gripes, bigfeats_doc, prs_80_main, whiteboard_gripes
- G496 A superseded vault props kept in Convex backups still opens the unrotated vaultKey with the old passphrase — NOTYET — old_gripes
- G497 Accept Standard Schema (`@standard-schema/spec`) for host validators in place of a Zod type — later, per the Coach — gripes_1_doc, humans_gripes, prs_80_main, whiteboard_gripes
- G498 Close the `storeBox()`-over-a-damaged-box race (and the store-then-erase gap) with a revision-checked erase in the VaultDB contract — Coach: "TODO it", at the contract tightening party once every adapter shares the battery — gripes_1_doc, todo_gripes, prs_80_main, humans_gripes, whiteboard_gripes
- G499 A pluggable conflict handler for the weird cases (a lockbox too damaged to know its epoch vs a healthy store) — NOT YET — todo_gripes
- G500 An opt-in `lockWhenHidden` prop on safebyok-react (and its naming clash with the README recipe) — ruled "not yet" (TODO side quest) — old_gripes, whiteboard_gripes
- G501 `maskCarefully`: keep one or two combining marks per base character and drop orphaned marks at a cut edge — NOT YET — todo_gripes, whiteboard_gripes
- G502 A generator to keep the eslint configs cut from the core's in step — RAGEBAIT, until drift causes an uncaught bug — old_gripes, todo_gripes, humans_gripes
- G503 Hold comments to 100 columns (#81): redo the reflow from its recipe, decide trailing comments, `@ts-expect-error` lines, Markdown tables, STYLE's "two more spaces" — Coach: leave until 1.0.0-pre — gripes_1_doc, old_gripes, prs_open, prs_60_80, humans_gripes, whiteboard_gripes
- G504 Take `p-retry` or `exponential-backoff` if `storeBox()`'s retry ever grows — RAGEBAIT — todo_gripes
- G505 React Native: a WebCrypto shim, a keychain DeviceDB, a native Argon2 binding, no IndexedDB/BroadcastChannel/TextDecoder paths — NOT YET — todo_gripes, old_gripes
- G506 Delete the leftover worktree directories and `git worktree prune` (look first at byok-strict_configs and byok-passkey_unlock, which hold unpushed work) — Coach: the Coach will, when things settle down — gripes_1_doc, bigfeats_doc, humans_gripes, prs_80_main, old_gripes, whiteboard_gripes
- G507 A REST vault store over `fetch` with a Next.js demo, and a blob helper for secrets too large to be a whisper — side quests, "not needed yet" — old_gripes, todo_gripes
- G508 A sub-millisecond tiebreaker beside each timestamp (monotonic or random), bound only where present — NOT YET — todo_gripes, old_gripes
- G509 A finer unlock race analyser telling a lock the user meant from one that fell due while typing — NOT YET — todo_gripes, whiteboard_gripes
- G524 One test container for every backend — side quest; the Coach: close out the PRs first, for the push to 1.0.0 — matters
