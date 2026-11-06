# Thread 5: module_clock (2026-11-06)

Branch `20261106-module_clock`, PR #PRNUM, base main (cut at fbe760e0f). Justify: green; safebyok
1857 tests, every package and the size budget passing.

* **Built**:
  * `packages/safebyok/src/helpers/clock.ts`: `nowMillis()` reads `Date.now()` on each call;
    `_cheat_clock(fn)` and `_cheat_clockReset()` are the test backdoor. They are re-exported from
    `tests/test-helpers.ts` (`safebyok/testing`), never from `src/index.ts`. The build is
    unbundled, so `dist/testing.js` and the models import the one `dist/helpers/clock.js`
    (checked).
  * `clock` is gone from `bankOpts`/`BankOpts`, `vaultDBOpts`, `listingOpts.world`, `VX.world`,
    `provingWorld`, `leaseFriend`, and so from every world and friend; `Bank.clock`,
    `Listing.clock`, `Vault.clock`, `VaultDB.#clock`, `Clock`, `wallClock` and `clockShape` are
    gone. The 13 sites that read the time call `nowMillis()`.
  * Tests: the five world helpers call `_cheat_clock` in place of handing a clock in;
    `tests/vitest-setup.ts` (wired in `vitest.config.ts` as `setupFiles`) resets the clock after
    every test. `tests/helpers/clock.test.ts` is new. The clock-shape cases and "throws a clock
    that throws" are dropped.
  * Docs: STYLE.md (the host-code `Shape` exceptions are four; the epoch-millis paragraph names
    `nowMillis()`), VOCABULARY.md (the **logger** row alone), `notes/wontfix.md` (the host-clock
    row says what is true now), and the one G4 sentence in `notes/guarantees.md` ("Both go by
    the device's clock, as `Date.now()` reads it: ...").
  * Changeset `.changeset/20261106-module_clock.md`, minor: a host passing `clock` meets
    `bad_option`; `bank.clock` is gone; `_cheat_clock` is the test hook.
* **Directives riding on this thread**, a commit each:
  1. `proving.buildLease` judges `checked.friend`, not the raw `friend`. The new test hands in a
     friend whose `vault_tok` is a prototype getter for another vault. It failed before the fix.
  2. `lease.test.ts`: `sealWith` and `unsealWith` zero the whisper bytes they held. The test spies
     on `TextEncoder.encode` / `TextDecoder.decode` to catch the arrays. It fails with the
     `fill(0)` calls removed.
  3. `phrases.ts`: `whisperTooLarge` and `noRoomForBox` are deleted, with their cases in
     `phrases.test.ts`. **Pulled forward**: `BoxDamagedBeyondNaming`, which has no caller either
     and was what the stale `damaged_box` comment described.
  4. `consts.ts`: the `FarFuture` and `ForeverMillis` prose is rewritten. So is `MinuteMillis`'s,
     which pointed at the same "until locked" display. The consts.test case that rebuilt that
     display, testing a host's own arrow rather than the constant, is deleted.
  5. `storable.ts`: `#isEnabled` and `isEnabled` say a sweep or a vacate, not a delete.
     `errors.ts`: the `damaged_box` comment says a whisper that will not open, or opens to no
     whisper.
  6. `errors.ts`: the `getWhisper` example is `isVaultError`'s, since the `VaultError` class's
     example (`vaultDB.tryGetVault`) is sound. It now reads `box.extractWhisper()`, the very line
     thread 3's branches carry, so whichever lands second merges clean. `extractWhisper` takes no
     label, so "a valid label" has nothing to attach to.
* **Decisions taken**:
  * A module-level clock with a setter, not a clock passed anywhere. The Coach approved
    "option (a)" in the inventory (`clock-inventory.md`).
  * The state lives in a `const reading = { millis }` holder.
    `unicorn/no-top-level-assignment-in-function` refuses a reassigned `let`.
  * `_cheat_clock` takes no validation. It is a test hook, absent from the main entry.
  * `VX.world` is kept as an empty `objCheck` (strip), refusing only a non-object. `World` is
    `object` rather than `Z.infer` of it, which would be `Record<string, never>` and break every
    `World & {...}` intersection. Thread 6 replaces both when the worlds become Picks.
  * `makeProving` in `vault-world.ts` builds its proving world by hand rather than from a second
    `makeVaultWorld()`, which would have taken the shared clock over.
* **Deviations**:
  * The reset is one vitest `setupFiles` hook, not a reset in each helper's teardown:
    `storage-world` has no teardown, and a missed reset would leak a frozen clock into the next
    file. The helpers only set the clock.
* **Discoveries**:
  * `consistent(bag, other)` reads only `bag`'s own enumerable fields, while a Zod parse reads
    through the prototype. Any other `consistent(raw, ...)` on an unparsed argument has the same
    hole. I found none in the files I touched.
  * `notes/gallant.md` still shows `this.clock.now()` and `clock = wallClock` in three examples.
    Left alone: gallant.md stays whole, for reviewers.
  * `safebyok-react` and the demo still pass a `clock`, but to `safebyok-old`. Untouched.
  * eslint's cache can hide a file's existing warnings: a `git stash` comparison read 0 where a
    fresh run read 1 (`consts.ts`, `Whispered`'s block).
* **For the Coach**:
  * **ForeverMillis**: no core caller is left (only its own test; safebyok-react reads
    safebyok-old's copy). I gave it neutral prose. Recommend deleting it in a later thread.
  * **testing re-export**: `safebyok/testing` publishes `_cheat_clock` and `_cheat_clockReset`, as
    the brief said. That puts them in a published entry, under loud names.
