# Thread 7: gating_attempt (2026-11-23)

Branch `20261123-gating_attempt`, PR [#865](https://github.com/mrflip/safebyok/pull/865), stacked on [#864](https://github.com/mrflip/safebyok/pull/864) (`20261123-dojo_scenarios`), filed against `main`.
Proved: rework, `pnpm justify` green at the tip, 7697 tests in 16 suites (`safebyok` 1482, `safebyok-react-lean` 322, the dojo 111), lint, typecheck and build of every package. Build: green after the catch-up onto `ca81152c3`, 7694 tests.

* **Built**:
  * **Core** (`packages/safebyok`): `device.gatingBirthAttempt(params)`, `gate.gatingUnlockAttempt`,
    `gatingReplacePassphraseAttempt`, `gatingAddPasskeyAttempt` (dna only), `gatingRevokePasskeyAttempt`; each is the maker
    then `attempt()`. Every maker (`device.birthGating`, `Bank.birthGating`, `Gate.birthGating`, `gate.unlockGating` and
    siblings) takes `FormData | <Verb>Dna | <Verb>Cleartexts`. `GatingChecks` (shapes-gateish.ts), one per verb named for
    its gating, renames a dna's form fieldnames into the body's `…Cleartext` names, judging nothing, loose (unknown
    fields ignored). A `FormData` loses `passphrase`, `nextPassphrase` and `confirmation` (`FormSecretFieldnames`) in the
    gating's constructor (`takeSecretFields`, gating.ts), whatever the verb and even when it then refuses. Tests:
    `tests/models/gating-attempt.test.ts`.
  * **React** (`packages/safebyok-react-lean`): each form hook's result gains `attempt(params)` (sync maker, then
    `mutateAsync(gating)`; resolves on settle, never rejects), `wasRefused()` (a ref, read as it settles) and
    `keepTextIfRefused(event, onEmptied?)` (cancels the first reset after a refused attempt). Knock gains the five plain
    calls `gating<Verb>Attempt`, resolving nothing. `FormMutationResult<ParamsT>`. The kit's forms
    use `attempt`; `formActionOf` is deleted; `UnlockForm` posts; `UsernameField` renders null without a username;
    `useNewPassphrase.forget(event?)` keeps the verdicts on a cancelled reset.
  * **Dojo**: `LoginTab.tsx` on `birth.attempt` and `keepTextIfRefused`; its tests and dojo-findings (Login rows, items
    5-7, new items 28-31) say what is true now.
* **Rework, the Coach's rulings of 2026-11-23** (commits after `efa89173d`):
  * **`keepTextIfRefused(event, onEmptied?)`**: `onEmptied(event)` is called whenever the form is let empty, never when
    its text is kept. Three lines in the hook, one `Checks` line. Login hands it `newPassphrase.forget`.
  * **Removed, with tests, exports and doc mentions**: the core's `gate.tryUnlock`, `tryReplacePassphrase`,
    `tryAddPasskey`, `tryRevokePasskey`, `Bank.tryBirth`; the giver's `<verb>Gating`, `<verb>MutationOptions`,
    `FormMutationOptions`, each hook's `gating`. `rg` found no caller in `src/`, demos or e2e (the dojo's
    `make-fixture.ts` calls the core makers, which stay). Tests that handed a hook's gating to `mutate` call `attempt`;
    the vacate test counts by the gating read back from the mutation cache's `variables`. Deleted as pinning only the
    removed wrappers: the try-forms block in gate-forms.test.ts, the `unlockMutationOptions` @example, "keys the
    standalone options under no user", and one stage refusal already covered by "resolves refused where the gating cannot
    be made". Not touched (ruled out of scope): `gate.unlock({…})` and siblings, `popField`, `isInCleartextNames`.
  * **STYLE.md *Naming***: `wasFoo`/`hasFoo` acceptable where more natural, beside the `isFoo` rule.
  * **`CreateVaultForm` and `ReplacePassphraseForm`** take `onReset={(event) => { x.keepTextIfRefused(event,
    newPassphrase.forget) }}`: refused keeps every field (and the verdict), stored empties. Tests in tests/kit.
  * **Before hydration** (probed with `renderToString` and a replay in jsdom): an Action form gets `action="javascript:
    throw…"` and React's inline script, which cancels the submit and queues the `FormData` on `document.$$reactFormReplay`;
    React replays it into the action once hydrated (observed: a queued revoke ran after hydration). `UnlockForm`
    (`onSubmit`, `method="post"`) posted its passphrase to the page's URL. Built first on `SubmitButton`, then narrowed after review to `UnlockForm` alone (`useIsHydrated` in the kit; `SubmitButton` keeps its old promise). As first built: `SubmitButton` disabled until hydrated,
    `useSyncExternalStore(subscribeToNothing, () => true on the client, () => false on the server)`, about four code
    lines; `subscribeToNothing` is now exported from react-giver.tsx for it. Covers every kit form. Set aside: per-form
    flags (the button is the one place every form shares), a `useHydrated` dependency (one hook call).
  * **notes/security.md**: one new entry (pre-hydration) and two amendments to the 2026-11-20 cloak entry (fewer
    cleartext entrypoints; refused text kept), by a sonnet subagent.
* **Decisions made**:
  * **One maker takes both namings.** The held test sweep needs the makers to keep `{ passphraseCleartext }`; a bag
    naming any field `…Cleartext` is read as given (strict, as before), any other bag through `GatingChecks` (loose).
    One small predicate, `isInCleartextNames`; set aside: separate humane makers (a fourth way), an alias checker
    accepting both names in one bag (an options engine), and humane-only makers (would break ~25 test lines and
    Knock's held `fooGating`).
  * **The rename happens inside the gating's adoption try**, so a host getter's throw is replaced by `cleartextsThrew`
    and passkey answers are adopted (and the host's PRF bytes zeroed) as before.
  * **Fieldnames**: `passphrase`, `nextPassphrase`, `confirmation` (the kit's and `useNewPassphrase`'s input names),
    `passkeyAnswer`, `nextPasskeyAnswer` (VOCABULARY's "passkey answer").
  * **`wasRefused()`** besides the asked-for `keepTextIfRefused`: the kit's forms hand focus back on a refusal, and a
    form action must resolve `void`, so `attempt` cannot resolve a boolean (tsc refuses `Promise<boolean>` there).
  * **`keepTextIfRefused` keeps only the first reset after a refusal**, so Login's Dismiss (a `form.reset()`) still
    empties a refused form.
  * **Login's mismatch check** became `disabled={! newPassphrase.isReady}` on its submitting buttons, as the kit does.
  * **Wrong stage** (coordinator's directive): `attempt` makes the gating inside its try, so a maker's refusal resolves
    refused, never unhandled; the mutation never runs, so `error` stays null and the alert shows nothing.
* **Deviations**:
  * `gatingAddPasskeyAttempt` and `useAddPasskey().attempt` take a dna only: a `FormData` cannot carry the answer.
  * The kit's `AddPasskeyForm` still uses `popField` for its passphrase (the ceremony is awaited between).
  * The passkey unlock form keeps no `method` (coordinator: it has no field).
* **Discoveries**:
  * The giver's `demandBank()` refuses before the core's maker, so a `FormData` attempted at the wrong stage keeps its
    secret fields (findings item 28; reported, not fixed).
  * A dna's bad field is refused under the body's name (`passphraseCleartext: Invalid input…`), never its text.
  * React's post-action reset fires after `attempt` resolves, so a ref set at settle is current; no `startTransition`.
* **For the Coach**: whether the core should check `confirmation` against the passphrase (still open). A host's own
  `form.requestSubmit()` or own button before hydration is not covered by `SubmitButton`. An Action form submitted
  by such means is replayed into its verb once hydrated; whether the bank is up by then is timing (in the probe it was).
