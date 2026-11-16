/** The storage policies a write names, each refusing it unless the Thing stored allows it. */

import { isEqual, omit } from 'es-toolkit'
import { type EX, Errors, Phrases as BigPhrases } from 'safebyok-big/internals'
import type { GateThing, GateWriteAsk, Thing, Wayins } from './shapes-thing'

// == [Policies]: GatePolicies, policyRefusalOf, PoliciedMeta, gateIssue
// Each runs once the put table has found the write would replace the live gate. Each line is one row of its policy's table
// in notes/storage-policies.md, in the same order, less big's registered_at row: every live-over-live write keeps its born_at.

/** The `cited` of a gate write ask. */
type GateCited = GateWriteAsk['cited']

/** The storage policies, each a check of a gate write against the wayins stored. Each returns why it refuses, or null to allow the write. */
const GatePolicies = {
  /** The record replaces the passphrase wayin the gating proved against, and nothing else. */
  replace_passphrase(cited: GateCited, record: GateThing, stored: Wayins): string | null {
    if (! isEqual(cited.wayins?.main, stored.main))                       { return BigPhrases.ProvedWayinMoved }
    if (! isEqual(omit(record.wayins, ['main']), omit(stored, ['main'])))  { return BigPhrases.OtherWayinMoved }
    return null
  },
  /** The record adds a passkey wayin to a gate that has none, and changes nothing else. */
  add_passkey(_cited: GateCited, record: GateThing, stored: Wayins): string | null {
    if (stored.passkey0 !== null)                                                { return BigPhrases.PasskeyStored }
    if (record.wayins.passkey0 === null)                                         { return BigPhrases.PasskeyNotAdded }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored, ['passkey0']))) { return BigPhrases.OtherWayinMoved }
    return null
  },
  /** The record removes the gate's passkey wayin, and changes nothing else. */
  revoke_passkey(_cited: GateCited, record: GateThing, stored: Wayins): string | null {
    if (stored.passkey0 === null)                                                { return BigPhrases.NoPasskeyStored }
    if (record.wayins.passkey0 !== null)                                         { return BigPhrases.PasskeyNotRevoked }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored, ['passkey0']))) { return BigPhrases.OtherWayinMoved }
    return null
  },
} as const satisfies Record<EX.StoragePolicy, (cited: GateCited, record: GateThing, stored: Wayins) => string | null>

/** Check `ask` against each storage policy it names, over the wayins stored. Returns why the first to refuse it does, or null if each allows it. */
export function policyRefusalOf({ cited, record, options }: GateWriteAsk, stored: Wayins): string | null {
  const policies = options?.policies ?? []
  for (const policy of policies) {
    const why = GatePolicies[policy](cited, record, stored)
    if (why !== null) { return why }
  }
  return null
}

// Big types a refusal's meta.act as its own BadAct, which has no `policied`.
/** Refusal meta with act `policied`, for a write the put table allows but a storage policy or the born_at check refuses. */
export const PoliciedMeta = { act: 'policied' } as unknown as Errors.RefusalMeta

/** A `gate_issue` refusal of a write over `stored`, saying `why`. */
export function gateIssue(stored: Thing | null, why: string): Errors.VaultError {
  return new Errors.VaultError('gate_issue', BigPhrases.gateIssue(why), { rows: { dbhas: stored }, meta: PoliciedMeta })
}
// --
