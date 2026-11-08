# Crossings: events and their timescales

How long each event takes, in milliseconds, to judge which crossings can happen in practice.

**Measured** is one throwaway run on 2026-11-03: Node 24 under vitest, in a Linux VM on Apple Silicon. The code
is the current `packages/safebyok/src`, so it uses today's verbs, not the design's. Each figure is the median of
20 runs, or 5 for anything over 100 ms. **Estimate** is from memory, with nothing measured.

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

* **Derive against attempt:** an attempt contains a derive, so it cannot take less. These are separate small samples
  whose ranges overlap (derive 634 to 655, check 620 to 634, attempt 626 to 644): read them all as about 640.
* **deviceDB:** the measured figures ran against fake-indexeddb, which never commits to disk, so they say nothing
  about a browser. Real IndexedDB waits on a transaction commit and is the figure to reason with. The memory
  deviceDB runs at 0.003 to 0.018.
* **Argon2id:** a phone runs this slower, likely 2 to 5 times (estimate), and it may hit memory limits.
* **Safari:** Apple publishes no figure for this. Timers are throttled or stopped once the tab is hidden, and a
  suspended page can be discarded with no further event. Treat any `await` as possibly never resuming.
* **Names:** the design's `buildStored`, `buildLease`, `tryCacheLease`, `peekLease` and `tryUncacheLease` are
  today's `Proving.attempt` (through `gate.attemptProof`), `makeLease`, `tryPutLease`, `tryGetLease` and
  `tryDelLease`.

## Crossings raised

One sentence each. The goal is that when lock is called, nothing crosses it, and we get there with simple code analyzed in
context, not by fine-tuning each of these.

* A `lock()` landing during `lease.peek` (0.5 to 5 ms) loses: the vault ends unlocked with its cached row erased, until the
  next `lock()`.

## A gate change rejecting after its record is stored

The vaultDB is the ground truth: in each of these the verb's caller hears a refusal though the record landed, the next fetch
brings this device up to it, and nothing guards against them. Each is pinned in `tests/models/halpimonfire.test.ts`.

* A `sweep` or `vacate` of the listing while the store's answer comes back: delivering it refuses `disabled`. The new
  passphrase opens the vault from then on, and the next `hello` lists the row.
* A crypto failure in `proved.buildLease`, staged by a mock: the failure rejects, the vault holds the new gate and the old
  lease, unlocked and sealing, and its cached row is of the old epoch, so the next session asks for a proof.
* `demandReadyToAttach` refusing after a tombstone or a sweep crosses is **a birth's alone**: `vault_gone` or `disabled`, the new
  lease vacated. A gate change can't meet it: the tombstone or sweep drops the lease held, `#renewLease` sees it forgotten
  and leaves the new one unattached, and the verb *resolves*, over a vault now gone or let go.
* A refused stow in `cacheAsCacheCan` is no rejection: the verb resolves, unlocked, and `onBadNews` hears it.

## Crossings the sprint's threads raised

Copied from `unrace-progress.md` at the sprint's end; names as they stood when raised (`tidy` is now `bank.autolock`).

* A lock during `listing.put` loses: the put lands anyway (thread 1).
* A `box.del` checks the lock only at entry (thread 1).
* A vaultDB watch stopped in the same tick still hears a queued notice (thread 2).
* A `lock()` landing while `vault.ensureUnlocked` proves ends unlocked, with its lease cached; ruled in `noted.md` (thread 3).
* `uncacheForgotten` deletes by scope outside the lease's chores, so it can land after an unlock's put and cost the next session
  a proof (thread 3's review).
* `ensureTimely(0)` can join a `get` begun before the call and resolve with the older record, which is what the spec's join
  draws (thread 5's review).
* `box.expose` assigns `#exposed` after its await, so a sweep of that box alone leaves a whisper on a swept box; `expose` is
  postponed this sprint (thread 7's review).
* `create`'s put answer that loses to a delete and a new life hands back another vault; thread 10's `#runBirth` ended this.
* A `lock()` during the `ensureTimely` in `delBox`'s no-box-held path lets the tombstone land on a vault now locked (thread 9's review).
* An instance arriving during `putBox`'s `ensureTimely` sends the birth into `demandNotHeld`, refusing `bad_option` (thread 9's review).
* A second `attempt` with the same answer while the first runs zeroes the bytes in use, so the first answers `bad_option` (thread 10's review).
* A tombstone or sparse record landing during `ensureUnlocked`'s lease peek makes `Gating`'s constructor throw `bad_option` (thread 10's review).
* A `del_vault`'s `lock()` with a refused erase and no `onPanic` vacates the vault during the delete, and `listing.del` still lands (thread 11).
* A tombstone or discard between the commit and the lease in `#landGate` settles the gating as failed though the row moved (thread 11's review).
* A gate verb refused `vault_gone` or `vault_mismatch` doesn't deliver, so the Vault reads present until its next fetch, box answer or notice (thread 11's review).
* Crossing `hello`s: the last to answer sets the stage (thread 12).
* A record changed between `getBank` and the watch's start isn't heard until the next fetch (thread 12).
* A listed live vault whose row is void in `getBank` stays listed until its next fetch (thread 12).
* A held lease whose cache row never landed, or that another page's `tidy` erased, isn't found by `tidy`, leaving the vault unlocked past autolock; this keeps a lease that should drop (thread 12 and its review; a Coach's row).
* A birth past the enter key finishes and caches its lease after `bank.vacate`; this keeps a lease that should drop (thread 12's review).
* A swept `hello` landing late marks a fresh listing `refused` (thread 12).
* A `getBank` or plugin load that never answers holds `tidy` back; this keeps a lease that should drop (thread 12's rework).
* A `hello` crossing `bank.vacate` lands `ready` on the emptied listing, which reopens the false prompt, by reading (thread 12's rework and second review).
* The watch stays on past a vacate, so a notice can list a vault on a bank not ready, by reading (thread 12's rework).
* A `hello` in flight crossing `bank.vacate` lands on the same listing, so it can mark the bank `ready` and list the vaults, locked, after a sign-out; it holds no lease (thread 13, by reading).
* `demandBirthSlot` sees only what this session holds, so a birth over a vault stored but not yet fetched still asks and runs the KDF, then answers that vault locked (thread 15's second review).
