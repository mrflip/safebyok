/** The scopes, records and asks a vaultDB's tests share: a vault and a box at a revision, their tombstones, the flawed rows its verbs must refuse, and a get, put or del of either. */

import * as SX from '../../src/shapes/shapes-storage'
import type { Boxscope, VaultScope } from '../../src/shapes/shapes-core'
import type { IfAbsent } from '../../src/shapes/shapes-enums'
import type {
  BoxDelAsk, BoxGetAsk, BoxPutAsk, BoxQuery, BoxRecord, BoxRow, BoxTombstone, Gate, Revision,
  VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultRecord, VaultRow, VaultTombstone,
} from '../../src/shapes/shapes-storage'

/** The bank the records stand in. */
export const bankScope  = { applabel: 'acme', user_id: 'u1' }
/** The scope of the vault the records stand in. */
export const vaultScope = { ...bankScope, vaultlabel: 'main' }
/** The scope of the box the records stand in. */
export const boxscope   = { ...vaultScope, boxlabel: 'openai' }
/** The query for the vault the records stand in, in the life `life1`. */
export const vaultQuery = { ...vaultScope, vault_tok: 'life1' }
/** The query for the box the records stand in, in the life `life1`. */
export const boxQuery   = { ...boxscope, vault_tok: 'life1' }
/** The moment every record was registered and written at. */
export const Now = Date.UTC(2026, 9, 15)

/** The scope of the vault `vaultlabel` in the bank the records stand in. */
export const vaultScopeOf = (vaultlabel: string): VaultScope => ({ ...bankScope, vaultlabel })

/** The scope of the box `boxlabel` in the vault the records stand in. */
export const boxscopeOf = (boxlabel: string): Boxscope => ({ ...vaultScope, boxlabel })

const ciphered = { cipher_iv_b64: 'aXY', ciphertext_b64: 'Y3Q' }

/** A passphrase wayin, its ciphertext fake. */
export const passphraseWayin = SX.passphraseWayinRecord.parse({ wayinkind: 'passphrase', key_deriver_label: 'test', salt_b64: 'c2FsdHNhbHRzYWx0c2FsdA', device_id: '00000000-0000-4000-8000-0000000000d1', registered_at: Now, vault_key_wayin_wrapped: ciphered })
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

/** Flaws that leave a box row's `am` and revision readable and fail its check, each named. */
export const boxFlaws = [
  ['a later fmt',                (box: BoxRecord) => ({ ...box, fmt: SX.BoxFormat + 1 })],
  ['an extra field',             (box: BoxRecord) => ({ ...box, smuggled: 'field' })],
  ['garbled ciphertext',         (box: BoxRecord) => ({ ...box, whisper_ciphered: 'garbled' })],
  ['a tombstone with a whisper', (box: BoxRecord) => ({ ...box, am: 'x' })],
] as const

/** Flaws that leave a vault row's `am` and revision readable and fail its check, each named. */
export const vaultFlaws = [
  ['a later fmt',             (vault: VaultRecord) => ({ ...vault, fmt: SX.VaultFormat + 1 })],
  ['an extra field',          (vault: VaultRecord) => ({ ...vault, smuggled: 'field' })],
  ['a garbled gate',          (vault: VaultRecord) => ({ ...vault, gate: 'rubble' })],
  ['a tombstone with a gate', (vault: VaultRecord) => ({ ...vault, am: 'x' })],
] as const

/** How the verbs must refuse a flawed row: as `storage_issue`, or as damaged, the row asked for or a box op's vault. */
export type FlawRefusal = 'storage_issue' | 'damaged'

/** A row the verbs must refuse, how they must refuse it, the fields their refusal names, and what is wrong with it. */
export type FlawedRow = readonly [row: unknown, refusal: FlawRefusal, fieldnames: readonly string[] | undefined, blurb: string]

const soundVault = vaultAt()
const soundBox   = boxAt()

/** The fields a vault row has beside its revision and its life. */
const VaultFieldsBeyondRevision = ["applabel", "user_id", "vaultlabel", "fmt", "registered_at", "written_at", "gate"]

/** Vault rows the verbs must refuse, each filed at the world's vault and standing at its revision where it has one. */
export const FlawedVaultRows: readonly FlawedRow[] = [
  // a sound row filed at another address than it names:
  [{ ...soundVault, user_id: "u2" },                                                    "storage_issue", ["user_id"],                'naming another user_id'],
  [{ ...soundVault, vaultlabel: "other" },                                              "storage_issue", ["vaultlabel"],             'naming another vaultlabel'],
  // no object:
  [["rubble"],                                                                          "storage_issue", undefined,                  'that is an array'],
  ["rubble",                                                                            "storage_issue", undefined,                  'that is a string'],
  [12,                                                                                  "storage_issue", undefined,                  'that is a number'],
  // lacking the fields every row has:
  [{ garbage: true },                                                                   "damaged",       ["am"],                     'with none of the fields every row has'],
  [{ fmt: SX.VaultFormat + 1, revision_seq: 9 },                                        "damaged",       ["am"],                     'with a later fmt and a revision_seq alone'],
  [{ revision_tok: "r9", revision_seq: 9, am: "a", vault_tok: "life9", garbage: true }, "damaged",       VaultFieldsBeyondRevision,  'with a revision and a life and no other field'],
  // whole, and failing its check:
  [{ ...soundVault, fmt: SX.VaultFormat + 1 },                                          "damaged",       ["fmt"],                    'of a later fmt'],
  [{ ...soundVault, smuggled: "field" },                                                "damaged",       [],                         'with an extra field'],
  [{ ...soundVault, gate: "rubble" },                                                   "damaged",       ["gate"],                   'with a garbled gate'],
  [{ ...soundVault, am: "x" },                                                          "damaged",       [],                         'that is a tombstone with a gate'],
  [{ ...soundVault, vault_tok: "life2", gate: "rubble" },                               "damaged",       ["gate"],                   'of another life, with a garbled gate'],
]

/** Box rows the verbs must refuse, each filed at the world's box and standing at its revision where it has one. */
export const FlawedBoxRows: readonly FlawedRow[] = [
  // a sound row filed at another address than it names:
  [{ ...soundBox, user_id: "u2" },                 "storage_issue", ["user_id"],           'naming another user_id'],
  [{ ...soundBox, vault_tok: "life2" },            "storage_issue", ["vault_tok"],         'naming another vault_tok'],
  [{ ...soundBox, boxlabel: "other" },             "storage_issue", ["boxlabel"],          'naming another boxlabel'],
  // no object:
  [["rubble"],                                     "storage_issue", undefined,             'that is an array'],
  ["rubble",                                       "storage_issue", undefined,             'that is a string'],
  [12,                                             "storage_issue", undefined,             'that is a number'],
  // lacking the fields every row has:
  [{ garbage: true },                              "damaged",       ["am"],                'with none of the fields every row has'],
  [{ fmt: SX.BoxFormat + 1, revision_seq: 9 },     "damaged",       ["am"],                'with a later fmt and a revision_seq alone'],
  // whole, and failing its check:
  [{ ...soundBox, fmt: SX.BoxFormat + 1 },         "damaged",       ["fmt"],               'of a later fmt'],
  [{ ...soundBox, smuggled: "field" },             "damaged",       [],                    'with an extra field'],
  [{ ...soundBox, whisper_ciphered: "garbled" },   "damaged",       ["whisper_ciphered"],  'with garbled ciphertext'],
  [{ ...soundBox, am: "x" },                       "damaged",       [],                    'that is a tombstone with a whisper'],
]

const tombstoneFieldsOf = ({ revision_tok, revision_seq }: Revision) => ({ revision_tok: `${revision_tok}x`, revision_seq: revision_seq + 1, am: 'x' as const })

/** The tombstone that deletes the vault row `record`, one revision on, under a life tok of its own. */
export const vaultTombstoneOf = (record: VaultRow): VaultTombstone => SX.vaultTombstone.parse({ ...SX.vaultSparse.parse(record), ...tombstoneFieldsOf(record), vault_tok: `${record.vault_tok}x` })
/** The tombstone that deletes the box row `record`, one revision on, under a life tok of its own. */
export const boxTombstoneOf = (record: BoxRow): BoxTombstone => SX.boxTombstone.parse({ ...SX.boxSparse.parse(record), ...tombstoneFieldsOf(record), box_tok: `${record.box_tok}x` })

/** The revision a record stands at, as a call's prior. */
export const priorOf = SX.revisionOf
/** A gate verb's arguments: `vault` at its next revision, its `gate_epoch` one up and `moved` laid over its gate, and the revision `vault` stands at. */
export const gateMoveOf = (vault: VaultRecord, moved: Partial<Gate>) => {
  const prior = priorOf(vault)
  const record: VaultRecord = { ...vault, ...SX.nextRevisionOf(prior, Now + 1), gate: { ...vault.gate, gate_epoch: vault.gate.gate_epoch + 1, ...moved } }
  return [record, { prior }] as const
}
/** A revision no record in these tests stands at. */
export const stale: Revision = { revision_tok: 'nope', revision_seq: 7 }

/** A put's policies, either or both. One left out is `add` over no row, and `repl` over a live one. */
type PutPolicies = Partial<Pick<VaultPutAsk, 'ifAbsent' | 'ifPresent'>>
const AddOrReplace = { ifAbsent: 'add', ifPresent: 'repl' } as const

const vaultScopeIn = ({ applabel, user_id, vaultlabel }: VaultScope): VaultScope => ({ applabel, user_id, vaultlabel })
const boxQueryIn = ({ applabel, user_id, vaultlabel, boxlabel, vault_tok }: BoxQuery): BoxQuery => ({ applabel, user_id, vaultlabel, boxlabel, vault_tok })

/** The get of the vault at `scope`, by a caller that holds no row of it. */
export const vaultGetAskOf = (scope: VaultScope = vaultScope, ifAbsent: IfAbsent = 'fail'): VaultGetAsk => ({
  op: 'get', ...vaultScopeIn(scope), ifAbsent, expected: SX.sentinelVaultOf(scope),
})

/** The get of the box `asked` for, by a caller that holds no row of it. */
export const boxGetAskOf = (asked: BoxQuery = boxQuery, ifAbsent: IfAbsent = 'fail'): BoxGetAsk => ({
  op: 'get', ...boxQueryIn(asked), ifAbsent, expected: SX.sentinelBoxOf(asked, asked.vault_tok),
})

/** The put of the vault `record` over the row `expected`, or over none for null. It adds and replaces, but for what `policies` says. */
export const vaultPutAskOf = (record: VaultRecord, expected: VaultRow | null = null, policies: PutPolicies = {}): VaultPutAsk => ({
  op: 'put', ...vaultScopeIn(record), ...AddOrReplace, ...policies, expected: expected ?? SX.sentinelVaultOf(record), record,
})

/** The put of the box `record` over the row `expected`, or over none for null. It adds and replaces, but for what `policies` says. */
export const boxPutAskOf = (record: BoxRecord, expected: BoxRow | null = null, policies: PutPolicies = {}): BoxPutAsk => ({
  op: 'put', ...boxQueryIn(record), ...AddOrReplace, ...policies, expected: expected ?? SX.sentinelBoxOf(record, record.vault_tok), record,
})

/** The del of the vault row `expected`, storing `record`: its tombstone, unless given. */
export const vaultDelAskOf = (expected: VaultRow, record: VaultTombstone = vaultTombstoneOf(expected)): VaultDelAsk => ({
  op: 'del', ...vaultScopeIn(record), expected, record,
})

/** The del of the box row `expected`, storing `record`: its tombstone, unless given. */
export const boxDelAskOf = (expected: BoxRow, record: BoxTombstone = boxTombstoneOf(expected)): BoxDelAsk => ({
  op: 'del', ...boxQueryIn(record), expected, record,
})
