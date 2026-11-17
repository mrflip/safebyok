# Thread 8: is_booleans (2026-11-07)

Branch `20261107-is_booleans`, PR #595, stacked on #594 (thread 7, brands). Justify: green;
safebyok 2514, safebyok-react 258, demo 96, e2e 298 (+4 skipped), every other package as before.

The Coach: "Is for booleans and word for enum, state is a smell."

* **Built**:
  * `lockState()` is gone from vault, box, listing, bank and the listing's world; each has an
    `isLocked` getter. Bank answers false, a listing asks its world, a storable asks its listing,
    and Vault overrides it with `#lease === null`. `LockState`, `lockStateVals` and their
    front-door export are gone (`shapes-enums.ts`, `index.ts`).
  * `listingWorld` checks `isLocked: bool` in place of `lockState: fn()`; `ListingWorld` picks
    `isLocked`.
  * Snapshots: the vault's `present`, `lockState` -> `isPresent`, `isLocked: boolean`; the box's
    `full`, `present`, `exposed`, `veiled` -> `isFull`, `isPresent`, `isExposed`, `isVeiled`.
  * Carried through `dom/box-fields.ts`, safebyok-react (`VaultLockControl`, the dev box
    inspector), the demo's `saved-api-key.ts`, every test, both READMEs, VOCABULARY.md
    (*locked*), `notes/design-models.md`, `notes/expose_improves_security.md`,
    `notes/old_vocabulary.md`.
  * STYLE.md *Naming*: "A boolean is `isFoo`, an enumeration a plain noun, and `state` is a
    smell", folding in the old "state names nothing public" text and the two-valued enum rule;
    the `…Pred` rule split into its own paragraph.
  * Changeset `20261107-is_booleans.md`, minor for safebyok and safebyok-react, each rename
    old -> new.
* **Decisions taken**:
  * `VaultLockControl`'s span carries `data-locked` (`"true"`/`"false"`) in place of
    `data-lock-state` (`"locked"`/`"unlocked"`). The alternative, keeping a word attribute
    computed from the boolean, keeps a two-valued enum alive in the DOM; the rule says boolean.
  * The dev box inspector and the test probes (React's `ShowsVault`, the demo's `VaultProbe`)
    still print `locked`/`unlocked`: that is display text, not a name. Each probe has a small
    `lockWordOf` helper in its test helpers, so the many assertions on the probe text stand.
  * Test helper `models-world.ts`: `setLocked(boolean)` replaces `setLockState(word)`, and
    `mw.worldWith(overrides)` makes a world with some members swapped and the lock still live
    (see Discoveries).
* **Deviations**:
  * Thread 7's changeset (`20261107-brands.md`) named `exposed`, `veiled` and `lockState`; I
    renamed them there, so the release notes don't introduce names this same release removes.
  * `notes/old_vocabulary.md`'s right-hand column (today's name) now reads `isLocked`.
* **Discoveries**:
  * Spreading a world (`{ ...mw.world, unsealStampedString }`) freezes the `isLocked` getter
    at the spread, so a later `setLocked` never reaches it; halpimonfire's "a lock() refuses
    'vault_locked'" failed that way. A function member survived a spread; a getter does not
    (STYLE.md *Crossings*). Hence `worldWith`.
  * No snapshot boolean mirrors a stored field: all derived. No stored shape changed.
* **Audit, left unrenamed** (no public `*State` name besides `LockState` in `packages/*/src`):
  * `Landing.landed`: the adapter SPI answer of the `doPut*` hooks, in the idb, postgres and
    convex adapters and Convex validators. A bare adjective; `isLanded` fits the rule, but it
    reaches every adapter, so it wants its own thread.
  * `ok` in `Outcome`/`Answer` (and graphql's vault resolvers): a result discriminant by
    convention, recommend keeping it.
  * `passkeysAvailable()` (safebyok-react export): a function, not a field; `arePasskeysAvailable`
    or `hasPasskeys` would fit the rule. Recommend leaving it or a separate rename.
  * `takesFocus` props, `Gripe.fromPasskey` (internal), `VaultHeld.stage 'present'` (an enum
    value): fine as they stand.
* **For the Coach**: the open questions above, as rows: `landed`, `ok`, `passkeysAvailable`.
  No casts, eslint-disables or `@ts-expect-error` added.
