# Thread 13: The bank's listing (2026-10-27)

Branch `20261027-bank_listing`, PR [#286](https://github.com/mrflip/safebyok/pull/286), cut from `origin/main` (threads 2 to 12 merged).
Justify: green (core 3283 passed / 37 skipped; react 309; demo 229 / 17 skipped; convex 350;
graphql 344; postgres 322; indexeddb 165; fastkey 49; e2e 107 / 116 skipped; root 265).

* **Built**:
  * `BankSnapshot` is `(Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>)
    & { vaults: readonly BankVault[] }` (bank.ts, *Public types*): flat on the bank's scope, a
    `lifecycle` where `status` was (`timely` is `ready`), `err` only while `refused`.
  * `BankVault = Lifecycled<VaultScope> | Refused<VaultScope>` replaces `VaultEntry`; no Vault
    object inside. `BankStatus`, `EntryStatus`, `VaultEntry` and the `bank.status` getter are gone.
  * `bank.snapshot.vaults`: sorted by scopepath (`byCodeUnit`), frozen; a new array exactly when an
    entry changes (`#relist`), so it keeps its identity across the bank's own lifecycle moves, and
    each element keeps its own until it changes.
  * `bank.vaultOf(bag)` (the Vault object once `ready`, else null) and `bank.bankVaultOf(bag)` (the
    listed vault), both keyed lookups in `#entries` by scopepath; `entryOf` is gone.
    `HeldEntry` holds `vault` beside `view`. Internally `LibsLoad` speaks `lifecycle` too.
  * `VaultParts` (vault-opts.ts) carries `applabel`, `user_id`, `vaultlabel` as own fields, frozen;
    the `_applabel` removal is gone. Each DeviceDB / VaultDB call gets the scope picked out
    (`CX.vaultScope.parse(parts)` in the bank and in the Vault constructor), never the parts.
  * safebyok-react: `useVault(vaultlabel)` returns `Vault | null` (through `bank.vaultOf`); new
    `useBankVault(vaultlabel)` returns `BankVault | null` (the listing, by `bank.bankVaultOf`).
    Both ask and both throw misuse, as `useVault` did.
  * The demo, the convex and e2e tests, both READMEs, and a changeset
    (`.changeset/20261027-bank_listing.md`). #283's changeset and the core README's *The
    snapshot* carry the `demandConsistentWith(snapshot)` sentence (no `gate_moved` now).
  * `reactEverything`'s budget 9.9 → 10 kB, by the rule (6.93 kB measured; the new hook).
* **Decisions taken**:
  * **`bank.bankVaultOf(bag)`**, the keyed lookup of a listed vault. NEWSTYLE §7 says lookups go by
    key, never by scanning the listing, and React needs the lifecycle and `err` of one vault; the
    name follows the type that replaced `VaultEntry`. A two-way door: the Coach may prefer
    `entryOf` kept, or another name.
  * **`useVault` returns the Vault object; `useBankVault` is new.** Seven of ten callers wrote
    `useVault('main')?.vault ?? null`; the rest render lifecycle or `err`, which now come from the
    listing. The alternative, `useVault` returning `BankVault & { vault }`, would rebuild
    `VaultEntry` in the binding.
  * **`bank.status` is removed**, not renamed: NEWSTYLE §5 reads what changes through the one
    snapshot. `applabel`, `user_id`, `scope` getters stay (fixed for the bank's life).
* **Deviations**:
  * **`keptIfSame` not reused for `vaults`.** It compares by `stableJsonify`, which cannot tell
    two refusals of one kind apart (vault.ts says so of `trouble`), and each element already keeps
    its identity. The listing is instead rebuilt only when an entry changes, so its identity
    follows change by construction, with no comparison. No refused-to-refused transition exists
    today, so `keptIfSame` would have worked; this is the simpler, exact form.
* **Discoveries**:
  * The bank's `#publish` had one caller per kind of change; splitting `#relist` (entries) from
    `#setLibs` (lifecycle) was all it took for the listing to keep its identity.
  * `notes/security.md` still names `entryOf` and `VaultEntry` in older entries; not touched (a
    sonnet subagent's file, and no security decision moved here).
* **For the Coach**: the two names above (`bankVaultOf`, `useBankVault`), and the React hook split.
