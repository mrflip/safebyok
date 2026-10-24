# Thread 14: contract_tab (2026-10-24)

Branch `20261024-contract_tab`, PR [#267](https://github.com/mrflip/safebyok/pull/267), base `main`. Justify: not run (no code; this file and an
empty changeset only). The work is in the design doc,
[Every path through store()](https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70).

* **Built**:
  * **Tabs renamed.** The old *Contract* tab is now *(old) Design of Contract*, kept, placed just
    after the new one (order `Na`). *Contract, primitives* is now *Contract*, at the old one's
    place (order `N`), its title and lead saying so.
  * **The Contract restated as a design tool** on purpose and relationships, true to main
    (30d5f9df) with #265 and #252. Per section:
    * *At a glance* (new): a lead, a drawn diagram of the cast (app, bank, Vault object, gating,
      requestCleartext, box, proving, lease, gate, the two stores) and what calls what, and a
      17-row table: each call, what it is for, which gating it raises, which store verbs it reaches.
    * *How your secrets are kept safe*: 3 lines reworded (the seal step; "any failure is
      damaged_box", 13; "the vaultKey never crosses a method boundary", 15).
    * *Terms*: 2 reworded (ground truth; the stamp, 20: a Box carries it whole, a Lease, Gate and
      Proving all but `vault_epoch`). *Conventions*: 2 (the one-form list, 27; `del()`'s answer).
    * *States*: the "Derived from" column is "Set by", 3 cells restated at the call level.
    * *Bank*: a lead; a **For** line on each call; `onBadNews` throw at a birth (87); `ensureVault`
      +4 refusals (104); `closeVault` `bad_label` (108); `clearCachedVault` and `delDamagedVault`
      rewritten from thread 13's notes (below).
    * *Vault*: a lead; `checkStrength` in the signature and the `vault_gone` exemptions (132, 138).
      **For** on every call. `hello`: Does as three steps, a *staleMinutes* paragraph (144),
      +`storage_blocked`, `corrupt_record` (155). `ensureUnlocked`: Does 3 as seven observable
      sub-steps. `putBox`/`getBox`/`getWhisper`/`delBox`: "at once, asking nobody" only while
      locked (13); `putBox` refuses by call shape, `stale_write` (whole, no `meta`) or `vault_gone`
      (reads first) (12); the `Box.seal` step cut. `putWayin`/`delWayin`: a table of slot by state
      in place of the prose, a seven-step Does, the grant the device store refuses (250),
      `gate_made_elsewhere` (254). `checkPassphrase` replaced by `checkStrength`/`tryCheckStrength` (7).
    * *Gatings*: a **For** line; the chain table (sealing and resealing steps) cut for a
      relationships table (raised by, proven by, changes, then); the attempt's outcomes as four
      dialog actions; the order a caller can see (290, 292); `lockLanded` once a deletion is sent (301).
    * *Box*: how a Box is made, `Box.seal` and `Box.make` among them (306); the stamp as readable
      but never in JSON or a spread (307); `box.extractWhisper()` as its own subsection.
    * *Lease*, *VaultDB*: a **For** line each. *Refusals*: the `vault_mismatch` row by call shape
      (393), the `stale_write` row's `meta`. *Shapes*, *A lock landing mid-call*, *Tradeoffs*: unchanged.
* **Decisions taken**:
  * Kept the labels **Does / Guarantees / Returns / Refuses** and added **For** above them, as the
    tests cite labels. The numbered Does lists of `hello`, `ensureUnlocked` and `putWayin` are
    ordered so the tests' step cites (`ensureUnlocked, Does 3.7`, `putWayin, Does 6`) point at the
    behaviour they test; every step is one a caller can observe.
  * Restated at the call level where the old text named the order of store verbs; kept the store
    verb names themselves, as they are the relationship to the adapters.
* **Deviations**: pulled forward from thread 13's report (the orchestrator's go, 2026-10-24): the
  `clearCachedVault` and `delDamagedVault` entries, now saying it touches this device's store
  alone, no unlock or passphrase; a vault not held or not stored is no refusal; it lets the entry go
  once both erasures land; `delDamagedVault` lets storage decide, for a vault the bank may not
  report, and keeps the entry on any refusal but `stale_write`.
* **Discoveries**:
  * **Contract lines kept as the target over the code**: none. Every finding was a line the code
    made untrue, and each now says what the code does.
  * **Doc blocks still untrue** (code, so not this thread's): `putBox` (vault.ts:592-593, 605-606),
    `getBox` (652-653), `getWhisper` (681), `delBox` (711-712): findings 12 and 13's Recs reword them too.
  * **Test cites that point at no section** of the new Contract: `VaultDB.putBox` (12 tests),
    `VaultDB.getBox`, `VaultDB.getCapacity`, `Wayin`, `Lease`, `Bad news is told once`,
    `requestCleartext, in React` (4) and `with none configured`, `delWayin, Does 2/3/4` (numbered
    for the old tab), `Gating, attempt refuses: vault_locked` and `offer another way in`. The
    `VaultDB.*` ones belong to VAULTDB.md, the adapter's contract.
* **For the Coach**:
  * **Public surface the Contract does not describe** (yours to call; no sections added): the
    standalone `delDamagedVault`; Vault's `logger`, `keyDeriver`; Bank's `applabel`, `status`,
    `snapshot`; `Box.seal`/`trySeal` (named only), `baseRevisionTok`, `toJSON`; the `Lease`,
    `Wayin` and `Gate` classes; the error helpers beyond `isVaultError`, `outcomeOf`, `valOf`; the
    adapter kit (`Refusals`, `Expectations`, `Sanitizer`, `Ckeys`, `memoryDeviceDB`,
    `localVaultDB`, the string stores); the entry points `safebyok/idb`, `safebyok/browser`,
    `safebyok/utils`.
  * **putBox's two refusals by call shape**: the Contract now states the asymmetry the code has
    (thread 7 recorded it). Whether that is the contract you want is finding 12's row.
