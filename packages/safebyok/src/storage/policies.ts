/** The storage policies a write names, each refusing it unless the gate it replaces allows it. */

import { isEqual, omit } from 'es-toolkit'
import type { EX } from 'safebyok-big/internals'
import { PolicyPhrases } from '../phrases'
import type { GateWriteAsk } from '../shapes/shapes-asks'
import type { AnteWayins, PolicyPhrase } from '../shapes/shapes-manifest'

// == [Policies]: GatePolicies

// Each judges a write that replaces the live gate. Each line is one row of its policy's table in notes/storage-policies.md,
// in the same order, less big's registered_at row: every live-over-live write leaves its born_at the same.

/** The storage policies, each a check of a gate write ask against the wayins of the live gate it replaces. Each returns why it refuses, or null to allow the write. */
export const GatePolicies = {
  /** The record replaces the passphrase wayin the gating proved against, and nothing else. */
  replace_passphrase({ cited, record }: GateWriteAsk, ante: AnteWayins): PolicyPhrase | null {
    if (! isEqual(cited.wayins?.main, ante['main']))                     { return PolicyPhrases.ProvedWayinMoved }
    if (! isEqual(omit(record.wayins, ['main']), omit(ante, ['main'])))  { return PolicyPhrases.OtherWayinMoved }
    return null
  },
  /** The record adds a passkey wayin to a gate that has none, and changes nothing else. */
  add_passkey({ record }: GateWriteAsk, ante: AnteWayins): PolicyPhrase | null {
    if (ante['passkey0'] !== null)                                              { return PolicyPhrases.PasskeyStored }
    if (record.wayins.passkey0 === null)                                        { return PolicyPhrases.PasskeyNotAdded }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(ante, ['passkey0']))) { return PolicyPhrases.OtherWayinMoved }
    return null
  },
  /** The record removes the gate's passkey wayin, and changes nothing else. */
  revoke_passkey({ record }: GateWriteAsk, ante: AnteWayins): PolicyPhrase | null {
    if (ante['passkey0'] === null)                                              { return PolicyPhrases.NoPasskeyStored }
    if (record.wayins.passkey0 !== null)                                        { return PolicyPhrases.PasskeyNotRevoked }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(ante, ['passkey0']))) { return PolicyPhrases.OtherWayinMoved }
    return null
  },
} as const satisfies Record<EX.StoragePolicy, (ask: GateWriteAsk, ante: AnteWayins) => PolicyPhrase | null>
// --
