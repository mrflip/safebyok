# Thread 5: screen_lock_recipe (2026-10-15)

Branch `20261015-screen_lock_recipe`, cut from [#55](https://github.com/mrflip/safebyok/pull/55)'s tip `fda3462` (#53 merged); PR [#60](https://github.com/mrflip/safebyok/pull/60), stacked on #55. Reviewed: the reviewer added df343ac, e88105f and 1fec5b8 (below). Justify: green (root 105, safebyok 381, safebyok-convex 219, safebyok-react 16, demo 28); `pnpm size` within every limit.

* **Built**:
  - `vault.ts`: `Vault.lockSoon(graceSeconds?)`, default 5, at most 60 (`bad_option` otherwise: Zod's number refuses `NaN` and `Infinity`). With a key held and a grace above 0 it moves the shut counter (an unlock or passphrase change under way loses), clears `askPassphraseAt` (null: the gate closes by having no deadline, so a wall clock stepped back in the grace cannot reopen it -- the reviewer's df343ac; it first set it to now), schedules `shutAfter(graceMs)`, bumps, and erases the device record. With no key, or a grace of 0, it is `lock()`. The timer only drops the key (`dropKey()`: nulls `vaultKey` and `askPassphraseAt`, clears the timer) and bumps.
  - `keyInHand()`: the check an operation already past `ensureUnlocked()` makes when it looks again (`store()`'s retries, `erase()`'s second look). It asks only that the key still be held, so work begun before the gate closed finishes in the grace. `ensureUnlocked()` no longer drops the key on refusal while a shut is pending, or a new `read()` in the grace would kill the `store()` in hand.
  - `takeUpUnlock()` cancels a pending shut: an `unlock()` in the grace ends it, and so does a `changePassphrase()`, which proves the passphrase too (docs and a test from the reviewer's e88105f).
  - `shut()`, `refresh()`'s outlived path and `close()` all go through `dropKey()`, so every path that forgets the key clears the timer too.
  - `close()` moves the counter and drops the key from memory, and leaves the device record. An unlock under way on a closed handle takes nothing up, erases a record it already wrote, and throws `vault_closed` (tested: two cases, both failing on the base).
  - Tests: `tests/vault.test.ts` *lockSoon*, 27 cases (fake `setTimeout`/`clearTimeout` only), including the `graceSeconds` tables and the recipe run against an `EventTarget` standing in for `document`. `makeRacingWorld()` gains `holdNextBoxRead()`, which holds a `store()` in hand.
  - Docs (the Idle Detection snippet's `AbortController`, and a note that TypeScript's DOM types lack `IdleDetector`, from the reviewer's 1fec5b8): `Vault` doc blocks (`lockSoon`, `close`, `unlock`, `changePassphrase`, `VaultState`); the core README's *Locking* rewritten, with *A screen-lock recipe* (`lockSoon()` on `visibilitychange`, `lock()` on Idle Detection's `screenState === 'locked'`, sign-out, and plainly: any lock ends the remembered unlock, so a host wanting a week-long unlock shouldn't lock on tab-away); `notes/security.md` entry; TODO.md roadmap 5 (what is built, what is left) and the `lockWhenHidden` side quest; `.changeset/20261015-screen_lock_recipe.md` (patch, safebyok).

* **Decisions taken**:
  - **An unlock begun in the grace beats the timer**, even one still deriving when the timer fires. Thread 4's note had the timer go through `shut()` so an unlock under way loses to it. I took the other side because a timer is not a user's act: the user's last act was to come back and type their passphrase, and losing would make them type it again for nothing. The timer doesn't move the counter. An unlock under way *when `lockSoon()` is called* still loses, because `lockSoon()` moves the counter.
  - **A second `lockSoon()` never lengthens a grace**, only shortens it.
  - **The ceiling is 60 s**, natural expiry's ruled grace: a gentler lock should not linger longer than the natural one.
  - **`close()` is a shut in memory, not on the device**: it keeps "forgets nothing stored", and the reopen-unlocked test still holds. The losing unlock throws `vault_closed`, not `vault_locked`, because the handle is what refuses now. A `changePassphrase()` under way when the handle closes still lands and resolves, as it does under `lock()`.
  - **No `unref()` on the timer**: `close()` clears it, and calling `unref` needs a Node-typed cast in a platform-neutral `src/`. A Node process that calls `lockSoon()` and never closes stays alive at most 60 s.

* **Deviations**:
  - **The snapshot flips to `locked` when `lockSoon()` is called, not when the timer fires.** The plan's gloss and the ruling say the timer "flips the snapshot". I went the other way because clearing `askPassphraseAt` already makes `vaultState()` read `locked`, and `VaultState`'s own doc defines `unlocked` as "whispers readable". A snapshot that said `unlocked` while every new call threw `vault_locked` would show a UI an open lock that prompts. Keeping it `unlocked` would need `vaultState()` to consult the pending timer. The timer's own bump changes nothing, and a test pins that subscribers hear once.
  - **Natural expiry changes slightly**: a `store()` or `erase()` begun before `askPassphraseAt` now finishes past it (its inner checks are `keyInHand()`). This follows the ruling ("an operation already going is never clawed back"), and it is in the changeset and the security note.

* **Discoveries**:
  - Natural expiry's timer did not fall out of these lines, though `shutAfter()` is its mechanism. Two things need settling first, both written into TODO roadmap 5: `setTimeout` holds at most 2^31-1 ms (24.8 days), so a seven-day window fits but `Infinity` does not; and `ensureUnlocked()` drops an expired key itself today, a job the timer would take over.
  - Thread 1 (zod_mini) will need to move `graceSeconds`, a classic `Z.number()` schema in `vault.ts`, to `zod/mini` when it rebases.
  - The demo's sign-out still calls `lock()` and then signs out, which unmounts the provider (a close). With `lockSoon()` the close would end the grace at once anyway, so I left it alone.
  - The React README doesn't mention the recipe, so it is unchanged.

* **For the Coach**:
  - Confirmed by the review and the orchestrator, for the Coach's final word: an unlock begun in the grace beats the timer (against thread 4's note); the snapshot flips at `lockSoon()`, not at the timer (against the ruling's wording); the 60 s ceiling; `close()` throws `vault_closed` at an unlock under way and keeps the stored record.
  - Adding `lockSoon` to `Vault` breaks a host's own object typed as `Vault` (a test fake). The changeset says so; it is marked patch, as the sibling threads' additive changes are.
