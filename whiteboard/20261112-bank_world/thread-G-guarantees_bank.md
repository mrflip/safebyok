# Thread G: guarantees_bank (2026-11-13)

Branch `20261112-guarantees_bank`, PR #678, stacked on #689 (thread 17t, bank_tidy, 94c6b57e0). Justify: green at the
wrapup rework (safebyok 2963 tests, e2e 549, every package passing); docs and a changeset only, no code changed.

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
    thing below (Bank → gate and vault listings → each thing; Vault → the box listing in hand; a Box no longer enabled
    drops its exposed whisper); a lock, a bank tombstone and another life use the same `align`. Construction says only
    `BankDB.tryDelBank` (from the `del_bank` gating's act, through the bank listing) deletes the gate row, that
    `bank.del()` and `gate.del()` refuse, and that a host uses `bank.delPrompt()`. `ensureVault` on a locked bank and
    put/del demanding an unlocked bank were checked in code; no guarantee claims otherwise, so nothing was added.
  * **Thread 19, snapshots**: a new paragraph lists each snapshot's fields. Each is made from its own thing alone; the
    device's holds `bank_tok`; the box's `isLocked` is a boolean copy. **Correction:** the note said no snapshot shows a
    salt. The gate's snapshot shows each wayin's header (`salt_b64`, `key_deriver_label`, `credential_id`,
    `prf_salt_b64`), without `bank_key_wayin_wrapped`, so the claim is now "no wrap and no secret".
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
* **For the Coach**: confirm that "no wrap" is the property the gate snapshot must keep. Its salts and credential ids
  are public, and the note now says the snapshot shows them.
