# Sprint v6bank: pre-plan

The non-controversial part of the next sprint over `src/models`: what the Coach marked *proceed*
on the sprint doc's Roadmap Gaps tab (2026-10-31 and 2026-11-01), what the scratchpad records as
*lgtm* (2026-11-01), and what the newvault sprint's resolutions deferred to "the next sprint".
Each thread below is a candidate; the plan proper orders them, writes each handoff, and names the
models for the workers. Nothing here changes a decision already made.

**What this pre-plan leaves out, on purpose.** The Coach keeps the current storable code as it is
until they can supervise the big changes slowly: the staged record stays, the own props stay as
they are inscribed, the listing keeps the work it does for the storable, and Box and Vault keep
their base class. The Trigger is reviewed apart. *Hold* items stay held: limits and capacity,
damaged boxes in the snapshot, keep-on-device failure. Vault deletion has no mark and is not
in. A thread that finds it cannot avoid one of these stops and says so; it does not make the
change.

## Ground rules

Carried from the newvault sprint and the scratchpad; the plan repeats them in every handoff.

1. `try*` answers an `Outcome`; the plain verb throws. A throw goes through a factory in a
   `Refusals` section whose sentence comes from `phrases.ts`; the factory may take objects it
   sanitizes and attaches.
2. No catch-and-relabel, except in the host-call functions that hear the passphrase (G1, G8).
3. Checkers live in `models-shapes.ts`, made by `Checkers`, `Checker` or `objCheck`.
4. Key bytes are zeroed in `try/finally`. The cleartext (passphrase or PRF answer) takes the
   straightest path from the user's fingertips to the one `Proving` method that handles it; each
   hop that holds it is named and zeroes or drops it. No proof closures on model verbs.
5. Stored fields underbar_case; times integer epoch millis; test backdoors `_cheat_`-prefixed.
6. Doc blocks short, one or two lines, written for the caller; a line that narrates parameters is
   stripped on sight. No GAP or FIXME comments survive a thread: a gap is a line in the thread's
   report.
7. A gated verb's name is its gating kind: `build_vault`, `unlock_vault`, `replace_passphrase`,
   `add_passkey`, `revoke_passkey`.
8. A damaged record fails by name: a refusal kind, told as bad news, shown as the snapshot's
   trouble, documented as expected control flow. No fate, no tombstone, no silent repair.
9. Consistency checks are welcome where they guard a promise (the rollback guard); the old
   code's mania for them is not. Insert no retries or whizbangs in a primitive's path.

## Threads

In a rough order of dependence. "Exists" names what `src/models` already has, so the worker
extends rather than rebuilds. Threads 3 (gating) and 4 (bank) are the large ones: the plan
splits the passkey path and the telling out of 3, and eviction and sign-out out of 4 (the Coach,
2026-11-01).

### 1. names_and_refusals

Mechanical and first, so the later threads build on the names.

* Move every refusal factory the models use into `helpers/refusal-funcs.ts`, including those
  the old code shares. A factory's name states what was observed, not a guess at cause or
  remedy: `gateMovedUnderChange` stays; `unlockFirst` becomes `needVaultUnlocked`.
* Survey `raiseX`, and rename: an error is `refuseX`, an increment `incrementX`,
  a making `makeX` (sync) or`buildX`/`launchX` (async); and so on. Report any other sense.
* Survey `kept`: where it means *cached* (the deviceDB's copy of a lease or a record), rename to
  `cached`; and similarly other senses. Report the other senses you found.
* Isolate the storable's listeners at settle: each call caught and reported, as `tellBadNews`
  already does, so one throwing listener cannot abort a verb.
* Scrub two pieces of dead code: `VaultListing.draftOf` once put-first `ensure` lands
  (thread 4 may do this instead), the stale comment in `send` about a locked thing's getters.

### 2. deriver_and_strength

* `KeyDeriver` as an interface in `src/deriver/` (exists: `shapes.ts`, `basederiver.ts`,
  `argon2id-webv1.ts`, static noble import, `load()` kept for wasm derivers). Wire it as the
  world's `keyDeriver`, a required `Bank.make` option with no default, so the tree-shake holds.
* The strength checker: `StrengthChecker` type (exists in `models-shapes.ts`), the
  `NoStrengthChecker` refusal and `notes/configuration.md` (both exist), `zxcvbnStrengthChecker`
  exported from the browser entry and the v06 entry, `checkStrength`/`tryCheckStrength` on the
  gating, the `weak_passphrase` refusal as a correctable one in the ask loop.

### 3. gating

Builds on `gating.ts` (the sketch: `Gating<KindT>`, `attempt`, `decline`, `isOpen`, `toJSON`,
`checkStrength`) and `proving.ts`.

* The `Gating` class and the ask loop: a verb that needs the user makes a `Gating` of its kind,
  hands it to the world's `requestCleartext` (required, one path through the bank), and awaits
  settlement; the host's dialog calls `attempt` and `decline`. Correctable refusals (wrong
  passphrase, weak passphrase) loop; the rest settle. A small `deferred()` helper replaces the
  hand-rolled resolver (the target is ES2022; `Promise.withResolvers` is ES2024).
* Entry points on the vault and the bank, not on `Gating` statics: `vault.ensureUnlocked()`,
  `replacePassphrase()`, `addPasskey()`, `revokePasskey()` and `bank.ensureVault()`. The `Gate`
  makes no gatings.
* Drop the closures: `ensureUnlocked`, the gate verbs and `Proving` take cleartext values
  (exists: `AttemptClosure`, `PassphraseClosure`, `PasskeyClosure`, `makeFromClosure`,
  `invokeProofClosure` go). Ground rule 4 governs every hop.
* The passkey path: `attemptPasskey` on an `unlock_vault` gating grants a lease through
  `PasskeyProving`; the gating exposes what the host's `createPasskey`/`askPasskey` read (the
  passkey header: `credential_id`, `prf_salt`), so the button has something to read.
* The telling of the two-device races, which the versioned put already makes safe: a first gate
  lost to another device gets its own sentence ("set on another device; enter the passphrase
  chosen there"), and a declined gating gets a `declined` refusal kind, replacing the G8 relabel
  that made a cancelled dialog read as a bug.
* Refusal kinds: the list the gating and the vault verbs throw, declared once, so React's
  messages have a contract to map on.

### 4. bank

Builds on `bank.ts` (the sketch: `BankOpts`, `make`, `hello`/`goodbye`, `vaultScopeOf`,
`vaultOf`, `ensureVault`/`tryEnsureVault`, `closeVault(s)`, snapshot and subscribe).

* `Bank` owns the `VaultListing` and delegates to it. `VaultListing.ensure(dna, cleartexts)` is
  put-first: build the record (draft plus gate) without holding a Vault, put it, hold the result,
  adopt the stored row on `stale_write`; `build` becomes the listing's private step.
* `Listing.evict(scope)`: `try { thing.evict() }`, remove the thing, remake the snapshot.
  `closeVault` locks then evicts; `closeVaults` for each; eviction stops the vault showing
  secrets and tells its boxes to disarm. Sign-out (storage says the user is no longer signed in)
  closes the vaults.
* Options: `applabel`, `user_id`, `vaultDB`, `deviceDB`, `onBadNews`, `logger`, `keyDeriver`,
  `requestCleartext`, `strengthChecker`, `autolockMinutes` (was `leaseHours`), `pesterMinutes`,
  `vaultRefreshMinutes` (was `staleMinutes`), `boxRefreshMinutes`. The clock is not an option:
  `wallClock`, with `_cheat_clock` as a second constructor parameter for tests. The
  secure-context check stays (refuses only an explicit `isSecureContext === false`). No
  `maxBoxBytes` yet (limits are held).
* The bank is not a Storable: its device record lives in the deviceDB through a `load`/`save`
  pair like `Cache`; its snapshot is the sketch's small one (lifecycle, the vaults' snapshots).
* Lifecycle `starting`/`ready`/`refused`, `hello` warming the vault listing from the cache
  (exists on the listing), `goodbye` ending the watch.

### 5. devicedb

* `src/devicedb/`: the `DeviceDB` base class (the current one, moved there and typed against
  the models' lease record and device record, or a copy of it if much of it slims down on the
  way: the Coach, 2026-11-01), `memoryDeviceDB`, the idb adapter with `doPutLease` widened to
  the models' row.
* The `LeaseDBFriend` plumbing from the bank's deviceDB to each vault (exists: `leaseDBFriend()`
  on the vault, `Lease.get`, `takeUpKeptLease`), so a reload takes up the kept lease at birth and
  does not ask again.
* The device record: `device_id` per scope and the highest epoch seen per vault, for thread 7.
* `clearCachedVault`: a way to drop a cached vault, damaged or not.

### 6. store_fronting

* The model `Store` (`get`/`put`/`del`/`watch`, exists as the listing's `VaultStore`/`BoxStore`)
  fronted by `localVaultDB` and the `VaultDB` hook adapters: the versioned put with `stale_write`
  carrying the stored row, `revision_seq` computed by storage.
* Watch lifecycle: a watch that fails rings `onChange` so the thing fetches again and meets the
  refusal itself (the old contract's "subscribe trouble"); signed-out is told as bad news and
  reaches the bank (thread 4). No capacity.

### 7. vault_snapshot_and_guards

* `VaultSnapshot` content: lock state, `autolock_at`, the gate's public parts (passkey header
  present or not), the boxes' snapshots, freshness and trouble. `BoxSnapshot` likewise where it
  is thin. React renders from `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`.
* `try*` forms for every vault verb (exists on the storable and the gate verbs; `ensureUnlocked`,
  `lock`, the lease verbs need them). Getters `autolockMinutes` and `pesterMinutes` on the vault,
  reading the triggers' intervals.
* Gate-epoch voiding: `gate_epoch` on the vault record and in the lease stamp; a lease granted
  under an older epoch is voided when the gate moves, here or on another device (exists: the
  vault locks on a received gate change; this makes the lease itself refuse).
* The rollback guard: the device record's highest epoch seen; a stored record below it is
  `vault_behind`, locks the vault, and is told as bad news. The one consistency check the Coach
  asked back first.
* Bad news: `onBadNews` with the host default and handler-failure isolation (exists on the
  listing), reached from the bank's options.

### 8. whispers_and_names

* `getWhisper`, `useWhisper` (zeroes the bytes after the callback) and `tryGetWhisper` on the
  box, atop `unsealWhisper` and `expose` (exist). The exposed whisper surviving `lock()` in
  memory is kept by the Coach's ruling; the doc says so plainly.
* Names: the reserved `test_` namespace and the label checks, cheap and pinned by old tests.
* A check, not a build: the whisper's `codec` and `schema_version` are box fields the seal binds
  (`whisper_codec`, `whisper_schema_version`, exist); confirm `whisper-field.ts` and the React
  field need nothing more.

### 9. pester

* `pesterMinutes`, default seven days: a Trigger on the vault that asks for the passphrase again
  when its interval is up, reset whenever the passphrase is given. Refuse `null`, accept
  `Infinity`; an interval past the 24.5-day timer cap sets no timer and is checked on the next
  call, a looser best-effort guarantee the doc states.
* The pester raises an `unlock_vault` gating with `reason: 'pester'`, so a host's dialog is the
  one it already has (the Coach, 2026-11-01).
* Distinct from the autolock (reset on every successful gating, default fourteen days).

### 10. v06_entry

* `safebyok/v06`: the models' entry point. `Bank`, `Vault`, `Box`, `Lease`, the `Gating` types
  and `RequestCleartext`, `StrengthChecker` and `zxcvbnStrengthChecker`, the `KeyDeriver`
  interface and the argon2id deriver, the `Store` and `DeviceDB` types, the refusal kinds, the
  record checkers a host validates with. Every type an exported signature names is exported.
* `src/index.ts` is untouched: the old surface stays until the models reach parity.

### 11. damaged_wayins

Last, and carefully: a damaged or unknown wayin is told as bad news and the rest of the vault
stays usable. Only a passkey wayin can be damaged (a passphrase is required). The most likely
cause of "damage" in code this young is a bug of our own, so the refusal names what failed the
check, and ground rule 8 governs: by name, as control flow, never repaired in place.

## Checks and chores, not threads

* VOCABULARY's **Made under** paragraph (`VaultMadeUnder`, `gate_epoch`, `demandConsistentWith`)
  describes the old code; rewrite or drop it when thread 7 settles `gate_epoch`.
* `notes/guarantees.md`'s table of where the guarantees are kept names the old core's files; add
  `src/models/lease.ts`, `box.ts`, `gating.ts` and `proving.ts` through the sonnet route.
* `parseJsonOrNull` in `models/box.ts` becomes one shared helper under `src/helpers/` when a
  thread is there anyway.
* The `safebyok-react` package reads the old surface; a parity note at the sprint's end lists
  what `BankProvider`, `useVault`, `GatingModal` and the passkey button still lack.

