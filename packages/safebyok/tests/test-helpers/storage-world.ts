/** The scopes, records and a live {@link MemoryVaultDB} that the vaultDB's tests share: a vault and a box at a revision, their tombstones, and a store holding them. */

import { _cheat_clock } from '../../src/helpers/clock'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as SX from '../../src/shapes/shapes-storage'
import type { BoxRecord, BoxTombstone, Revision, VaultRecord, VaultTombstone } from '../../src/shapes/shapes-storage'

export const bankScope  = { applabel: 'acme', user_id: 'u1' }
export const vaultScope = { ...bankScope, vaultlabel: 'main' }
export const boxscope   = { ...vaultScope, boxlabel: 'openai' }
export const Now = Date.UTC(2026, 9, 15)

const ciphered = { cipher_iv_b64: 'aXY', ciphertext_b64: 'Y3Q' }

export const passphraseWayin = SX.passphraseWayinRecord.parse({ wayinkind: 'passphrase', key_deriver_label: 'test', salt_b64: 'c2FsdA', device_id: '00000000-0000-4000-8000-0000000000d1', registered_at: Now, vault_key_wayin_wrapped: ciphered })
export const passkeyWayin = SX.passkeyWayinRecord.parse({ wayinkind: 'passkey', credential_id: 'cred1', prf_salt_b64: 'A'.repeat(43), device_id: '00000000-0000-4000-8000-0000000000d1', registered_at: Now, vault_key_wayin_wrapped: ciphered })

export const vaultAt = (revision_seq = 0, vault_tok = 'life1'): VaultRecord => SX.vaultRecord.parse({
  ...vaultScope, fmt: SX.VaultFormat, revision_tok: `vrev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', vault_tok,
  gate: { gate_epoch: 1, passphrase_wayin: passphraseWayin, passkey_wayin: null },
})

export const boxAt = (revision_seq = 0, vault_tok = 'life1', extra: object = {}): BoxRecord => SX.boxRecord.parse({
  ...boxscope, fmt: SX.BoxFormat, revision_tok: `brev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', vault_tok, box_tok: 'box1',
  whisper_codec: 'json_v1', whisper_schema_version: 1, sidecar: {}, box_key_wrapped: ciphered, whisper_ciphered: ciphered,
  ...extra,
})

const tombstoneFieldsOf = ({ revision_tok, revision_seq }: Revision) => ({ revision_tok: `${revision_tok}x`, revision_seq: revision_seq + 1, am: 'x' as const })
export const vaultTombstoneOf = (record: VaultRecord): VaultTombstone => SX.vaultTombstone.parse({ ...SX.vaultSparse.parse(record), ...tombstoneFieldsOf(record) })
export const boxTombstoneOf = (record: BoxRecord): BoxTombstone => SX.boxTombstone.parse({ ...SX.boxSparse.parse(record), ...tombstoneFieldsOf(record) })

export const priorOf = SX.revisionOf
export const stale: Revision = { revision_tok: 'nope', revision_seq: 7 }

/** A store holding a live vault, and a live box when asked. */
export const storeWith = async (opts: { box?: boolean } = {}) => {
  _cheat_clock(() => Now + 1)
  const vaultDB = new MemoryVaultDB()
  const vault = vaultAt()
  await vaultDB.putVault(vault, { prior: SX.VoidRevision })
  const box = boxAt()
  if (opts.box) { await vaultDB.putBox(box, { prior: SX.VoidRevision }) }
  return { vaultDB, vault, box }
}
