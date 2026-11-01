# Thread 3d: gating_concurrency (2026-11-01)

Branch `20261101-gating_concurrency`, PR #435, stacked on #433 (3c, `20261101-gating_telling`).
Justify: green (safebyok 4860 passed, 37 skipped; every package green; no size moves).

* **Built**
  * **A second gating on a vault** (`models/vault.ts`, `#launchGating`, `#launchInTurn`,
    `#askInTurn`): a gated verb called while a gating of its kind is launched joins it (one
    promise per kind in `#launches`), sharing its outcome; the first caller's `run` is the one
    run. A gating of another kind waits its turn on `#askingMutex` (es-toolkit `Mutex`, FIFO),
    held from before `Gating.launch` until the gating settles. Class doc says so.
  * **`ensureUnlocked(cleartexts)` attempts through an open unlock gating**
    (`#joinUnlocking`, `#attemptThrough`). `#asking` holds the gating handed to the host
    (set by wrapping `requestCleartext`, which `Gating.launch` calls before its first await).
    A correctable refusal throws to the joiner alone and leaves the gating open; otherwise the
    joiner shares the unlock in flight. A join while no unlock gating is open (direct proof in
    flight, or the unlock still queued behind another kind) spends the cleartexts untried, as
    before (G2).
  * **The refresh before proving** (`#unlockByProof` begins `await this.fetch()`, no longer
    only when not full). Both paths: a gating's attempt and a direct `ensureUnlocked(cleartexts)`.
    `#unlockByGating` still fetches (when not full) before launch, so the gating carries a
    passkey header.
  * **`Gating.#inTurn` on `Mutex`** (`models/gating.ts`, `#turns`), replacing the promise
    chain. The recorded tests (decline behind an attempt, success wins) pass unchanged.
  * **`lockedWhileAsking`** (`helpers/refusal-funcs.ts`) and `Phrases.LockedWhileAsking`: kind
    `declined`. **No caller yet** -- see *For the restack*.
  * Tests: `vault-gate.test.ts` "A second gating on a vault" (join, wait, wait past a
    decline); `vault-unlock.test.ts` "while an 'unlock_vault' gating asks the user" (unlock
    through, correctable refusal unspent and gating open, two concurrent joins) and "the gate it
    proves against" (passkey revoked or replaced elsewhere, directly and through a gating).
    `gating.test.ts`'s moved-passkey cases now store elsewhere without fetching here, so they
    prove the attempt's refresh. Helpers `holdNextDialog`, `replacePasskeyElsewhere` moved to
    `tests/test-helpers/vault-world.ts`.
  * `notes/guarantees.md` G2: the join sentence names `#attemptThrough`.

* **Decisions taken**
  * **Join same kind, wait for another; never refuse.** Refusing would need a new refusal
    kind and make every host retry; waiting gives a React host one dialog per vault at a time.
    Joining shares the first caller's `run` (for `replace_passphrase` etc. the second caller
    handed no cleartexts, so there is nothing of theirs to lose).
  * **A turn ends when the gating settles**, not when the host's dialog promise resolves:
    `Gating.launch` resolves on settle, and a host that keeps a dialog up animating should not
    block the next gating.
  * **The refresh on both paths**, not only the gating's: the direct path had the same hole
    (a revoked passkey proving against a cached gate). Cost: an unlock needs storage reachable.
  * **`#attemptThrough` uses `tryAttempt` and throws only while the gating stays open.** A
    catch-and-rethrow-when-open would read the same; the Outcome keeps the "is it still
    open" test after the attempt explicit. Open question below.
  * **`lockedWhileAsking` is `declined`**, not `vault_locked`: the gating ended unanswered,
    which is what a host's dialog code switches on; 4b's `lockedWhileUnlocking` stays
    `vault_locked` for the direct path.

* **Set aside**
  * A per-vault queue of gating requests instead of a Mutex plus a per-kind map: more code
    for the same order.
  * Attempting a joiner's cleartexts while the unlock is queued (not yet asking): would need
    to hold the cleartexts until the gating opens, keeping secret material alive in a queue.

* **Discoveries**
  * After `gating.decline()`, awaiting anything gives the launch time to reject and
    `#unlocking` to clear, so a "join" written after it proves directly instead. Tests that
    mean to join must call before yielding.
  * 3c's moved-passkey tests fetched the other device's write before attempting, so they did
    not prove the refresh; they now do.

* **For the restack with 4b (#434)**
  * 4b's `#gatings` Set (filled by wrapping `requestCleartext`) overlaps `#asking`; one of
    them should go. `#asking` is at most one gating now, since gatings take turns.
  * The lock should decline the asking gating with `lockedWhileAsking()`: `Gating.decline`
    takes no refusal today; it needs an optional one or a sibling method.
  * A lock should also refuse queued launches (waiting on `#askingMutex`, not yet asking);
    today they ask after the lock, which for an `unlock_vault` is arguably right.

* **For the Coach**
  * **Offline unlock** now refuses where storage is unreachable, even with the gate cached.
  * React's `BankProvider` still declines a gating open on one vault when another vault's
    launches; out of scope here.
