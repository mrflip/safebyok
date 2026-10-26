# Thread 7: bank_per_user (2026-10-26)

Branch `20261026-bank_per_user`, PR [#278](https://github.com/mrflip/safebyok/pull/278), stacked on [#277](https://github.com/mrflip/safebyok/pull/277). Justify: green (core 3174 passed /
37 skipped, convex 346, graphql 331, postgres 318, react 307, indexeddb 165, fastkey 49, demo 227,
e2e 107, root 265). Size: `Bank` 54.2 kB, its budget 57 → 58 kB by the rule (`--write`); no other
line moved.

* **Built**:
  * **A bank per signed-in user** (bank.ts, vault-opts.ts). `MakeBankOpts` gains `user_id`, parsed
    with `applabel` by `CX.bankScope.parse(opts)` (`bad_scope`), which replaces thread 2's interim
    `bankApplabel`. `ParsedBankOpts` carries `applabel` and `user_id` flat. New getters
    `bank.user_id`, `bank.scope` (frozen `BankScope`).
  * **The bag calls.** `ensureVault`, `reopenVault`, `clearCachedVault`, `delDamagedVault` (and
    `try` forms) take `(bag, opts?: BankVaultOpts)`; `closeVault`, `entryOf` take `(bag)`. The bag
    type is written out, `Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>`. One validator,
    `vaultBag` (module-level, `bad_scope`, strips), then two checks after the parse:
    `checkNoStoresIn` (a `vaultDB`/`deviceDB` in the first bag refuses `bad_option`) and
    `#demandSameScope` (the comparison with `bank.scope`, `bad_scope`, `meta.fieldnames`, no
    values). Public `bank.demandConsistentWith(thing)` parses with `bankBag` and makes the same
    comparison. `VaultChoice` is gone; `VaultDraft` is `BankVaultOpts` (`{ vaultDB?, deviceDB? }`,
    strict, `bad_option`); `parseVaultDraft` is `vaultPartsOf(bank, scope, opts)`.
  * **The load hooks.** `KeyDeriver` gains optional `load` (key-deriver.ts), checked by
    `keyDeriverShape`; `loadKeyDeriver` (key-deriver-spec.ts, beside the deriver's other runtime
    helpers, so `Bank` does not import noble). `loadLibs` runs both loads side by side, the checker's
    refusal first where both fail. Docs say: made once, before any bank, handed to each; each bank's
    hello runs the load; an early call is a warm-up.
  * **The FIXMEs on `#ensureLoaded`.** One value, `#libs: LibsLoad`
    (`made | timely`, `starting` with its `loading` promise, `refused` with its `err`), is the
    bank's status and the snapshot's `err`; no shared err or null-promise test. `#initialize()`
    ("run the bank's startup ... and publish") returns `Promise<Outcome<void>>`, a status, and is
    the one place the lifecycle moves (through `#loadThenSettle` and `#setLibs`). The clearing of a
    failed load's error is now structural: a new load's `starting` replaces the `refused` value
    whole, since that refusal told of a load no longer under way; a `timely` bank never loads again,
    so there is nothing to clear there. A test pins `starting` with `err: null` on the retry.
  * **safebyok-react**: `BankProvider` passes `user_id` to `Bank.make`; `Provided` is `{ bank }`;
    the hooks name the vault by `{ vaultlabel }`; `BankProviderProps` is
    `Omit<MakeBankOpts, 'user_id'> & { user_id: string | null, ... }`. Its effect already re-ran on
    `user_id` and closed the vaults, so the drop is the same control flow; a test checks the next
    user's bank is a new object with that `user_id`, and `useBank()` is null while signed out.
  * **Docs**: core README (Quickstart, the cast, sign-out, key derivation's `load`, strength
    checker, errors table, the damaged/behind recipes), React README, adapter READMEs (convex,
    indexeddb, fastkey, graphql), root README, VOCABULARY, STYLE's `ensure` example, CUSTOMIZATION,
    the demo (`entry.scope` handed to the bank), `notes/security.md` (one entry, through a subagent).
  * Changeset `.changeset/20261026-bank_per_user.md` (safebyok, safebyok-react: minor), with
    before/after.
* **Decisions taken**:
  * **A bag that is no object refuses `bad_scope`** (the one validator's kind), where the draft
    refused `bad_option`. The check stays; its kind moved.
  * **Unknown fields in the first bag are stripped**, as the duck design wants, so a misspelt
    field or `userId` there is ignored rather than refused; the second bag stays strict.
  * **Bank status values unchanged** (`made | starting | timely | refused`): `LibsLoad`'s
    discriminant is the status, one field mapping onto thread 13's `Lifecycled | Refused`.
  * **The two loads run side by side** (`Promise.all` of two Outcomes), not in sequence.
  * `sealBoxlabel` (box.ts) stays: no bag of this thread's reaches `Box.seal`.
* **Deviations**:
  * `checkNoStoresIn` is a check beyond the preplan: without it, a host's old
    `ensureVault({ ..., vaultDB })` would be stripped and birth the vault in the bank's default
    store. Two-way door; listed as an open matter.
* **Discoveries**:
  * TypeScript's excess-property check catches `{ ...bag, vaultDB }` at a literal call, not a
    spread variable or plain JS: hence the runtime check.
  * `{ user_id, vaultlabel }` bags from before keep working for the bank's own user, so most test
    sites needed no change; the many `u1Main` constants in `tests/vault/` were left.
  * **For thread 8**: `draftOf` (bank.ts) still spreads a parsed scope into the record.
  * **For thread 13**: `#libs` is the status to map; entries still key `Map<VaultScopepath, ...>`.
* **For the Coach**: the open matters in the PR (the stores-in-bag check; `bad_scope` for a
  non-bag; stripping unknown fields in the first bag).
