# Sprint v6bank: plan

* **Date:** 2026-11-01. **Mode:** YOLO. **Issued by:** the Coach (`/sprint v6bank YOLO MODE!!!`),
  from `preplan.md` beside this file, "co-written with an agent: be flexible; adjust the level of
  agent as you judge".
* **Default levels:** review `medium`; worker and reviewer on their agents' own model (Opus 5.5)
  and effort; style pass on `style-reviewer`'s pin (`sonnet`). Per-thread levels below.
* **At once:** 3 threads.
* **Sprint branch:** `20261101-v6bank_sprint` (worktree `../byok-v6bank_sprint`), the sprint PR.
* **Sprint doc:** https://claude.ai/artifact/J2B7dBt2L3GcMSSEc8MEMp (doc `89d55586-f408-4988-9eb2-2d10f024a7bb`; Open Matters body `4ed66ae5-ebfc`, Cleanup `8a78f636-2f9c`, Progress `440b40aa-8bd2`, Resolved `cfaec394-47f1`; State enum `0ab24e76-3ece`).
* **Status:** 1, 2, 3a–3d, 4a, 4b, 6, 7a, 9 filed; 5a in review; then 5b, then the restack before 7b, which needs force-push (Open Matters, TOP).

## Read first

CLAUDE.md is given. Beyond it, by section, only where the thread writes that kind of thing:

* `preplan.md`, *Ground rules*: quoted below, and in every handoff. The rest of the pre-plan is
  quoted thread by thread; a worker need not open it.
* `STYLE.md`, *Naming* (every worker, once); *Comments and doc blocks*, *Tests*, *Validation*,
  *Shapes and duck typing* when it writes one of those.
* `notes/guarantees.md`, *The guarantees*, before changing `crypto.ts`, `proving.ts`, `lease.ts`,
  `gating.ts`, `box.ts` or `types/types.ts` (old core or `src/models/`).
* `VOCABULARY.md`: look up a term before using or coining one.
* `scratchpad.md` beside this file: the Coach's side notes on the sketch. Its last section,
  *Review findings ... not yet ruled*, is **not** in this sprint's scope.

## Ground rules

From the pre-plan, verbatim:

1. `try*` answers an `Outcome`; the plain verb throws. A refusal is thrown through a factory in
   a `Refusals` section, its sentence from `phrases.ts`; a factory may take objects it sanitizes
   and attaches.
2. A refusal passes through as thrown. `outcomeOf` makes a `try*` form, and that is where an
   error becomes an `Outcome`; a plain verb does not wrap a call in `outcomeOf` to throw its
   error again. The host-call functions that hear the passphrase relabel what they catch (G1,
   G8); elsewhere a catch adds something (zeroing in `finally`, say) or is not there.
3. Checkers live in `models-shapes.ts`, made by `Checkers`, `Checker` or `objCheck`.
4. Key bytes are zeroed in `try/finally`. The cleartext (passphrase or PRF answer) takes the
   straightest path from the user's fingertips to the one `Proving` method that handles it; each
   hop that holds it is named and zeroes or drops it. The model verbs take cleartext values, not
   proof closures.
5. Stored fields underbar_case; times integer epoch millis; test backdoors `_cheat_`-prefixed.
6. Doc blocks short, one or two lines, written for the caller; a line that narrates parameters is
   stripped when met. A GAP or FIXME comment the thread cannot close moves to the thread's
   report.
7. A gated verb's name is its gating kind: `build_vault`, `unlock_vault`, `replace_passphrase`,
   `add_passkey`, `revoke_passkey`, `del_vault`.
8. A damaged record fails by name: a refusal kind, told as bad news, shown as the snapshot's
   trouble, documented as expected control flow; not a fate or a tombstone, and not repaired
   in place.
9. Consistency checks are welcome where they guard a promise (the rollback guard); the old
   code's mania for them is not. Retries, abort controllers and the like stay out of a
   primitive's path; a host, or orchestration code we provide, adds them.

Particular to this sprint:

10. **Held, not touched** (the pre-plan's lead): the staged record stays, the own props stay as
    inscribed, the listing keeps the work it does for the storable, Box and Vault keep their base
    class; the Trigger is reviewed apart; limits and capacity, damaged boxes in the snapshot, and
    keep-on-device failure stay held. A thread that cannot avoid one says so in its report and
    asks, rather than making the change.
11. **The old surface stays.** `src/index.ts` and the old core (`src/*.ts` outside `models/`,
    `deriver/`, and the new `devicedb/`) change only where a thread's text names it (thread 1's
    renames, thread 5's move, thread 6's fronting). The models reach parity first.
12. Pre-1.0: no shims, no migrations (CLAUDE.md). The models' stored shapes are not yet written
    by any host, so a change to them needs no compatibility, only a line in the changeset.

## Shape of the sprint

```
origin/main ─ 1 ─ 3a ─┬─ 3b ──────────────────────┐
           │          └─ 4a ─ 4b ─┬─ 5 ───────────┤ restack ─ 7b ─┬─ 8  ─┐
           │                      └─ 7a ──────────┤               ├─ 10 ─┤ restack ─ 11
           │    1 ─┬─ 6 ──────────────────────────┤               └─ 12 ─┘
           │       └─ 9 ──────────────────────────┤
           └─ 2 ──────────────────────────────────┘
```

The core line is long because `src/models` is small and every thread lives in it: a thread
that rewrites lines another rewrites stacks on it. The side threads (2, 6, 9) live in corners of
their own. Before 7b the orchestrator restacks everything filed into one line; again before 11.

## Threads

### 1. names_and_refusals

> Mechanical and first, so the later threads build on the names.
>
> * Move every refusal factory the models use into `helpers/refusal-funcs.ts`, including those
>   the old code shares. A factory's name states what was observed, not a guess at cause or
>   remedy: `gateMovedUnderChange` stays; `unlockFirst` becomes `needVaultUnlocked`.
> * Survey `raiseX`, and rename: an error is `refuseX`, an increment `incrementX`,
>   a making `makeX` (sync) or`buildX`/`launchX` (async); and so on. Report any other sense.
> * Survey `kept`: where it means *cached* (the deviceDB's copy of a lease or a record), rename to
>   `cached`; and similarly other senses. Report the other senses you found.
> * Isolate the storable's listeners at settle: each call caught and reported, as `tellBadNews`
>   already does, so one throwing listener cannot abort a verb.
> * Scrub two pieces of dead code: `VaultListing.draftOf` once put-first `ensure` lands
>   (thread 4 may do this instead), the stale comment in `send` about a locked thing's getters.

*Gloss.* Touches all of `src/models/`, `src/helpers/`, and the old core wherever `raiseX` and
`kept` appear (old `vault.ts` alone has ~37 `kept`s; `device-db.ts` 14). The surveys span the
whole tree, tests included. `draftOf` goes in thread 4a, where put-first `ensure` lands: leave it.
A stored field named `kept_*`, if any, is renamed only in the models (ground rule 11 keeps the
old stored shapes).
**Levels:** worker medium effort; review `low`; style pass `opus` (it is mostly naming).
**Depends on:** nothing. **Look-ahead:** every later thread imports from `refusal-funcs.ts`;
thread 3b declares the refusal-kind list, so 1 renames factories and leaves the kinds as they are.
**Size:** M.

*Review:* (#426, low, fixed) padded columns, chai forms, a quote style and a stale banner fixed; left: listener throws silent where there is no `reportError` (Open Matters), stale `KeptLease` in VOCABULARY/guarantees (to thread 9), 47 factories without doc blocks (Open Matters), untested `CachedLease` examples (minor, predates), a `raise` test local (thread 5).

### 2. deriver_and_strength

> * `KeyDeriver` as an interface in `src/deriver/` (exists: `shapes.ts`, `basederiver.ts`,
>   `argon2id-webv1.ts`, static noble import, `load()` kept for wasm derivers). Wire it as the
>   world's `keyDeriver`, a required `Bank.make` option with no default, so the tree-shake holds.
> * The strength checker: `StrengthChecker` type (exists in `models-shapes.ts`), the
>   `NoStrengthChecker` refusal and `notes/configuration.md` (both exist), `zxcvbnStrengthChecker`
>   exported from the browser entry and the v06 entry, ~~`checkStrength`/`tryCheckStrength` on the
>   gating, the `weak_passphrase` refusal as a correctable one in the ask loop~~ *(moved to 3a)*.

*Gloss.* `src/deriver/`, `models-shapes.ts`'s `StrengthChecker`, `bank.ts`'s option types only.
`BankOpts.keyDeriver` is already required with no default: confirm and test it. The browser
entry already exports `zxcvbnStrengthChecker`; the v06 entry is thread 11's. *Orchestrator:* the
gating's strength methods and `weak_passphrase` in the ask loop moved to 3a, which builds the
loop. Runs beside thread 1 from `origin/main`: it leaves every `kept` and `raiseX` name to 1.
**Levels:** worker `sonnet`; review `low`.
**Depends on:** nothing. **Look-ahead:** 11 exports the deriver interface and argon2id deriver.
**Size:** S.

*Review:* (#427, low, fixed) a test refusal form, two doc blocks' placement, and a prototype-dropping spread in `checkSuppliedSpecKept` fixed; `checkKeyDeriver` judged sound and kept. Left: long doc-block first lines and two untwinned examples (documentarian, Open Matters), `checkKeyDeriver`'s doc on trusted input (Cleanup).

### 3a. gating

> Builds on `gating.ts` (the sketch: `Gating<KindT>`, `attempt`, `decline`, `isOpen`, `toJSON`,
> `checkStrength`) and `proving.ts`.
>
> * The `Gating` class and the ask loop: a verb that needs the user makes a `Gating` of its kind,
>   hands it to the world's `requestCleartext` (required, one path through the bank), and awaits
>   settlement; the host's dialog calls `attempt` and `decline`. Correctable refusals (wrong
>   passphrase, weak passphrase) loop; the rest settle. A small `deferred()` helper replaces the
>   hand-rolled resolver (the target is ES2022; `Promise.withResolvers` is ES2024).
> * Entry points on the vault and the bank, not on `Gating` statics: `vault.ensureUnlocked()`,
>   `replacePassphrase()`, `addPasskey()`, `revokePasskey()` and `bank.ensureVault()`. The `Gate`
>   makes no gatings.
> * Drop the closures: `ensureUnlocked`, the gate verbs and `Proving` take cleartext values
>   (exists: `AttemptClosure`, `PassphraseClosure`, `PasskeyClosure`, `makeFromClosure`,
>   `invokeProofClosure` go). Ground rule 4 applies to each hop.
>
> *(from thread 2)* `checkStrength`/`tryCheckStrength` on the gating, the `weak_passphrase`
> refusal as a correctable one in the ask loop.

*Gloss.* `models/gating.ts`, `proving.ts`, `vault.ts`, `gate.ts`, `bank.ts`'s `ensureVault`,
`world` types in `models-shapes.ts`. `requestCleartext` becomes required in `BankOpts`; a test
world passes one that calls `attempt` at once. `deferred()`: library first (CLAUDE.md): look for
one already in the tree; else a few lines in `src/helpers/`, said so in the PR.
**Levels:** worker high effort; review `high` (guarantees: `gating.ts`, `proving.ts`).
**Depends on:** 1. **Look-ahead:** design the `Gating` construction once for all of these:
a `reason` field (`'pester'`, thread 10) rides on an `unlock_vault` gating; `del_vault`
(thread 8) is passphrase-only, so a kind says which proofs it accepts; 3b adds
`attemptPasskey` and the refusal-kind list; 4a moves `ensureVault` onto the listing's put-first
`ensure`, so keep `bank.ensureVault`'s body thin. *Orchestrator:* also renames `RaisedGating` → `LaunchedGating` and "raise a gating" → "launch" tree-wide (YOLO, thread 1's open matter).
**Size:** L.

*Review:* (#430, high, fixed) validator namespaces, orphaned doc blocks and blank lines, a stale doc line; cleartext path traced, no guarantee broken; the strength check in the Gate judged right. Left: cross-realm zeroing (to 3b), spend on correctable refusal (3b), one gating per scope (4a, 3c), lock/eviction settle a gating (4b), cleartexts through an open gating (3c), `#inTurn` onto `Mutex` (3c, and `#leaseChore` in 4b), docs/tests nits.

### 3b. gating_passkey

> * The passkey path: `attemptPasskey` on an `unlock_vault` gating grants a lease through
>   `PasskeyProving`; the gating exposes what the host's `createPasskey`/`askPasskey` read (the
>   passkey header: `credential_id`, `prf_salt`), so the button has something to read.
> * ~~The telling of the two-device races … ; refusal kinds~~ *(split into 3c)*

*Gloss.* `gating.ts`, `proving.ts`'s `PasskeyProving`, `phrases.ts`, `refusal-funcs.ts`, the
refusal-kind type in `models-shapes.ts`. Runs beside 4a, both off 3a.
**Levels:** review `high` (guarantees).
*Orchestrator:* split after 3a's review grew it to ~8 items (3a compacted twice). 3b also: zero a
cross-realm passkey answer (`spendPrfBytes` tests `instanceof`; zero by the checker's tag test, a
G2 hole), and match G2 — a passkey answer stays unspent only on a correctable refusal (YOLO).
**Depends on:** 3a. **Look-ahead:** 7a shows the passkey header in the snapshot; 8's `del_vault`
refuses a passkey. **Size:** M.

*Review:* (#431, high, fixed) G2's text overstated what a 'wrong_passkey' leaves unspent (corrected, pinned by a test); a malformed-answer test. Left: a stale passkey header loops a correctable refusal and a passkey on a vault without one stays correctable (both to 3c, YOLO), nested spends (harmless), React must bind `tryAttemptPasskey` (parity note), doc-block tone.

### 3c. gating_telling

> * The telling of the two-device races, which the versioned put already makes safe: a first gate
>   lost to another device gets its own sentence ("set on another device; enter the passphrase
>   chosen there"), and a declined gating gets a `declined` refusal kind, replacing the G8 relabel
>   that made a cancelled dialog read as a bug.
> * Refusal kinds: the list the gating and the vault verbs throw, declared once, so React's
>   messages have a contract to map on.

*Gloss.* Split from 3b. `gating.ts`, `phrases.ts`, `refusal-funcs.ts`, the refusal-kind type in
`models-shapes.ts`, VOCABULARY.md. *Orchestrator:* also (YOLO, from the reviews of 3a and 3b): a
passkey offered to a vault without one, and a `wrong_passkey` against a gate changed since
launch, refuse non-correctably (keeping G2 true); a wrong-kind `attemptPasskey` may get a kind of
its own; VOCABULARY.md's **cleartext** and **gating** rows brought to the models. Concurrency
moved to 3d. The kind list
reuses `identity_revoked` for signed-out (thread 6). **Levels:** review `high`.
**Depends on:** 3b. **Look-ahead:** the kind list carries room for what later threads throw:
`vault_behind` (7b), `vault_gone`, `vault_remade` (8), damaged-wayin (12); declare those 3c can
name now, and say in the doc block that the list grows. **Size:** M.

*Review:* (#433, high, fixed) two doc fixes; `gate_moved` judged a fresh judgment, not a relabel; G2 holds. Left: a passkey revoked elsewhere still unlocks until a refresh (to 3d, YOLO, TOP), `absent_wayin` closing the unlock dialog (Coach), VOCABULARY rows half-moved (done note), doc nits.

### 3d. gating_concurrency

> *(split from 3c by the orchestrator; YOLO calls from 3a's review)* What a second gating on a
> vault does (with 4a's `ensure` joining an `ensureVault` in flight); `ensureUnlocked(cleartexts)`
> attempts through an open gating rather than waiting on it; `Gating.#inTurn` onto es-toolkit's
> `Mutex`.

*Orchestrator:* also: an unlock gating's run refreshes the gate first, so a passkey revoked elsewhere no longer unlocks (YOLO, #433 review); a lock's decline gets its own sentence (#434). *Gloss.* `gating.ts`, `vault.ts`'s unlock join. **Levels:** review `high`. **Depends on:** 3c.
**Size:** S–M.


*Review:* (#435, high, fixed) a gating that waited its turn found the vault sparse and refused `bad_option`; `#askInTurn` now fetches at the turn (tested). Left: offline unlock (Coach), a racing close spends a joiner's answer (G2 wording, Cleanup), a joined in-flight fetch can predate a revocation, extra round trips, a queued unlock re-check and queued launches at a lock (restack). The static vault key (G10) makes revocation an honest-path check (Open Matters). The thread file's "#unlockByGating still fetches before launch" is stale: `#askInTurn` fetches at the turn.

### 4a. bank

> Builds on `bank.ts` (the sketch: `BankOpts`, `make`, `hello`/`goodbye`, `vaultScopeOf`,
> `vaultOf`, `ensureVault`/`tryEnsureVault`, `closeVault(s)`, snapshot and subscribe).
>
> * `Bank` owns the `VaultListing` and delegates to it. `VaultListing.ensure(dna, cleartexts)` is
>   put-first: build the record (draft plus gate) without holding a Vault, put it, hold the result,
>   adopt the stored row on `stale_write`; `build` becomes the listing's private step.
> * Options: `applabel`, `user_id`, `vaultDB`, `deviceDB`, `onBadNews`, `logger`, `keyDeriver`,
>   `requestCleartext`, `strengthChecker`, `autolockMinutes` (was `leaseHours`), `pesterMinutes`,
>   `vaultRefreshMinutes` (was `staleMinutes`), `boxRefreshMinutes`. The clock is not an option:
>   `wallClock`, with `_cheat_clock` as a second constructor parameter for tests. The
>   secure-context check stays (refuses only an explicit `isSecureContext === false`). No
>   `maxBoxBytes` yet (limits are held).
> * The bank is not a Storable: its device record lives in the deviceDB through a `load`/`save`
>   pair like `Cache`; its snapshot is the sketch's small one (lifecycle, the vaults' snapshots).
> * Lifecycle `starting`/`ready`/`refused`, `hello` warming the vault listing from the cache
>   (exists on the listing), `goodbye` ending the watch.

*Gloss.* `bank.ts`, `vault-listing.ts`, `listing.ts`. Removes `VaultListing.draftOf` (from
thread 1). *Orchestrator:* also aligns the models-world test fake, which writes a revision-0 tombstone on a `del` over no row, with thread 6's store, which answers null. *Orchestrator:* the device record's contents and its `load`/`save` are thread 5's;
4a keeps the sketch's `device_id` handling and leaves a seam. *Orchestrator:* the Coach took the Rec on `hello()`'s failed deriver load: left bare, `tryHello`'s Outcome carries it; 4a confirms in its doc block. Thread 2's `checkKeyDeriver` line in `Bank`'s constructor stays (it joins at the restack).
**Depends on:** 3a.
**Look-ahead:** 4b adds `evict` beside `ensure`; 5 plumbs the deviceDB to each vault; 7b reads
`onBadNews` from the bank's options. **Size:** M.

*Review:* (#432, medium, fixed) a chai form, quotes, a `TH` import, a doc line. Left: the `KeyDeriver` switch to the old type only quiets a test helper (restack takes thread 2's), a tombstoned vault re-ensured asks before refusing (to 8), a lost build's new passphrase untold (to 7b, YOLO), a joined call drops its cleartexts (to 4b, YOLO), a failed re-hello of a ready bank reads `refused` (Coach's call), test casts, style nits.

### 4b. bank_eviction

> * `Listing.evict(scope)`: `try { thing.evict() }`, remove the thing, remake the snapshot.
>   `closeVault` locks then evicts; `closeVaults` for each; eviction stops the vault showing
>   secrets and tells its boxes to disarm. ~~Sign-out (storage says the user is no longer signed
>   in) closes the vaults.~~ *(moved to 7b)*

*Gloss.* `listing.ts`, `bank.ts`, `vault.ts`/`box.ts` `evict`. A box's disarm on eviction drops
its exposed whisper; on `lock()` alone the whisper stays (the Coach's ruling, thread 9).
*Orchestrator:* sign-out needs thread 6's store signal, so it is wired in 7b, which stands on
both. **Levels:** worker medium effort. *Orchestrator:* a call to `ensureVault` that hands its own cleartexts does not join one in flight (YOLO, #432 review). Lock and eviction also settle an open gating; `Vault.#leaseChore` onto es-toolkit's `Mutex` (YOLO, #430 review). The disarm also clears a box's exposed whisper when a tombstone or a newer revision lands (YOLO, #428 review).
**Depends on:** 4a. **Look-ahead:** 8 evicts on
deletion and on a received tombstone. **Size:** S.

*Orchestrator:* 4b found no thread gives a vault its `BoxListing`, so eviction cannot disarm boxes yet (Open Matters, TOP).

*Review:* (#434, high, fixed) an `ensureUnlocked` after a lock joined the overtaken unlock (fixed, tested); doc fixes; `listing.evict`'s `bad_scope` pinned. Significant, pre-existing: the birth lease is taken outside the lease mutex and lock check, breaking G4 under a mid-birth lock (to 5b, YOLO, TOP). Left: `Box.expose` race (done note), an open `build_vault` gating beside a cleartexts run and answers in flight after a close (to 7b, YOLO), double listener tell on close, evicted objects still usable, style nits.

### 5a. devicedb (5b lease_plumbing split off)

> * `src/devicedb/`: the `DeviceDB` base class (the current one, moved there and typed against
>   the models' lease record and device record, or a copy of it if much of it slims down on the
>   way: the Coach, 2026-11-01), `memoryDeviceDB`, the idb adapter with `doPutLease` widened to
>   the models' row.
> * The `LeaseDBFriend` plumbing from the bank's deviceDB to each vault (exists: `leaseDBFriend()`
>   on the vault, `Lease.get`, `takeUpKeptLease`), so a reload takes up the kept lease at birth and
>   does not ask again.
> * The device record: `device_id` per scope and the highest epoch seen per vault, for thread 7.
> * `clearCachedVault`: a way to drop a cached vault, damaged or not.

*Orchestrator:* rename the host-facing `doDelUnparsed` → `doDelDamaged` only in the models' new DeviceDB, if copied there. *Gloss.* New `src/devicedb/`, old `device-db.ts`/`idb.ts`, `models/lease.ts`, `vault.ts`,
`bank.ts`. Move or copy is the worker's call by the Coach's rule; a copy leaves the old one for
the old surface (ground rule 11). `takeUpKeptLease` is `takeUpCachedLease` after thread 1. *Orchestrator:* 5 also renames `incrementDeviceRecord` → `advanceDeviceRecord` (and "raised, never lowered" → "advanced"), in code and VOCABULARY.md (YOLO, thread 1's open matter).
**Levels:** review `high` (guarantees: `lease.ts`). **Depends on:** 4b.
**Look-ahead:** 7b's rollback guard reads and raises the highest epoch seen; 8 erases the cached
lease and cache. **Size:** M.

*Orchestrator:* split after 4b's review added the G4 fix (~9 items). 5a: the module, `memoryDeviceDB`, the idb adapter, the device record, `clearCachedVault`, the `advanceDeviceRecord` and `doDelDamaged` renames, the vault-cache seam. 5b below.

### 5b. lease_plumbing

> *(split from 5)* The `LeaseDBFriend` plumbing from the bank's deviceDB to each vault (exists:
> `leaseDBFriend()` on the vault, `Lease.get`, `takeUpKeptLease`), so a reload takes up the kept
> lease at birth and does not ask again.
>
> *(orchestrator, YOLO, from 4b's review)* The birth grant in `VaultListing.ensure` runs through
> the vault's lease mutex (`#withLeaseDB`) and lock check, so a lock during a vault's birth erases
> its kept lease and leaves it locked (G4).

*Gloss.* `vault.ts`, `vault-listing.ts`, `models/lease.ts`. **Levels:** review `high`.
**Depends on:** 5a. **Size:** S–M.

### 6. store_fronting

> * The model `Store` (`get`/`put`/`del`/`watch`, exists as the listing's `VaultStore`/`BoxStore`)
>   fronted by `localVaultDB` and the `VaultDB` hook adapters: the versioned put with `stale_write`
>   carrying the stored row, `revision_seq` computed by storage.
> * Watch lifecycle: a watch that fails rings `onChange` so the thing fetches again and meets the
>   refusal itself (the old contract's "subscribe trouble"); signed-out is told as bad news and
>   reaches the bank (thread 4). No capacity.

*Gloss.* `local-vault-db.ts`, `vault-db.ts`, the `Store` types in `models-shapes.ts`, a new
adapter module beside them. *Orchestrator:* 6 tells signed-out (a `signed_out` refusal kind,
if 3b has not landed it here, declared locally and reconciled at the restack); 7b wires it to
`closeVaults`. **Depends on:** 1. **Look-ahead:** 8 deletes through the `Store`, including over
a row whose record does not parse: give `del` a conditional form (`revision_tok`) and say how an
unconditional one is expressed, or leave the seam and report it. **Size:** M.

*Review:* (#429, medium, fixed) the watch pushed after unwatch and a throwing `onNotice` ended a sweep; validator namespaces; quotes. After review: `delUnparsed` → `delDamaged`, changeset trimmed. Left: the world read after the swap (to 8), `onChange` floods bad news (to 7b), 11 smaller nits.

### 7a. vault_snapshot

> * `VaultSnapshot` content: lock state, `autolock_at`, the gate's public parts (passkey header
>   present or not), the boxes' snapshots, freshness and trouble. `BoxSnapshot` likewise where it
>   is thin. React renders from `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`.
> * `try*` forms for the vault verbs a host calls (exist on the storable and the gate verbs;
>   `ensureUnlocked`, `lock` and the lease verbs need them). Getters `autolockMinutes` and
>   `pesterMinutes` on the vault, reading the triggers' intervals.

*Gloss.* `vault.ts`, `box.ts` snapshots, `models-shapes.ts`. "Damaged boxes in the snapshot" is
held (ground rule 10): `trouble` is the vault's own. **Levels:** worker medium effort.
**Depends on:** 4b. **Look-ahead:** 10 fills the pester trigger the getter reads; 12 shows
wayin damage as trouble. **Size:** M.

*Review:* (#436, medium, fixed) a lock during the pre-launch fetch launched a dialog that could not succeed (now refuses `vault_locked`, tested); doc fixes. Left: verbs on a damaged vault refuse by the wrong kind (to 12), unneeded snapshot cost on unadopted receives, `pesterMillis` accepts `Infinity` (to 10), 3b's loose ends (restack).

### 7b. vault_guards

> * Gate-epoch voiding: `gate_epoch` on the vault record and in the lease stamp; a lease granted
>   under an older epoch is voided when the gate moves, here or on another device (exists: the
>   vault locks on a received gate change; this makes the lease itself refuse).
> * The rollback guard: the device record's highest epoch seen; a stored record below it is
>   `vault_behind`, locks the vault, and is told as bad news. The one consistency check the Coach
>   asked back first.
> * Bad news: `onBadNews` with the host default and handler-failure isolation (exists on the
>   listing), reached from the bank's options.
>
> *(from 4b)* Sign-out (storage says the user is no longer signed in) closes the vaults.
>
> *(chore)* VOCABULARY's **Made under** paragraph (`VaultMadeUnder`, `gate_epoch`,
> `demandConsistentWith`) describes the old code; rewrite or drop it when thread 7 settles
> `gate_epoch`.

*Gloss.* `lease.ts`, `proving.ts` (the stamp), `vault.ts`, `bank.ts`, the device record (5),
`VOCABULARY.md`. Stands on the restacked line (all of 1–7a filed). *Orchestrator:* tell the host when a lost two-device build discarded the passphrase just chosen, with 3c's "set on another device" sentence (YOLO, #432 review). From thread 6: signed-out arrives as bad news of kind `identity_revoked` (no `signed_out` kind): key `closeVaults` on it; a bank holding no vault hears nothing (document, no probe). Add the box store's `vault_tok` gate (the old `putBox`'s), as the props-and-boxes inconsistency. Check whether watch trouble's forced refetch tells `vault_locked` as bad news, and quiet it if so. **Levels:** worker high
effort; review `high` (guarantees). **Depends on:** 3d, 5b, 6, 7a. **Size:** M.

### 8. vault_deletion

> Added by the Coach (2026-11-01): React's `DelVaultModal` and the demo use it. Builds on threads 3,
> 4 and 6.
>
> * `vault.del()` and `tryDel()`: a `del_vault` gating proved by the passphrase (a passkey does not
>   do; the old form was `ProvenByPassphraseForm`), then the listing's `del` under the vault's
>   `priorRevisionTok`, landing the tombstone. The vault locks, its lease is evicted and the kept
>   lease and cache erased, its boxes evicted, and the bank evicts the vault.
> * On the other devices the watch receives the tombstone: the vault locks, is evicted, and
>   `vault_gone` is told as bad news; a vault made anew under the same label is `vault_remade`.
> * `bank.delDamagedVault({ vaultlabel })`: for a vault whose stored record fails its checks, so no
>   proof is possible, on the host's say. How the `Store` expresses a delete over a row that does
>   not read (its `revision_tok` where the sparse record parses, else an unconditional `del`) is
>   settled with thread 6; the old `VaultDelExpectation` with a null `gate_epoch` is the precedent.
> * Neither deletes boxes one by one: the vault's tombstone is the deletion, and a box under a
>   tombstoned vault reads as absent.

*Gloss.* `vault.ts`, `vault-listing.ts`, `bank.ts`, `gating.ts` (the kind), devicedb erase.
**Levels:** review `high` (lease erase). *Orchestrator:* from thread 6: `Store.del` is conditional on `revision_tok`; `delUnparsed(scope)` is the unconditional delete for a damaged row (removes it only while it still reads as damaged). `Vault.takeWorld` refuses a box answer whose vault row is absent or damaged: settle it with the tombstone rule.
**Depends on:** 7b. Beside 10 and 12. **Size:** M.

### 9. whispers_and_names

> * `getWhisper`, `useWhisper` (zeroes the bytes after the callback) and `tryGetWhisper` on the
>   box, atop `unsealWhisper` and `expose` (exist). The exposed whisper surviving `lock()` in
>   memory is kept by the Coach's ruling; the doc says so plainly.
> * Names: the reserved `test_` namespace and the label checks, cheap and pinned by old tests.
> * A check, not a build: the whisper's `codec` and `schema_version` are box fields the seal binds
>   (`whisper_codec`, `whisper_schema_version`, exist); confirm `whisper-field.ts` and the React
>   field need nothing more.
>
> *(chore)* `parseJsonOrNull` in `models/box.ts` becomes one shared helper under `src/helpers/`
> when a thread is there anyway.

*Gloss.* `models/box.ts`, the label checkers in `models-shapes.ts`, `src/helpers/`.
*Orchestrator:* also takes thread 1's leftover `kept` names (test locals → `stored`/`was`, convex `tallyRow`/`storedTally`, react `liveness`, `unmaskedChars`) and `KeptLease` → `CachedLease` in VOCABULARY.md and notes/guarantees.md.
**Levels:** review `high` (guarantees: `box.ts`). **Depends on:** 1. **Size:** S–M.

*Review:* (#428, high, fixed) a chai form, the `checkKeyDeriver` call moved after `bankScope.parse` (parity with the core's `bad_scope` first), a test name. Left: the exposed whisper outlives a delete or rewrite (to 4b, Open Matters), guarantees.md lacks the whisper routes (wrap-up), `box.ts` type re-exports (to 11), no `tryUseWhisper` (as the core), the duplicate deriver checks with thread 2 (restack), two doc-block nits. *Orchestrator:* thread 9 read "the reserved `test_` namespace" as the deriver's reserved labels and duplicated thread 2's `checkKeyDeriver` and `tests/models/bank.test.ts` — my handoff's gap; reconciled at the restack, thread 2's as the base, keeping 9's `unk` scope fields, `bad_scope` tests and call order.

### 10. pester

> * `pesterMinutes`, default seven days: a Trigger on the vault that asks for the passphrase again
>   when its interval is up, reset whenever the passphrase is given. Refuse `null`, accept
>   `Infinity`; an interval past the 24.5-day timer cap sets no timer and is checked on the next
>   call, a looser best-effort guarantee the doc states.
> * The pester raises an `unlock_vault` gating with `reason: 'pester'`, so a host's dialog is the
>   one it already has (the Coach, 2026-11-01).
> * Distinct from the autolock (reset on every successful gating, default fourteen days).

*Gloss.* `vault.ts`, `gating.ts` (`reason`, designed in 3a), the Trigger as it stands (it is
reviewed apart: use it, do not reshape it). **Levels:** worker `sonnet`.
**Depends on:** 7b. **Size:** S.

### 11. v06_entry

> * `safebyok/v06`: the models' entry point. `Bank`, `Vault`, `Box`, `Lease`, the `Gating` types
>   and `RequestCleartext`, `StrengthChecker` and `zxcvbnStrengthChecker`, the `KeyDeriver`
>   interface and the argon2id deriver, the `Store` and `DeviceDB` types, the refusal kinds, the
>   record checkers a host validates with. The types an exported signature names are exported too.
> * `src/index.ts` is left as it is: the old surface stays until the models reach parity.

*Orchestrator:* export `Box`'s types from their defining files and drop `box.ts`'s re-exports (#428 review). *Gloss.* New `src/v06.ts`, `package.json` exports, the build config, `.size-limit.json` (a new
line: run `pnpm size:budget --write`). An additive entry point, pre-1.0: a two-way door.
**Levels:** worker `sonnet`; review `low`; style pass default. **Depends on:** everything,
restacked. **Size:** S.

### 12. damaged_wayins

> Last, and carefully: a damaged or unknown wayin is told as bad news and the rest of the vault
> stays usable. Only a passkey wayin can be damaged (a passphrase is required). The most likely
> cause of "damage" in code this young is a bug of our own, so the refusal names what failed the
> check, and ground rule 8 applies: by name, as control flow, not repaired in place.

*Gloss.* `models/gate.ts`, `wayin.ts`, the gate checkers, the vault's snapshot trouble (7a).
**Levels:** worker high effort; review `high`. **Depends on:** 7b. **Size:** M.

## Checks and chores

* VOCABULARY's *Made under*: thread 7b. `parseJsonOrNull`: thread 9.
* `notes/guarantees.md`'s *Where the guarantees are kept* gains `src/models/lease.ts`, `box.ts`,
  `gating.ts`, `proving.ts`: a `sonnet` subagent at wrap-up, once those files have settled.
* The `safebyok-react` parity note (what `BankProvider`, `useVault`, `GatingModal` and the
  passkey button still lack): the sprint PR's `human/` entry at wrap-up.

## For the Coach

* Nothing blocks the start. YOLO calls go to *Open Matters* as they are made.
