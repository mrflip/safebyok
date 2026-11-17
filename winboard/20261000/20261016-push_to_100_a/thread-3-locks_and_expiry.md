# Thread 3: locks_and_expiry (2026-10-16)

Branch `20261016-locks_and_expiry`, PR [#127](https://github.com/mrflip/safebyok/pull/127), from
`main` (`f63bd915`). Justify: green; core 1649 passed / 33 skipped, React 112, demo 162, every
other package as on main. `pnpm size`: openVault 22.21 kB, under main's 23 kB.

* **Built**:
  - `Ms` is `Millis` everywhere (`ForeverMillis`, `reentryWindowMillis`, the private names, the
    tests' and `safebyok/testing`'s). New exports `MinuteMillis`, `MaxReentryHours` (588), and the
    type `UnlockExpectation`.
  - `forcePassphraseReentryHours`: positive up to 588 or `Infinity`, else `bad_option`.
  - Expiry (`vault.ts`): the threshold is checked at every call (`ensureUnlocked`, and
    `keyInHand` for work in hand); one timer at a time, `unref`'d (`unrefTimeout`): it rings at
    `askPassphraseAt` (snapshot flips) and drops the key 60 s later (`armExpiry`, `shutAt`,
    `ExpiryGraceMillis`). A look past the shut time drops a key whose timer ran late
    (`dropKeyIfDue`). `lockSoon()` takes the lesser shut time; past it, locks at once.
  - Renewal in one place, `deadlineFor(proof, call)`: an `unlock()` or any passphrase proof sets
    now + window; a passkey proving a change keeps the standing deadline (sets one if locked).
  - Versioned erase: `DeviceMark.lock_generation` (format `safebyok-mark-v2`); `forgetUnlock()`
    raises it before erasing (every lock: `lock`, `lockSoon`, the sign-out lock, `destroy`);
    `noteStart()` reads it as an unlock or a ways-in change starts; `DeviceDB.writeUnlock(unlock,
    expected)` is conditional (`stale_write` otherwise; one IDB transaction in `idbDeviceDB`);
    `writeMark` keeps the higher generation. `describeDeviceDB` gained three tests.
  - `close()` is no lock: no shut-count move (`outrun` checks `closed`), no erase.
  - G130: `deviceTroubleAsCondition` wraps a non-VaultError from the remembered-unlock read at
    open as `storage_unavailable`, cause kept.
  - Docs: core README *Locking* and both screen-lock recipes; `notes/wontfix.md` (new, G129);
    two `notes/security.md` entries at the end, three older entries marked revised; VOCABULARY's
    lock generation; CLAUDE.md and PROCESS.md name `wontfix.md`; the changeset.

* **Closes** (for the sweep):
  - G115 closed: all four `lockSoon()` calls kept, `vault_locked` for a lost unlock; "never depend
    on a timer" is the threshold-plus-timer above (code, README *Locking*).
  - G124 closed: the timer (code, `notes/security.md`).
  - G125 closed: only-earlier rule; `ensureUnlocked` no longer drops a key work in hand holds;
    the timers are `unref`'d (Fable said leave the unref: the timer now lives days, so I did it).
  - G126 closed: `close()` erases nothing; the undo erase runs only for a lock in its own handle.
  - G127 closed by a README line (*Locking*, the clock paragraph): left as built.
  - G128 closed by a README line (the clock stepped back): left as built.
  - G129 closed: `notes/wontfix.md`'s first entry, and the option's doc block.
  - G130 closed: code and a test.
  - G131 closed: the versioned erase.
  - G132 closed by a doc line (`unlock()`'s doc, README): `wrong_passphrase` stands, per Fable.
  - G490 closed: both recipes' `catch` quiet only `vault_closed`.
  - G509 closed: nothing to build (strawman, *The two locks*): expiry is no lock and never
    defeats an unlock or `changePassphrase()` under way (tested); a user's lock does.
  - G324, its `Millis` half, closed: the rename, and the far-future rule
    (`>= FarFuture - MinuteMillis`) in doc blocks, README and VOCABULARY.

* **Decisions taken**:
  - The window's renewal is decided by the proof in `deadlineFor`, the one place every proof
    passes; removeUnlock by passphrase renews too ("type a password for any reason").
  - A passkey-proved change on a locked vault unlocks with a full window, as `unlock(passkey)`.
  - The conditional write is `writeUnlock` itself, with an expectation, as VaultDB's verbs take
    one, not a new verb: no unconditional path is left to misuse.
  - `lock_generation` is per scope: a vault made anew under the scope keeps counting.

* **Deviations**:
  - **`lockSoon()` still defeats an unlock under way** (G115's "keep all four", which the Coach
    marked proceed), and raises the lock generation. The strawman's two-locks table puts
    `lockSoon()` with the soft lock, whose "unlock already under way: finishes". Only expiry is
    soft here. See *For the Coach*.
  - `lockSoon()` erases the remembered unlock at once, as built, not "at the shut time" (strawman
    table): a new tab opening within the grace is new work, and should ask.
  - `writeMark` gained a rule (never lower the generation) beyond the preplan's "one
    conditional write": without it a mark raised from an older read (rollback marks, another tab)
    can undo a lock.
  - The timer is two moments, one timer at a time: a bell at the deadline (so the snapshot flips
    then, as the strawman's "locked at once" wants) and the drop a minute later.
  - Pulled forward from thread 7: the React dialog's "until locked" now compares
    `>= ForeverMillis - MinuteMillis` (one line in `passphrase-modal.tsx`, two tests). G324's
    wording half stays thread 7's.

* **Discoveries**:
  - Every unlock now arms a `setTimeout`: a test spying on `setTimeout` must filter (see
    `delaysAsked` in `vault.test.ts`), and `vi.runAllTimers()` would lock a vault.
  - The review (fixed, `d716b306`) left seven minors; the orchestrator hands all but (4) to
    thread 4: (1) the drop is armed a fixed minute after a late ring, not `dueAt - now` (the fix
    wants `pass()` moving clock and timers together); (2) `destroy()`'s `eraseMark` resets the
    generation, so an unlock elsewhere under way at 0 can take up a destroyed vault's key; (3) a
    lock before any mark exists raises nothing; (4) the post-deadline minute is open to a clock
    stepped back (G128's class, left); (5) `store()`'s stale-write retry calls `ensureUnlocked()`
    where `keyInHand()` honours the grace; (6) G130's wrap covers `rememberedUnlock` only, not
    `refresh()`'s `readMark`; (7) `keptMark()` warns as `call: 'refresh'` when a lock calls it.
  - A mark from before (`-v1`) reads as none, once: the rollback check restarts from storage.
  - Thread 4: `noteStart()`/`takeUpUnlock(…, started, until)` is the unlock's shape now;
    `destroy()` goes through `shut()` → `forgetUnlock()`.
  - Thread 6: route a passkey-proved `changePassphrase` through `reviseUnlocks`; `deadlineFor`
    already keeps the standing deadline for it. No re-plumbing.
  - Thread 7: import `MinuteMillis` from `safebyok`.
  - Thread 2: the mark's format is already bumped to `-v2`; the snapshot test should list it.

* **For the Coach**:
  - Is `lockSoon()` soft (an unlock under way finishes, as the strawman's table has it) or as
    built (it loses, per G115)? Now an Open Matters row.
    - → *Coach (2026-10-16):* lockSoon() is a soft lock; thread 4 (#132) builds it so.
  - A passkey proving a change keeps the deadline rather than renewing it: the narrower reading
    of "type a password ... and prove I am mrflip". G530 (NOT YET) asks the deeper question.
