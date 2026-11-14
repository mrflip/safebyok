/** The storage policies: what each demands of an ask and the rows stored before the operation may go ahead, as `notes/storage-policies.md` lists them. */

import { isEqual, omit } from 'es-toolkit'
import * as Phrases from './phrases'
import * as Refuse from '../refusals/throwers'
import type { BankRow, GatePutAsk, GateRecord } from '../shapes/shapes-bankdb'
import type { StoragePolicy } from '../shapes/shapes-enums'

// == [Gate policies]: StoredGateRows, replace_passphrase, add_passkey, revoke_passkey
// Each runs on the rows fetched in the step that stores the record, once the put table has found the put would replace
// the live gate row. Each line is one row of its policy's table in notes/storage-policies.md, in the same order.

/** The rows a gate put's policy reads: the live bank row, and the live gate row the put would replace. */
export type StoredGateRows = Readonly<{ parent: BankRow, gate: GateRecord }>

/** The `replace_passphrase` policy: the record replaces the passphrase wayin the gating proved against, and nothing else. */
export function replace_passphrase({ expected, record }: Pick<GatePutAsk, 'expected' | 'record'>, { parent, gate }: StoredGateRows): true {
  if (record.registered_at !== gate.registered_at)                                    { throw Refuse.bankGateIssue(parent, gate, Phrases.RegisteredAtNotStored) }
  if (! isEqual(expected.wayins.main, gate.wayins.main))                              { throw Refuse.bankGateIssue(parent, gate, Phrases.ProvedWayinMoved) }
  if (! isEqual(omit(record.wayins, ['main']), omit(gate.wayins, ['main'])))           { throw Refuse.bankGateIssue(parent, gate, Phrases.OtherWayinMoved) }
  return true
}

/** The `add_passkey` policy: the record adds a passkey wayin to a gate that has none, and changes nothing else. */
export function add_passkey({ record }: Pick<GatePutAsk, 'record'>, { parent, gate }: StoredGateRows): true {
  if (record.registered_at !== gate.registered_at)                                    { throw Refuse.bankGateIssue(parent, gate, Phrases.RegisteredAtNotStored) }
  if (gate.wayins.passkey0 !== undefined)                                             { throw Refuse.bankGateIssue(parent, gate, Phrases.PasskeyStored) }
  if (record.wayins.passkey0 === undefined)                                           { throw Refuse.bankGateIssue(parent, gate, Phrases.PasskeyNotAdded) }
  if (! isEqual(omit(record.wayins, ['passkey0']), omit(gate.wayins, ['passkey0'])))   { throw Refuse.bankGateIssue(parent, gate, Phrases.OtherWayinMoved) }
  return true
}

/** The `revoke_passkey` policy: the record removes the gate's passkey wayin, and changes nothing else. */
export function revoke_passkey({ record }: Pick<GatePutAsk, 'record'>, { parent, gate }: StoredGateRows): true {
  if (record.registered_at !== gate.registered_at)                                    { throw Refuse.bankGateIssue(parent, gate, Phrases.RegisteredAtNotStored) }
  if (gate.wayins.passkey0 === undefined)                                             { throw Refuse.bankGateIssue(parent, gate, Phrases.NoPasskeyStored) }
  if (record.wayins.passkey0 !== undefined)                                           { throw Refuse.bankGateIssue(parent, gate, Phrases.PasskeyNotRevoked) }
  if (! isEqual(omit(record.wayins, ['passkey0']), omit(gate.wayins, ['passkey0'])))   { throw Refuse.bankGateIssue(parent, gate, Phrases.OtherWayinMoved) }
  return true
}
// --

// == [Applying them]: StorageDemandsDispatcher, demandStorage

/** Each storage policy's function, by its name. */
export const StorageDemandsDispatcher = {
  replace_passphrase, add_passkey, revoke_passkey,
} as const satisfies Record<StoragePolicy, (ask: GatePutAsk, stored: StoredGateRows) => true>

/** Apply each storage policy `ask` names to the rows stored. Throws `gate_issue` at the first one that refuses. */
export function demandStorage(ask: GatePutAsk, stored: StoredGateRows): true {
  for (const policy of ask.options.policies) { StorageDemandsDispatcher[policy](ask, stored) }
  return true
}
// --
