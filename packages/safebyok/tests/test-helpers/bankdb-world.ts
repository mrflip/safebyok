/** The scopes, rows and asks a bankDB's tests share: a bank, its `main` gate and a vault at a revision, their tombstones, and an ask of each verb. */

import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import type { GateVerb, IfAbsent } from '../../src/shapes/shapes-enums'
import type { BankBuildAsk, BankDelAsk, BankRecord, BankRow, BankTombstone, GatePutAsk, GateRecord, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultRecord, VaultRow, VaultTombstone, Wayins } from '../../src/shapes/shapes-bankdb'
import { Now, passkeyWayin, passphraseWayin } from './storage-world'

/** The bank the rows stand in. */
export const bankScope  = { user_id: 'u1', banklabel: 'acme' }
/** The scope of the bank's only gate. */
export const gateScope  = { ...bankScope, gatelabel: 'main' as const }
/** The scope of the vault the rows stand in. */
export const vaultScope = { ...bankScope, vaultlabel: 'main' }
/** The `ensureBank` ask of the bank the rows stand in. */
export const bankEnsureAsk = { op: 'ensure' as const, ...bankScope, gates: ['main'] as ['main'] }

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

/** The vault record at `revision_seq` under the bank life `bank_tok`, in the vault life `vault_tok`. */
export function vaultAt(revision_seq = 0, bank_tok = 'bank1', vault_tok = 'life1'): VaultRecord {
  return BX.vaultRecord.parse({ ...vaultScope, fmt: BX.VaultFormat, revision_tok: `vrev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', bank_tok, vault_tok })
}

function tombstoneFieldsOf({ revision_tok, revision_seq }: SX.Revision) { return { revision_tok: `${revision_tok}x`, revision_seq: revision_seq + 1, am: 'x' as const } }

/** The tombstone that deletes the bank row `record`, one revision on, under a bank_tok of its own. */
export function bankTombstoneOf(record: BankRow): BankTombstone { return BX.bankTombstone.parse({ ...record, ...tombstoneFieldsOf(record), bank_tok: `${record.bank_tok}x` }) }
/** The tombstone that deletes the vault row `record`, one revision on, under a vault_tok of its own. */
export function vaultTombstoneOf(record: VaultRow): VaultTombstone { return BX.vaultTombstone.parse({ ...record, ...tombstoneFieldsOf(record), vault_tok: `${record.vault_tok}x` }) }

/** The `buildBank` ask of `record` and its gate over `expected`, or over none for null. */
export function bankBuildAskOf(record: BankRecord = bankAt(), gate: GateRecord = gateAt(0, record.bank_tok), expected: BankRow | null = null): BankBuildAsk {
  return { op: 'build', ...bankScope, expected: expected ?? BX.shellBankOf(bankScope), record, gate }
}

/** A gate verb's ask: the gate row `stored` at its next revision with `wayins`, under its own bank life unless `bank_tok` is given. */
export function gatePutAskOf(gateVerb: GateVerb, stored: GateRecord, wayins: Wayins, bank_tok: string = stored.bank_tok): GatePutAsk {
  const record = { ...stored, ...SX.nextRevisionOf(SX.revisionOf(stored), Now + 1), wayins }
  return { op: 'put', ...gateScope, bank_tok, expected: stored, record, gateVerb }
}

/** The `delBank` ask of the bank row `expected`, storing `record`: its tombstone, unless given. */
export function bankDelAskOf(expected: BankRow, record: BankTombstone = bankTombstoneOf(expected)): BankDelAsk {
  return { op: 'del', ...bankScope, expected, record }
}

/** The get of the vault, under the bank life `bank_tok`, by a caller that holds no row of it. */
export function vaultGetAskOf(bank_tok = 'bank1', ifAbsent: IfAbsent = 'fail'): VaultGetAsk {
  return { op: 'get', ...vaultScope, bank_tok, ifAbsent, expected: BX.shellVaultOf(vaultScope) }
}

/** The put of the vault `record` over the row `expected`, or over none for null, under its own bank life. It adds and replaces. */
export function vaultPutAskOf(record: VaultRecord, expected: VaultRow | null = null): VaultPutAsk {
  return { op: 'put', ...vaultScope, bank_tok: record.bank_tok, ifAbsent: 'add', ifPresent: 'repl', expected: expected ?? BX.shellVaultOf(vaultScope), record }
}

/** The del of the vault row `expected`, storing its tombstone, under its own bank life. */
export function vaultDelAskOf(expected: VaultRow): VaultDelAsk {
  return { op: 'del', ...vaultScope, bank_tok: expected.bank_tok, expected, record: vaultTombstoneOf(expected) }
}
