/** The Things and asks a vaultDB's tests share: the main gate at a revision, and the asks that get it and write over it. */

import { BW } from 'safebyok-big/testing'
import { type GateExpected, type GateThing, type GetThingAsk, type WriteThingAsk, GateThingFormat, ShellMeta, lifeseqOf } from '../../src/storage/shapes-thing'
import { T0 } from './models-world'

/** The bank the Things stand in. */
export const ThingBank = Object.freeze({ userid: 'u1', banklabel: 'acme' })
/** The scope of the bank's main gate. */
export const GateScope = Object.freeze({ ...ThingBank, labelpath: 'gate/main' })

/** The main gate's wayins: its passphrase wayin alone, its ciphertext fake. */
export const MainOnly = Object.freeze({ main: BW.mainWayin })
/** The main gate's wayins with a passkey wayin beside its passphrase wayin. */
export const WithPasskey = Object.freeze({ main: BW.mainWayin, passkey0: BW.passkey0Wayin })

/** The main gate at revision 0 of life 0, born at {@link T0}, with `overrides` laid over it. */
export function gateThingOf(overrides: Partial<GateThing> = {}): GateThing {
  const lifeseq = lifeseqOf(0)
  return {
    ...GateScope, label: 'main', fmt: GateThingFormat, am: 'a', revtok: 'rev-0', revseq: 0, lifeseq, lifepath: `/${lifeseq}`,
    born_at: T0, written_at: T0, wayins: MainOnly, auth: {}, sigs: {}, meta: {}, ...overrides,
  }
}

/** The revision of the main gate after `prior`, written a millisecond later, with `overrides` laid over it. */
export function nextGateOf(prior: GateThing, overrides: Partial<GateThing> = {}): GateThing {
  return { ...prior, revtok: `rev-${String(prior.revseq + 1)}`, revseq: prior.revseq + 1, written_at: prior.written_at + 1, ...overrides }
}

/** The ask that births the main gate as `record`, over the shell. */
export function birthAskOf(record: GateThing = gateThingOf()): WriteThingAsk {
  return { op: 'write', ...GateScope, expected: ShellMeta, record, ifAbsent: 'add', ifPresent: 'fail' }
}

/** The ask that writes `record` over the main gate `expected`, under the storage `policies`. */
export function replaceAskOf(expected: GateExpected, record: GateThing, policies?: WriteThingAsk['options']): WriteThingAsk {
  return { op: 'write', ...GateScope, expected, record, ifAbsent: 'fail', ifPresent: 'repl', ...(policies && { options: policies }) }
}

/** The ask that gets the main gate, answering null for none under `'nil'`. */
export function getGateAskOf(ifAbsent: GetThingAsk['ifAbsent'] = 'nil'): GetThingAsk { return { op: 'get', ...GateScope, ifAbsent } }
