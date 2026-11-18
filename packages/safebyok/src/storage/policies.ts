/** The storage policies a write names, each refusing it unless the Thing stored allows it. */

import { isEqual, omit } from 'es-toolkit'
import { type EX, Phrases as BigPhrases } from 'safebyok-big/internals'
import type { GateWriteAsk, Wayins } from '../shapes/shapes-thing'

// == [Policies]: GatePolicies, policyRefusalOf
// Each runs once the put table has found the write would replace the live gate. Each line is one row of its policy's table
// in notes/storage-policies.md, in the same order, less big's registered_at row: every live-over-live write keeps its born_at.

/** The storage policies, each a check of a gate write ask against the wayins stored. Each returns why it refuses, or null to allow the write. */
const GatePolicies = {
  /** The record replaces the passphrase wayin the gating proved against, and nothing else. */
  replace_passphrase({ cited, record }: GateWriteAsk, stored: Wayins): string | null {
    if (! isEqual(cited.wayins?.main, stored.main))                       { return BigPhrases.ProvedWayinMoved }
    if (! isEqual(omit(record.wayins, ['main']), omit(stored, ['main'])))  { return BigPhrases.OtherWayinMoved }
    return null
  },
  /** The record adds a passkey wayin to a gate that has none, and changes nothing else. */
  add_passkey({ record }: GateWriteAsk, stored: Wayins): string | null {
    if (stored.passkey0 !== null)                                                { return BigPhrases.PasskeyStored }
    if (record.wayins.passkey0 === null)                                         { return BigPhrases.PasskeyNotAdded }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored, ['passkey0']))) { return BigPhrases.OtherWayinMoved }
    return null
  },
  /** The record removes the gate's passkey wayin, and changes nothing else. */
  revoke_passkey({ record }: GateWriteAsk, stored: Wayins): string | null {
    if (stored.passkey0 === null)                                                { return BigPhrases.NoPasskeyStored }
    if (record.wayins.passkey0 !== null)                                         { return BigPhrases.PasskeyNotRevoked }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored, ['passkey0']))) { return BigPhrases.OtherWayinMoved }
    return null
  },
} as const satisfies Record<EX.StoragePolicy, (ask: GateWriteAsk, stored: Wayins) => string | null>

/** Check `ask` against each storage policy it names, over the wayins stored. Returns why the first to refuse it does, or null if each allows it. */
export function policyRefusalOf(ask: GateWriteAsk, stored: Wayins): string | null {
  const policies = ask.options?.policies ?? []
  for (const policy of policies) {
    const why = GatePolicies[policy](ask, stored)
    if (why !== null) { return why }
  }
  return null
}

// --
