# Thread 3b: gating_passkey (2026-11-01)

Branch `20261101-gating_passkey`, PR #PRNUM, stacked on
[#430](https://github.com/mrflip/safebyok/pull/430). Justify: green; core 4841 passed, 37
skipped; every package green; no size budget moved.

* **Built**
  * **The passkey path** (`src/models/gating.ts`). `gating.attemptPasskey(passkeyAnswer)` and
    `tryAttemptPasskey` are an `attempt({ passkeyAnswer })`, typed by a `this:` parameter onto
    `Gating<PasskeyGatingKind>`. `PasskeyGatingKind` (`models-shapes.ts`) is computed from
    `ProvedByForGatingkind`, so today it is `'unlock_vault'` alone. Called on any other kind
    through a cast, it refuses 'bad_option' (`RefusalFuncs.passkeyProvesNot`, phrase
    `PasskeyProvesNot`). It attempts nothing, leaves the gating open and spends the answer.
    Thread 8's passphrase-only `del_vault` gets this for free once its `provedBy` is `['passphrase']`.
  * **The passkey header.** `gate.passkeyHeader` (`gate.ts`) is the passkey wayin's
    `PasskeyWayinHeader`, frozen, or null when there is none. `gating.passkeyHeader` copies the
    vault's at launch, and is null for a vault with no passkey or for `build_vault` (no vault).
    The host's `askPasskey` reads `credential_id` and `prf_salt_b64` from it. Thread 7a's snapshot
    can reuse `gate.passkeyHeader` as "header present or not". `#unlockByGating` now fetches the
    full record before launching (a vault held sparse has no gate to read).
  * **G2 in the models.** `spendAnswerAfter(handed, work)` (`proving.ts`) runs `work` and spends
    the answer unless `work` refused as `MSX.isCorrectable` says (a kind in `correctableKindVals`).
    The local `isCorrectable` moved out of gating.ts into models-shapes.ts. Every export that
    takes cleartexts runs through it: `Proving.makeProvingPair`/`attempt`,
    `PasskeyProving.make`/`ofWayin`, `Gate.build`/`withPasskeyAdded`, `gating.attempt`/
    `attemptPasskey`, `vault.ensureUnlocked`/`replacePassphrase`/`addPasskey`/`revokePasskey`,
    `listing.build`, `bank.ensureVault`. The `try*` forms are `outcomeOf` over the plain verb.
    A call that joins an unlock in flight spends its answer at once (`vault.#joinUnlocking`):
    the answer is never tried, so another call's correctable refusal does not leave it unspent.
  * **Zeroing by tag.** `spendPrfBytes` tests `isBytes` (exported from `checks/validator.ts`,
    though not from the package), not `instanceof`. Tested with a real other-realm `Uint8Array`
    from `node:vm`'s `runInNewContext('new Uint8Array(32).fill(7)')`, whose `instanceof
    Uint8Array` the test asserts false. It is tested through `makeProvingPair` (which succeeds:
    WebCrypto takes the foreign view), through `PasskeyProving.make` refusing a short salt, and
    through `gating.attemptPasskey` refused for good.
  * **notes/guarantees.md G2** names the models' rule, `spendAnswerAfter`, `isCorrectable`,
    `#joinUnlocking`, `attemptPasskey` and `isBytes`, and adds the models' tests to *Checked by*.
* **Decisions taken**
  * **The header is captured at launch, not read live.** A live getter on a gating whose vault
    was later held sparse would throw from a host's render. A gating lives for one dialog, and
    the passkey can't change under it without a gate change, which would refuse the attempt
    anyway. Set aside: a getter reading `vault.gate.passkeyHeader` live.
  * **A wrong-kind attemptPasskey does not settle the gating.** It refuses before anything runs,
    as a misuse ('bad_option'), and the dialog can still take a passphrase. Set aside: settling
    it as refused, which would close a dialog over a host bug the user can't correct.
  * **'bad_option' for the wrong kind** is the nearest existing refusal kind. 3c owns the list.
  * **Four tests changed meaning**, from "spent either way" to "unspent on a correctable refusal":
    a weak passphrase at build, `wrong_passkey` at `gating.attempt` and at `ensureUnlocked`, and
    a wrong passphrase at `addPasskey`. Each now also shows the same answer succeeding when
    handed in again.
* **Deviations**
  * **I touched thread 4a's files**, `bank.ts` (`ensureVault`) and `vault-listing.ts` (`build`),
    to wrap each in `spendAnswerAfter`. Each is a two-line change, needed because build_vault's
    `weak_passphrase` passed through there and spent the answer. Expect a small conflict with 4a.
* **Discoveries**
  * The old core (`src/proving.ts`, etc.) has no `instanceof Uint8Array` left. The gap was only
    in the models.
  * Don't `await` anything between two `ensureUnlocked` calls meant to race. `passkeyOf` uses
    real WebCrypto and yields, so the first unlock can finish before the second is made.
* **For the Coach**
  * **No `attemptPassphrase`.** It would be the twin of `attemptPasskey`, but it wasn't asked
    for; `attempt({ passphrase })` does the job.
  * **`gating.toJSON()` still shows kind and scope alone**, not the header. 7a may want it there.
