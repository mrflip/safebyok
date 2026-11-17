# Thread 12: convex_server_cap (2026-10-15)

Branch `20261015-convex_server_cap`, [PR #46](https://github.com/mrflip/safebyok/pull/46), on
main (#44 and #41 merged before filing; rebased onto 7510af7). Justify: green (core 318, convex
256, react 15, demo 28, root 91). Review: 0 significant, 9 minor (left); the reviewer's commit
reworks `store()`'s "never refused for room" sentence (below).

* **Built**:
  - `packages/safebyok-convex/src/component/tallies.ts`: the limits (`MaxVaultLockboxes` = 8,000;
    `MaxVaultLockboxBytes` = 7 MiB − 1 KiB) and the tally verbs `weigh`, `reckon`, `refuses`,
    `record`, `forget`, `drop`.
  - A new table `safebyok_vault_tallies` (`bundle_id`, `lockbox_count`, `lockbox_bytes`; index
    `by_bundle`). `updateBox` reckons the tally, refuses past a limit, writes, and records;
    `eraseBox` takes the erased row off it; `eraseVault` drops it.
  - `vault_full` joins `SafebyokErrorKindVals` (`src/refusals.ts`). `convexVaultDB`'s
    `refusing` already maps every listed kind to a `VaultError`, so the client needed nothing
    more.
  - Tests: `tests/component/tallies.test.ts` (new: limits, `weigh`, a `refuses` table); in
    `tests/component/vaults.test.ts`, the tally kept true across insert/replace/erase/destroy and
    under concurrent writes, kept apart per vault, a vault without a tally counted lazily (and not
    by an erase), the weight limit (refusal writes nothing, exact fill, one byte more refused, a
    lighter replacement allowed), an over-limit pre-tally vault that shrinks and erases, a vault
    too large to read whole erased a box at a time, and the large-vault section refilled to each
    server limit under `transactionLimits`, erased beside a bundle of a whole document. Host
    pass-through in `server.test.ts`; `convexVaultDB` and `vault.store()` mapping to `vault_full`
    in `convex-vault-db.test.ts`. `heavyBox` added to the convex `tests/helpers.ts`.
  - Docs: the Convex README (functions, refusals, the table, *How big a vault can be*),
    `VaultDB`'s `maxVaultBytes` and `updateBox` doc blocks, the `vault_full` comment in
    `errors.ts`, two entries in `notes/security.md`, and a `safebyok: patch` changeset.

* **Decisions taken**:
  - **Both count and bytes.** Bytes protect the 16 MiB read budget directly. A count is still
    needed: an erase deletes every row, and a transaction may write only 16,000 documents and
    read 32,000, so many tiny rows would break `eraseVault` well inside any byte limit.
  - **Component constants, not host config.** The limits come from Convex's own per-transaction
    limits, and their job is to keep `destroy()` possible. Letting a host raise them would break
    that, and a host that wants a lower policy limit can have one added later, as a trusted
    argument from `api({ ... })`. The function arguments are unchanged.
  - **The byte limit is (16 MiB / 2) − 1 MiB − 1 KiB.** An erase reads each row twice: the
    lockboxes, the bundle (at most one 1 MiB document, even from a modified client) and the
    tally (~150 bytes; 1 KiB reserved). Proven under convex-test's real limits with a bundle of
    a whole document.
  - **Weighed with `getDocumentSize` from `convex/values`** (library-first; it is what convex-test
    and, by its own docs, Convex charge a read). A new row is weighed with its real `_id` once
    inserted, so the tally equals the bytes an erase reads, exactly.
  - **The refusal rule, in both measures:** refuse a write that would leave the vault past a
    limit *and* larger by that measure than it found it. So a replacement is never refused for
    count; a **heavier replacement past the byte limit is refused** (otherwise a modified client
    could swell every box to 1 MiB); a replacement no heavier, and every erase, always lands.
  - **A separate tally table, keyed by the bundle row's `_id`, not fields on the bundle row.**
    The bundle and lockbox tables are untouched, so every vault already written reads as before.
    A rollback to an older component would meet bundle rows with unknown fields and refuse to
    deploy; an unused extra table blocks nothing. Keying by `bundle_id` means a vault made anew
    gets a fresh tally, and the tally row stays a fixed ~150 bytes (no `user_id` in it).
  - **Lazy backfill, bounded.** A vault with no tally is counted at its next `updateBox`,
    streaming its rows (`for await`) and stopping at the first row past a limit. If it stops,
    the vault is over a limit by an unknown amount: it gets no tally, and any write that grows it
    is refused until erases bring it back. Erases never count a vault, so a vault too large to
    read whole is still erasable, one box at a time.
  - **Kind**: `vault_full` reused, a **condition** (the user erases a lockbox), as thread 1 made
    it; no new kind. For thread 13: it now also means "storage has no room", not only "past
    `maxLockboxes`".
  - **Changeset**: a patch for `safebyok` and `safebyok-convex`. Built while the convex package
    was private; #41 made it public and lockstep just before filing, so it was added at the rebase.

* **Deviations**: none from the plan. To keep clear of thread 14 (`store_backoff`), I did not
  touch `store()`'s doc block in `packages/safebyok/src/vault.ts` (see *For the Coach*).

* **Discoveries**:
  - convex-test enforces 16,000 documents written per transaction too, which is why the count
    limit exists.
  - The client's fit check gives each lockbox 1 KiB for its non-whisper fields. A Convex row with
    a full note (up to 1 KiB of UTF-8), labels, scope columns and field names weighs ~1.6 KiB
    plus the user id. So at extreme settings (tiny `maxWhisperBytes`, ~4,000 lockboxes, every
    note full) an honest client could meet the component's byte limit just before its own
    `maxLockboxes`, and get `vault_full` from the server. At the defaults it stays far inside
    (101 of the largest default whisper ≈ 5.4 MiB).
  - `convexVaultDB` still declares `maxVaultBytes` = 8 MiB, while the component allows 7 MiB −
    1 KiB of lockboxes. Lowering the declaration would make the default `maxLockboxes` (100) fail
    the fit check at the default `maxWhisperBytes`, so it stays. The core's doc now says a backend
    enforcing its own limit sets it above what `maxVaultBytes` admits, which holds.
  - Real Convex may fetch a query's rows in pages, so the bounded backfill could read a page past
    the limit. That only matters for a vault already over it.
  - After a rollback to a pre-tally component and a roll forward, tallies are stale for vaults
    written in between. Deleting the table's rows makes every vault recount. Recorded in
    `notes/security.md`.

* **For the Coach**:
  - `store()`'s doc block (`vault.ts`) said "Replacing a lockbox is never refused for room". The
    reviewer's `api:` commit now says replacing is never refused by `maxLockboxes`, though storage
    may refuse a heavier one as `vault_full`. Thread 14 edits the same doc block, so expect a
    small doc conflict for whichever lands second.
  - Not checked (review): production Convex's read accounting against `getDocumentSize`, and a
    rollback deploy beside the leftover tally table.
  - **Settled by the Coach:** should a host be able to set a *lower* server-side limit? No.
    "deploying different size limits on host and db is undefined behavior (not a bug, but we
    won't say what will happen)". There is no host knob; the Convex README (after *How big a
    vault can be*) and `VaultDB.maxVaultBytes`' doc block now say that client-side limits
    (`maxLockboxes`, `maxWhisperBytes`, the adapter's `maxVaultBytes`) that disagree with the
    storage's, or an adapter declaring a `maxVaultBytes` its store does not hold to, are
    undefined behaviour. The README's *Refusals* bullet and `store()`'s doc block are untouched
    (PR #50, stacked on this, rewrites the bullet).
