/** The scopes and records a vaultDB's tests share: a vault and a box at a revision, and their tombstones. */

import * as SX from '../../src/shapes/shapes-storage'
import type { Boxscope, VaultScope } from '../../src/shapes/shapes-core'
import type { BoxRecord, BoxTombstone, Revision, VaultRecord, VaultTombstone } from '../../src/shapes/shapes-storage'

/** The bank the records stand in. */
export const bankScope  = { applabel: 'acme', user_id: 'u1' }
/** The scope of the vault the records stand in. */
export const vaultScope = { ...bankScope, vaultlabel: 'main' }
/** The scope of the box the records stand in. */
export const boxscope   = { ...vaultScope, boxlabel: 'openai' }
/** The moment every record was registered and written at. */
export const Now = Date.UTC(2026, 9, 15)

/** The scope of the vault `vaultlabel` in the bank the records stand in. */
export const vaultScopeOf = (vaultlabel: string): VaultScope => ({ ...bankScope, vaultlabel })

/** The scope of the box `boxlabel` in the vault the records stand in. */
export const boxscopeOf = (boxlabel: string): Boxscope => ({ ...vaultScope, boxlabel })

const ciphered = { cipher_iv_b64: 'aXY', ciphertext_b64: 'Y3Q' }

/** A passphrase wayin, its ciphertext fake. */
export const passphraseWayin = SX.passphraseWayinRecord.parse({ wayinkind: 'passphrase', key_deriver_label: 'test', salt_b64: 'c2FsdA', device_id: '00000000-0000-4000-8000-0000000000d1', registered_at: Now, vault_key_wayin_wrapped: ciphered })
/** A passkey wayin, its ciphertext fake. */
export const passkeyWayin = SX.passkeyWayinRecord.parse({ wayinkind: 'passkey', credential_id: 'cred1', prf_salt_b64: 'A'.repeat(43), device_id: '00000000-0000-4000-8000-0000000000d1', registered_at: Now, vault_key_wayin_wrapped: ciphered })

/** The vault record at `revision_seq` in the life `vault_tok`, with `extra` laid over it. */
export const vaultAt = (revision_seq = 0, vault_tok = 'life1', extra: object = {}): VaultRecord => SX.vaultRecord.parse({
  ...vaultScope, fmt: SX.VaultFormat, revision_tok: `vrev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', vault_tok,
  gate: { gate_epoch: 1, passphrase_wayin: passphraseWayin, passkey_wayin: null },
  ...extra,
})

/** The box record at `revision_seq` in the life `vault_tok`, with `extra` laid over it. */
export const boxAt = (revision_seq = 0, vault_tok = 'life1', extra: object = {}): BoxRecord => SX.boxRecord.parse({
  ...boxscope, fmt: SX.BoxFormat, revision_tok: `brev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', vault_tok, box_tok: 'box1',
  whisper_codec: 'json_v1', whisper_schema_version: 1, sidecar: {}, box_key_wrapped: ciphered, whisper_ciphered: ciphered,
  ...extra,
})

const tombstoneFieldsOf = ({ revision_tok, revision_seq }: Revision) => ({ revision_tok: `${revision_tok}x`, revision_seq: revision_seq + 1, am: 'x' as const })

/** The tombstone that deletes the vault `record`, one revision on. */
export const vaultTombstoneOf = (record: VaultRecord): VaultTombstone => SX.vaultTombstone.parse({ ...SX.vaultSparse.parse(record), ...tombstoneFieldsOf(record) })
/** The tombstone that deletes the box `record`, one revision on. */
export const boxTombstoneOf = (record: BoxRecord): BoxTombstone => SX.boxTombstone.parse({ ...SX.boxSparse.parse(record), ...tombstoneFieldsOf(record) })

/** The revision a record stands at, as a call's prior. */
export const priorOf = SX.revisionOf
/** A revision no record in these tests stands at. */
export const stale: Revision = { revision_tok: 'nope', revision_seq: 7 }
