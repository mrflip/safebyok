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
