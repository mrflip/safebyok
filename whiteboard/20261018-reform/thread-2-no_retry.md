# Thread 2: store() without the retry (2026-10-18)

Branch `20261018-no_retry`, PR #TBD, cut from `origin/main` `2946a499`. Justify: green (core
2105 passed / 35 skipped; react 218; demo 190 / 16 skipped; e2e 81 / 89 skipped; every adapter green).

* **Built**:
  - `packages/safebyok/src/vault.ts`: `store()` makes one attempt: it reads the box, seals it, and
    writes with the versioned expectation. A `stale_write` refusal catches up once
    (`refreshOnStale`, unchanged) and is thrown by the new **`refuseStaleStore(err)`**. That step
    says what a caught-up stale store throws: `stale_write` (nothing was written, the vault shows
    the lockbox as storage holds it, store again; the adapter's refusal as its `cause`), or
    `vault_locked` when the catch-up relocked the device. Anything else passes through as it came.
    Gone: `retryStale`, `MaxWriteAttempts`, `WriteRetryBaseMillis`, `retryDelayMillis`, `sleep`,
    the `'erased'` outcome, `boxStood`, and the now-unused `randomBytes` import. `writeOver` keeps
    the `clearsFirst` path unchanged. The `store()`, `lockSoon()` and `isCaughtUpStale` doc blocks
    are rewritten.
  - `README.md`: a new *Two devices storing at once* paragraph under *Conditions*, and the
    `stale_write` row and *Damaged lockboxes* sentence updated. `VAULTDB.md` (*Who does what*,
    4.3), the convex README and `NOTYET.md` no longer say "last writer wins" or "retry".
  - Tests (`tests/vault.test.ts`): the tests that counted attempts, timed the waits or pinned
    the jitter are deleted, along with their helpers (`drivenToEnd`, `untilAsleep`, `realTurn`,
    `pinJitter`, `rivalBeforeEachWrite`). The new test is "a store over a box written meanwhile
    elsewhere is refused as stale once, without waiting...". It runs on a deaf vaultDB, so only
    the catch-up can bring the other write in. It checks: one `updateBox`, no timer, the
    snapshot showing their revision and bag, and that a second store lands over their revision.
    The damaged-box, created-meanwhile, erased-meanwhile, relock and `lockSoon` tests now expect
    one refusal, then a second store.
  - `notes/security.md`: the existing 2026-10-15 retry entry is rewritten in place (dated
    2026-10-18), by a `sonnet` subagent following the file's header.
  - `.changeset/20261018-no_retry.md`: `minor`, safebyok. No removed name was public.
* **Decisions taken**:
  - **A relocking catch-up still throws `vault_locked`**, not `stale_write`. That was already
    what the first attempt did (`keyInHand()` after the catch-up), and `withUnlockedVault` in
    react prompts and stores again after the unlock. `erase()` throws `stale_write` in the same
    case. The kinds differ, but each says what the caller has to do next.
  - **Look-ahead for thread 9**: `refuseStaleStore(err)` in `vault.ts` is the named catch-up
    step. `created_elsewhere` can be one more branch in it after `keyInHand()`: when
    `prev === null` and the caught-up `boxes` list the boxlabel, pass `prev` (or a flag) in. The
    created-meanwhile test ("a store of a box that did not exist, and is created meanwhile
    elsewhere, is refused as stale: theirs stands") is the one thread 9 changes.
* **Discoveries**:
  - `pnpm size`: `everything` 34.86 to 34.72 kB (-0.14), `openVault` 27.56 to 27.45 kB (-0.11);
    the rest unchanged. The new refusal message takes back part of what the deletion saved.
  - react and demos assumed no retry. Both demo `save()` handlers show `err.message` and keep
    the form open, so a `stale_write` leaves the user one click from storing again. The message
    says to. Nothing changed there.
* **For the Coach**:
  - `notes/security.md` still has three lines elsewhere that describe the retry: near line 117
    ("as a retried store's would"), 1028 ("Only `store()` retries ... an erase wins") and 1034
    ("the store then retries over it, last writer wins"). The header says to change no other
    entry, so the subagent left them as they are. Should the next writer of the file amend them?
