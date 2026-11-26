/** The storage policies a write names, each refusing it unless the gate it replaces allows it. */

import { isEqual, omit } from 'es-toolkit'
import type { EX } from 'safebyok-big/internals'
import type { GateWriteAsk } from '../shapes/shapes-asks'
import type { AnteWayins, PolicyTag } from '../shapes/shapes-manifest'

// == [Policies]: GatePolicies

// Each judges a write that replaces the live gate. Each line is one row of its policy's table in notes/storage-policies.md,
// in the same order.

/** The storage policies, each a check of a gate write ask against the wayins of the live gate it replaces. Each returns the {@link PolicyTag} of its refusal, or null to allow the write. */
export const GatePolicies = {
  /** The record replaces the passphrase wayin the gating proved against, and nothing else. */
  replace_passphrase({ cited, record }: GateWriteAsk, ante: AnteWayins): PolicyTag | null {
    if (! isEqual(cited.wayins?.main, ante['main']))                     { return 'ProvedWayinMoved' }
    if (! isEqual(omit(record.wayins, ['main']), omit(ante, ['main'])))  { return 'OtherWayinMoved' }
    return null
  },
  /** The record adds a passkey wayin to a gate that has none, and changes nothing else. */
  add_passkey({ record }: GateWriteAsk, ante: AnteWayins): PolicyTag | null {
    if (ante['passkey0'] !== null)                                              { return 'PasskeyStored' }
    if (record.wayins.passkey0 === null)                                        { return 'PasskeyNotAdded' }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(ante, ['passkey0']))) { return 'OtherWayinMoved' }
    return null
  },
  /** The record removes the gate's passkey wayin, and changes nothing else. */
  revoke_passkey({ record }: GateWriteAsk, ante: AnteWayins): PolicyTag | null {
    if (ante['passkey0'] === null)                                              { return 'NoPasskeyStored' }
    if (record.wayins.passkey0 !== null)                                        { return 'PasskeyNotRevoked' }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(ante, ['passkey0']))) { return 'OtherWayinMoved' }
    return null
  },
} as const satisfies Record<EX.StoragePolicy, (ask: GateWriteAsk, ante: AnteWayins) => PolicyTag | null>
// --
