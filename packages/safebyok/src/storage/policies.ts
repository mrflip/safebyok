/** The storage policies a write names, each refusing it unless the Thing stored allows it. */

import { isEqual, omit } from 'es-toolkit'
import { type EX, Errors, Phrases as BigPhrases } from 'safebyok-big/internals'
import type { GateThing, GateWriteAsk } from './shapes-thing'

// == [Policies]: GatePolicies, demandPolicies, gateIssue
// Each runs once the put table has found the write would replace the live gate. Each line is one row of its policy's table
// in notes/storage-policies.md, in the same order, less big's registered_at row: every live-over-live write keeps its born_at.

/** What a gate write cites. */
type GateCited = GateWriteAsk['cited']

/** Each storage policy: what it demands of a gate write's records and of the gate stored, throwing `gate_issue` where it refuses. */
const GatePolicies = {
  /** The record replaces the passphrase wayin the gating proved against, and nothing else. */
  replace_passphrase(cited: GateCited, record: GateThing, stored: GateThing): void {
    if (! isEqual(cited.wayins?.main, stored.wayins.main))                            { throw gateIssue(stored, BigPhrases.ProvedWayinMoved) }
    if (! isEqual(omit(record.wayins, ['main']), omit(stored.wayins, ['main'])))       { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
  /** The record adds a passkey wayin to a gate that has none, and changes nothing else. */
  add_passkey(_cited: GateCited, record: GateThing, stored: GateThing): void {
    if (stored.wayins.passkey0 !== undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyStored) }
    if (record.wayins.passkey0 === undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyNotAdded) }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0']))) { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
  /** The record removes the gate's passkey wayin, and changes nothing else. */
  revoke_passkey(_cited: GateCited, record: GateThing, stored: GateThing): void {
    if (stored.wayins.passkey0 === undefined)                                         { throw gateIssue(stored, BigPhrases.NoPasskeyStored) }
    if (record.wayins.passkey0 !== undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyNotRevoked) }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0']))) { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
} as const satisfies Record<EX.StoragePolicy, (cited: GateCited, record: GateThing, stored: GateThing) => void>

/** Check `ask` against each storage policy it names, over the gate stored. Throws `gate_issue` at the first that refuses. */
export function demandPolicies({ cited, record, options }: GateWriteAsk, stored: GateThing): void {
  const policies = options?.policies ?? []
  for (const policy of policies) { GatePolicies[policy](cited, record, stored) }
}

// Big types a refusal's meta.act as its own BadAct, which has no `policied`.
/** The meta of a refusal of a write the put table would let replace the Thing stored. */
export const PoliciedMeta = { act: 'policied' } as unknown as Errors.RefusalMeta

/** A `gate_issue` refusal of a write over `stored`, saying `why`. */
function gateIssue(stored: GateThing, why: string): Errors.VaultError {
  return new Errors.VaultError('gate_issue', BigPhrases.gateIssue(why), { rows: { dbhas: stored }, meta: PoliciedMeta })
}
// --
