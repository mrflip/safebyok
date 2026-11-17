# Thread 1: outcome_default (2026-10-27)

Branch `20261027-outcome_default`, PR [#297](https://github.com/mrflip/safebyok/pull/297), cut from `origin/main` (`802c91f9`). Justify: green;
core 3390 passed, 37 skipped; every other package green.

* **Built**: `fixup-preplan.md` items 1 to 3.
  - Item 1: `outcomeOf`'s `otherwise` now defaults to `Refusals.unexpectedError`.
    - `answering` is gone from `vault-db.ts`.
    - The sixteen `, unexpectedError` arguments are dropped.
    - The doc block's examples pass `Refusals.storageUnavailable` for a call out to storage.
    - The core README's refusals section says so.
    - Built from the orchestrator's `step1.patch`, which I checked against STYLE.md and kept
      as it was.
  - Item 2: `adapterAnswer` is the try/catch alone. The Outcome-shape check and its `bad_option`
    are gone, as is `hookname` (nine calls, not the preplan's eleven).
    - VAULTDB.md now says what a wrapped answer meets.
  - Item 3: `unexpectedError` lives in `refusals.ts`, after `storageUnavailable`.
    - `index.ts` re-exports it from there.
    - `bank.ts` and `vault.ts` import it from there.
    - Its tests moved to `tests/refusals.test.ts`.
  - notes/security.md: a `sonnet` subagent amended two passages in place: `outcomeOf`'s default,
    and the old `bad_option` check.
  - One changeset, `.changeset/20261027-outcome_default.md`, `minor`.
* **Decisions taken**:
  - The two `vault.ts` lines thread 2 rewrites (`#readBox`'s and `#storedBase`'s `outcomeOf`)
    lose the argument and nothing more.
  - `isOutcomeShaped` stays in `outcome.ts` for thread 3 to delete, as the handoff says.
  - The refusals module's doc block gains one sentence: `unexpectedError` is the one maker an
    adapter never throws.
* **Discoveries**:
  - **Proof for item 2.** Before removing the check, I ran a throwaway probe: an adapter whose
    every hook resolves `good(...)` of its answer, and one whose every hook resolves
    `bad(...)`. Without the check:
    - `getVault`, `getVaultRecords`, `ensureVault`, `getCapacity` and `delDamagedVault` refuse
      `corrupt_record`. `ReadAnswer` needs a `vault` key, which a wrapped answer lacks.
    - `getBox` refuses `damaged_box`.
    - `putVaultRecord`, `putBox`, `delBox` and `delVault` refuse `corrupt_record`, each with its
      "landed, but ... whether it did is not known" message.
    - So no verb takes a wrapped answer, good or bad, as a landed write or as "no vault". The
      check was vacuous for safety: it only gave a better message.
  - The rewritten tests in `tests/vault-db.test.ts` pin this. `ForgetfulVaultDB` now also
    forgets on `doPutBox` and `doDelBox`, so all four write verbs are covered.
  - `Refusals.unexpectedError` is a new member of the exported `Refusals` namespace.
    `tests/index.test.ts` lists it, and the changeset says so.
* **For the Coach**:
  - The `damaged_box` from `getBox` for a wrapped answer tells the user to remove the box. The
    preplan accepted this. Only an adapter that never ran `describeVaultDB` shows it.
  - **Open question: `Refusals.unexpectedError`.** Moving the function to `refusals.ts` adds it
    to the exported `Refusals` namespace, beside the top-level `unexpectedError`. Recommendation:
    keep both.
