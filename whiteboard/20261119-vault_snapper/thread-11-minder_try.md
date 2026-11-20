# Thread 11: minder_try (2026-11-20)

Branch `20261120-minder_try`, PR #778, stacked on #777 (whisper_refresh). Proved: safebyok 1374 tests, safebyok-react 329,
typecheck and lint clean in both, before the catch-up.

* **Built**:
  * **The goodbye-then-hello token is out** (`packages/safebyok/src/minding/thing-minder.ts`). `#minding: symbol | null` is
    main's `#isReady = false` again; `list`, `tryWrite` and `#doGet` lose their stretch checks, and the docs lose "answered after
    `goodbye` caches nothing". The three lifecycle tests of an answer landing after goodbye and a fresh hello, their
    `outcomeOf` helper and `LateListVaultDB` (world.ts) are gone. `notes/wontfix.md` gains "A minder's answer that crosses a
    `goodbye` and a fresh `hello`". A plain goodbye still lands nothing (`#sendToTSQ` checks `#isReady`), as on main.
  * **Try-verb pairs**: `tryGet`/`get`, `tryList`/`list`, `tryWrite`/`write`. Each `tryFoo` resolves an `Outcome`; each `foo` is
    `Outcome.valOf(await this.tryFoo(...))`. `tryGet` and `tryList` wrap their body in `Outcome.outcomeOf`. `refresh` is
    unchanged (it still calls `get`). `vault.#writeOnce` calls `minder.write`; no other caller changed (vault's two `get`s,
    minder-bank's `get` read best as they are). Tests: `ThingMinder.tryGet`, `ThingMinder.tryList` (reads test),
    `ThingMinder.write` (writes test).
  * **`listingAt(scoped)` and `isListingBareAt(scoped)` take a `ThingScope`** again, checked by `#demandOwnScope`.
    `queryKey`, `listingQueryKey`, `childrenQueryKey` keep `Labelpathed`.
  * **Events drop `carkind` and the listing's `tag`** (`shapes-minder.ts`). New static `ThingMinder.isThingEvent(event)`: true
    when the event's query key ends in `'!'`, a type guard to `ThingEvent`. The giver (`safebyok-react/src/giver/minder-bank.ts`),
    world.ts's `toldOf` and the listen, listing-orders, invalidate and writes tests use it. VOCABULARY.md's *car* row says so.
  * Changeset `.changeset/20261120-minder_try.md` (empty; the new core is private).

* **Decisions made**:
  * **Misuse in a `tryFoo` resolves as a bad outcome; it does not throw.** The handoff said misuse "still throws from both, as
    STYLE.md's validation and refusal rules say". But `tryWrite` already answered misuse as a refusal, by its doc ("Before
    `hello`, after `goodbye`, or for a scope outside this bank, it answers the refusal without asking the vaultDB.") and its test
    ("answers the refusal, and asks the vaultDB nothing, while not minding"); `tryAt` does the same; VOCABULARY calls an Outcome
    "the result a non-throwing `try*` call resolves to"; the vaultDB's and big's try verbs answer misuse too. I found no STYLE rule
    saying misuse throws from a try form. Keeping `tryWrite`'s contract meant building `tryGet`/`tryList` the same way. `get`,
    `list` and `write` throw misuse, as before. Set aside: throwing misuse from all three try forms, which changes `tryWrite`'s
    stated contract and its test.
  * **`ThingFormat` is not bumped.** It is also every stored Thing's `fmt` and safebyok-postgres's `TableVersion`, so a bump is
    a stored-shape change. The event shape with `carkind` never shipped: the feed's versioning (thread 2) and `'a010501'`
    (thread 3) are both in this unmerged line.
  * **`isThingEvent` is a static on `ThingMinder`**, not a field on the event: TypeScript cannot narrow the union on
    `queryKey.at(-1)`, and the guard keeps the giver from knowing the key's mark. It takes a typed `MinderEvent` and parses
    nothing.
  * `thing-minder-cache.test.ts`'s "is true of the root box's listing, empty again, after goodbye and hello" stays. It is on
    main, and is no crossing: nothing is under way at the goodbye.

* **Deviations**:
  * A `get` that throws something other than a refusal now rejects with it as an `unexpected_error`, since `tryGet` goes
    through `Outcome.outcomeOf`. Said in the changeset.

* **For the Coach**:
  * **Misuse from try forms** (above): resolved, not thrown. Flipping it means `tryGet`/`tryList` lose the `outcomeOf`
    wrap of their guards, and `tryWrite`'s doc line and its "while not minding" test change.
  * **ThingFormat not bumped** (above). shapes-minder.ts's "A change to this shape bumps ThingFormat" stands for the
    future.
  * Making `goodbye` final, or post-goodbye operations throw, was held, as the handoff asked. Nothing here touches it.
