# Thread 19: review_fixes (2026-11-24)

Branch `20261124-review_fixes`, PR [#885](https://github.com/mrflip/safebyok/pull/885), stacked on
[#884](https://github.com/mrflip/safebyok/pull/884). Proved: `pnpm justify` green, every package, none skipped:
safebyok 1860, safebyok-react-lean 327, safebyok-big 2950, root scripts 331, the rest unchanged (counts in the PR body).

Built by hand (no /sprint) from a handoff of two reviews' findings, A to H. Each is small and done plainly.

* **Built**:
  * **A** (`src/models/device.ts`, `#doSignin`): after a root-box get that found nothing and carried no world, the
    bank's get now returns only where it did not answer `gotlive`; a live bank falls through to the
    `bankRootsMissing` check, so the stage shows `'failed'` with that refusal instead of `'starting'` for good.
    Test: `device.signin` "shows the roots missing as failed where the bank is stored live with no main gate or root box".
  * **B** (`react-giver.tsx`, `listenToGate`): `onBadNews: noop`, as the world and the persist scaffold pass, with
    the same comment. Test: `record-hooks.test.tsx`, "useGate, mounted twice" (three reports before, one after).
  * **C**: the VaultMinder's `Stamp` type is `Dispatch`, its parameters `dispatch`; the comment that the wrapped
    vaultDB "stamps its notices" now says it gives each notice a read_tc.
  * **D**: `readTcNow` and `readAtOf` moved to `src/storage/agerank.ts` beside `tcchunkOf`; the classifier uses
    `BaseThing.sparseOf`. `safebyok/storage` exports both at its top level, and the postgres and idb-lean adapters
    and a react-lean test call `readTcNow()` rather than `Classifier.readTcNow()`. madge shows the
    `thing.ts > thing-classifier.ts` cycle gone.
  * **E**: `Throwers.refusalOfThrown` in the VaultMinder's `#tell` (twice), the device's `tellBadNews` and the world's
    `refusalSnapshotOf`.
  * **F**: the once verbs' section comment names where `getOnce` refuses; eleven test titles read "tells of of"
    (not one), all fixed; the giver's birth comment says the sign-in, not `hello`; the gate's `#tell` comment says a
    gate change heard by `receive` from another device is not among what a subscriber hears.
  * **G**: `endCause` and `hostedVault` moved to `shapes-bankish.ts` as `WorldChecks`; `worldOpts` and `vaultMinder`
    stay in the World's `Checks`, with the comment.
  * **H** (its own commit, 386973173; the security note is the next, 112c7abe4): the giver's gate verbs make their
    gating through `gateGatingOf(params, dnaCheck, gatingOf)`, which, where `demandBank()` refuses, first calls the
    core's new export `vacateHandedCleartexts(params, dnaCheck)` (`src/models/gating.ts`): `adoptedCleartextsOf`
    then `zeroAnswer` on the two answers, the steps a gating's constructor and `vacate()` take. Per-verb makers
    `unlockGatingOf`, `replacePassphraseGatingOf`, `addPasskeyGatingOf`, `revokePasskeyGatingOf` serve both the
    hook and the plain call, so the check and maker are paired once. Tests: react-giver.test.tsx "a form verb at the
    main gate, refused while the bank is starting" (four, hook and plain call each); gating.test.ts
    "vacateHandedCleartexts(params, dnaCheck)" (three).

* **Decisions made**:
  * A's test removes the main gate **and** the root box. With the gate alone gone, the root-box get already refuses
    (the classifier's own `bankRootsMissing`), and the bug's path is never reached.
  * D: `readTcNow` is what every adapter calls, so rather than re-export it from the classifier (a shim) it is
    exported from `safebyok/storage` directly, with `readAtOf` beside it.
  * H, approaches set aside: building a gating with a stand-in gate (a cast, and a gate the body would reach);
    using `device.birthGating(params).vacate()` (the birth's dna check does not know `nextPasskeyAnswer`); a
    `Gating` subclass made only to vacate (more machinery than a three-line function). `vacateHandedCleartexts`
    does not check its `dnaCheck` beyond calling it: only the giver calls it, with a `GatingChecks` member, and a
    bad one ends in `adoptedCleartextsOf`'s own catch, an `unexpected_error` that carries nothing of it.
  * H also covers `signed_out` (nobody signed in): `demandBank` refuses through `demandDevice`, and the same path vacates.

* **Deviations**:
  * H changes one refusal a host sees on misuse: a dna the verb's check refuses (not an object) at a stage with no
    bank now refuses `bad_record` rather than `absent_vault`, as a birth's already does.
  * The security note amends the 2026-11-20 (cloak) entry, whose 2026-11-23 amendment had recorded this case as
    "recorded, not fixed", rather than adding a new entry: the file's header says to amend an entry on the same
    mechanism. Dropping H means dropping 112c7abe4 with it.

* **Discoveries** (noticed, left):
  * The World's `Checks` comment "Defined here, not with the shapes: they name a model class" also covers
    `vaultMinder`, which names the VaultMinder, not a model class; it could move to `shapes-vault-minder.ts` beside
    `isVaultMinder`, as the vault TSQ's own check already sits in its shapes file.
  * madge reports some forty other import cycles in `packages/safebyok/src`, most through `shapes-gateish.ts`,
    `shapes-bankish.ts` and the models; many may be type-only.

* **For the Coach**:
  * H adds a core export, `vacateHandedCleartexts`, for the giver: confirm a core export is the right home, rather
    than giving the Gate makers a way to vacate without a gate.

## After the report: finding H is taken out

The Coach withdrew his go-ahead for H (the giver's gate form verbs vacating the host's cleartexts when they refuse for
want of a bank): "it sounds pretty intrusive... Reaching in to a caller's methods is usually a sin", and asked how a
host comes to show a form when the system is broken or unready. A host reaches that case only by rendering a gate form
at a stage with no bank; the kit's own form renders only when an unlock is wanted, which needs a bank. The verb refuses
before any mutation runs, so nothing of ours holds the cleartext. The commit and its `notes/security.md` amendment are
dropped from this branch; the earlier entry there, which records the case as not fixed, stands. The old tip is tagged
`20261124-review_fixes-with-cleartext-commit`. If the guarantee is wanted at every stage later, the plain way is for the
world to make the gate gatings, as it makes the birth's.
