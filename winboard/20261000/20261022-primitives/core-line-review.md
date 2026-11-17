# primitives: review of the whole core line, at #261's tip

*Orchestrator*, 2026-10-23. An `opus` review, read-only, of `packages/safebyok/src/` at b623e361 (the line #253 → #261), asked whether the redesign works. Read this before the wrap-up review, or before touching a finding listed here.

**Verdict:** the redesign works, with gaps. Every audit risk (1–10) holds on the paths traced. A lock is never undone inside a tab, and no stale write reaches storage. The flow is a set of straight-line primitives: nothing re-reads or retries inside one.

## Sent to thread 9b (in its files)

- **S1:** `vault-opts.ts:377` keeps the host `requestCleartext`'s throw as the refusal's `cause`, so a throw quoting the typed passphrase reaches every waiting call's error. Drop the cause, as the strength checker does.
- **U1:** `proving.ts:188`: a failed `putLease` throws past its demand (risk 10a), and `#grantAfterChange` can then swallow it into a false success. The same applies to deriver and HKDF throws at `:269` and `:335`.
- **U4:** `#attempt` (`gating.ts:252`) returns `good(vault)` even when its gating settled refused.
- **U2:** `#takeOwnWrite` (`vault.ts:1339`) keeps a lease from the old gate, so the snapshot reads `unlocked` while box calls refuse `gate_moved`.
- **U5:** `del()` (`vault.ts:777`) judges a stale picture `absent_vault` without a read.
- **M2:** `StandingGating` as a default `gating` in `proving.ts` would silently reopen risk 1 for a caller that forgets it. Make `gating` required.
- **Docs:** `lockLanded` (`gating.ts:33`) and `GatingInside.delVault` (`gating.ts:122`).

## To the Coach (Open Matters rows)

- **U3:** another tab's unlock drops this tab's lease at its next refresh (`standsBeside`, `vault.ts:1921`). Rec: drop only when the store holds none, or the gate moved.
- **U6:** a tab already holding the newer picture never reports a rollback, because the refresh ignores an older read before testing `vault_behind` (`vault.ts:1031`; the audit's risk 6 order). Rec: test `vault_behind` first.
- **M1:** the sent-deletion machinery (`gating.ts:155-219`) could be simpler. Once the delete is sent, lock and decline leave the gating alone and storage's answer settles it.
- **M4:**
  - `Lease.#dropDamaged` erases on a judgment.
  - `leaseRecordOf` is used only by tests.
  - Four helpers classify one gate-write refusal (`vault.ts:1308-1336`, `1858-1869`).
  - The wayin casts at `gating.ts:340` and `355`.
  - Gate and Lease stamps are enumerable (nothing secret in them).

## Awaits with no demand before use

Only U1's. The review lists the exempt ones (device-record floors, erases after a lock, crypto covered by the next demand, `delVault`'s own expectation, and birth's entry-identity check).
