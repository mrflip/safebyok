# Thread G: guarantees_bank (2026-11-13)

Branch `20261112-guarantees_bank`, PR #678, the top of the line, stacked on #690 (thread 22, convex_tidy). Justify:
green at the update leg (safebyok 2975 tests, e2e 540, every package passing); docs only, no code changed, and an empty changeset.

* **Update leg** (2026-11-13, at cc38d16e8, above #691, #692, #693, #694, #695 and #690): every claim of
  `notes/guarantees.md` rechecked against the code; no guarantee found broken. A ledger sentence records the leg.
  * **Deletes**: `bank.del()` is Storable's own and deletes an unlocked bank with no prompt; `bank.delPrompt()` proves
    the passphrase and locks first. Both reach `BankDB.tryDelBank` through the bank listing. `gate.del()` refuses
    (`bad_option`). *The construction* now says so, and that the tombstone delivered drops the lease, forgets its row,
    and drops every exposed whisper below: the one new line, with three tests cited.
  * **The gate's snapshot** shows only each wayin's `registered_at` (`WayinSnapshot`, thread 21): no header, no salt.
    The earlier *For the Coach* item ("no wrap" as the property to keep) is moot; the snapshot keeps less than that.
  * **Renames**: `GX.provingWorld` became `GX.provingDevice`, and the proving's "world" became its "device"; one G10 test
    title followed (*before the device's is asked*).
  * **Listings** keep deleted things outside their list: `align` reaches each thing kept, and a listing's snapshot is
    the labels of its present things. A vault's tombstone is a life of its own, so its exposed whispers end at a
    vault's delete too (the whisper row and *Open items* 1 say "deleted or taking another life").
  * **G4**: with `VX.Promptly` at one hour, a lease row cited by a gate's old revision still loads until a
    `buildFromCache` meets the new revision, by the watch or by a refresh once the gate in hand is an hour old.
  * **Stale before this leg** (at 94c6b57e0 already): `safebyok-react` and `safebyok-fastkey` were said to run on the old
    core. The dialogs read the passphrase from their password inputs through `FormData` (`textOf`), never component state;
    `AddPasskeyModal` replaces the `put_passkey` form; fastkey checks its spec through `parseKeyDeriverSpec`.
  * Checked and unchanged: every other backticked name and every *Checked by* title, found in `src` or `tests`.
  * Looked up: nothing in the plan or progress document.
* **Wrapup rework** (2026-11-13, rebased onto #689 after the line was restacked onto main): `notes/guarantees.md` brought up to the code at
  94c6b57e0, once, the code overriding the note. A ledger line records it.
  * Already right from earlier reworks, confirmed by `rg`: thread 12's names (`lock`, `ensureUnlocked`), thread 16's
    `BankDB`, and G8's `deviceDBFailed`.
  * **Autolock** (the Coach's ruling): `bank.autolock` asks `Lease.tryExpiresAt` for the cached lease's expiry and holds
    no lease row. G4 now says where the expiry is kept: nowhere; `expiryOf` (`models/lease.ts`) reckons `proved_at` plus
    the device's `leaseMillis` (from `autolockMinutes`), which the bank hands the Lease in its `LeaseFriend`, each time
    it is asked; `bank.autolock` and `Lease.buildFromCache` (`isPastAutolock`) read it. The exceptions in G4 and G9 and
    the old *Open items* 2 are gone; the leaseKey access point names `Lease.expiresAt` as a reader of the cached row.
  * **Keepers**: the table's `lease.ts` and `bank.ts` rows name `expiresAt`, `autolock`'s new path and `listOwnLeases`;
    G4's *Kept by* adds `models/bank.ts`.
  * **Thread 18**: the host paragraph says the device's disable calls the bank's `lock()`, whose `align` reaches every
    thing below; a lock, a bank tombstone and another life use the same `align`.
  * **Thread 19, snapshots**: a paragraph lists each snapshot's fields, each made from its own thing alone; the claim
    is "no wrap and no secret" (the gate's then showed each wayin's header; since thread 21, only `registered_at`).
  * **Checked by**: `vault-gate.test.ts` → `bank-gate.test.ts` (G1), `vault-lease.test.ts` → `bank-lease.test.ts` (G9),
    and G4 cites the expiry cases in `lease.test.ts` and `bank-ending.test.ts`. Every title cited was found by `rg -F`
    in its file (one is generated from a case table, as the note says).
  * Looked up: nothing in the plan or progress document; the handoff was enough.
* **Rework after the rebase onto thread 10** (`3f898e018`): the note followed the code at 89437bc0c. It covered the
  host-function paragraph (`askUser`, handed down privately; the Bank gives it to neither listing), the enabled sentence,
  the brand sentence, the `Proving.judgeStrength` access point, G9 on `#unlockBankByProving`, the vacate's forget, G4's
  sweep, and the whisper's exposure ends. Stale names fixed: the Lease's `evict`/`revoke`/`forget`, the device database
  `safebyok:device-v002-001-001`, and the dropped `ask_passphrase_at`.
* **Built** (first pass, on thread 9): `notes/guarantees.md` restated for one gate per bank, merged from the sprint's
  `guarantees-bank.md` draft (promoted, then retired from the sprint directory), with the code overriding the draft.
* **Decisions taken**:
  * Thirteen files in the table: `models/vault.ts` stays (it passes the whisper's text on), and `bank.ts` and
    `device.ts` join.
  * The seal chain is Box → `vault.sealStampedString` → `bank.sealWith` → `Lease.sealWith`.
  * `onLifecycle` hears a `DeviceEvent`. G3 says the wayins are stored on the BankDB's gate row.
  * The Device lists leases only at a vacate (`listOwnLeases`, then `tryForget` with each listed row).
  * Approach set aside: amending a guarantee where the code departs from it. The note's header says to report, not
    amend; the autolock departure went to *Open items* until the Coach's ruling fixed the code.
* **Deviations**: none from the plan. Stale names fixed on the first pass: `storeFailed`, `Box.#edit`, `#keptWhisper`,
  `Lease.#friend` and `#renewLease`, plus seven test titles that no longer existed.
* **Discoveries**:
  * A vault aligns the box listing it has in hand, which may belong to an older life of the vault; `BoxListing.isEnabled`
    requires a matching `vault_tok`, so such a listing finds itself disabled and says goodbye. The note says that.
  * A disabled device never asks: `Gating.launchOn` reaches `bank.maingate`, which demands the bank enabled.
* **For the Coach**: (moot since thread 21, which shows only `registered_at` per wayin) whether "no wrap" was the
  property the gate snapshot must keep.
  * With `VX.Promptly` an hour, a cached lease can outlive a gate verb on another device by up to an hour when the
    watch misses it. Removal is not revocation, so no guarantee breaks; G4 now says so.
  * `bank.del()` deletes with no proof; it needs only an unlocked bank. No guarantee breaks.
