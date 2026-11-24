# Thread 20: late_rulings (2026-11-24)

Branch `20261124-late_rulings`, PR [#886](https://github.com/mrflip/safebyok/pull/886), stacked on
[#885](https://github.com/mrflip/safebyok/pull/885). Proved: see the PR's **Tests:** line (`pnpm justify` in full).

Built by hand (no /sprint): two rulings of the Coach's (A, B), then two additions from his replies to a cold read (C, D).

* **Built**:
  * **A** (G2). `World.vacateUnlessAttemptable(handed)` (`src/models/world.ts`, *Guards*): does nothing where the world
    is enabled and its roots live; otherwise clears `handed` by `vacateHanded` (`src/models/gating.ts`, *Adopting and
    vacating*), which runs the gating's own `adoptedCleartextsOf` and `zeroAnswer` under a new dna check,
    `GatingChecks.anyGating`, reading every verb's fieldnames. It never throws. The giver's four gate verbs' makers
    (`unlockGatingOf`, `replacePassphraseGatingOf`, `addPasskeyGatingOf`, `revokePasskeyGatingOf`, shared by hook and plain
    call) call it on `deviceNow()?.world` (a new friend member: the provider's device, signed in or not), then the
    unchanged `demandBank().gate.…Gating(params)` line refuses as before. Doc blocks and `docs/threat-model.md` rule 3
    say what is handed is the package's to clear. Security note amended (`notes/security.md`, 2026-11-24 line).
  * **B**. `VaultTSQ.#hear` on `aged` to bare: an item with data is set `null` at the event's read time and invalidated
    (`cancelRefetch: false`); an item with no data is reset, as before. The chain table regenerated from `gen.py`'s
    changed principle 5 (16 rows' `wanted` changed, 61 unchanged); the minder_matrix thread file's principle 5 rewritten.
  * **C**. `World.#hear` realigns on an item event at any of the three roots where all three are live or the bank is
    not live, else nothing: the last root to land, whichever, brings `locked`; `device.vault` is made then.
  * **D**. The VaultMinder's four pass-through branches and `#isOwnBank` are gone; an answer to an ask of another bank
    has its records refused at `#receiveAtThing`'s existing `parseConsistent` (onBadNews, `bad_record`). `receive`'s
    parse plus `demandConsistent` became one `parseConsistent`.
* **Decisions made**:
  * **A takes the carrier alone, no verb.** A form's secret fields are verb-free (`FormSecretFieldnames`); a dna's
    differ only in which names each verb's check reads, so one check reading all four (`passphrase`, `passkeyAnswer`,
    `nextPassphrase`, `nextPasskeyAnswer`) clears any of them. It zeroes a superset (an unlock handed a
    `nextPasskeyAnswer` has it zeroed too), which "ours to clear" covers.
  * **A does not throw; the verb's own `demandBank` does** (named `vacateUnlessAttemptable`, not the Coach's
    `demandAttemptableOrVacate`). A throw from the world would carry the core's messages, not the giver's; and at
    `swept`, where `device.bank` is still set, today's hook runs the mutation and shows the endCause as its `error`: a
    throw before the mutation would change that to `error: null`. Not throwing keeps every refusal and every hook
    answer as it was. A malformed carrier is swallowed (adoption clears what it took before refusing), so a no-bank
    stage's own refusal is what the host sees, never `bad_record`.
  * **B's `dead`**: principle 3 ("it goes once a later life is live") decides it: the later life's soon is live, so
    no dead record. The test's reading (`cachePrecisOf`) shows `dead` only while the Thing is `here`.
  * **C reads the world, not the event**: "the bank is not live" is `! isLive(this.bank)`, so a gate or box arriving
    while the bank is a shell realigns to the same stage, telling no one.
* **Deviations**:
  * **B: an item with no data is still reset**, against "an item is never reset ... do nothing". Doing nothing broke a
    working case, `record-hooks.test.tsx` "unwatched: a list, then the late answer": the hook's first fetch is in flight
    when a list tells the box at a newer revision, sparse; reset cancels and refetches, and with nothing the late answer
    lands the older revision, stale, with no refetch. TanStack will not restart a fetch on a no-data entry by invalidate
    (`Query.fetch` cancels only where `state.data !== undefined`, query-core 5.107.1 `src/query.ts`). An entry with no
    data has no seed to return to, so the seed problem is gone either way. The wontfix row on a cancelled `getOnce` is
    kept, narrowed to an item with no data.
  * **B: the QueryClient duck check now asks for `getQueryData`** (and `Phrases.QueryClientExpected` names it), since
    the writer reads it.
  * **A: no provider mounted at all** means no world, so nothing is cleared there (the refusal is unchanged). Recorded
    in the security note as not fixed.
  * **D: the ask itself is not refused.** None of the four raw verbs has a validating line of its own (the wrapped
    vaultDB checks the ask, not knowing the minder's bank), and the brief forbade a new pass; the existing per-record
    check refuses what such an answer carries.
* **Discoveries**:
  * D's search: `world.makeThing` checks scope by `checkedConsistent(..., { kind: 'record_conflict' })` beside a parse:
    left, its kind is deliberate and tested. `VaultTSQ.listOnce` checks a scope it built from its own scope against its
    own scope (`listScope.parseConsistent({ ...this.#scope, labelpath }, this.#scope)`): tautological, left. `vault.ts`
    has one `parseConsistent`, fine. No other pass-through.
  * C: the old code left `device.vault` null exactly because the device makes its vault on a snapshot change.
* **For the Coach**: the open matters in the PR body.
