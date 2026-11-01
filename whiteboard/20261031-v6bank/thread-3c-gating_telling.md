# Thread 3c: gating_telling (2026-11-01)

Branch `20261101-gating_telling`, PR [#433](https://github.com/mrflip/safebyok/pull/433), stacked on
[#431](https://github.com/mrflip/safebyok/pull/431). Justify: green; core 4851 passed, 37
skipped; every package green; no size budget moved.

* **Built**
  * **The models' refusal-kind list** (`src/models/models-shapes.ts`, section *Refusal kinds*).
    `modelsRefusalKindVals` and `ModelsRefusalKind`: every kind the gatings and vault verbs
    throw, grouped (misuse, correctable, a gating ended, vault and boxes, storage's word, bad
    news). It declares the kinds later threads throw: `vault_behind`, `vault_gone`,
    `vault_remade`, `damaged_wayin`, `identity_revoked`. The doc block says the list grows.
    `correctableKindVals` is checked against it. Thread 11 exports it from `safebyok/v06`.
  * **The list is enforced** (`src/helpers/refusal-funcs.ts`). Every factory makes its refusal
    through a private `listedRefusal(kind: ModelsRefusalKind, ...)`, so a factory of a kind off
    the list does not compile. `tests/helpers/refusal-funcs.test.ts` checks it at run time too.
  * **`declined`**, a new condition in `errors.ts` (`refusalKindVals`, `RefusalFamilyForKind`,
    the README's Conditions table, `errors.test.ts`). `gatingDeclined` refuses it: on
    `decline()`, and when the host's dialog resolves with the gating still open. It replaces
    the 'vault_locked' that made a cancelled dialog read as a locked vault.
  * **A passkey for a vault with none** refuses 'absent_wayin' (`noPasskeyWayin`, in
    `PasskeyProving.ofWayin`). It was 'wrong_passkey'. Not correctable, so it settles the
    gating and spends the answer.
  * **A passkey changed since launch** (`Gating.#judgedAgainstLaunch`, `gating.ts`). When an
    attempt is refused 'wrong_passkey' and the vault's in-memory passkey header no longer
    matches the one the gating launched with (by `credential_id` and `prf_salt_b64`), the
    outcome becomes 'gate_moved' (`passkeyMovedSinceLaunch`). It settles the gating and spends
    the answer. If the passkey was revoked with none put in its place, the attempt already
    refuses 'absent_wayin'.
  * **The first gate lost to another device**: `RefusalFuncs.gateMadeElsewhere` refuses
    'gate_made_elsewhere', with its own sentence (`Phrases.GateMadeElsewhere`): "set on
    another device ... Enter the passphrase chosen there". **Nothing calls it yet**; see *For
    the Coach*.
  * **Docs**: VOCABULARY's **cleartext** and **gating** rows describe the models. guarantees.md
    G2 names the two new spends; G8 says the models' decline is a refusal of its own, not a
    relabel, and that `requestCleartext`'s throw is replaced at `tryHearRequestCleartext`.
    The doc blocks of `Gating.launch`, `attempt`, `decline`, `ensureUnlocked` and
    `PasskeyProving.ofWayin` are updated to match.
* **Decisions taken**
  * **The throw of `requestCleartext` stays 'unexpected_error'**, not 'declined'. The
    documented way to cancel is to resolve the dialog or call `decline()`. A throw is a host bug,
    and its error may quote the passphrase, so it is replaced (G8).
  * **A wrong-kind `attemptPasskey` keeps 'bad_option'** and leaves the gating open. It is a
    host bug that `this: Gating<PasskeyGatingKind>` already types away; a kind of its own would
    only name a cast.
  * **The 'gate_moved' check is judged after the run, against the in-memory gate.** Set aside:
    a check before the run (the in-memory gate may not have been refreshed yet, and the run is
    where a fresh gate is met). Also set aside: checking in `attemptPasskey` alone
    (`attempt({ passkeyAnswer })` would bypass it).
  * **Reused kinds, coined one.** 'absent_wayin', 'gate_moved' and 'gate_made_elsewhere'
    existed already. 'declined' is the only new kind.
  * **The list leaves out** the kinds the models do not throw: `crypto_failed`,
    `passkey_unavailable`, `attempt_in_flight`, `vault_mismatch`, `newer_format`.
* **Deviations**
  * `#judgedAgainstLaunch` replaces one refusal with another, which the plan's rule 2 bans
    outside the host-call functions. It is a judgment from the gating's own state (the header
    it launched with), not a relabel of a foreign throw, and keeps no cause. It is flagged as
    an open question.
  * VOCABULARY now describes the models, while the exported core still uses the old gatingkinds
    (`initialize_gate`, ...). The old core goes away in this sprint. The term **landed** gives way
    to **settles**; the kind `gating_landed` keeps its name.
  * The changeset is minor: the exported `refusalKindVals` gains 'declined'. Nothing exported
    throws it yet.
* **Discoveries**
  * A gating's run does not refetch a full vault, so a passkey changed elsewhere is seen only
    after something refreshes the vault (the test fetches it). Thread 3d or later may want the
    unlock gating's run to refresh first.
  * The main index already exports an old-core `correctableKindVals`. Thread 11's v06 export
    will need to pick between the two names.
* **For the Coach**
  * **Wire `gateMadeElsewhere`**: `VaultListing.ensure` (thread 4a, #432, out of my scope)
    resolves the other device's vault, locked, when its put loses. The old core refuses
    'gate_made_elsewhere' there (bank.test.ts:1030). Recommended: throw
    `RefusalFuncs.gateMadeElsewhere()` where `vault.vault_tok !== draft.vault_tok`, in 4a's
    rework or by whoever files after 4a.
  * **Is 'gate_moved' by judgment acceptable?** Recommended yes. The alternative is to leave
    a stale-header 'wrong_passkey' correctable, which keeps the dialog asking for a passkey
    the vault no longer has.
