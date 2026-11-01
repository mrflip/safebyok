# Thread 7a: vault_snapshot (2026-11-01)

Branch `20261101-vault_snapshot`, PR #TBD, stacked on
[#434](https://github.com/mrflip/safebyok/pull/434). Justify: green; safebyok 4886 passed, 37
skipped; size budgets unmoved.

* **Built**:
  * `VaultSnapshot` (`vault.ts`) gains `full`, `lockState`, `autolock_at` (the held lease's, null
    while locked), `hasPasskey` (null while sparse), `boxes` (a frozen empty array), `refreshedAt`
    and `trouble` (`VaultTrouble`, `models-shapes.ts`: `{ refusalkind, message }`). Its doc says
    it carries no secret material. `makeSnapshot` reads the passkey's presence off the record's
    `gate.passkey_wayin`, never building a Gate: a passkey wayin stored damaged (the loosened
    short-salt test) would otherwise throw out of `listing.build`.
  * `trouble` is `{ refusalkind: 'damaged_vault', message: Phrases.VaultStoredDamaged }` while
    `am === 'd'`, else null. New phrase in `phrases.ts`, *Vault: bad news*.
  * `Storable.refreshedAt` (protected): the trigger's `lastSucceededAt`. `receive` now remakes the
    snapshot (`#replaceSnapshot`, which compares by stableJsonify) when an answer only confirms
    the record in hand, so `refreshedAt` moves on a confirming fetch. Boxes and the bank show no
    freshness, so their snapshots, and the storable test that pins "notifies nobody", are
    unmoved.
  * Getters `autolockMinutes` (`leaseMillis / MinuteMillis`) and `pesterMinutes` (world's
    `pesterMillis`, else `DefaultPesterMillis`). `VaultWorld` and `vaultListingOpts`' world gain
    an optional `pesterMillis`; the bank, being the world, already had one.
    `DefaultPesterMillis` moves from `bank.ts` to `vault.ts` beside `DefaultLeaseMillis`.
  * Try forms: `tryEnsureUnlocked`, `tryLock`, `tryTakeUpLease`, `tryTakeUpCachedLease`.
  * `GatingSnapshot`/`gating.toJSON()` gain `hasPasskey`, agreeing with the vault snapshot.
  * Tests: `tests/models/vault-snapshot.test.ts` (new); `gating.test.ts` (toJSON).

* **Decisions taken**:
  * **Presence only for the passkey**, in both the snapshot and `toJSON`: STYLE.md's snapshot
    carries only what a host renders, not a salt; `askPasskey` reads the live
    `gating.passkeyHeader` (3b), not the JSON. Set aside: the whole header in both (it is public,
    but a `prf_salt_b64` in host state invites logging it, and nothing renders it).
  * **Freshness as a timestamp**, not `isTimely`: a boolean that changes with the clock goes
    stale inside a frozen snapshot that is only remade on settle.
  * **`trouble` only for a damaged record** today. A refused refresh (`trigger.lastErr`) does not
    settle, so it would need its own remake hook; left for the thread that wants it. Thread 12
    adds wayin damage here.
  * `tryLock` answers `Promise<Outcome<void>>` though `lock()` is synchronous, as every try form
    goes through `outcomeOf`.
  * Empty changeset: `models/` is not exported yet (as 4b's).

* **Pulled forward from thread 3b** (PR [#431](https://github.com/mrflip/safebyok/pull/431)),
  verbatim, so the restack meets identical lines: `Gate.passkeyHeader` (declare, doc, the
  constructor's parse and `decorate`), `Gating.passkeyHeader` (declare, doc, `adorn` at launch),
  and `#unlockByGating`'s `if (! this.isFull) { await this.fetch() }` with 3b's doc sentence
  (4b's `lockSeq` parameter differs from 3b's signature, so that hunk meets a trivial conflict:
  keep `lockSeq`). The restack takes 3b's side of the rest; the lines are identical.

* **Deviations**: `bank.ts`'s pester GAP now reads that no trigger reads it yet and the vault
  offers it as `pesterMinutes` (the GAP itself stays thread 10's).

* **Discoveries**:
  * 3b's `Gate` constructor parses the passkey header eagerly, so a passkey wayin stored with a
    malformed salt makes every `vault.gate` refuse, the gating's launch included (the loosened
    test pins 'bad_record' on the passphrase's unlock). That is why the snapshot reads the record.
  * The vault's `lock()` on an already-locked vault leaves the snapshot's identity (stableJsonify).

* **For the Coach**:
  * `boxes` stays empty until the vault holds a box listing; which thread gives it one?
  * `pesterMillis` takes `leaseMillis`' check (a positive int or Infinity), so a bank made with
    fractional `pesterMinutes` would be refused at the listing, as fractional autolock already is.
  * No try forms for `letLeaseGo` or `evict`: they are the listing's and the bank's, not a host's.
