# Thread 12, one_stamp: ctx-bytes, old and new (2026-11-27)

For the reviewer and whoever checks the crypto change: every expectation of
`packages/safebyok/tests/models/ctx-bytes.test.ts` that changed. Keys are shown sorted, as `cipherCtx` writes them.
Old is the file at `604f0cc6f`; new is the file at this thread's tip.

## Bytes of each ctx

| ctx | old | new |
|---|---|---|
| the encoding example | `[{bank_tok,banklabel},{boxlabel,revision_tok,written_at},"whisper_ciphered",{wayinkind}]` (a list of stamps) | `[{labelpath,revtok,written_at},"whisper_sealed.ciphered",{wayinkind}]` (one stamp) |
| passphrase wayin | `[{banklabel,born_at,lifeseq,lifetok,userid}, {banklabel,born_at,labelpath,lifeseq,modelkind:"gate",userid}, "bank_key_passphrase_wrapped", {born_at,devicetok,key_deriver_label,label:"main",salt_b64,wayinkind}]` | `[{banklabel,banktok,born_at,label:"main",labelpath,lifepath,modelkind:"wayin",userid}, "bank_key_passphrase_wrapped", {born_at,devicetok,key_deriver_label,salt_b64,wayinkind}]` |
| passkey wayin, and its passkeyKey's HKDF info (the same bytes) | as the passphrase's, with `"bank_key_passkey_wrapped"` and header `{born_at,credential_id,devicetok,label:"passkey0",prf_salt_b64,wayinkind}` | `[{...,label:"passkey0",...,modelkind:"wayin",...}, "bank_key_passkey_wrapped", {born_at,credential_id,devicetok,prf_salt_b64,wayinkind}]` |
| lease | `[{bank stamp}, {bank_born_at,bank_lifeseq,bank_lifetok,banklabel,born_at,fmt,gate_labelpath,gate_lifeseq,gate_revtok,proved_at,userid,wayinkind}, "bank_key_lease_wrapped"]` | `[{banklabel,banktok,born_at,fmt,gate_born_at,gate_labelpath,gate_lifepath,gate_revtok,modelkind:"lease",proved_at,userid,wayinkind}, "bank_key_lease_wrapped"]` |
| box, each of its two | `[{bank stamp}, {am,banklabel,born_at,fmt,label,labelpath,lifepath,lifeseq,modelkind,revseq,revtok,userid,written_at}, purpose, {codectag,schematag}]` | `[{am,banklabel,banktok,born_at,fmt,labelpath,lifepath,modelkind,revseq,revtok,userid,written_at}, purpose, {codectag,schematag}]` |

The wayin's stamp `born_at` is its gate's (`TH.T0`); the wayin's own `born_at` stays in its header.

## Field lists

| list | old | new |
|---|---|---|
| bank | `BankStampFields`: userid, banklabel, lifeseq, born_at, lifetok (bound into every ctx) | `BankLifeFields`: userid, banklabel, lifeseq, born_at, banktok, of `bank.life`, bound into nothing |
| gate | `GateStampFields`: userid, banklabel, modelkind, labelpath, lifeseq, born_at (bound into each wayin's ctx) | `ThingStampFields` (below), of `bank.gate.stamp`, which no ctx binds today |
| box | `BoxStampFields`: 13, with label and lifeseq, no banktok | `ThingStampFields`: modelkind, userid, banklabel, labelpath, banktok, fmt, am, lifepath, revtok, revseq, born_at, written_at |
| wayin | none | `WayinStampFields`: modelkind, userid, banklabel, labelpath, lifepath, born_at, label, banktok, read back from `wayinCtxOf`'s bytes |
| wayin header | none | `PassphraseHeaderFields`: wayinkind, key_deriver_label, salt_b64, devicetok, born_at |
| lease | `LeaseStampFields`: fmt, userid, banklabel, bank_lifeseq, bank_born_at, bank_lifetok, gate_labelpath, gate_lifeseq, gate_revtok, born_at, proved_at, wayinkind | modelkind, userid, banklabel, banktok, gate_labelpath, gate_lifepath, gate_born_at, gate_revtok, fmt, born_at, proved_at, wayinkind |

## Tests gone, and tests new

* Gone, since there is no second stamp: "a box will not unseal under its two stamps in the other order"; "a box / a
  wayin / a lease will not unwrap under a bank stamp with another X" (15 tests). The fields they covered are covered by
  each stamp's own per-field tests now.
* Recast: "a wayin will not unwrap under a gate stamp with another X" is "... under a stamp with another X", over the
  wayin's stamp's 8 fields.
* New: a wayin will not unwrap under a header with another X (5 fields), nor with its `label` put back in the header;
  the gate's stamp field list; the bank's life field list.
* New, "a bank's next life" (4 tests): a born bank seals a box and is granted a lease; both roots are tombstoned; a
  second device runs `Bank.birth` over the two tombstones. The new gate is at lifepath `0000000002` with a new banktok;
  the old wayin will not unwrap under the new gate's life, nor under the old life with only the banktok moved; the old
  lease will not unwrap under the stamp the new gate would grant, nor with only the banktok moved; the old box will not
  unseal under its stamp moved into the new life (banktok and lifepath), nor with only the banktok moved, nor under the
  new life's bankKey. Each opens under its own stamp first, as a control.
