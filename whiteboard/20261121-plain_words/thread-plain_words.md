# Thread: plain_words (2026-11-21)

Branch `20261121-plain_words`, stacked on #767 (the top of the vault_snapper line), cut at `fa4709048`.
Proved: safebyok lint, typecheck, 1352 tests; safebyok-react lint, typecheck, 360 tests (safebyok-big and safebyok built
first); `pnpm justify` at the tip before the rework, which touched test files only.

Language fixes to the new core (`packages/safebyok/src`, `tests`) and the React giver (`packages/safebyok-react/src/giver`,
`tests/giver`, the giver's test helpers), from the read-only hunt's report (`goop/report.md` in the sprint's scratchpad),
under the Coach's rulings of 2026-11-21.

* **Built**:
  * `core:` the form verbs' fields are `passphraseCleartext`, `passkeyCleartext`, `nextPassphraseCleartext` and
    `nextPasskeyCleartext`, in the new core's checks, the cloak, the gatings, the giver and their tests.
    `shapes-gateish.ts` ports big's `bankBuildCleartexts`, `bankUnlockCleartexts`, `oneProofOf` and `ProvedCleartexts`
    back in with the new keys, built from big's `GX.passphraseCleartext`, `GX.passkeyAnswer` and `GX.freshPasskeyAnswer`
    (the same code as before 98526ce17, renamed). Big keeps its own fields.
  * `docs:` one commit per family: hold and keep; hears, heard of and tells of; entry; "What" openers; "as" trailers;
    take; signature and backdoor; grammar. `tests:` titles' "as" trailers and setup-and-outcome titles.
  * An empty changeset, `.changeset/20261121-plain_words.md`, saying what a caller now passes.
* **Decisions made**:
  * A line with faults of two families is fixed whole in the first family's commit (hold/keep came first), so a few
    "hears" and "as it came" fixes ride in the hold commit.
  * **entry** became **item** for the host's React Query cache entry of a box, and **items and lists** for a minder's
    TanStack entries: the words the soon_item thread brings. A package's "entry point" keeps its name.
  * **keep** was fixed where it meant has, contains, caches, retains, carries over or leaves unchanged (VOCABULARY's
    senses). keep in the sense of maintain stays: keeps current, keeps open, keeps apart, keeps showing, keeps waiting,
    keeps out, keeps shut.
  * **take** was fixed where it meant gets, adopts, treats, reads or accepts in a test title; "the record `Bank.make`
    takes" (a function taking an argument) stays.
  * **hear/tell** stays wherever a listener, a subscriber, a watch or `onBadNews` really hears or is told. A deriver,
    a checker, a lease, a form verb, the minder fed by its sources, and a handler being called are fixed.
  * **Two unrelated behaviours** in one title were listed, then split in the rework (below).
  * Logical "hold" (a precondition holds) stays.
  * `CloakCleartexts` drops `PasskeyRevokeCleartexts` from its intersection: with the port, it is the same type as
    `UnlockCleartexts`, and lint's `no-duplicate-type-constituents` refuses the duplicate. The type is unchanged.
* **Left alone, by ruling**: the invariants sections (the ThingMinder's, the gatings' `//` block), `sealBox`'s and
  `Lease.seal`'s doc blocks, the `retry: false` comment, and every identifier but the four fields (`cheatHoldBank`,
  `pickle`, the test helpers' `hold()` and `HeldDeriver`, `LifepathNotKept`, `demandBornAtKept`, `trackedEntryOf`,
  the `heard` variables).
* **Discoveries**:
  * proving.ts still passes big's `passphraseClear`/`passkeyClear` keys to big's argument checkers (`strengthArgs`,
    `passphraseNovelArgs`, `passphraseStoredArgs`, `passkeyNovelArgs`, `passkeyStoredArgs`). These are internal
    argument bundles, not form verb fields, so they stay; porting them is a follow-up if the Coach wants no `…Clear` at all.
  * Big's `oneProofOf` export now has no user outside big; big's own `bankUnlockCleartexts` still uses it. Left in place.
  * VOCABULARY's `clear` row names `passphraseClear` as the deprecated form: still true (big), left.
* **For the Coach** (skipped entries, path:line at the thread's tip):
  * Rework (Coach, 2026-11-21): the two-behaviour tests are split, one per outcome, with a module-level helper where the
    two share a long setup. Two titles named one outcome and could not split: thing-minder-invalidate.test.ts "tells of
    the listing of a Thing with none under it, and of no listing above it" (one act, one assertion) and
    thing-minder-reads.test.ts "caches a main gate the ask tracks stale only once its own notice arrives, never from
    the get of the bank" (the assertion that it is absent, then present, is one before-and-after). Both are retitled.
    "keeps … shut" became "will not unseal" or "will not unwrap" (ctx-bytes.test.ts, proving.test.ts).
  * gating.test.ts:218, "keeps its outcome when reading the passkey answer to zero it throws": the body asserts an
    `unexpected_error` that quotes no passphrase; the title's meaning is unclear, so it was left.
  * `cheatHoldBank`: left; "it will be removed" (the Coach, 2026-11-21).
  * Out of the ruled families, left for a later pass: "front door", key alone, "state", "Internal.", machinery and
    refusal catalogs in doc blocks, "lands", "goes back", "bump", "reach-in"/"hand-in" (gating.ts), "in the new core"
    (minder-bank.ts:1), `#openSealed`.
