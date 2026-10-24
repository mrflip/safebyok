# Thread 7b: bank_provider (2026-10-22)

Branch `20261022-bank_provider`, PR #259, stacked on #258. Justify: green (see the PR's Tests line).

* **Built**:
  * `safebyok-react/src/bank-provider.tsx` (was `vault-provider.tsx`): `BankProvider`, `useBank`,
    `useVault(vaultlabel)`, `useVaultSnapshot(vaultlabel)`. Tests moved to `tests/bank-provider/`.
  * `BankProvider` makes one Bank per signed-in user in an effect (as `VaultProvider` did), holds it
    beside that `userId` in one state (`held`), and lets it go (`closeVaults()`) on sign-out, a new
    user, a shaping prop, unmount. Handlers still gated per bank (`kept.held`). No bank while
    signed out.
  * `useVault(vaultlabel)` returns the bank's `VaultEntry | null`, asks (`bank.tryEnsureVault`)
    only while the bank holds no entry, and throws a `misuse`-family refusal in render. A refused
    entry, `vault_gone` included, stays refused until the app asks again.
  * `PassphraseModal` gained `onStartedOver`, called once a confirmed start-over delete lands;
    `BankProvider` answers it with `bank.tryEnsureVault`, so the dialog's start over still lands on
    a new novel vault.
  * Core: `#bearEntry` holds the birth before publishing, the birth beginning a microtask on
    (`#settleBirth`); a birth let go in the asking task reads nothing. New `bank.delDamagedVault` /
    `tryDelDamagedVault`, over `delDamagedVaultIn` split out of `del-damaged-vault.ts`.
  * Demo: `BankProvider`, `useVault('main')`; the dashboard asks again on Retry / "Start a new
    vault", deletes a damaged vault with `bank.tryDelDamagedVault`, offers "Accept this copy"
    (`bank.tryClearCachedVault`) for `vault_behind`. Delete account no longer races a re-ask.
  * READMEs (react rewritten for *Use*, *When opening fails*, *Starting over*), core README, TODO,
    logger/vault-db comments, CLAUDE.md's test-folder path, `notes/security.md` (sonnet), size
    budget `VaultProvider` -> `BankProvider` (8.3 kB), changeset.
* **Decisions taken**:
  * `VaultProvider` goes, no wrapper (pre-1.0, no shims; a wrapper would carry the retired
    `openError` contract).
  * `useVault` returns the entry, not the Vault object: the entry is what replaces `openError`.
  * The bank is made in an effect, so `useBank()` is `Bank | null`: making it in render tripped
    `react-hooks/refs` on every handler (the latest-ref pattern), and wanted `userId` as a memo
    dep the lint calls unnecessary.
  * A bank per user (not one across users), so a let-go vault's late bad news never reaches the
    next user's handler, as before.
  * The recursion: the code fix, not a doc rule (the Open Matter's preferred option).
* **Deviations**: pulled forward `bank.delDamagedVault` (core API): without the provider's
  `delDamagedVault`, a host under `BankProvider` had no store handles to delete a damaged vault
  with. Parallels `clearCachedVault`.
* **Discoveries**:
  * The Probe in `tests/bank-provider/world.tsx` shows the entry's refusal as "refused: kind".
  * `useVault`'s ask is keyed on "no entry": after `clearCachedVault` or `delDamagedVault`, both of
    which let the entry go, a mounted `useVault` asks again on its own. Only refusals held in the
    entry (`vault_gone`, `vault_remade`, conditions) wait for the app.
* **Review and rework** (2026-10-23): the reviewer's four commits fixed a replaced dialog left
  unanswered, a start over asking an abandoned bank, two doc lines, and added the demo's tests.
  Reworked here: `tryDelDamagedVault` lets the entry go on `stale_write` (core test, the retired
  provider test's counterpart); `tryClearCachedVault` erases first, then lets go (test held at
  `delLease`); the demo's account deletion uses `tryDel` and shows the refusal; the ledger has 7b's
  seven retired rows; the changeset says the recursion is fixed and nothing stored changes shape.
  Left open: a child mounting in a user-change commit asks the old bank (review minor); a Vault
  object held through `clearCachedVault` could write a lease meanwhile (not the `vault_behind` path).
* **For the Coach**: see the PR's *Open questions*.
