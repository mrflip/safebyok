# Sprint newvault: progress

*Orchestrator's summary; newer than the plan where they differ. Workers look things up here; the thread files hold the full accounts.*

## The models PR (the base)

Filed from the Coach's planning checkout: PR [#408](https://github.com/mrflip/safebyok/pull/408), branch `20261031-newvault_models`, tip `4ff14b4b` (amended 2026-10-31: `Lease.wrapKey`/`unwrapKey` removed; `sealWith(bytes, boxKeyStamp, whisperStamp)` and `unsealWith(sealed, boxKeyStamp, whisperStamp)` take two flat stamps and bind each under the vault's stamp and the lease's own purpose; the whisper bytes are checked before the `try` that zeroes them, so a malformed stamp still spends them). Threads 1 and 5 were told to rebase onto it. It also carries the two unmerged planning commits `bb19200d` and `4e0ca295`, as `20261031-base_planning` has no PR of its own. It holds `models/lease.ts`, `wayin.ts`, `proving.ts`, `gate.ts`, `Vault.lock()`, and their shapes at the end of `models-shapes.ts` (banners *The vault's stamp*, *The wayin's forms*, *The gate's forms*, *What a proving is handed*, *The lease's forms*). Green: typecheck, eslint, 4519 tests.

## What the first round settled (2026-10-31)

* **Lease**: `Lease.get(vault, dbfriend)` throws, `Lease.tryGet` answers an Outcome; `grant(vault, dbfriend, vaultKey, opts)` warns rather than throws when the deviceDB refuses the put (the deviceDB is a cache); `forget()` drops the record, disposes the autolock and erases through the dbfriend, idempotent; `isInForce`; `sealWith(bytes, boxKeyStamp, whisperStamp)` / `unsealWith(sealed, boxKeyStamp, whisperStamp)` take the box's flat stamps; no `wrapKey`/`unwrapKey`: neither a key handle nor a purpose leaves the lease (the Coach: avoid even the concerns with an "anyway"). The record: `fmt` 7001, the vault stamp (`applabel`, `user_id`, `vaultlabel`, `vault_tok`, `registered_at`), `lease_key`, `vault_key_lease_wrapped`, `autolock_at`. No `gate_epoch`. The autolock is a `Trigger` (`helpers/trigger.ts`) scheduled at `autolock_at`, launching `vault.lock()` then `forget()`.
* **The dbfriend** `{ logger, tryGetLease(), tryPutLease(record), tryDelLease() }` is scope-bound: no verb takes a scope. The vault will make it with arrow functions.
* **Vault.lock()** is synchronous: `#isLocked`, `#lease` dropped, `lease.forget()` queued on `#leaseChores` (a promise chain, refusals told as bad news through the listing), `settle()`. `lockState()` reads `#isLocked`. `#unlock` must await `#leaseChores` before granting.
* **Proving**: `makeProvingPair(vault, proofClosure, world)` → `PassphraseProving.make(vault, world, passphrase)` and `PasskeyProving.make(vault, world, passkeyAnswer)`; `makeWayin(NOVEL | proving)`: NOVEL fabricates a vaultKey, a proving yields the one it unwraps from its own wayin (`#unwrapVaultKey`, extractable, `wrapKey` only, a local); `makeLease(dbfriend, opts)` on every proving. `ProvingWorld` = `{ clock, keyDeriver, device_id }`; `Cleartexts` = `{ passphrase, passkeyAnswer? }`; `ProofClosure` answers them. PRF bytes zeroed in `finally` even when validation fails (`spendAnswer`).
* **Wayin**: one class, `pickle()` the stored record, `toJSON()` the header. The passkey record's `prf_salt_b64` is checked for length by `FX.prfSalt`; the old vault record's field keeps its shape-only check (the old `damaged_wayin` contract has 10 tests behind it).
* **Gate**: props `passphrase_wayin`, `passkey_wayin | null` (pickles, typed by kind); adorned `ppWayin`, `pkWayin`, `vault`; `Gate.build` → `#novelWayins`: `passphraseProving.makeWayin(NOVEL)`, then `passkeyProving.makeWayin(passphraseProving)`. Not yet: `attemptProof`, the three gate ops, `gate_epoch`.
* **The vault stamp** binds no `format`; old wayins and leases do not open under the models (allowed pre-1.0).
* **Checkers** for all of the above are in `models-shapes.ts`; `stamps.ts` is gone.

## Discoveries worth carrying

* `Lease.get` of a kept lease past its `autolock_at` schedules an immediate autolock, which calls `vault.lock()` before the vault holds the lease: harmless, but `#unlock` must check `isInForce` before `#setLease`, and never set a lease the trigger is about to forget.
* The `Trigger` is born due and arms no timer until `scheduleLaunchAt`; `dispose()` disarms. A test that makes a lease must forget it or use fake timers, or the timer keeps the process alive.

## The gap review

`missing-functionality.md` (sonnet, 2026-10-31): no Bank, no host entry point, no snapshot content for React, no gating reason, no strength check, no gate-epoch voiding or rollback guard, no vault deletion, no limits. Its first five: Bank; snapshot content; gating reason and strength; gate-epoch voiding and the rollback guard; the deviceDB friend and lease options. Thread 6 pins "the vault locks when a received record's gate differs" meanwhile.

## Thread 1 taught (gate_in_record, PR #410)

* A draft vault is held first with `gate: null`, then `vault.buildGate(proofClosure)` edits the gate in. A patch's `gate` is taken only while the vault has no gate; later gate changes belong to the gate verbs (threads 2 and 4).
* `vault.leaseDBFriend()` answers `{ logger, tryGetLease, tryPutLease, tryDelLease }` as arrows bound to the vault's scope; `VaultWorld` carries `keyDeriver`, `device_id`, `leaseMillis`, `deviceDB`, `scope`, `logger`. Thread 2 reads `leaseMillis` from the world.
* `edit` demands a full record and `send` refuses a gateless vault: a failed proof closure leaves a held, gateless vault that `buildGate` may be called on again; `build(dna)` a second time refuses as already held.
* `vault.gate` is a prototype getter, so a Vault passed where its record is expected fails `vaultRecord`; nothing does that today.

## Rulings, 2026-10-31 (Open Matters, first sweep)

* `autolock_at` stays; `gate_epoch` stays out this sprint ("add it at some point": next sprint, with gate-epoch voiding); the two G8 relabels stay; `FX.prfSalt` stays a separate checker; `Wayin.toJSON` keeps the header; the vault stamp binds no format.
* The deviceDB bridge: "if there are things we will want from the old model, add them; if there are still gaps have the facade paper over them". Thread 2: look at the old lease record (`src/shapes/device.ts`) for fields the models will want and add them to `leaseRecord`; the bank's adapter papers over the rest.
* Doc blocks: short now, more later; slop that narrates parameters is stripped or fixed, never written anew (ground rule 8).

## Thread 5 taught (tests_models, PR #411)

* The fakes thread 6 reuses are in `packages/safebyok/tests/test-helpers/proving-world.ts`, imported directly (not through `TH`): `useFakeClock`, `WorldStamp`, `duckVaultOf` / `asVault`; `fakeDBFriendOf` (keeps the record in `kept`, spies each verb, logs calls in `logged`); `WeekMillis`, `grantedLeaseOf`, `sealStampsOf`; `TestPassphrase`, `DeviceId`, `provingWorldOf`, `passkeyAnswerOf`, `proofClosureOf`; `isZeroed`; the backdoor `_cheat_vaultKeyBytesOf`.
* Its pins found two things worth the Coach: a lease seals while out of force (no `isInForce` check in `sealWith`/`unsealWith`), and a lease longer than `MaxTimerMillis` (24.5 days) never autolocks because the Trigger sets no timer past the cap. Rows in Open Matters. The eight smaller pins are thread 2's and thread 3's (Cleanup, Your calls; thread 2's gloss).

## Rulings, 2026-10-31 (second sweep)

* Pester and autolock defined: autolock resets on every lease grant or renewal, default 14 days; the pester prompts for the passphrase every seven days (24.5 at most), reset whenever it is given; not this sprint.
* The gate is never null (orchestrator's call on the Coach's "up to you"): rework of thread 1 after its review; threads 2 to 4 build on `vault.gate: Gate`.
* Thread 1's guards: loosen or keep, but thread 6 tests that an edit over a sparse record keeps the gate.
* The gap review's first five are the next sprint, in that order. The planning commits ride in #408.
* The lease refuses `vault_locked` when not in force (thread 2); a lease longer than the timer cap setting no timer is by design (wontfix), caught by that check.

## Thread 1's review taught (PR #410, tip b985fb5d)

* A vault held sparse reads `gate` as null until `edit` hydrates, so anything that judges the gate must hydrate first (`ensureReadyToEdit()`); the rework removes the case, but thread 2's `#unlock` should still take the gate from the record in hand after a hydrate.
* The public patch must not carry the gate: `edit({ gate })` would store wayins no passphrase proved. Thread 4's gate verbs stage a new gate through a private path, never `vault.edit`.
* `vault.gate` is rebuilt when the record's `gate` object changes identity (every receive after a send): a held `Gate` goes stale across a send. Thread 2 keys by content or rebuilds on settle if it holds one.

## Rulings, 2026-10-31 (third sweep; YOLO from 09:20 UTC)

* Refusal factories bring their sentences from `phrases.ts` and may take objects they sanitize and attach; thread 2 moves the existing sentences. Catch-and-rethrow is allowed where it earns its lines.
* Closer Look: the lease is made at birth (thread 2, through the proving `Gate.build` hands back); the Trigger is the keeper of the end time and things check now against it, Infinity included; the private-method-on-another-instance idiom stays; the vault's stamp is parsed once per lease; `spendAnswer` gets a try/catch and a comment. The rest LGTM.
