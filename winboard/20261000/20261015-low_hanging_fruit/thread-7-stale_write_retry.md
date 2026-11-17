# Thread 7: stale_write_retry (2026-10-15)

Branch `20261015-stale_write_retry`, PR [#44](https://github.com/mrflip/safebyok/pull/44), stacked on
[#43](https://github.com/mrflip/safebyok/pull/43) (thread 6). Justify: green (safebyok 318,
safebyok-convex 219, safebyok-react 8, demo 24, root 91). No sprint-doc tab (Docs tools
disconnected). Tip updated after the coordinator's erase-wins ruling.

* **Built**: `store()` in `packages/safebyok/src/vault.ts` runs its read-then-write body through
  `retryStale`, a small module-level helper, up to `MaxWriteAttempts = 3` (module constant, not
  exported: an export is public surface). One attempt: `ensureUnlocked()`, `readBox`,
  `ensureRoomFor` (new box only), `ensureUnlocked()` again, fresh `revision_id`, fresh
  lockboxKey, `noteToStore(givenNote, prev)`, cipher, `updateBox` with the expectation inside
  `refreshOnStale`. Outside the loop, once: the first `ensureUnlocked`, `parseLabel`,
  `parseNote`, the whisper check and size check, and the final `refresh()`. `erase()` is
  unchanged in behaviour; a code comment and the doc block say why it is never retried. Tests in
  `tests/vault.test.ts` ("versioned updates: two devices writing at once"). Changeset
  `.changeset/20261015-stale_write_retry.md` (patch). A `notes/security.md` bullet.
* **Decisions taken**:
  - Three means three **attempts** (one try, two retries), stated in the doc block. The test of
    the losing store counts exactly three `updateBox` calls.
  - A retry is not given a delay or backoff: the re-read is the wait, and the limit is small.
  - **Relock mid-retry**: `refreshOnStale` already catches the device up. A reborn vault or a
    changed passphrase nulls the vaultKey there, so `ensureUnlocked()` at the top of the next
    attempt throws `vault_locked` before any read or write. Vault destroyed and not remade: same
    (`vault_locked`; the snapshot then says `absent`).
  - `retryStale` is recursive (functional style), takes `() => Promise<void>`, and rethrows any
    non-stale error as it came; the last stale error is the original `VaultError`.
  - `changePassphrase` and `destroy` are not retried: not in this thread's text.
* **Deviations**: none from the plan. `pnpm changeset` is interactive and exits 13 without a
  terminal, so the changeset is written by hand under the name the script would give.
* **Discoveries**:
  - **Behaviour change a host sees, beyond fewer `stale_write`s** (in the changeset): a `store()`
    into a vault reborn elsewhere now throws `vault_locked`, where it threw `stale_write` (and
    relocked). Four existing tests said so and are updated; the "written meanwhile" tests now land.
  - **Erase wins across a retry** (rulings.md, *Erase wins*, line 23: an erase is a clear intent,
    and the update must not undo it; the conflict-handler hook that would let a host choose stays
    in TODO). Rule: an attempt made over a standing box (`prev` not null) whose retry re-read finds
    the box gone does not write: `store()` throws `stale_write` at once (the catch-up refresh has
    already put the erase in the snapshot). A store that began on an absent box retries as usual,
    and one that finds it created meanwhile retries over the new revision. Tests: erase wins
    (exactly one `updateBox`, box stays erased) and created-meanwhile retries. An earlier draft of
    this thread re-created the box; the coordinator caught it against the ruling.
  - **The cap recount is exercised** (the coordinator corrected my first note, which said it
    could not run): attempt one reads the box absent, a rival creates it, the write is refused as
    stale, and the rival erases it before the retry's read; the retry has `prev === null`,
    `boxStood` is false, so `ensureRoomFor` runs again and refuses `vault_full` at the cap.
    Test: a hook on the second `readBox`, one `updateBox` call in all. A new label whose box is
    uncontended never retries; a rival filling the other slots races past the cap unseen
    (thread 1's security note covers it).
  - `twoDeviceWorld` in the test file now gives `here` its own `VaultDB` over the shared store, so
    a spy on `here`'s writes counts attempts without catching the rival's writes; it takes
    `OpenVaultOpts` overrides for `here`.
  - TODO.md's conflict-handler item says "after the retry (low-hanging-fruit thread 6)"; it is
    thread 7. Not edited here.
* **For the Coach**: a distinct error kind for erase-wins (it shares `stale_write` with an
  exhausted retry, so a host cannot tell them apart); the TODO.md slip above; the cap-race note above; and whether `vault_locked` (over the original `stale_write`) is right when a
  retry finds the device relocked. It is the orchestrator's stated expectation and tells the host
  the useful thing (ask for the passphrase), but it changes what an existing host catches.
