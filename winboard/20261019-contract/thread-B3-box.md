# Thread B3: box (2026-10-19)

Branch `20261019-box`, [PR #202](https://github.com/mrflip/safebyok/pull/202), stacked on [#201](https://github.com/mrflip/safebyok/pull/201) (`20261019-proof_wayin`, B1) since the restack. Justify: green; core 2524 tests (35 skipped), react 263, every package green, size within every line.

* **Built**:
  * `utils.ts`'s `adorn` and `decorate` were B3's first commit; B1 took the same form, and the
    commit dropped out at the restack.
  * `box.ts` is the class. The Zod schema is **`BoxRecord`** (was `Box`; the stored format,
    `safebyok-box-v6`, unchanged), and **`Box`** is the model:
    * `Box.make(vault, record, holder)`: validates through `BoxRecord` (`bad_record`, quoting nothing, no
      cause); `props` a frozen copy (its two `Ciphered` frozen too); the instance frozen; every
      stored field first-class, `sidecar` the parse of `sidecar_json`, frozen through by a
      `JSON.parse` reviver; `vault`, `props`, `summary` attached by `decorate`; `toJSON()` is `props`.
    * `Box.seal(vault, boxlabel, whisper, holder, vaultKey, { sidecar, over })`: `putBox`'s old sealing,
      now `planSeal` (vouch, settle the sidecar, no key made) then `sealPlanned` (the crypto).
      Fresh `boxKey` and `revision_tok`, `boxCtx` rebuilt from format, scope, `vault_id`, purpose
      and the whole visible header; `registered_at` and the sidecar carry forward from `over` only
      when it opens (the old `recordOpens`, now `(await over.tryOpen(key)).ok`, inside the seal).
      Ends in `Box.make`, so what it returns has passed the schema.
    * `box.tryOpen(vaultKey)` / `box.open(vaultKey)`: the old `decipherBox` and
      `unwrappingKeyFor`. `bad_option` for a non-CryptoKey, `absent_vault` with no vault id.
    * `BoxVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'clock'>`, the slice a box
      reads (the tests' stub), and `BoxHolder = Pick<VaultProps, 'vault_id' | 'vault_key_epoch'>`,
      the vault props it lies under, passed by the vault from `#vaultProps` at each call (B1's shape). `heldListing`: a listing entry
      copied and frozen through. `checkedWhisper`, `checkedSidecar`: the refusals moved from the vault.
  * `vault.ts` (reading, sealing and box sections only, plus three getters): `get logger()`,
    `get clock()`, `get keyDeriver()` beside `leaseMillis`; `#tryPutBox` seals through `Box.seal`
    and checks the whisper's fit against the sealed `sidecar_json`; `#getBoxOrDamaged` and
    `#getBoxOrThrow` make `Box`es; `#decipherOrCatchUp` stands on `box.tryOpen`; `#boxCtx`,
    `#decipherBox`, `#recordOpens`, `#unwrappingKeyFor`, `BoxFormat`, `BoxHeader`,
    `EmptySidecarJson` and `parseJsonOrNull` left the vault. New pair **`tryOpenBox(box)` /
    `openBox(box)`**: a `Box` or a `BoxRecord`, re-made under this vault, opened with the key in
    hand (`vault_locked` otherwise, no prompt, no storage read), the key re-checked after.
    `vault.boxes` entries go through `heldListing` when a listing is taken up.
  * The rename `Box` -> `BoxRecord` reached every adapter (indexeddb, postgres, convex, graphql),
    the demo's `OutageVaultDB`, the READMEs' recipes and tables, and the Convex component's own
    mirror validator (`BoxRecord`, so it still mirrors the core's name). `RefusalMeta.box_stored`
    is `BoxRecord | null`. `index.ts` exports `Box`, `BoxRecord` and the types `BoxVault`, `SealBoxOpts`.
  * Tests: `tests/box.test.ts` (the record table, now `describe("BoxRecord")`, then `Box.make`,
    `Box.seal`, `box.tryOpen`, `box.open`), `tests/vault/vault-boxes.test.ts` (`vault.openBox`,
    `what a vault hands its boxes`), `tests/utils.test.ts`.
* **Decisions taken**:
  * **The Contract's argument order**, `Box.make(vault, record)` and `Box.seal(vault, ...)`, over
    the thread text's `make(record)` and `seal(boxlabel, ..., vault, ...)`: the Contract is the spec.
  * **`vault.clock` is the vault's checked clock** (`{ now: () => this.#clockNow() }`), not the
    host's raw one: a box reading a clock that fails drops the key as the vault's own readings do.
    Frozen since the first review; kept over B1's at the restack.
  * **`props` and `summary` hidden like `vault`**: `Object.keys(box)` is exactly the stored fields
    (sidecar parsed), so a log line shows each once; `JSON.stringify(box)` is the record.
  * **`box.vault` typed `BoxVault`**, the slice, not `Vault`: what a box may lean on is explicit,
    and a test's stub fits it.
  * **The seal vouches for `over` itself**, so no caller can carry a planted sidecar forward; the
    vault's second fit check moved after the seal (nothing is written between).
  * **`openBox` touches no storage** (the Contract's *Vault* prose); the one refresh on a box that
    will not open stays on `getBox`'s path (`#decipherOrCatchUp`).
  * **`DamagedBox` stays a frozen plain type** (the Contract's `type DamagedBox`): it has no record
    to be made from. A tombstone (C3) can stand beside it the same way.
  * **Deep freezing without a deep-freeze**: `JSON.parse(json, (_ckey, val) => Object.freeze(val))`
    freezes every node as the platform's parse builds it; the listing re-parses the sidecar's
    stable JSON the same way. No hand-rolled walker, no dependency.
* **Deviations**:
  * `openBox`'s example `vault.openBox(err.meta.box_stored)` is left out: no layer fills it yet (C1).
  * `vault.openBox` accepts a `BoxRecord` as well as a `Box`, so a VaultDB's answer opens as it comes.
* **Discoveries**:
  * **`isOutcomeShaped` is not moot**: it runs in the VaultDB base on an adapter's raw answer, before
    any `Box.make`, and gives the better message (unwrap with `valOf`). `Box.make` would refuse an
    Outcome-shaped record too, as `bad_record`, but never sees one from storage.
  * **Review rework**: boxes first read `vault_id` and `vault_key_epoch` off the snapshot getters
    while the write's expectation read `#vaultProps`: safe by timing only. Now `putBox` reads
    `#vaultProps` once and hands that one object to the seal (`holder`) and the expectation; the
    vouching opens `over` under the same holder; the kept sidecar is weighed before any key is
    made (`planSeal` -> fit check -> `sealPlanned`), the whisper serialized once.
* **For C1, C2, C4**: `putBox(expect, box)` takes `box.props`; the winner in `meta.box_stored` is a
  `BoxRecord` at the VaultDB, and `vault.openBox` opens it as it comes. `#getBoxOrThrow` already
  returns a `Box`, so C4's `getBox` returns it in place of `#decipherOrCatchUp`'s whisper.
  `heldListing` is where a tombstone would be filtered out of `vault.boxes`.
* **For the Coach**:
  * **`Box` -> `BoxRecord`** for the schema, in every adapter and the Convex mirror. Rec: keep.
  * **`vault.clock` checked** rather than the host's raw clock. Rec: keep.
  * **`box.vault` typed as the slice `BoxVault`**; **`props`, `summary` hidden**. Rec: keep both.
  * **Contract drift**, nine items, in [thread-B3-box-drift.md](thread-B3-box-drift.md). Rec: carry each.
* **Restack onto B1** ([#201](https://github.com/mrflip/safebyok/pull/201), 2026-10-19). B3's
  `adorn`/`decorate` commit dropped out empty (B1's pair is byte-identical). Conflicts: imports
  (B1's `*Record` wayin names and `PasskeyAnswer`, B3's `BoxRecord` and box helpers), `index.ts`
  and its test (both sets of exports), the vault's proofs section (B1 moved it to `proof.ts`), the
  vocabulary banner (B3's), `notes/security.md` (both entries). One copy of each getter; `clock`
  is B3's frozen one. **One props source**: the vault freezes every vault props record as it takes
  it up (`frozenVaultProps`, at the refresh's read, the creating unlock, and a change to the ways
  in), so `#vaultProps` is both authoritative and frozen: boxes take it through
  `#currentVaultProps()`, ways in are made over it (`#wayinsOf`, one per record), and the
  snapshot's `props` is it. B1's separate frozen copy (`#modelsOf`) is gone. New test in
  `tests/vault/vault-wayins.test.ts`: frozen through, and each way in's holder, whether the vault
  made, read or rewrote the record.
* **Test counts** (total includes skipped): core 2378 (35 skipped) at base `19c0cc87`; B3's own
  tip 2445: `box.test.ts` 28 to 74, `utils.test.ts` 3 to 9, `vault-boxes.test.ts` 102 to 115+.
  Restacked on B1: 2524 (35).
* **Size**: no line moved; `everything` 38.85 of 41 kB.
