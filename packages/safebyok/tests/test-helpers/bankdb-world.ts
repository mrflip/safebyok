/** The scopes, rows and asks a bankDB's tests share: a bank, its `main` gate, a vault and a box at a revision, their tombstones, and an ask of each verb. */

import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import type { BankScope, Boxscope, VaultScope } from '../../src/shapes/shapes-core'
import type { IfAbsent, IfPresent, PutIfAbsent } from '../../src/shapes/shapes-enums'
import type {
  BankBuildAsk, BankDelAsk, BankRecord, BankRow, BankTombstone, BoxDelAsk, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxQuery, BoxRecord, BoxRow, BoxTombstone,
  GatePutAsk, GateRecord, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultRecord, VaultRow, VaultTombstone, Wayins,
} from '../../src/shapes/shapes-bankdb'

/** The bank the rows stand in. */
export const bankScope  = { user_id: 'u1', banklabel: 'acme' }
/** The scope of the bank's only gate. */
export const gateScope  = { ...bankScope, gatelabel: 'main' as const }
/** The scope of the vault the rows stand in. */
export const vaultScope = { ...bankScope, vaultlabel: 'main' }
/** The scope of the box the rows stand in. */
export const boxscope   = { ...vaultScope, boxlabel: 'openai' }
/** The query for the box the rows stand in, in the vault life `life1` of the bank life `bank1`. */
export const boxQuery: BoxQuery = { ...boxscope, bank_tok: 'bank1', vault_tok: 'life1' }
/** The `listBoxes` ask of the vault the rows stand in, in the vault life `life1` of the bank life `bank1`. */
export const boxListAsk: BoxListAsk = { op: 'list', ...vaultScope, bank_tok: 'bank1', vault_tok: 'life1' }
/** The `tidyGone` ask of the bank the rows stand in. */
export const boxTidyAsk = { op: 'tidy_gone' as const, ...bankScope }
/** The `ensureBank` ask of the bank the rows stand in. */
export const bankEnsureAsk = { op: 'ensure' as const, ...bankScope, gates: ['main'] as ['main'] }

/** The scope of the vault `vaultlabel` in the bank the rows stand in. */
export function vaultScopeOf(vaultlabel: string): VaultScope { return { ...bankScope, vaultlabel } }
/** The moment every row was registered and written at. */
export const Now = Date.UTC(2026, 9, 15)

/** The scope of the box `boxlabel` in the vault the rows stand in. */
export function boxscopeOf(boxlabel: string): Boxscope { return { ...vaultScope, boxlabel } }

const ciphered = { cipher_iv_b64: 'aXY', ciphertext_b64: 'Y3Q' }

/** A passphrase wayin, its ciphertext fake. */
export const passphraseWayin = SX.passphraseWayinRecord.parse({ wayinkind: 'passphrase', key_deriver_label: 'test', salt_b64: 'c2FsdHNhbHRzYWx0c2FsdA', device_tok: '00000000-0000-4000-8000-0000000000d1', registered_at: Now, bank_key_wayin_wrapped: ciphered })
/** A passkey wayin, its ciphertext fake. */
export const passkeyWayin = SX.passkeyWayinRecord.parse({ wayinkind: 'passkey', credential_id: 'cred1', prf_salt_b64: 'A'.repeat(43), device_tok: '00000000-0000-4000-8000-0000000000d1', registered_at: Now, bank_key_wayin_wrapped: ciphered })

/** The bank's passphrase wayin, its ciphertext fake. */
export const mainWayin     = BX.passphraseWayin.parse({ ...passphraseWayin, wayinlabel: 'main' })
/** The bank's passkey wayin, its ciphertext fake. */
export const passkey0Wayin = BX.passkeyWayin.parse({ ...passkeyWayin, wayinlabel: 'passkey0' })
/** Another passphrase wayin, as `replacePassphrase` stores. */
export const otherMainWayin = BX.passphraseWayin.parse({ ...mainWayin, salt_b64: 'b3RoZXJzYWx0b3RoZXJzYQ' })

/** A gate's wayins with no passkey wayin. */
export const MainOnly: Wayins = { main: mainWayin }

/** The bank record at `revision_seq` in the life `bank_tok`. */
export function bankAt(revision_seq = 0, bank_tok = 'bank1'): BankRecord {
  return BX.bankRecord.parse({ ...bankScope, fmt: BX.BankFormat, revision_tok: `krev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', bank_tok })
}

/** The gate record at `revision_seq` under the bank life `bank_tok`, in the gate life `gate_tok`, with `wayins`. */
export function gateAt(revision_seq = 0, bank_tok = 'bank1', wayins: Wayins = MainOnly, gate_tok = 'gate1'): GateRecord {
  return BX.gateRecord.parse({
    ...gateScope, fmt: BX.GateFormat, revision_tok: `grev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a',
    bank_tok, gate_tok, wayins, auth: {}, sigs: {}, meta: {},
  })
}

/** The vault record at `revision_seq` under the bank life `bank_tok`, in the vault life `vault_tok`, with the fields of `extra` over its own. */
export function vaultAt(revision_seq = 0, bank_tok = 'bank1', vault_tok = 'life1', extra: object = {}): VaultRecord {
  return BX.vaultRecord.parse({ ...vaultScope, fmt: BX.VaultFormat, revision_tok: `vrev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', bank_tok, vault_tok, ...extra })
}

function tombstoneFieldsOf({ revision_tok, revision_seq }: SX.Revision) { return { revision_tok: `${revision_tok}x`, revision_seq: revision_seq + 1, am: 'x' as const } }

/** The tombstone that deletes the bank row `record`, one revision on, under a bank_tok of its own. */
export function bankTombstoneOf(record: BankRow): BankTombstone { return BX.bankTombstone.parse({ ...record, ...tombstoneFieldsOf(record), bank_tok: `${record.bank_tok}x` }) }
/** The tombstone that deletes the vault row `record`, one revision on, under a vault_tok of its own. */
export function vaultTombstoneOf(record: VaultRow): VaultTombstone { return BX.vaultTombstone.parse({ ...record, ...tombstoneFieldsOf(record), vault_tok: `${record.vault_tok}x` }) }

function bankScopeOf({ user_id, banklabel }: BankScope): BankScope { return { user_id, banklabel } }
function vaultScopeOfRow({ user_id, banklabel, vaultlabel }: VaultScope): VaultScope { return { user_id, banklabel, vaultlabel } }

/** The `buildBank` ask of `record` and its gate over `expected`, or over none for null, at the record's scope. */
export function bankBuildAskOf(record: BankRecord = bankAt(), gate: GateRecord = gateAt(0, record.bank_tok), expected: BankRow | null = null): BankBuildAsk {
  const scope = bankScopeOf(record)
  return { op: 'build', ...scope, expected: expected ?? BX.shellBankOf(scope), record, gate }
}

/** A gate verb's ask: the gate row `stored` at its next revision with `wayins`, under its own bank life unless `bank_tok` is given. */
export function gatePutAskOf(stored: GateRecord, wayins: Wayins, bank_tok: string = stored.bank_tok): GatePutAsk {
  const record = { ...stored, ...SX.nextRevisionOf(SX.revisionOf(stored), Now + 1), wayins }
  return { op: 'put', ...gateScope, bank_tok, expected: stored, record }
}

/** The `delBank` ask of the bank row `expected`, storing `record`: its tombstone, unless given. */
export function bankDelAskOf(expected: BankRow, record: BankTombstone = bankTombstoneOf(expected)): BankDelAsk {
  return { op: 'del', ...bankScopeOf(expected), expected, record }
}

/** The get of the vault at `scope`, under the bank life `bank_tok`, by a caller that holds no row of it. */
export function vaultGetAskOf(bank_tok = 'bank1', ifAbsent: IfAbsent = 'fail', scope: VaultScope = vaultScope): VaultGetAsk {
  return { op: 'get', ...vaultScopeOfRow(scope), bank_tok, ifAbsent, expected: BX.shellVaultOf(scope) }
}

/** The policies of a put, any of them given; the rest add and replace. */
type PutPolicies = { ifAbsent?: PutIfAbsent, ifPresent?: IfPresent }

/** The put of the vault `record` over the row `expected`, or over none for null, at its scope and under its own bank life. It adds and replaces unless `policies` says otherwise. */
export function vaultPutAskOf(record: VaultRecord, expected: VaultRow | null = null, policies: PutPolicies = {}): VaultPutAsk {
  const scope = vaultScopeOfRow(record)
  return { op: 'put', ...scope, bank_tok: record.bank_tok, ifAbsent: 'add', ifPresent: 'repl', ...policies, expected: expected ?? BX.shellVaultOf(scope), record }
}

/** The del of the vault row `expected`, storing `record`: its tombstone, unless given. It is made at the row's scope, under its own bank life. */
export function vaultDelAskOf(expected: VaultRow, record: VaultTombstone = vaultTombstoneOf(expected)): VaultDelAsk {
  return { op: 'del', ...vaultScopeOfRow(expected), bank_tok: expected.bank_tok, expected, record }
}

/** The box record at `revision_seq`, in the vault life `vault_tok` of the bank life `bank_tok`, with the fields of `extra` over its own. */
export function boxAt(revision_seq = 0, bank_tok = 'bank1', vault_tok = 'life1', extra: object = {}): BoxRecord {
  return BX.boxRecord.parse({
    ...boxscope, fmt: BX.BoxFormat, revision_tok: `brev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', bank_tok, vault_tok, box_tok: 'box1',
    whisper_codec: 'json_v1', whisper_schema_version: 1, sidecar: {}, box_key_wrapped: ciphered, whisper_ciphered: ciphered,
    ...extra,
  })
}

/** The tombstone that deletes the box row `record`, one revision on, under a box_tok of its own. */
export function boxTombstoneOf(record: BoxRow): BoxTombstone { return BX.boxTombstone.parse({ ...BX.boxSparse.parse(record), ...tombstoneFieldsOf(record), box_tok: `${record.box_tok}x` }) }

function boxQueryOf({ user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok }: BoxQuery): BoxQuery { return { user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok } }

/** The get of the box at `asked`, by a caller that holds no row of it. */
export function boxGetAskOf(asked: BoxQuery = boxQuery, ifAbsent: IfAbsent = 'fail'): BoxGetAsk {
  return { op: 'get', ...boxQueryOf(asked), ifAbsent, expected: BX.shellBoxOf(asked) }
}

/** The put of the box `record` over the row `expected`, or over none for null, in its own vault life. It adds and replaces unless `policies` says otherwise. */
export function boxPutAskOf(record: BoxRecord, expected: BoxRow | null = null, policies: PutPolicies = {}): BoxPutAsk {
  return { op: 'put', ...boxQueryOf(record), ifAbsent: 'add', ifPresent: 'repl', ...policies, expected: expected ?? BX.shellBoxOf(record), record }
}

/** The del of the box row `expected`, storing `record`: its tombstone, unless given. It is made in the row's own vault life. */
export function boxDelAskOf(expected: BoxRow, record: BoxTombstone = boxTombstoneOf(expected)): BoxDelAsk {
  return { op: 'del', ...boxQueryOf(expected), expected, record }
}
