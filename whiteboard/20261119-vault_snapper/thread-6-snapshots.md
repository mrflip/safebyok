# Thread 6: snapshots (2026-11-20)

Branch `20261120-snapshots`, PR #773, stacked on #772 (thread 5, `20261120-bank_gatings`). Proved: `pnpm justify`
green after catching up onto #772 at 76edb6866 (`safebyok` 1287 tests, `safebyok-big` 2946, e2e 576, every package
passing).

* **Built** (`packages/safebyok/src/`):
  * `shapes/shapes-bankish.ts` *Snapshots*: `BankStage` (all of S1's stages: `signed_out`, `starting`, `unborn`,
    `locked`, `unlocked`, `swept`, `failed`), `BankEndCause` (`sweep`, `vacate`, `signout`, `delete`), `RefusalSnapshot`
    (`{ refusalkind, family, message }`), `BankSnapshot`, `OpenGatingSnapshot`, `DeviceSnapshot`. Exported from
    `core.ts`.
  * `models/bank.ts`: `getSnapshot` and `subscribe` (getters returning private arrows, per STYLE), `#makeSnapshot`
    (pure) and `#align` (es-toolkit `isEqual` against the last snapshot; tells subscribers only on a change).
    `#attachLease`, `lock()` and `sweep()` call `#align()` last. Subscribers are checked with `VX.listener`; a throw goes
    to `tellBadNews`.
  * `models/device.ts`: the same pair. The device's snapshot is `{ bank, gating }`: `bank` is its held bank's snapshot by
    identity (the device subscribes `#align` to the bank in `cheatHoldBank`), `gating` is the open gating's
    `{ gatingkind, gatingseq, isAttempting, lastRefusal }` or null. `attachGating`/`detachGating` bump `#gatingseq` and
    align; `alignOpenGating()` is for the gating. `device.sweep()` now sweeps its held bank.
  * `models/gating.ts`: `isAttempting` and `lastRefusal` getters; the gating calls `device.alignOpenGating()` as an
    attempt begins and ends.
  * Tests: `bank.test.ts` (7, including the done-when: one snapshot each for unlock, lock and sweep, the same object
    between, none for a box landing, a second lock or a wrong passphrase), `device.test.ts` (9), `gating.test.ts` (3).
  * `VOCABULARY.md` **stage**: a sentence for the new core's `BankStage`.
  * `notes/security.md`: a snapshots entry, and an amendment line on the lean_gate entry (its "device.sweep() does not
    reach its banks yet" is no longer true).
  * `notes/guarantees-drift.md`: by the orchestrator's directive from #772's review, an entry recording that the
    Bank's four re-entry points take cleartexts and pass them unread to `gating.ts` (G1 and G9 hold in substance); and
    an amendment to the bank_gatings device-sweep entry, since `device.sweep()` now sweeps the last Bank made.

* **Decisions made**:
  * **The device's snapshot nests the bank's** rather than copying its fields, so the Bank alone carries stage and
    flags (the Coach: "bank ... should be the only thing that carries a stage"). A bank change makes a new device
    snapshot because the nested object changed identity.
  * **`gatingseq` lives on the Device only**, bumped on attach and on detach, so an open gating's seq is odd and each
    open-close pair is distinct. It falls out of the one-at-a-time rule with no new state on the Gating; no re-entry
    point checks it.
  * **`isWatching` and `heardAt` are left out entirely**, type included: they wait for the vaultDB's watch.
  * **`lastErr` is always null** and **`endCause` is always `'sweep'` when ended**: `failed` and the other endings come
    with startup. Only `locked`, `unlocked` and `swept` are reachable.
  * **`leaseEndsAt` is `lease.proved_at + device.leaseMillis`**, an expiry, never a duration.
  * **`lastRefusal` is a plain frozen `{ refusalkind, family, message }`**, never the VaultError: no `cause`, `meta`
    or rows reach a render tree. It is kept until the next attempt's refusal (not cleared as an attempt begins), so a
    form can show it while the next attempt runs. A refusal at the door (`attempt_in_flight`) is not kept.
  * The new type is `OpenGatingSnapshot`, since `GatingSnapshot` already names `gating.toJSON()`'s shape.

* **Deviations**:
  * **`device.sweep()` cascades to the held bank** (`#thisIsTemporaryBank?.sweep()`), through the one allowed cheat
    (`cheatHoldBank`). Without it a device sweep left the bank's snapshot `unlocked` with a live lease while every verb
    refused. The bank's refusal stays the device's (`endCause` getter), so existing tests hold.
  * The per-field getters on Bank (`isLocked`, `isUnlocked`, `endCause`) stay beside the snapshot, against STYLE's one
    snapshot accessor; removing them is out of this thread's scope.

* **Discoveries**:
  * The cheat holds only the **last** Bank made on a device, and a bank made in `#birth` is held before its birth lands:
    a failed birth leaves the device forwarding a never-stored bank's snapshot. Startup's bank registry replaces this.
  * `wrong_passphrase`'s family is `condition`, not `correctable`.
  * The `bank.endCause` getter returns a VaultError, while the snapshot's `endCause` is a `BankEndCause` string: the
    same name for two things (open matter).

* **Not yet later, used**: `gatingseq` (it fit naturally); none other. Nothing here nails down the vaultDB watch
  (`isWatching`, `heardAt`), startup's stages, or concurrency.

* **For the Coach**:
  * The `endCause` name clash (string on the snapshot, VaultError on the getter): rename one?
  * Keep `lastRefusal` across attempts, or clear it as an attempt begins?
  * The device-sweep cascade: endorse, or keep device and bank sweeps apart until startup?
