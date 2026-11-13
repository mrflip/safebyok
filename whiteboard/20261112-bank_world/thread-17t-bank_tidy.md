# Thread 17t: bank_tidy (2026-11-13)

Branch `20261113-bank_tidy`, PR to follow, stacked on #688. Justify: see the PR's **Tests:** line.

* **Built**: five leftovers of thread 17, one commit each, plus one changeset (`.changeset/20261113-bank_tidy.md`, `safebyok` patch).
  1. `BoxFormat` is defined once, `5003`, in `shapes-storage.ts` (the base box forms need a `fmt`); `shapes-bankdb.ts` re-exports it (`export { BoxFormat } from './shapes-storage'`), and its `banked` extension no longer repeats `fmt: lit(BoxFormat)`. The stale `5002` is gone; nothing parsed a box at 5002 (rows stored say 5003). `safebyok/storage`'s top-level `BoxFormat` now reads 5003, hence the changeset.
  2. `vault_empty` removed from `refusalkindVals`, `RefusalFamilyForKind`, the doc block's family list and `errors.test.ts`. Nothing threw it; no README or other doc named it (only `notes/gallant-docblocks.md` examples, left alone).
  3. `already_asking` comment says "on this device" (`Device.attachGating` refuses per device). Same fix to the `alreadyAsking` thrower's doc block and the `AlreadyAsking` phrase, which carried the same false "on this bank" (the phrase is host-visible message text).
  4. `Checkers` doc example: `gate_epoch` and `gateRecord` (both gone) replaced by a vault record with `vault_tok`, `revision_tok`, `revision_seq`, sourced from `[CX]`.
  5. `Bank.demandPresent`: **reachable, left in place** (see below).
* **Decisions taken**: kept `BoxFormat` in `SX` rather than dropping `fmt` from the base box forms: `SX.BoxSparse` and friends are exported (`src/index.ts`, `safebyok/storage`) and dropping `fmt` would change those exported types.
* **Deviations**: item 3 also touched the thrower doc and the phrase (same defect, one line each).
* **Discoveries**: `Bank.demandPresent` is unreachable from `Bank`'s own guards (`#demandLease`, `demandPromptable`, `demandAttachable` and `Storable.fetch` all call `demandEnabled()` first, and `Bank.isEnabled` includes `isPresent`), but `Listing.handleIfAbsent` calls `found.demandPresent()` for a listed instance under `ifAbsent: 'fail'`, the default. A tombstoned Bank stays listed ("disables this bank for good, though it stays listed"), so `bank.listing.tryGet(bank.scope)` after `delPrompt` reaches it and answers `bank_gone` (checked by a scratch test, since removed). It is also abstract on `Storable`, so every subclass owes one. `Bank.demandPresent` stays. The `demandPresent()` calls after `demandEnabled()` in `#demandLease`, `demandPromptable` and `demandAttachable` are redundant for a Bank; not touched (out of scope).
* **For the Coach**: whether to drop those three redundant chained `demandPresent()` calls in `bank.ts`.
