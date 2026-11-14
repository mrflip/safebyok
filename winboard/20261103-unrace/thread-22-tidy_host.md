# Thread 22: tidy_host (2026-11-03)

Branch `20261103-tidy_host`, PR #465, stacked on #464. Justify: green; core 4783 passed, 37 skipped; `tests/models` 1156,
`proof.test.ts` among them. Size budgets unmoved; empty changeset.

* **Built**, in `src/models/bank.ts`:
  1. `#bringUp` is plain code again: nothing in the package calls the verb, only a host. This undoes thread 12's rework.
  2. `bank.tidy` is **`bank.autolock`**, the Coach's rename. It finds this bank's rows past the autolock duration by
     `deviceDB.leasesProvedBefore(cutoff)`, and calls `vault.lock()` on each listed vault of the row's own `vault_tok`, which does
     the erasing. It erases no row itself. `vaultDB.tidyGone` is another verb, and stays.
  3. `bank.vacate` keeps its unconditional erase, for `identity_revoked` on a fresh page, now the only erase path:
     `#eraseOwnLeases` and `#eraseLease`, with `#ownLeasesProvedBefore` the scan both share. `#vacateLeasesProvedBefore`,
     `#vacateLease` and the branch on what is listed are gone.
  4. The proof: the host calls `bank.autolock()`, on the open page and after the late page's `hello`, with what a component renders
     through `subscribe` and `getSnapshot`.
  5. A `notes/security.md` entry, below.
* **Test rows.** Gone with `tidy` in `hello`: its order in `hello`, an offline `hello`, a plugin refusal, the double refusal. New:
  `hello` scans nothing and an old row stands; a host's call after `hello`; `vault.lock()` on a locked vault with a cached row erases
  that row, which the fresh page relies on; a call before `hello` does nothing and does not throw; an unlisted row and a row of
  another life stay; a refused erase reaches `onPanic` through the vault's lock. The panic row moved to `bank.vacate`, its only
  caller of the bank's `#panic` now, and a fresh page's `vacate` has a row.
* **Decisions taken.**
  * **`autolock` keeps reading `leasesProvedBefore`.** No plainer route turned up: a fresh page holds no lease to judge by, and
    `deviceDB.peek` for each listed vault would answer each `lease_key` to learn one `proved_at`.
  * **`FarPast` and `FarFuture` both stay, against the handoff's guess.** `autolock`'s cutoff needs `FarPast` as its floor, as an
    autolock of `Infinity` gives `-Infinity`, which `DS.cutoff` refuses (the "autolock of Infinity" row). `#eraseOwnLeases` needs
    `FarFuture`, as the deviceDB has no verb for every row, and its verbs are the next sprint's.
* **Rows it leaves.** A row whose vault is not listed stays where it is. `Lease.peek` meets it only if that vault is ever listed; then
  the next `autolock` erases it through that vault's `lock()`, if the host's call comes first. A row of another life in a listed
  vault's slot is no row to `deviceDB.peek` or to that vault's `vacate`, so it stays until a lease is cached over it or `bank.vacate`.
  The Coach: "removing rows that are not in the listing seems like another but different and async task". Not this thread's: **a seed
  for the next sprint.**
* **Discoveries.**
  * **`Lease.peek` does not judge a row's age, so a fresh page's autolock is now the host's alone.** A host that does not call
    `autolock` after `hello` gets `ensureUnlocked` attaching a row past autolock with no proof. Pinned in `bank.test.ts`, entered in
    `notes/security.md`, and an open matter below.
  * **A refused erase on a listed vault panics twice in `bank.vacate`**: once from `vault.vacate()`'s own erase, once from
    `#eraseOwnLeases`. The old `listed.lock()` branch was a no-op on a vacated vault, which hid the second. Left as it is, the erase
    being unconditional.
  * `await bank.autolock()` resolves with the vaults reading locked and their erases started, not landed, as `vault.lock()` returns
    at once; so the rows wait on `TH.eventually`.
  * A crossing: a lease attached between the scan and the lock is locked, and its row erased, as is a gating open on that vault.
* **Docs.** `notes/guarantees.md` never names `tidy` or `hello` tidying (`rg -n 'tidy'`, no hits), so it needs no change.
* **For thread 13's file, not mine to edit.** Item 4 of *What the demo needs next* in `thread-13-proof.md` says "A timer calling
  `bank.tidy()`". It stands as to the timer, but needs the new name, and a call after each `hello`. The proof bears this out.
* **For thread 14: what the specs in `whiteboard/20261102-newdesign/` and `whiteboard/20261103-unrace/` now get wrong.** All say `tidy` for `autolock`.
  * `hello` calls it: `newdesign-proof.md:131`, `newdesign-models.md:307`, `unrace-preplan.md:135`.
  * It vacates rows itself, or any row: `newdesign-proof.md:22`, `:206`, `newdesign-models.md:255`, `:307`.
  * In name only: `newdesign-proof.md:132`, `:345`, `:472`, `:512`, `newdesign-models.md:286`, `noted.md:9`, `unrace-preplan.md:237`,
    `:240`.
* **For the Coach.**
  * **A late page unlocks past autolock unless its host calls `autolock`.** Is that the ruling's intent, or should `Lease.peek`
    refuse a row past autolock? I'd leave it for the next sprint's lease work, and instruct the host meanwhile.
