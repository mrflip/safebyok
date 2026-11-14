# Thread 7: brands (2026-11-07)

Branch `20261107-brands`, PR #594, top of the line main -> #592 -> #594. Justify: green after the second rework;
safebyok 2513, react 258, graphql 235 (+3 skipped), e2e 298 (+4 skipped), the rest unchanged.

* **Built**:
  * `brand(obj, Brand, val = true)` and `brandOf(val, Brand)` in `helpers/consts.ts`, exported from
    `safebyok` and `safebyok/storage`. `brand` attaches a hidden, fixed, non-enumerable key, and `brandOf`
    is safe on any value. `brandGuarded` is now brand plus freeze. Every guard reads through `brandOf`
    (`isVaultDB`, `isDeviceDB`, `isGuarded`, `isWhisperedBag`), and `answersTrueTo` is gone.
  * `IsGuarded = Symbol.for('@safebyok/guarded')` and `NOVEL = Symbol.for('@safebyok/novel')`.
  * `IsVaultError = Symbol.for('@safebyok/vaulterror')`, worn through a class getter on VaultError.
    `isVaultError` reads it, so a second copy's VaultError is recognised; one rebuilt from JSON is not.
  * `gate.ts` uses `hasModelkind(val, 'wayin')`. `Proving` gains a `modelkind` getter and joins
    `ModelkindClasses`, and `proving.ts` checks `val === NOVEL || hasModelkind(val, 'proving')`.
    Nothing in `src/` uses `instanceof` for a brand any more.
  * The front door exports `ENCRYPTED`, `LOCKED`, `VEILED` and `isWhisperedBag`.
  * `box.isVeiled`, beside `isShowing`, is true from `veil()` until `unveil()`, `expose()` or `unexpose()`,
    whatever the lock. It mirrors `#isVeiled`, as the snapshot's `veiled` does.
  * Rework (the Coach's rulings, 2026-11-07): `box.exposure`, a live getter answering `'unexposed' |
    'locked' | 'veiled' | 'showing'` in the order `box.whisper` picks its bag, typed by `BoxExposure` and
    listed in `boxExposureVals` (`shapes-enums.ts`, both on the front door). `isShowing` reads it.
    `unexpose()` clears the veil; `veil()` still refuses nothing on an unexposed box, `unveil()` still does.
    React's `useBoxExposure(box)` follows it (`'unexposed'` for no box); `useBoxIsVeiled` is gone and
    `useBoxIsShowing` stays. The dev box inspector shows the state in place of the `brandOf` read.
  * Docs (the Whispered and bag doc blocks, `box.whisper`'s, the README, STYLE.md's brand rule, the
    changeset) now tell a host never to read the mark or compare `box.whisper` with a bag, and to ask
    `box.exposure`, `isShowing`, `isVeiled`, `isWhisperedBag` or the snapshots.
  * Tests: the core's state table checks `exposure` in every cell; `isVeiled` gains unexpose and
    unexposed-veil cases; `proof.test.ts`'s mini host and `readme-recipes.test.ts` read `exposure`;
    React's `whyHidden` map is gone.
  * React's `NoBoxBag` is replaced by the core's `ENCRYPTED`.
  * graphql's `vaultResolvers` checks `brandOf(candidate, IsVaultDB) === true`, not `instanceof VaultDB`.
  * `no-useless-escape` is `'off'` in `packages/safebyok/eslint.config.mjs` and in every config cut from
    it (the root, `safebyok-{convex,fastkey,graphql,indexeddb,postgres,react}`, `demos/safebyok-demo-react`,
    `e2e`), but not in the `-old` packages. The two disables on `Patterns.b64url` and `Patterns.user_id` are gone.
  * STYLE.md gains a brand rule, and its Validation line now says a class is told by `hasModelkind`.
    guarantees.md says the IsGuarded brand is a tripwire, not a lock. security.md (by a sonnet
    subagent) has a new entry at the top of *Of Interest*, and amendments in place to the 2026-11-06
    IsGuarded entry and the 2026-10-19 isVaultError entry.
  * Second rework (the Coach's rulings, 2026-11-07), a commit each: `whisperState` became `box.exposure`
    (`BoxExposure`, `boxExposureVals`, `useBoxExposure`), which also clears STYLE.md's "`state` names nothing
    public"; `exposure`'s and `BoxExposure`'s doc blocks say `'locked'` is not the vault's lock; a box adopting
    a tombstone, swept or vacated drops its veil with its whisper (`#dropExposed`, below), with tests for each;
    the core README keeps the script and the plain React form and points to safebyok-react's README, which now
    has *Building a form safely* (the raw `BoxFields` field moved there) and *React version*;
    `notes/expose_improves_security.md` gains *When a field lets go*, citing react.dev; the changeset follows.
* **Decisions taken**:
  * Dropping the veil goes through a private `#dropExposed()` (clears `#exposed` and `#isVeiled`, no settle),
    which `unexpose()`, `adopt` (on a tombstone), `sweepContents` and `vacateContents` all call, each
    unconditionally. Calling `this.unexpose()` itself, as the ruling said, was tried and set aside: its
    `settle()` inside `#disable` runs before `listing.unlist(this)`, so the box listing's subscribers were
    told once with the vacated box still listed; `proof.test.ts`'s vault delete caught the extra paint.
    `#disable` and `receive` settle once afterwards anyway. `sweepContents` was the same body as
    `vacateContents`, so it got the same change.
  * The react README's footnote adds a sentence linking `notes/expose_improves_security.md`; the raw-field
    paragraph lost "unbinds" and "binds" (the Coach wants no jargon). The recipe test's raw-field `describe`
    now names safebyok-react's README.
  * `brand` and `brandOf` are not Checkers-validated. `validator.ts` imports `refusals/errors.ts`, which
    now imports `consts.ts`, so Checkers would make a cycle. A primitive passed to `brand` gets the
    platform's TypeError from `defineProperty`.
  * The Whispered bags stay own and enumerable literals, not `brand()`. A `//` comment says why: a spread
    copy carries the mark to the put that refuses it. The orchestrator is raising this with the Coach.
  * `exposure` and `box.whisper` keep two parallel four-line chains rather than one derived from the
    other: deriving `whisper` would need a non-null assertion or a dead `?? ENCRYPTED`. The state table
    test pins them together.
  * VeilPage in React's hooks test reads the veil from `useBoxSnapshot(box)?.veiled`, as a host now would.
  * `no-useless-escape` is also off in `demos/` and `e2e/`, which are cut from the same config as well.
* **Deviations**: beyond the plan, I added the front-door bag exports, the graphql `instanceof` fix, and
  `useBoxIsShowing`. There are no eslint-disables or ts-expect-errors. The casts are
  `(err as VaultError)` in `isVaultError` and `(val as Partial<Record<symbol, unknown>>)` in `brandOf`,
  plus a few in tests (`as object`, `as unknown`, `as Record<symbol, unknown>`).
* **Discoveries**:
  * `veil()` on an unexposed box sets `isVeiled` true while `exposure` is `'unexposed'`, until
    `expose()` clears it. Hosts told to use `exposure` never see it; it is an open matter.
  * #593 renames the VaultDB family. Expect mechanical conflicts in `consts.ts` (`isVaultDB`/`IsVaultDB`)
    and on the graphql `custom<DB.VaultDB>` line.
  * React's tests run against safebyok's build, not its source. After a core change, rebuild
    (`pnpm --filter safebyok build`) before running React's tests alone.
  * `Whispered`, `WhisperedBag`, `ENCRYPTED`, `LOCKED` and `VEILED` are still exported, though hosts are now
    told not to use them; whether to keep them is an open matter (recommend: un-export `Whispered` and
    `WhisperedBag`, keep the bags for `useWhisper`'s no-box answer and the put-refusal tests, after the
    Coach settles Open items 1).
  * `gate.ts`'s wayin check could now move to the shapes, since it no longer names the class.
* **For the Coach**: see the PR's open questions. The rework follows the rulings of 2026-11-07; the bags
  stay enumerable literals, as Open items 1 is still the Coach's.
