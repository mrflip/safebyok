# Crossings: events and their timescales

How long each event takes, in milliseconds, so that we can judge which crossings can happen in practice. A
crossing is one operation called while another is still in flight.

**Measured** is one throwaway run on 2026-11-03: Node 24 under vitest, in a Linux VM on Apple Silicon, over
`packages/safebyok-big/src` as it was that day. The table uses that day's names, not the design's (*Names*, below),
and several have changed since. Each figure is the median of 20 runs, or of 5 for anything over 100 ms.
**Estimate** is from memory, with nothing measured.

| Event                                      | ms                  | Source    | What it covers                                                                                    |
| ------------------------------------------ | ------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `listing.#deliver`, value already stored   | 0.001 to 0.004      | Measured  | `storable.receive` 0.0007; `boxListing.fetch` through `#deliver` on an in-memory store 0.0043     |
| Cache a value in deviceDB                  | 0.03; real 1 to 20  | See below | `tryPutLease` on fake-indexeddb; the real figure is an estimate                                   |
| Peek a value in deviceDB                   | 0.04; real 0.5 to 5 | See below | `tryGetLease` on fake-indexeddb; the real figure is an estimate                                   |
| Vacate a value in deviceDB                 | 0.04; real 1 to 20  | See below | `tryDelLease` on fake-indexeddb; the real figure is an estimate                                   |
| Make a new lease from a proving            | 0.17                | Measured  | `makeLease`: unwrap, wrap, and a put to a spy deviceDB                                            |
| Encrypt a whisper, 1 KB                    | 0.25                | Measured  | `lease.sealWith`: box key made and wrapped, then AES-GCM. AES-GCM alone is 0.023                  |
| Encrypt a whisper, 64 KB                   | 0.32                | Measured  | As above. AES-GCM alone is 0.18                                                                   |
| Convex database call                       | 50 to 300           | Estimate  | A query or mutation round trip, once connected. A cold start or a far region costs more           |
| GraphQL call to Postgres                   | 50 to 500           | Estimate  | Network, resolver and query, on a healthy API. A cold serverless start can reach 1,000+           |
| Derive a key                               | 650                 | Measured  | Argon2id in pure JS (`@noble/hashes`): 64 MiB, t=3, p=1. The package has no PBKDF2                |
| Check a password                           | 630                 | Measured  | `gate.attemptProof`: derive, then unwrap. Right and wrong cost the same; 0.15 of it is not derive |
| A gating attempt, crypto only              | 635 to 650          | Measured  | `vault.ensureUnlocked(proof)` with Argon2id, in-memory stores. All but the derive is 0.4 to 0.5   |
| A whole `unlock_vault` attempt              | 650 to 1,200        | Sum       | One derive, at most one fetch, the lease cached. No network or real deviceDB was measured          |
| A whole `replace_passphrase` attempt        | 1,350 to 2,300      | Sum       | Two derives, at most one fetch, the put, the lease cached                                          |
| Execute PRF with Touch ID                  | 1,000 to 5,000      | Estimate  | Prompt shown to finger read. The authenticator's own work is a small part of it                   |
| Type in a passphrase                       | 5,000 to 30,000     | Estimate  | Dialog shown to enter key: about 20 characters at 2 to 5 per second, plus a retry or a manager    |
| iPhone Safari tab runs, post backgrounding | 0 to 30,000         | Estimate  | JS may be suspended within seconds of leaving the tab, and may not run again. Assume no warning   |
| Worrywart passphrase change @ every 7 days | 604,800,000         | Exact     | 7 × 24 × 3,600 × 1,000                                                                            |

## How far to trust these

* **Derive against attempt:** an attempt includes a derive, so it cannot take less. These are separate small
  samples whose ranges overlap (derive 634 to 655, check 620 to 634, attempt 626 to 644): read them all as about
  640.
* **deviceDB:** the measured figures ran against fake-indexeddb, which never commits to disk, so they say nothing
  about a browser. Real IndexedDB waits on a transaction commit, and its estimate is the figure to reason with.
  The memory deviceDB runs at 0.003 to 0.018.
* **Argon2id:** a phone runs it slower, likely 2 to 5 times (estimate), and may hit memory limits.
* **Safari:** Apple publishes no figure for this. Timers are throttled or stopped once the tab is hidden, and a
  suspended page can be discarded with no further event. Treat any `await` as possibly never resuming.
* **Names:** the design's `buildStored`, `buildLease`, `tryCacheLease`, `peekLease` and `tryUncacheLease` were,
  on 2026-11-03, `Proving.attempt` (through `gate.attemptProof`), `makeLease`, `tryPutLease`, `tryGetLease` and
  `tryDelLease`.

## Crossings raised

One sentence each. The goal is that nothing crosses a `lock()`, and that we get there with simple code analyzed in
context, not by fine-tuning each of these.

* A `lock()` called during `lease.peek` (0.5 to 5 ms) does not take effect: the vault ends up unlocked, with its cached
  row forgotten, until the next `lock()`.

## A gate change rejecting after its record is stored

The bankDB is the ground truth. In each of these, the verb's caller gets a refusal although the record was stored. The
next fetch brings this device up to date, and nothing guards against them. When this was written, each had a test in
`tests/models/halpimonfire.test.ts`. That file's *A gate change after its record is stored* now has one case: a `lock()`
called while the new lease is made.

* A `sweep` or `vacate` of the listing while the bankDB's answer is on its way back: delivering the answer refuses with
  `disabled`. From then on the new passphrase unlocks the vault, and the next `hello` lists the row.
* A crypto failure in `proved.buildLease`, which the test stages with a mock: the verb rejects with the failure. The vault has
  the new gate and the old lease, and it stays unlocked and able to seal. Its cached row is of the old epoch, so the next
  session asks for a proof.
* Only **a birth** can have `demandReadyToAttach` refuse after a tombstone or a sweep crosses it. It refuses with `vault_gone`
  or `disabled`, and the new lease is vacated. A gate change cannot reach that refusal. The tombstone or sweep drops the
  vault's lease, `#renewLease` sees that it was forgotten and leaves the new lease unattached, and the verb *resolves*,
  although the vault is by then deleted or swept.
* A refused stow in `cacheAsCacheCan` does not reject: the verb resolves with the vault unlocked, and the refusal goes to
  `onBadNews`.

## Crossings the sprint's threads raised

Copied from `unrace-progress.md` at the sprint's end. The names are as they were when each was found (`tidy` is now
`bank.autolock`).

* A lock during `listing.put` does not stop it: the put is written anyway (thread 1).
* A `box.del` checks the lock only at entry (thread 1).
* A bankDB watch stopped in the same tick still receives a queued notice (thread 2).
* A `lock()` called while `vault.ensureUnlocked` is proving leaves the vault unlocked, with its lease cached. The ruling
  is in `noted.md` (thread 3).
* `uncacheForgotten` deletes by scope outside the lease's chores, so its delete can be written after an unlock's put, and the
  next session then has to prove again (thread 3's review).
* `ensureTimely(0)` can join a `get` begun before the call and resolve with the older record, which is how the spec draws the
  join (thread 5's review).
* `box.expose` assigns `#exposed` after its await, so a sweep of that box alone leaves a whisper on a swept box. `expose`
  was postponed that sprint (thread 7's review).
* When `create`'s put answer loses to a delete and a new life, `create` returns another vault; thread 10's `#runBirth` ended this.
* A `lock()` during the `ensureTimely` in `delBox`'s path for no box in memory lets the tombstone be written for a vault that is by then locked (thread 9's review).
* If an instance arrives during `putBox`'s `ensureTimely`, the birth reaches `demandNotHeld`, which refuses with `bad_option` (thread 9's review).
* A second `attempt` with the same answer, made while the first is running, zeroes the bytes in use, so the first refuses with `bad_option` (thread 10's review).
* A tombstone or sparse record that arrives during `ensureUnlocked`'s lease peek makes `Gating`'s constructor throw `bad_option` (thread 10's review).
* A tombstone or discard that arrives between the gate verb and the lease concludes the gating as failed, although the row moved (thread 11's review).
* A gate verb refused with `vault_gone` or `vault_reborn` delivers nothing, so the Vault still reports present until its next fetch, box answer or notice (thread 11's review).
* When two `hello`s cross, the last one answered sets the stage (thread 12).
* A record changed between `getBank` and the watch's start isn't seen until the next fetch (thread 12).
* A listed live vault whose row is void in `getBank` stays listed until its next fetch (thread 12).
* A lease in force whose cache row was never written, or was forgotten by another page's `tidy`, isn't found by `tidy`, so the vault stays unlocked past autolock: a lease that should be dropped is kept (thread 12 and its review; a Coach's row).
* A birth that is past the enter key when `bank.vacate` runs still finishes, and caches its lease after the vacate: a lease that should be dropped is kept (thread 12's review).
* A swept `hello` that returns late marks a fresh listing `refused` (thread 12).
* A `getBank` or plugin load that never returns blocks `tidy`: a lease that should be dropped is kept (thread 12's rework).
* A `hello` that crosses `bank.vacate` marks the emptied listing `ready`, which reopens the false prompt; found by reading (thread 12's rework and second review).
* The watch stays on past a vacate, so a notice can list a vault on a bank that is not ready; found by reading (thread 12's rework).
* A `hello` in flight when `bank.vacate` runs is delivered to the same listing, so after a sign-out it can mark the bank `ready` and list the vaults, locked. It has no lease (thread 13, by reading).
* `demandBirthSlot` sees only what this session has listed, so a birth for a vault that is stored but not yet fetched still asks the user and runs the KDF, then returns that vault, locked (thread 15's second review).
