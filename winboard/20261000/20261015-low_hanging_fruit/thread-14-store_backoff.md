# Thread 14: store_backoff (2026-10-15)

Branch `20261015-store_backoff`, PR [#45](https://github.com/mrflip/safebyok/pull/45), on
`main` (thread 7's [#44](https://github.com/mrflip/safebyok/pull/44) had merged by filing time).
Justify: green (safebyok 327, safebyok-convex 219, safebyok-react 15, demo 28, root 91). Had no separate review: a small
follow-up the Coach asked for directly, in YOLO mode.

* **Built**: in `packages/safebyok/src/vault.ts`, `retryStale` now sleeps before each retry:
  uniformly random in `[WriteRetryBaseMs * 2^(n-1), WriteRetryBaseMs * 2^n)`, `WriteRetryBaseMs =
  1000`, so 1-2 s before retry 1 and 2-4 s before retry 2 (up to about 6 s longer in the worst
  case). `MaxWriteAttempts` stays 3. No wait before the first attempt or after the last refusal.
  Module-private constants and helpers (`retryDelayMs`, `sleep`), not a public option. Doc blocks
  of `store()`, `MaxWriteAttempts`, `WriteRetryBaseMs`, `retryDelayMs`, `retryStale` updated.
  Changeset `.changeset/20261015-store_backoff.md` (patch); #44's is untouched.
* **Decisions taken**:
  - Jitter is drawn from `crypto.getRandomValues` (via `randomBytes(4)`), not `Math.random`: the
    core's eslint config forbids `Math.random` in `src/`. The doc block says the jitter guards no
    secret.
  - Library first: no existing dependency offers a sleep or backoff; `setTimeout` in a promise
    is three lines. Not added: `p-retry` or `exponential-backoff`. **Settled by the Coach:**
    "our retry, note the library under ragebait in the todo" -- the hand-written backoff stays,
    and `TODO.md`'s *RAGEBAIT* now says to take `p-retry` (or `exponential-backoff`) if it ever
    grows (more callers, cancellation, a policy hook).
  - **Erase and relock are told of at once, not after a wait.** With the sleep inside
    `retryStale`, a box erased elsewhere would only have been noticed on the retry's read, after
    1-2 s of waiting for nothing. So in the attempt, a `stale_write` from `updateBox` is now
    followed (after the catch-up `refreshOnStale` already does) by `ensureUnlocked()` and a check
    that the box is not gone from the snapshot's `boxes`; either ends the store there
    (`vault_locked` or the erase-wins `stale_write`). The same checks at the top of the next
    attempt still catch an erase or lock that happens during the wait. This is a small addition to
    the brief, made so "erase wins ... no wait" holds.
* **Tests** (`tests/vault.test.ts`): the "two devices writing at once" suite runs on a faked
  `setTimeout` clock (only `setTimeout`/`clearTimeout` are faked), helpers `stillClock`,
  `drivenToEnd`, `untilAsleep`, `pinJitter`; the existing retry tests are driven to the end
  without real waiting. New: no wait on a first-attempt win; a wait in [1000, 2000) before one
  retry; [1000, 2000) then [2000, 4000) before two; the exact window edges (lowest draw 1000 then
  2000, highest 1999 then 3999) with the jitter word pinned; the third refusal throws with only
  two waits; nothing is read or written while asleep; lock during the wait gives `vault_locked`
  with one `updateBox`; erase during the wait gives `stale_write` after the one wait, no further
  retry; erase wins and relock caught up by the refusal wait for nothing.
* **Deviations**: thread 7's file says "A retry is not given a delay or backoff"; this thread
  reverses that at the Coach's request. The core README does not describe the retry, so it is
  unchanged. No `notes/security.md` line: the jitter is not a security decision.
* **For the Coach**: the numbers (3 attempts, base 1 s) are a two-way door; the Coach saw them and
  did not object, so they stand. The six-second worst
  case lands in a UI awaiting `store()`: a host showing a spinner will see it.
