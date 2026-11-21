# Thread gating_instance: a gating is an instance (2026-11-21)

Branch `20261121-gating_instance`, PR [#794](https://github.com/mrflip/safebyok/pull/794), stacked on #793 (plain_words). Design: `gating_instance-design.md` beside
this file, agreed with the Coach 2026-11-21. Proved: safebyok 1357 tests, safebyok-react 360, lint and typecheck of both
clean; `pnpm justify` green (safebyok-big 2946, safebyok 1357, safebyok-react 360, e2e 576, every other package green), after the catch-up onto #793's rework 1.

* **Built**:
  * `packages/safebyok/src/models/gating.ts` (288 lines): the base `Gating` and one subclass per form verb
    (`BirthGating`, `UnlockGating`, `ReplacePassphraseGating`, `AddPasskeyGating`, `RevokePasskeyGating`). The base
    has a protected constructor `(cleartexts, body)`. The body is a closure over the bank (or device) and its friend,
    held in a private field. The cleartexts are adopted as the cloak adopted them, it redacts as `'[gating]'`, and its
    getters hand out copies. `attempt()` runs the body and vacates in a `finally`. `tryAttempt()` is the `outcomeOf`
    wrap. `vacate()` zeroes the gating's own PRF bytes. The five bodies are today's functions, moved and made private.
  * `bank.ts`: makers `Bank.birthGating` (static), `unlockGating`, `replacePassphraseGating`, `addPasskeyGating`,
    `revokePasskeyGating`. Each plain verb is `await maker(c).attempt()`.
  * A new thrower `gatingSpent()` (kind `gating_concluded`, phrase `GatingSpent`) for a second attempt.
  * `cloak.ts` and its tests are gone. Their tests now live in `tests/models/gating.test.ts` as the gating's, beside
    new ones for `attempt`, `tryAttempt` and the single use. `CleartextChecks.cloakArgs` became `gatingArgs`, and
    `CloakCleartexts` became `GatingCleartexts`.
  * The entry points export the gating classes as **types only** (as big exports `Gating`). A subclass's constructor
    takes the friend that receives provings, so the published surface must not offer it (G9).
  * Giver: `GiverBank`'s five form verbs became five makers returning `Gating`. `FormMutationDefaults` carries
    `mutationFn: attemptGating` and `onSettled: vacateGating`, a plain function with no try/catch. Each hook returns
    `{ ...useMutation(opts), gating }`, and `forBank` also gives the five makers by name. `cleartextsOf` and
    `vacateCloak` are gone.
  * `safebyok/testing` gains `_cheat_gatingOf(cleartexts, body)`, a gating whose body is any function, for the fake
    giver world.
* **Decisions made**:
  * **The giver's maker is async**: `unlock.mutate(await unlock.gating({ … }))`. The giver holds no `Bank` until
    `device.ensureBank()` resolves, so a synchronous maker would need the started bank tracked in React state, with a
    null (or a throw) before it starts. The async maker calls `ensureBank()` as `mutationFn` did before. This is the
    PR's open question.
  * **Adoption runs before the field check.** The two answer fields are read and adopted first, then the
    "knows each field" check runs, so a refused construction (a stray field) still zeroes the host's PRF bytes. The
    cloak missed this; the old verbs' `finally` covered it, and `gating.test.ts` *zeroes the answer when the cleartexts
    fail their check* holds it. Undefined fields are dropped (es-toolkit `omitBy`), as the giver's `cleartextsOf` did.
  * **Every object a gating keeps is its own.** A non-answer object is copied too, so `vacate` never reaches a host's
    getter and cannot throw. A host's ArrayBuffer or non-Uint8 view is zeroed at adoption (best effort, as
    `vacateAnswerAt` did), and the body's check then refuses it.
  * **The bodies parse their checks directly.** `checkedCleartexts`'s catch could no longer fire: what a body gets is
    the gating's own plain data. The catch moved into adoption.
  * **The try twins are unchanged**, `outcomeOf(() => this.verb(c))`, not `maker(c).tryAttempt()`. A maker throws
    synchronously on a malformed object, and `maker(c).tryAttempt()` would let that escape as a throw.
  * **The plain verbs are `async`**, for the same reason: a synchronous throw from the maker becomes a rejection.
  * **`attempt` marks the gating spent before its body runs** (`#isSpent`). A second attempt refuses whether or not
    the first has ended. That is the single-use rule, not a crossing guard, and no test races the two.
  * **The base `Gating` has no generic.** `attempt()` resolves `Bank`. The cheat gating casts its body.
* **Deviations**:
  * `gating.test.ts` *keeps its outcome when reading the passkey answer to zero it throws* is **deleted**: a gating
    vacates only its own copies, so its subject is gone. Its successor is a construction case, *refuses a passkey
    answer whose PRF bytes' getter throws, carrying nothing of the throw*. Adoption reads that getter, and the cloak
    let the host's error escape there.
  * Beside the cloak row, notes/guarantees-drift.md amends three entries (cloak, form_verbs, bank_gatings). VOCABULARY
    keeps the *cloak* row's wording and adds "A gating cloaks the cleartexts it is made with.", so the *passphrase*
    and *cleartext* rows still read.
* **Guarantees** (guarantees-big.md G1, G2, G8, G9):
  * **G1**: the drift continues as the cloak's did. A passphrase stays in a private field until the gating is
    attempted or vacated.
  * **G2**: kept and tightened against the cloak. The host's bytes are zeroed at construction, refused or not, and the
    gating's copies at the attempt's end or at `vacate()`. An answer's getter mints an unzeroed copy (open matter).
  * **G8**: no refusal carries a cleartext. A throwing getter at adoption becomes `cleartextsThrew`, and
    `gatingSpent`'s phrase is constant.
  * **G9**: "only `Gating`, `Proving` and `Lease`" reads literally again. The friend lives only in a private closure,
    and the classes are type-only exports.
* **Discoveries**: the security.md subagent amended the cloak entry and left the giver_forms entry's "take a `Cloak`"
  as history.
* **For the Coach**: the async maker (above), and whether the gating's getters should go. Nothing in the core or the
  giver calls them, and each read of a passkey answer mints a copy that nothing zeroes.
* **Rebase**: the catch-up met #793's rework 1, which split `react-giver.test.tsx`'s two-behaviour tests into one per
  outcome, with `runThrough…` helpers. The resolution keeps that split and turns each helper from a cloak to a gating.
