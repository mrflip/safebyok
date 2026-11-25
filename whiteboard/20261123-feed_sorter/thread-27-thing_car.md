# Thread 27: thing_car (2026-11-24)

Branch `20261124-thing_car`, PR [#893](https://github.com/mrflip/safebyok/pull/893), stacked on [#892](https://github.com/mrflip/safebyok/pull/892). Proved: see the
PR's **Tests:** line (`pnpm justify` in full; idb-lean, postgres, react-lean and the three lean demos by hand).

Built by hand (no /sprint), from the orchestrator's brief (C1–C6). The Coach: a ThingCar with a `lastErr`, "only an
internal record for answering questions like the lastErr and refreshed_at"; "the car goes in the map first, always, and
is never dropped"; a once verb throws its own answer's refusal, TanStack's contract.

* **Built**:
  * **C1, the car.** `ThingCar<ThingT>` (shapes-vault-minder.ts, exported): `Readonly<{ thing, lastErr: VaultError | null,
    erred_at: EpochMillis | null }>`. A frozen plain record, replaced (never mutated) when `lastErr` changes, so a
    reader holds a snapshot and the same object until it changes. The minder's map is `#cars`; `thingAt` answers
    `carAt(scoped)?.thing`, so its callers did not change; `carAt` is the narrow read (in `VaultMinderMembernames`).
  * **C2, made first, never dropped.** `#ensureCar` makes the Thing holding the shell (`seen` itself where it is the
    void sentinel, else `Shell.inParentLivesOf(seen)`), keeps its car, and only then does the Thing receive `seen`.
    `ThingMaker` now takes the shell (`(shell: VoidSentinel) => ThingT`). Thread 23's keep-then-drop is gone. Where
    `makeThing` refuses (`record_conflict`) or the minder's own `seenCited` parse refuses, no car is made, the refusal
    goes to `onBadNews`, and it is the refusal the tell hands back.
  * **C3, `lastErr`.** Set in `#receiveAtThing` when `thing.receive` throws (the thrown value made a refusal once, so
    `lastErr` and the bad news are one object), with `erred_at = Clock.nowMillis()`; cleared when `receive` returns,
    news or not; `erred_at` is kept on a clear, as TanStack keeps `errorUpdatedAt`.
  * **C4, the tell hands back the refusal.** `#tellAnswer(answer, roots, owns)` tells roots then owns and returns the
    first refusal among `owns` (the get's or write's own record); `#tell` returns its first refusal. `#doTryGetThing` /
    `#doTryWriteThing` return `{ answer, refusal }`; `tryGetThing` / `tryWriteThing` answer the vaultDB's answer
    unchanged; `tryGetOnce`, `tryPutOnce`, `tryDelOnce` answer `ownRefusedAnswerOf(answer, refusal)` where there is one.
    The three "no Thing" checks and their comments are gone (`getOnce`; `Vault.tryPutBoxOnce` / `tryDelBoxOnce`).
  * **C5**: not built. The bad news names no labelpath (see *For the Coach*). C4 already shows the error where the
    item's own refetch meets the refusal: the query errors with its data kept (vault-tsq test).
  * **C6.** `Thing.inspectable().dataUpdatedAt` is `read_at` (0 before any record); a root's row in
    `device.inspectable()` shows its car's `lastErr` kind (one line in `device.ts`).
  * VOCABULARY.md: a one-line **car** entry beside **minder**.
* **Decisions made**:
  * A type, not a class: a frozen record replaced on change reads plainer than a class with `#fields` and getters, and
    is a snapshot by nature. It lives in `shapes/`, by the house rule, not in `minding/`.
  * Names: `lastErr` (TanStack `error`; the snapshot's own `lastErr`), `erred_at` (TanStack `errorUpdatedAt`, in the
    `read_at` / `written_at` family). No earlier car in `safebyok-big/src`: nothing to reuse.
  * `erred_at` is the clock time of the refusal, not the record's `read_tc`: a refused record's `read_tc` may be the
    very thing refused (a UUID that is no time code).
  * A refused answer built from a good one has act `unclassified_storing`, the good answer's `ask`, `world`, `banktok`,
    `tracked` and `read_tc`, and the refused record as `dbhas`. A refused answer whose `dbhas` is refused keeps its act
    and takes the Thing's refusal as `err` (a `stale_write` over a record the Thing refuses would otherwise loop).
  * `getOnce` reads `this.thingAt(scoped)!`: a good answer's own record was told and taken, so the car is there.
  * `RefusingThing` moved from thing.test.ts to `tests/test-helpers/plain-thing.ts` (TH), begun as `PlainThing` is.
* **Deviations**:
  * The brief expected `makeThing` to begin from the shell; it began from `seen` where whole, so a first record a
    Gate's adopt refuses threw inside `makeThing`. The minder now hands `makeThing` the shell. `world.makeThing` is
    unchanged (it still takes any seen).
  * Sign-in's gets (not edited) now see the root's own refusal: a refused root record makes `tryGetOnce` bad, so
    sign-in shows that refusal instead of `bank_roots_missing`, and where the bank is already up tells it to
    `onBadNews` a second time (once from the vault TSQ's listener, once from sign-in). Broken state only.
* **Discoveries**:
  * `Vault.#donorAt` keeps its own "no Thing after the get" check (`throw Throwers.storageIssue()`): it reads through the
    vault TSQ, whose cache can answer without a get, so the car guarantee does not reach it. Left; the next thread can
    judge.
  * A root carried by both the answer's `world` and its `tracked`, refused, is refused twice: two bad news for one answer.
  * The minder's `rungThing` check refuses a gate whose wayins fail `GateChecks` before any Thing sees it (`isWhole`
    reads the wayins), so a test of a refused root record uses an answer whose `read_tc` is no time code.
* **Tables**: unchanged (feed_sorter's 190 rows and the minder_matrix chains); `Thing.receive` is untouched.
* **For the Coach**:
  * **C5, what it would take.** The minder knows the labelpath where a Thing refuses (`#receiveAtThing`). Either give
    `VaultMinderListener.onBadNews` a second argument, the labelpath or null (a damaged child, a hear that threw), or
    tell an `erred` event through `hear`. The first is narrower: `VaultEvent` is also what device databases ring. The
    writer then invalidates the item with `cancelRefetch: false`; the refetch's own refusal lands while that fetch is in
    flight, so it dedupes and does not loop.
  * **Should a repeat, an older or a sparse record clear `lastErr`?** In the PR body, with my recommendation: keep it as
    built, any record taken clears it.
  * **Second pass onto the car**: in the PR body.
