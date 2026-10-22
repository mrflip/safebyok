# Thread 7b: bank_provider (2026-10-22)

Branch `20261022-bank_provider`, PR (draft, to come), stacked on #258. Justify: in progress.

* **Built**: so far, the core fix for a bank listener that asks for a vault synchronously: the
  birth is held before anything is published (`#bearEntry` / `#settleBirth` in
  `packages/safebyok/src/bank.ts`), with a test in `tests/bank.test.ts`.
* **To come**: `BankProvider`, `useBank`, `useVault(vaultlabel)` in `safebyok-react`; `openError`
  and `retryOpen` gone; README, demo, e2e, size budget.
