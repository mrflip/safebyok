# Post-PR rulings (2026-10-14, Coach in chat)

The Coach's decisions on this thread's open questions and the next thread's shape, recorded as
ruled so the next thread starts from here, not from memory.

## The storage interface: versionedUpdate

* **The name is `versionedUpdate`** (not "CAS" or "compare-and-swap" -- jargon stays out).
  A versioned update saves a lockbox only if the standing record still carries the `revision_id`
  the writer read (or there is none), and saves a bundle only if the standing `passphrase_epoch`
  is the one proven against. A failed expectation refuses with a new error kind (`stale_write`).
* **Only call and only implement the smart verbs.** The Coach reversed the dumb-primitives
  layer: adapters implement the smart verbs directly, rather than seven fetch/save/trash
  primitives with compositions on top. Every realistic production backend does conditional
  writes natively (Convex mutations, SQL `UPDATE ... WHERE`, Firestore/Mongo transactions,
  DynamoDB conditional puts, S3 If-Match); the targets that lack them (memory, localStorage)
  are single-threaded enough that a synchronous check-then-save is atomic within a tab anyway.
  The base class keeps validation (shape, scope and label refusals) wrapped around the
  adapter's verbs, so an adapter author cannot forget it.
* **`store()` surfaces `stale_write` on first failure** -- the least-code option, right for the
  LEGO-set surface. TODO(soonish): a retry-up-to-a-limit politeness for the batteries-included
  surface.
* **Erase wins.** An erase is a clear, idempotent intent on a different path from update: no
  version expectation. TODO(with the retry work): a conflict-handler hook where a host could
  hear about erase-vs-update collisions.
* The stale-session hole the other thread found (a box written by a device holding a destroyed
  vault lands in its reborn successor, because "no box here yet" is a valid expectation) is
  closed interim by look-before-write in vault.ts; the durable close is `versionedUpdate`
  carrying the `vault_id` expectation to the backend. TODO: fold vault_id into versionedUpdate.
* TODO(not yet): the IndexedDB adapter's `versionedUpdate` done truly atomically, inside a
  single IndexedDB transaction (idb-keyval's `update()`; synchronous updater, throw-to-abort
  mapped to `stale_write`). Until then it is check-then-save with a small window --
  `notes/security.md` says so.

## whisper_schema_version

* **Yes, and in public metadata** (beside `note`): the host app sets it at `store()`, reads it
  on the summary, and migrates after reading. Anyone worried that it leaks their data-shape
  generation can leave it at 1 forever and version inside the whisper themselves.
* **Not optional in the stored record**: zod fills it (default 1) at the first reasonable
  opportunity, so every stored lockbox carries a concrete value.
* Number vs string: Coach asked; agent recommends **integer** (ordering is the whole job:
  "stored < current, migrate" -- strings invite '1.10' < '1.2' bugs; `passphrase_epoch` is the
  in-house precedent; VOCABULARY already says "version number"). Awaiting the word.

## Numbers in the storage contract

* `whisper_schema_version` is an **integer** (ruled). Wider ruling: the VaultDB contract requires
  a backend to store integers up to `Number.MAX_SAFE_INTEGER` (2^53 - 1 -- microseconds since
  epoch reach it in the year 2255), and safebyok never asks for more: no 64-bit fields, no BigInt, no
  polyfill. This covers every numeric field in a record: `passphrase_epoch`,
  `whisper_schema_version`, `expires_at`, future timestamps.

## The unlock window

* **`rememberForMs` is renamed `forcePassphraseReentryHours`** (ruled): the knob's practical
  meaning is "time between makings of the user type their passphrase", so the name says that.
  Hours, fractions accepted. TODO: the rename (public surface: OpenVaultOpts, safebyok-react prop,
  demo, tests) rides the expiry thread.
* Screen-lock locking: the hook already exists -- `vault.lock()` -- and `src/` cannot own DOM
  listeners (it runs where there is no `document`). The recipe is one host line on
  `visibilitychange` (or Chromium's permission-gated Idle Detection API, the only true
  screen-lock signal). TODO: document the recipe. TODO(not yet, ruled): safebyok-react grows an
  opt-in `lockWhenHidden` prop, since the client package may touch the DOM.

## The boundary pattern (repo-wide TODO)

TODO: audit everywhere a record has "late" optional fields. The pattern the Coach named: a value
becomes **fully nulled, defaulted and validated when it crosses a critical boundary** (into
storage, out of storage, across the public API) **and is trusted otherwise**. Optionals that
exist only because a field arrives late should be resolved at the boundary, not carried.
First candidates: `Lockbox.note`, the new `whisper_schema_version`, `DeviceUnlock`'s shape.

## Expiry (ruled 2026-10-14; build off these)

Two timestamps, no bouncer between, and nothing in flight is ever killed:

* After `staleVaultTS`, any operation that would fail if the vault locked mid-flight refuses to
  **start** until the vault is fresh again (an unlock). This is the entry gate built today.
* An operation already going is never clawed back: if the vault locks and unlocks again before
  the operation notices, nothing changed and it completes.
* The vault locks when (a) the app invokes `lock()`, or (b) a timer watching `shutVaultTS`
  fires: the key is nulled and the snapshot flips. In-flight work holding the key in a local
  still finishes -- locking gates entries, it does not revoke handles.

The ruled numbers and names:

* **Shutting forgets both**: at shut -- timer or explicit -- the in-memory key is nulled AND the
  device-remember record is erased. A lock is a lock; none of them leaves "remember me" standing.
* **`lockSoon(graceSeconds = 5.0)`** (ruled name): advance `staleVaultTS` to now and
  `shutVaultTS` to now + graceSeconds -- "no new secrets from this instant; finish what is in
  hand; the key dies shortly." The natural callee for the screen-lock recipe and sign-out flows.
* **Natural expiry's grace is 60 seconds**: `shutVaultTS = staleVaultTS + 60s`, a library
  constant, not a knob.
* **`staleVaultTS` is fixed from unlock, static, never sliding**: unlock time plus the
  `forcePassphraseReentryHours` the app passed to `openVault`. Per-open means per-device: two
  devices on one vault may carry different windows, which is fine and is noted in
  notes/security.md -- the window is client-side politeness, not a vault-wide synced policy.

Decoding today's `expiresAt` (it does double duty): the in-memory unlock is closure state in one
tab (the non-extractable vaultKey handle + `expiresAt`, gating entries); the device-remember
record is a DeviceUnlock in the deviceDB (IndexedDB) holding the localUnlockKey and the wrapped
vaultKey with its own `expires_at`, honored at the next open. The split assigns the stale/shut
pair to the in-memory side; the device record's deadline maps to `staleVaultTS` (a remembered
unlock past it re-prompts), with shut being in-memory grace only.
