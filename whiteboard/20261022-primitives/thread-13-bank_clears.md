# Thread 13: bank_clears (2026-10-24)

Branch `20261024-bank_clears`, PR #PR, stacked on [#252](https://github.com/mrflip/safebyok/pull/252)
in the line main → #265 → #252 → #this → #250. Justify: green (core 3147 passed, 37 skipped);
`pnpm size:budget` moves nothing.

Two of the Coach's rulings (2026-10-24), made into docs, tests and TODOs. **No behaviour
changed**: at the base, both calls already did what the Coach ruled; the empty changeset says so.

* **Built**:
  * `bank.clearCachedVault` (`packages/safebyok/src/bank.ts`): its doc block says it touches this
    device's store alone (no VaultDB verb, no unlock, no passphrase), as clearing site data would;
    a vault the bank holds no entry for, or storage does not hold, is no refusal; the store erased
    is the draft's `deviceDB` (or the bank's own); the entry let go is the bank's entry for the
    draft's scope once `delDeviceRecord` and `delLease` both land, whichever stores it was born
    from; a draft amiss or a device-store refusal keeps it.
  * `bank.delDamagedVault`: storage decides, by the checks it alone can make, so it may be asked
    for a vault the bank holds no entry for; it acts on the draft's stores (the doc said "the
    bank's own"); the entry let go is the bank's for the scope once storage answers, on success
    and on `stale_write`; any other refusal keeps it. The standalone `delDamagedVault`
    (`del-damaged-vault.ts`) says no bank need have opened or refused the vault first.
  * `HeldEntry`'s field comment no longer says every draft naming other stores is refused.
  * Tests, `packages/safebyok/tests/bank.test.ts`, 57 → 65 `it(` (vitest 61 → 69), none retired:
    a new `describe("bank.clearCachedVault")` (4: no entry and nothing stored; a record and lease
    an earlier session left, for a vault this bank never opened; a draft naming another deviceDB,
    no stores checked; a device-store refusal keeping the entry) and 4 in
    `describe("bank.delDamagedVault")` (damaged, no entry; sound, no entry, `bad_option`; nothing
    stored, no entry; a draft naming another vaultDB lets the held entry go). A helper `gotVaultOf`.
  * READMEs: the core's *A vault that cannot be opened* and *A vault behind this device* say the
    same; its `absent_vault` row no longer offers `bank.delDamagedVault` (a novel vault is sound,
    and refuses `bad_option`). The React README's damaged-vault paragraph says `stale_write` lets
    the entry go too (final-review row 25's second line).
  * `TODO.md`, *Soonish*: *A redacting or wrapped logger for what touches key material* (the
    Coach's second ruling, quoted; the *"sensitive" and "host" flags* TODO stays open beside it),
    and *A trial write at startup: `vault.probe`* (the Coach's Postgres-grants ruling, quoted;
    added at the orchestrator's mid-thread message). The Postgres README already lists the
    grants a role needs to open a vault (*Your database's own rules*), so nothing was added there.
  * `notes/security.md`: an amendment in place to the 2026-10-16 `delDamagedVault` entry (the
    file's header asks for amendments in place), by a `sonnet` subagent; nothing else touched.

* **Decisions taken**:
  * Both TODOs are *Soonish*, not *Side quests*: each has a design question (redaction step or
    wrapped logger; where a harmless probe lands, and whose call it is).
  * The "let go whichever entry stands when they finish" mechanism is unchanged (the Coach's open
    row): the doc blocks describe it as it is, "the entry the bank holds for the draft's scope
    once ...".

* **Deviations**: the React README line (one sentence) and the core README's `absent_vault` row
  are outside the gloss; both are about which entry these calls let go, or when they apply.

* **For thread 14 (Contract)**: no Contract line is made untrue by a behaviour change, since none
  changed. See *Contract lines* below for lines that already disagree with the ruling.

* **For the Coach**: nothing blocking.
