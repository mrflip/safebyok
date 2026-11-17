# Thread 15, follow-up: epoch_bounds (2026-10-15)

Branch `20261015-epoch_bounds`, cut from origin/main at 23551b2 (#53's merge); PR [#57](https://github.com/mrflip/safebyok/pull/57). It follows the merged [#53](https://github.com/mrflip/safebyok/pull/53) and is not part of it: these commits were built on #53's branch after it was filed, and #53 merged without them. Justify: green (root 105, safebyok 365, safebyok-convex 219, safebyok-react 15, demo 28); `pnpm size` within every limit.

The Coach: "for far future -- I'm inclined to go with the microsecond epochalypse which I think is still 200+ years away as our no-dates-past-this number, enforced by Zod; I'd also exclude epoch millis before 1981."

* **Built**:
  - `FarFuture` (`types.ts`) is `9_007_199_254_740` ms, commented `Math.floor(Number.MAX_SAFE_INTEGER / 1000)`: 2255-06-05T23:47:34.740Z, the last millisecond whose epoch microseconds are a safe integer. It is still the clamp for `Infinity` and what `askPassphraseAt` then equals.
  - `FarPast` is `347_155_200_000`, 1981-01-01T00:00:00Z.
  - `EpochMillis` is `Z.number().min(FarPast).max(FarFuture).int()`, each limit with its own message ("likely epoch seconds", "likely epoch microseconds", "whole epoch milliseconds"). `.int()` comes last so a huge number such as 1e300 is told about microseconds, not about being unsafe. All three are exported, and the exact-surface test lists them.
  - `DeviceUnlock.expires_at` is an `EpochMillis`. It is the only epoch-ms field: the bundle's and lockboxes' `created_at`/`updated_at` are ISO strings (roadmap 3 converts them), and the Convex validators carry no epoch ms.
  - `deadlineAfter` floors its sum, so a host clock that returns fractions still writes whole milliseconds.
  - The `Clock` doc says `now()` returns whole epoch ms between the bounds, that nothing checks it, and what a clock in seconds or microseconds does.
  - Tests: an `EpochMillis` case list and its messages (`types.test.ts`); out-of-bounds deadlines read through `memoryDeviceDB`, including what 0.2.0 wrote for a 1e9-hour window; spoiled rows read through a host's unchecking deviceDB; a deadline of exactly `FarFuture` still unlocked; and a fractional clock's deadline whole and read back (`vault.test.ts`). The React binding's pass-through test clock moved from 1000 to 2026. The `Infinity` test advances 200 years, not 1000: after 2255 even `FarFuture` has passed.
  - Docs: README *Locking*, a new changeset (`20261015-epoch_bounds.md`), #53's changeset (its 8.64e15 sentence now says `FarFuture`), and a `notes/security.md` bullet.

* **Decisions taken**:
  - **The bounds stay strict on read** (the orchestrator, YOLO decision 8, keeping the Coach's "no-dates-past-this number, enforced by Zod"). A device record out of bounds is erased, not clamped.
  - Fractions are refused (`.int()`), as STYLE.md says times are integers. `deadlineAfter` floors, so nothing the vault writes is fractional.
  - Both changesets are `patch`, as #53's already was for added surface before 1.0.

* **Discoveries**:
  - **The migration claim I first wrote was false** (caught in review). `safebyok@0.1.0` and `0.2.0` capped the window only at `MAX_SAFE_INTEGER` ms and stored `now + window` unclamped. So a host passing, say, `1e9` hours to mean "never" (`Infinity` was refused then) wrote a deadline past 2255, from any window above about two million hours (some 229 years). Such a device record now reads as no remembered unlock and is erased, and that user enters the passphrase once more. Nothing else that was written is affected. The changeset and the security note say so.
  - `rememberedUnlock`'s `Math.min(remembered.expires_at, FarFuture)` cannot be reached now, and its running comment ("a finite deadline past what a Date can") is stale. Both are left for second_harvest's thread 3, which stacks on this PR and owns those lines.

* **For the Coach**:
  - Release level: `patch` as recorded, though erasing some device records that released versions wrote may merit `minor` before 1.0 (the second reviewer's point). Your call at release.
  - Open: the host's `Clock` is not checked. A clock in seconds keeps an unlock in memory a thousand times its window, and its remembered unlocks never read back. A one-time `EpochMillis` check of `clock.now()` at `openVault` (kind `bad_option`) would catch it at once; it touches `openVault`, which the threads stacked here are rewriting.
  - Not taken: clamping an out-of-bounds stored deadline on read to `FarFuture` (the reviewer's option b), which would keep the 0.1.0/0.2.0 records above unlocked. It would make the ceiling a clamp rather than a refusal.
