# Thread 7: with_whisper (2026-11-20)

Branch `20261120-with_whisper`, PR #TBD, stacked on #773 (thread 6, `20261120-snapshots`). Proved: `vault.test.ts`
31 tests, `safebyok` typecheck and lint of the touched files; `pnpm justify` pending.

* **Built** (`packages/safebyok/src/models/vault.ts`, tests in `tests/models/vault.test.ts`):
  * `vault.withWhisper(labelpath, fn)`: checks the labelpath and that `fn` is a function (`bad_record`, before any
    prompt), awaits `bank.ensureUnlocked()`, gets the box with `minder.get` (the cached car if timely, else fetched),
    refuses `absent_box` for a `gone` or `void` car (big's `boxAbsent` thrower, re-exported through
    `refusals/throwers.ts`), then `return await fn(await bank.unsealBox(car.newest))`. `fn` may be sync or async
    (`Helpers.Awaitable<ResultT>`). Its throw goes up as it came.
  * `#scopeAt(labelpath)`, shared by `#newestAt` and `withWhisper`.
  * Item 1 (thread 4's review): `#newestAt` uses the cached car only when it is `full` or `gone`, and otherwise
    `minder.get`s it, so `putBoxOnce(labelpath, {}, secrets)` over a box known only from a list keeps its stored
    sidecar. The old test "refuses a newest cached sparse when the patch gives no sidecar" became "given a labelpath
    cached sparse, gets the box whole and keeps its stored sidecar"; a new test keeps the refusal for a sparse box passed
    as `cited`.
  * Item 2: `notes/security.md` (through a sonnet subagent): the thread 4 line now says the Vault holds no lease and
    seals through the bank's own; a new with_whisper entry at the top of *Of Interest*.
  * Item 3 (W2): `notes/wontfix.md`, "Changing only a box's sidecar needs the bank unlocked and the whisper in hand",
    with the workaround through `withWhisper`.
  * Item 4: the comment above "a vault's minder, beside the bank's own writes" now credits `AdapterVaultDB` (every
    adapter built on it: memory, Postgres) with telling each watch of the bank, main gate and root box records a write
    answers with, before the answer reaches its caller (`VaultDB.watch`'s bullet).
* **Decisions made**:
  * Unlock first, then get: the gloss's order, and a get after a long prompt is fresher than one before it. A box that
    is absent therefore prompts, then refuses `absent_box`; a host usually knows beforehand (its record hook's data is
    null).
  * `minder.get`, not `minder.at`, for the whisper: a stale cached whole box would silently hand `fn` an old whisper.
    `putBoxOnce` keeps using a cached car regardless of age, since a stale write refuses `stale_write` anyway.
  * A car left `behind` or `bare` after the get (a sparse record landing while the get waited: a crossing, out of
    bounds) is not handled specially: `unsealBox` refuses the sparse record (`bad_record`, from `BoxChecks.record`).
    Set aside: unsealing `car.fullest` (an older revision's whisper, silently), refusing `absent_box` (false), or
    getting again (a retry).
  * Nothing is zeroed: `lease.unseal` zeroes nothing, and strings cannot be zeroed. The unsealed box is a local.
  * A local `rejectionOf(promise)` helper in vault.test.ts checks `fn`'s throw by identity, chai-style;
    `Outcome.outcomeOf` would wrap a non-VaultError.
* **For the Coach**: the Wh1 recommendation (`absent_box` for never stored and for deleted) is built, taken in YOLO.
