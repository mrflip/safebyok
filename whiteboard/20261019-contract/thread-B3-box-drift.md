# Thread B3: box -- Contract drift (2026-10-19)

For whoever carries rulings into the Contract tab. Each item: where, what the code does, proposed text.

1. **Refusals, `bad_record`.** `Box.make` and `vault.openBox` refuse what is no box record as
   `bad_record`; the row names only VaultDB verbs. Proposed meaning: "a record or expectation that
   is not one this package builds, handed to a VaultDB verb, `Box.make` or `vault.openBox`; the
   store says `invalid_box`, the vault relabels it".
2. **Box block, `vault`.** Built as `vault: BoxVault`, the slice
   `Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'vault_key_epoch' | 'clock'>`.
   Proposed line: `vault: BoxVault // the slice of its vault a box reads: scope, id, epoch, clock; not in props`.
3. **Box block, `props` and `summary`.** Both hidden like `vault`, so a log line shows each stored
   field once. Proposed comment on `props`: `// the stored record, frozen; hidden like vault; what JSON.stringify(box) writes`.
4. **`Box.make` refuses.** Proposed, under the block: "`Box.make` touches nothing and throws, as
   `Vault.make` does: `bad_record` for a record this package does not write, quoting none of it."
5. **`Box.seal`.** The block is silent on `over` and on refusals. Proposed: "`over` is the box this
   one replaces, under the same boxlabel: its `registered_at` and sidecar carry forward only when
   it opens under `vaultKey`. A sidecar given wins. Refuses (throws) `bad_whisper`, `bad_option`
   (a sidecar JSON cannot carry, a `vaultKey` that is no CryptoKey, an `over` that is no box under
   this label, an unknown option), `bad_label`, `absent_vault`. Writes nothing."
6. **`box.tryOpen`, Refuses.** Add: "*Fix the code:* `bad_option`, a `vaultKey` that is no
   CryptoKey. *The state already says it:* `absent_vault`, a vault not yet created."
7. **Vault, `openBox(box)`.** Takes a `Box` or a `BoxRecord` (a VaultDB's answer opens as it comes)
   and re-makes it under this vault. Proposed signature: `openBox(box: Box | BoxRecord): Promise<Outcome<Whisper>>`
   "with the key in hand; touches no storage and asks for no proof: `vault_locked` without a key".
8. **Vault, `logger`, `clock`, `keyDeriver`.** Not in the field block. Proposed lines:
   `logger: VaultLogger // read-only`, `clock: Clock // read-only, checked: a reading that fails drops the key`,
   `keyDeriver: KeyDeriver // read-only`.
9. **Shapes, *Making and unmaking*.** "`Thing.make(vault, record)`" is what was built for `Box`;
   the preplan's phase-B rule says `make(record)`. The Contract's order stands; B1 should match.
