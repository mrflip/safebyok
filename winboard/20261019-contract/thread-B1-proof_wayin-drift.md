# Thread B1: proof_wayin -- Contract drift (2026-10-19)

For whoever carries rulings into the Contract tab. Each item: where, what the Contract says, what
the code does, the proposed text. Each is an *Open Matters* row in the thread file.

1. **`Wayin.make` takes the vault props it belongs to** (*Wayin*, class block; *Shapes*, Making
   and unmaking). The Contract: `static make(vault, record)`. Built: `Wayin.make(vault, record,
   holder)`, `holder` the vault props record (`vault_id`, `registered_at`, `vault_key_epoch`).
   A way in's wrap binds its vault props' `vault_id` and `registered_at`, and the vault's public
   `vault_id` reads the published snapshot, which lags the props a call is working on (a first
   unlock drafting the vault, a ways-in change proving against a fresh read). Proposed block lines:
   `holder: WayinHolder // the vault props it is one of: their vault_id and registered_at are bound into the wrap; not in props`
   and `static make(vault, record, holder): PassphraseWayin | PasskeyWayin`; plus
   `static listOf(vault, vaultProps): Wayin[]`.
2. **The statics that seal** (*Wayin*, block). The Contract: `static seal(vault, proof, vaultKey,
   stamp)`. Built, as the thread asked, three statics for now: `sealPassphrase(vault, proof, holder,
   stamp, vaultKey)`, `sealFirstPassphrase(...)` (also hands back the session key), and
   `sealPasskey(vault, proof, holder, stamp, vaultKey)` (refuses `bad_option` for a salt not 32
   bytes). B4 settles the one `seal`. Proposed: leave the block's `seal` as the target, with the
   holder: `static seal(vault, proof, holder, stamp, vaultKey): Promise<Wayin>`.
3. **The search across ways in** (*Wayin*). Not in the Contract. Built:
   `static tryOpenAmong(wayins, proof, wayinId?): Promise<Outcome<VaultKeyPair & { wayinId }>>`,
   which refuses `absent_wayin` (so `absent_wayin` stays outside `tryOpen`), passes over damaged and
   other-deriver ways in before deriving, and tries each passphrase in turn. Under the one-passphrase
   policy (B4) it collapses to "the way in of the proof's kind". Proposed: nothing until B4.
4. **`wayin.tryOpen` refuses more** (*wayin.tryOpen*, Refuses). Proposed, under a new group
   *Fix the code:* "`bad_option`, a proof of the other kind (a passkey's answer for a passphrase), or
   a key deriver handing back other than 32 fresh bytes; `unknown_key_deriver`, a passphrase another
   key deriver made, before any derivation; `unexpected_error`, the key deriver threw: what it threw
   is the cause, never logged." And under *Ask again*, for `wrong_passkey`: "...or was another
   credential's".
5. **What a way in shows beyond the block** (*Wayin*, block). Built: `wayinCtx` (getter),
   `isDamaged()`, `toJSON()` (the record). Proposed lines:
   `wayinCtx: Uint8Array // the context its wrap is bound to` and
   `isDamaged(): boolean // stored in a form this package never writes: tryOpen refuses it damaged_wayin`.
6. **`meta.wayin_listed`** (*Shapes*, the `meta` block). Built: `damaged_wayin` news from a read of
   the vault props carries `meta.wayin_listed: WayinSummary`, as `damaged_box` news carries
   `box_listed`. Proposed line: `wayin_listed?: WayinSummary // damaged_wayin found in a read: the way in as the snapshot lists it, carried by its bad news`.
7. **`Proof.parse` and new passphrases** (*Proof*). Built: `PassphraseProof.parse(vault, given)`
   and `PasskeyProof.parse(vault, given)` beside `Proof.parse`; the vault parses a new passphrase
   (`changePassphrase`, `addPassphrase`) as a `PassphraseProof`, so `Wayin.seal*` take a proof, never
   a string. Proposed, under *Guarantees*: "A new passphrase is a `PassphraseProof` too, refused
   alike when blank."
8. **`Proof.vault` is the slice** (*Proof*, block: `vault: Vault`). Built: typed
   `ProofVault = Pick<Vault, 'keyDeriver'>`, and a way in's `WayinVault = Pick<Vault, 'applabel' |
   'user_id' | 'vaultlabel' | 'keyDeriver'>`, as the preplan asks of a model. Proposed: no change
   (the block's `Vault` reads as the vault, which it is).
