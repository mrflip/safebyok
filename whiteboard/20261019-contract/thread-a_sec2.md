# Thread a_sec2: security follow-up to a_sec (2026-10-19)

Branch `20261019-a_sec2`, PR [#206](https://github.com/mrflip/safebyok/pull/206), stacked on #205
(B2 `lease`). Justify: green (core 2627 incl. 35 skipped, react 275, indexeddb 154, postgres 281,
convex 280, graphql 275, fastkey 49, demo 215, e2e 185 incl. 96 skipped).

* **Built**:
  * **The create window** (`src/vault.ts`). A first unlock's make captures `#makesStandDown`'s
    signal just before `ensureVaultProps`; a read's revocation (`#heedRevocation`, split out of
    `#takeStorage`) aborts it and makes a new one (`#standDownMakes`). An aborted make puts no
    vault props back, so the grant finds its props outrun, takes nothing up and writes no lease;
    the unlock refuses `vault_locked`. Race test in `tests/vault/vault-races.test.ts`, failing at
    base. TODO.md *Soonish*: cross-device invalidation, by a token each device authenticates.
  * **The stale-read rollback**: `isNewerCopy(inHand, fresh)` (same `vault_id`, lower epoch read)
    is no revocation and never replaces the props in hand. Race test, failing at base. No new reads.
  * **`#checkListed` reads nothing**: synchronous, from the listing in hand; `#ensureLease`'s
    `beforeAsking` is synchronous. Tests reworked (the listing is as fresh as `staleMinutes`
    keeps it); the a_fixes changeset edited to match.
  * **No salt or wrapped key in the snapshot** (Coach's ruling, mid-thread): `VaultSnapshot.props`
    and `vault.props` gone; `vault.wayins` is the snapshot's `WayinSummary[]`. The vault keeps the
    record it last settled from as `#shownProps`, for telling damaged-wayin news once.
  * **`Lease.grant` validates** `holder` and `askPassphraseAt` with `LeaseRecord`'s Zod checks
    (`GrantArgs`), throwing a ZodError as misuse.
  * **The cross-copy mark is gone** (Coach's ruling): `isVaultError` is `instanceof` plus the
    kind; `TH.foreignRefusal`/`TH.lookalikeRefusal` and their tests removed, one lookalike table
    and one other-copy test kept in `tests/errors.test.ts`. The only `instanceof VaultError` in
    core and react src is `isVaultError`'s own.
  * **idbDeviceDB blocked as a browser blocks it**: the conformance blocked store now fails every
    `indexedDB.open` with a request whose `onerror` fires a `SecurityError`; a write over quota (a
    transaction aborted with `QuotaExceededError`, via fake-indexeddb's `_abort`) is
    `storage_blocked`, keeping nothing (`tests/idb.test.ts`).
  * **After review** (#206's first review, at 4e9a2b66): a handle refused `rolled_back` forgets
    the vault props it held (`#forgetVaultProps` in `#heedRefusal`: state `opening`, no boxes, any
    make stood down), so the class doc's recipe (`delMark`, then `hello()`) works on that very
    handle; `isNewerCopy` had declined the restored copy as a stale read, and every way-in change
    refused `stale_write`. Test in `vault-storage.test.ts`, failing without the fix.
    `RefusalMeta.vault_props_stored` removed. `describeDeviceDB`'s example is self-contained.
    STYLE.md *Control flow and refusals*: the Coach's two rules.
  * **Docs**: `Wayin.sealPassphrase`'s doc; fastkey's README (`unexpected_error`, the vault's own
    `wrong_passphrase`); react's `forBoundary(err, source)` names the component, says where to look,
    and says when a cause was left out; CLAUDE.md's star-import example (`Names.checkFloor`);
    `.vitest/` ignored; `notes/security.md` through a sonnet subagent.
* **Decisions taken**:
  * One shared make stand-down signal, replaced at each revocation, not a field per make as
    `#takeUp` has: two unlocks may make at once on one handle.
  * The stale read is told by epochs, not a read sequence: storage never takes a vault's epochs
    back (the mark refuses one that does), so no counter is needed. Its listing is still taken.
  * The zxcvbn load test makes its vault from the same fresh module copy as the strength test,
    since another copy's VaultError is now a foreign throw.
  * idbVaultDB's blocked tests (safebyok-indexeddb) throw `SecurityError` synchronously from
    `open`, which is also what a browser does for an opaque origin: left as they are.
* **Deviations**:
  * Item 5's test pinning the mark's invisibility: dropped, the mark being gone (ruled).
  * No fastkey changeset exists to correct (its `bad_option` text is in a released CHANGELOG);
    the README is corrected, and the thread's changeset does not repeat it.
  * Tests that a host could not write over the props it held went with the props.
* **Discoveries**:
  * A make stood down by a revocation of *another* device's vault (V0 made and deleted elsewhere
    while this make wrote V1) refuses `vault_locked` though V1 stands. Fails safe.
  * A read that began before the make's write and resolves `null` after the make put its props in
    hand still revokes them (the make refuses); fails safe, and catching it needs a read sequence.
  * The restore corner left without a mechanism (ruled): this device's mark write after a way-in
    change failed (`#raiseMarkAfter` logs it), then storage is restored. The handle holds the newer
    props and no mark of them; the restored, older copy reads as a stale read, so the handle keeps
    refusing way-in changes as `stale_write`. The class doc tells the host to close such a handle
    and open another.
  * TODO.md's *A wayin change racing this handle's own refresh* (the reverse race: a read of the
    new props before `#reviseWayins` sets them) stands; this thread did not touch it.
* **For the Coach** (Contract drift, for the Contract tab): `VaultSnapshot` loses `props`; the
  handle loses `props`; `vault.wayins` is `readonly WayinSummary[]`, the snapshot's own (the
  Contract's *Vault* named `Wayin` models there). `isVaultError` no longer knows another copy's
  refusal. `Lease.grant` throws on input a lease record cannot hold. A handle refused
  `rolled_back` reads `opening` and holds no vault props. `RefusalMeta.vault_props_stored` is
  removed; thread A1b-c1's plan to fill it on `vault_mismatch` (`thread-A1b-c1-putbox.md`) must
  carry a summary instead (`vault_id`, `unlock_epoch`, the wayin summaries), if it wants one at
  all.
* **For lean_core**: the storage `Outcome` and the host's refusal share one type: a VaultDB verb's
  `BadOutcome.err` is the same `VaultError`, its `meta` the same public `RefusalMeta`, and the
  vault may rethrow it as it came. So vault props may not ride on that `meta` even storage-only.
  Two storage-only paths: a lost create needs none, as `ensureVaultProps` already resolves the
  winner's props as its good `val`; a stale `putVaultProps` could resolve a VaultDB-level answer of
  its own (say `Outcome<{ landed: boolean, stored: VaultProps | null }>`, the vault reading
  `stored` and refusing with a fresh `stale_write` of its own), never a `VaultError` a host sees.
  Not built here.
