/** The Things and asks a vaultDB's tests share: a bank's three roots and a box under its root, and the asks that get, list and write them. */

import { BW } from 'safebyok-big/testing'
import {
  type BankThing, type BirthBankAsk, type BoxThing, type CitedOf, type GateThing, type GetThingAsk, type ListThingsAsk, type PutAskArgs, type Thing,
  type ThingCited, type WriteAskOf, type WriteThingAsk,
  BankThingFormat, BoxThingFormat, GateThingFormat, ShellCited, delAskOf, getAskOf, lifeseqOf, lifeseqOfLifepath, listAskOf, putAskOf, seqOfLifeseq,
} from '../../src/storage/shapes-thing'
import { T0 } from './models-world'

/** The bank the Things stand in. */
export const ThingBank = Object.freeze({ userid: 'u1', banklabel: 'acme' })
/** The scope of the bank's bank Thing. */
export const BankScope = Object.freeze({ ...ThingBank, labelpath: 'bank' })
/** The scope of the bank's main gate. */
export const GateScope = Object.freeze({ ...ThingBank, labelpath: 'gate' })
/** The scope of the bank's root box. */
export const RootScope = Object.freeze({ ...ThingBank, labelpath: 'box' })
/** The scope of a box one label under the root box. */
export const BoxScope  = Object.freeze({ ...ThingBank, labelpath: 'box/openai' })

/** The main gate's wayins: its passphrase wayin alone, its ciphertext fake. */
export const MainOnly = Object.freeze({ main: BW.mainWayin, passkey0: null })
/** The main gate's wayins with a passkey wayin beside its passphrase wayin. */
export const WithPasskey = Object.freeze({ main: BW.mainWayin, passkey0: BW.passkey0Wayin })

const FakeCiphered = Object.freeze({ cipher_iv_b64: 'aXY', ciphertext_b64: 'Y3Q' })
/** A sealed whisper with fake ciphertext: the store checks only its shape. */
export const FakeSealed = Object.freeze({ key_wrapped: FakeCiphered, ciphered: FakeCiphered, codectag: 'json_v1', schematag: 'test_v1' })

/** Life 0's lifeseq, which is also a root's lifepath in its first life. */
export const Life0 = lifeseqOf(0)

/** The fields every Thing here starts from: revision 0 of life 0, born and written at {@link T0}. */
const FirstRevision = { am: 'a', revtok: 'rev-0', revseq: 0, lifeseq: Life0, born_at: T0, written_at: T0 } as const

/** The bank Thing at revision 0 of life 0, with `overrides` laid over it. */
export function bankThingOf(overrides: Partial<BankThing> = {}): BankThing {
  return { ...BankScope, label: 'bank', fmt: BankThingFormat, ...FirstRevision, lifepath: Life0, ...overrides }
}

/** The main gate at revision 0 of life 0, with `overrides` laid over it. */
export function gateThingOf(overrides: Partial<GateThing> = {}): GateThing {
  return {
    ...GateScope, label: 'gate', fmt: GateThingFormat, ...FirstRevision, lifepath: Life0,
    wayins: MainOnly, auth: {}, sigs: {}, meta: {}, ...overrides,
  }
}

/** The root box at revision 0 of life 0, with `overrides` laid over it. */
export function rootBoxOf(overrides: Partial<BoxThing> = {}): BoxThing {
  return { ...RootScope, label: 'box', fmt: BoxThingFormat, ...FirstRevision, lifepath: Life0, sidecar: {}, whisper_sealed: FakeSealed, ...overrides }
}

/** A live box at revision 0 of life 0, one `label` under the root box's life 0, with `overrides` laid over it. */
export function boxThingOf(label = 'openai', overrides: Partial<BoxThing> = {}): BoxThing {
  return {
    ...ThingBank, labelpath: `box/${label}`, label, fmt: BoxThingFormat, ...FirstRevision, lifepath: `${Life0}/${Life0}`,
    sidecar: {}, whisper_sealed: FakeSealed, ...overrides,
  }
}

/** The revision after `prior`, written a millisecond later, with `overrides` laid over it. */
export function nextOf<RecordT extends Thing>(prior: RecordT, overrides: Partial<RecordT> = {}): RecordT {
  return { ...prior, revtok: `rev-${String(prior.revseq + 1)}`, revseq: prior.revseq + 1, written_at: prior.written_at + 1, ...overrides }
}

/** The revision of the main gate after `prior`: see {@link nextOf}. */
export function nextGateOf(prior: GateThing, overrides: Partial<GateThing> = {}): GateThing { return nextOf(prior, overrides) }

/** `lifepath` with its own lifeseq moved on by `lives`. */
export function lifepathPlus(lifepath: string, lives: number): string {
  const leading = lifepath.slice(0, lifepath.lastIndexOf('/') + 1)
  return `${leading}${lifeseqOf(seqOfLifeseq(lifeseqOfLifepath(lifepath)) + lives)}`
}

/** The tombstone of the live box `prior`: its next revision, in its next life, sealing an empty whisper, with no sidecar. */
export function boxTombOf(prior: BoxThing, overrides: Partial<BoxThing> = {}): BoxThing {
  const { sidecar: _sidecar, ...next } = nextOf(prior) as BoxThing & { sidecar?: unknown }
  const lifepath = lifepathPlus(prior.lifepath, 1)
  return { ...next, am: 'x', lifepath, lifeseq: lifeseqOfLifepath(lifepath), ...overrides } as BoxThing
}

/** The box reborn over the tombstone `prior`: its next revision, in its next life, born when it is written. */
export function boxRebornOf(prior: BoxThing, overrides: Partial<BoxThing> = {}): BoxThing {
  const next     = nextOf(prior)
  const lifepath = lifepathPlus(prior.lifepath, 1)
  return { ...next, am: 'a', lifepath, lifeseq: lifeseqOfLifepath(lifepath), born_at: next.written_at, sidecar: {}, ...overrides }
}

/** The ask that births `record` (the main gate by default) over the shell it `cited` (a root's by default). */
export function birthAskOf(record: Thing = gateThingOf(), cited: ThingCited = ShellCited): WriteThingAsk {
  return putAskOf({ cited, record, ifPresent: 'fail' })
}

/** The ask that puts `record` over the live Thing it `cited`, under the storage policies of `options`. */
export function replaceAskOf<RecordT extends Thing>(cited: CitedOf<RecordT>, record: RecordT, options?: PutAskArgs['options']): WriteAskOf<RecordT> {
  return putAskOf({ cited, record, ifAbsent: 'fail', ...(options && { options }) })
}

/** The ask that deletes the Thing it `cited` with the tombstone `record`. */
export function delAskFor(cited: ThingCited, record: Thing): WriteThingAsk { return delAskOf({ cited, record }) }

/** The ask that gets the main gate, answering null for none under `'nil'`. */
export function getGateAskOf(ifAbsent: GetThingAsk['ifAbsent'] = 'nil'): GetThingAsk { return getAskAt('gate', ifAbsent) }

/** The ask that gets the Thing at `labelpath` in {@link ThingBank}. */
export function getAskAt(labelpath: string, ifAbsent: GetThingAsk['ifAbsent'] = 'nil'): GetThingAsk { return getAskOf({ ...ThingBank, labelpath, ifAbsent }) }

/** The ask that lists the children of the Thing at `labelpath` in {@link ThingBank}. */
export function listAskAt(labelpath: string, ifAbsent: ListThingsAsk['ifAbsent'] = 'fail'): ListThingsAsk { return listAskOf({ ...ThingBank, labelpath, ifAbsent }) }

/** The ask that births {@link ThingBank} with its three roots, each at revision 0 of life 0, with `overrides` laid over it. */
export function birthBankAskOf(overrides: Partial<BirthBankAsk> = {}): BirthBankAsk {
  return { ...ThingBank, op: 'birth', bank: bankThingOf(), gate: gateThingOf(), root: rootBoxOf(), ...overrides }
}
