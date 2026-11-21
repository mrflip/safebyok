# Thread 15: stage_not_wait (2026-11-21)

Branch `20261121-stage_not_wait`, PR #TBD, stacked on #810. Proved: safebyok 1343 tests, safebyok-react-lean 250,
both demos 9 each, tsc and eslint clean on the packages touched; `pnpm justify` at ready.

* **Built**:
  * **Core** (`packages/safebyok/src/models/vault.ts`): `Vault.withUnlockedWhisper(labelpath, fn)` checks its arguments,
    demands the bank enabled, refuses `bank_locked` on a locked bank, gets the box by today's rule (a refused get throws
    only when nothing is cached), and unseals through `bank.unsealBox`. It never waits and never unlocks.
    `withWhisper` checks its arguments, awaits `bank.ensureUnlocked()`, then calls it. The `Promise.allSettled` pairing
    is gone, so the box is now got after the unlock lands. Its test says so: 0 gets before the unlock, 1 after. There
    are five new tests for `withUnlockedWhisper`, its `@example` among them.
  * **React** (`packages/safebyok-react-lean/src/giver/react-giver.tsx`): nothing awaits `hello` but the provider's
    effect.
    * `withWhisper` calls `demandVault().withWhisper`.
    * `withLockableWhisper` reads the stage. At unlocked it calls `vault.withUnlockedWhisper`; at locked it calls
      `ifLocked` with the box; at any other stage it refuses through `demandVault()`.
    * `putBoxOnceAt` and `delBoxOnce` lose their awaits.
    * The queries (`useBox`, `useGate`, `useBoxList`, `useQueryOptions`, `boxQuery`) use `skipToken` until the stage is
      brought up, through a new helper, `isBroughtUp`. `boxQuery`'s doc tells a loader to wait for the stage.
  * **`Phrases.BankFailed`**: a failed bring-up refuses `absent_vault` with its own phrase, in `bankAbsentOf`.
  * **The bridge** (`react-bridge.ts`), on the Coach's directive (2026-11-21) to move the ordering await there:
    * The three queryFns lose `await device.hello()`.
    * `bridgeMinder` delivers each minder event through `queueMicrotask`, so no host queryFn's get starts inside the
      minder's own notification. It is flagged `#pragmatic-fix`, to go if it causes other problems, and carries E3's
      `#not-a-crossing`.
    * The bridge also skips a *bare* listing (`minder.isListingBareAt`), the one the minder's `hello` seeds.
  * **WhisperMask**: its effect keeps React's stale-result flag (`isCurrent`, set false in cleanup), so an answer that
    lands after the next stage, revision or prop is dropped. Its wontfix row is gone.
  * **notes**:
    * `notes/wontfix.md`: thread 12's row is rewritten. A lock mid-call now refuses `bank_locked`.
    * `notes/security.md`: one amendment line after the `with_whisper` entry (2026-11-20).
  * **Tests**:
    * `withLockableWhisper` refuses at `starting` with `BankNotStarted`, calling neither function.
    * `useBox` fetches nothing at `starting`.
    * A helper, `renderStarting`, holds the bank at starting with `pauseGets`.
    * The existing "calls ifLocked with the sealed record on a locked bank" covers the locked half of *Ready when*.
* **Decisions made**:
  * **Queries fetch at `unborn` too**, not only at locked or unlocked. The documented contracts need it: `useGate`
    answers null when no bank is stored, and `useBoxList` answers an empty listing for a user with no bank stored. Each
    has a test.
  * **The bridge skips the bare listing.** Without the skip, the seeded empty listing (updatedAt 0) landed in the host's
    item once a hook made it, and with `staleTime: Infinity` the gated query never fetched, so `useBoxList` answered
    `[]`.
  * **A shorter `withWhisper` doc.** Its doc points to `withUnlockedWhisper` for how the box is got and refused, rather
    than repeating the catalog.
* **Deviations**:
  * The plan's queries gate on "locked or unlocked". This thread also fetches at `unborn`; see above.
  * The handoff said to keep the hello hop in the queryFns. The Coach's directive moved it into the bridge.
* **Discoveries**:
  * **WhisperText test.** The unlock dialog now opens in the same tick as Show, since there is no hello hop to wait on.
    Its passphrase field has its own "Show" toggle, so the WhisperText test keeps a reference to its button rather than
    querying by name.
  * **Shared mocks.** Vitest's `restoreMocks` does not reset a `vi.fn`'s calls, so a test that counts calls makes fresh
    functions.
  * **Demo tests.** The demos' `tests/lib/local-vault-db.test.ts` call `device.hello()` as test setup, outside `src`.
  * **Closer Look E8** is not on disk, probably in a Claude Doc. I wrote `BankFailed`'s text from the plan's line alone.
* **For the Coach**:
  * **Security amendment for WhisperMask.** The thread 14 amendment to the Knock-Knock sidecar mask entry is only on
    the sprint's plan commits, so it could not be written on this branch. Its text went to the orchestrator to place.
  * **The `#pragmatic-fix` microtask** delays every delivery, `setQueryData` included, by a microtask. No test broke.
