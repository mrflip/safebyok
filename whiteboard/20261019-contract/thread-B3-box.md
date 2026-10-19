# Thread B3: box (2026-10-19)

Branch `20261019-box`, [PR #202](https://github.com/mrflip/safebyok/pull/202), stacked on [#195](https://github.com/mrflip/safebyok/pull/195) (`20261019-outcome_adapters`). Justify: green; core 2439 tests (35 skipped), every package green, size within every line.

* **Built**:
  * `utils.ts`: `adorn<VT>(obj, val: VT): VT` and `decorate<OT>(obj: OT, props: Partial<OT>): OT`,
    their own commit, exported from `safebyok/utils`. `decorate` defines each own entry of `props`
    on `obj` with `Object.defineProperty`: non-enumerable, non-writable, non-configurable; returns
    `obj`. `adorn` does the same with `val`'s entries and returns `val` (a guess at the Coach's
    meaning: the signature names no key). Only `decorate` is used. **B1's pair wins at the restack.**
  * `box.ts` is the class. The Zod schema is **`BoxRecord`** (was `Box`; the stored format,
    `safebyok-box-v6`, unchanged), and **`Box`** is the model:
    * `Box.make(vault, record)`: validates through `BoxRecord` (`bad_record`, quoting nothing, no
      cause); `props` a frozen copy (its two `Ciphered` frozen too); the instance frozen; every
      stored field first-class, `sidecar` the parse of `sidecar_json`, frozen through by a
      `JSON.parse` reviver; `vault`, `props`, `summary` attached by `decorate`; `toJSON()` is `props`.
    * `Box.seal(vault, boxlabel, whisper, vaultKey, { sidecar, over })`: `putBox`'s old sealing.
      Fresh `boxKey` and `revision_tok`, `boxCtx` rebuilt from format, scope, `vault_id`, purpose
      and the whole visible header; `registered_at` and the sidecar carry forward from `over` only
      when it opens (the old `recordOpens`, now `(await over.tryOpen(key)).ok`, inside the seal).
      Ends in `Box.make`, so what it returns has passed the schema.
    * `box.tryOpen(vaultKey)` / `box.open(vaultKey)`: the old `decipherBox` and
      `unwrappingKeyFor`. `bad_option` for a non-CryptoKey, `absent_vault` with no vault id.
    * `BoxVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'vault_key_epoch' | 'clock'>`:
      the slice a box reads; the tests' stub is typed as it. `heldListing`: a listing entry
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
  * Docs: VOCABULARY's box row, the core README's cast (`openBox`), `notes/security.md` (sonnet).
* **Decisions taken**:
  * **The Contract's argument order**, `Box.make(vault, record)` and `Box.seal(vault, ...)`, over
    the thread text's `make(record)` and `seal(boxlabel, ..., vault, ...)`: the Contract is the spec.
  * **`vault.clock` is the vault's checked clock** (`{ now: () => this.#clockNow() }`), not the
    host's raw one: a box reading a clock that fails drops the key as the vault's own readings do.
    Same shape as B1's `get clock()`; at the restack keep this body.
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
  * The `openBox` example `vault.openBox(err.meta.box_stored)` is left out: no layer fills
    `box_stored` yet (C1).
  * `vault.openBox` accepts a `BoxRecord` as well as a `Box`, so a VaultDB's answer opens as it comes.
* **Discoveries**:
  * **`isOutcomeShaped` is not moot**: it runs in the VaultDB base on an adapter's raw answer, before
    any `Box.make`, and gives the better message (unwrap with `valOf`). `Box.make` would refuse an
    Outcome-shaped record too, as `bad_record`, but never sees one from storage.
  * A box reads `vault_id` and `vault_key_epoch` off the vault's snapshot getters. The private
    vault props run ahead of the snapshot only inside a first unlock's awaits, when no key is in
    hand; `putBox` reads its expectation and the seal reads the vault in one synchronous run. A
    stale read could only make a box fail to open, never open wrongly.
  * `box.ts` cannot import `vault-opts.ts` (`readClock`): `vault-opts` -> `vault-db` -> `box` is a cycle.
* **For C1, C2, C4**: `putBox(expect, box)` takes `box.props`; the winner in `meta.box_stored` is a
  `BoxRecord` at the VaultDB, and `vault.openBox` opens it as it comes. `#getBoxOrThrow` already
  returns a `Box`, so C4's `getBox` returns it in place of `#decipherOrCatchUp`'s whisper.
  `heldListing` is where a tombstone would be filtered out of `vault.boxes`.
* **For the Coach**:
  * **`Box` -> `BoxRecord`** for the schema, in every adapter and the Convex mirror. Rec: keep.
  * **`adorn`'s meaning** was a guess; B1's pair replaces mine. Rec: B1's wins.
  * **`vault.clock` checked** rather than the host's raw clock. Rec: keep.
  * **`box.vault` typed as the slice `BoxVault`**; **`props`, `summary` hidden**. Rec: keep both.
  * **Contract drift**, nine items, in [thread-B3-box-drift.md](thread-B3-box-drift.md). Rec: carry each.
* **Test counts** (vitest JSON reporter; total includes skipped): core 2378 (35 skipped) at base
  `19c0cc87`, 2439 (35) at the tip: `tests/box.test.ts` 28 to 72, `tests/utils.test.ts` 3 to 9,
  `tests/vault/vault-boxes.test.ts` 102 to 113 (1,197 lines); every other file and package the
  same (one Convex validator test retitled `BoxRecord: ...`).
* **Size**: no line moved; `everything` 38.85 of 41 kB.
