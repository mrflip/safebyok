/** The Things and asks a vaultDB's tests share: a bank's three roots and a box under its root, and the asks that get, list and write them. */

import { type Lifepath, type Lifetok, Labelpath, Lifeseq } from '../../src/shapes/primitives'
import {
  type BankRecord, type BoxRecord, type BoxSparse, type GateRecord, type ThingCited, type ThingRecord,
  Shell, ThingFormat,
} from '../../src/shapes/shapes-thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
import { BaseThing } from '../../src/models/base-thing'
import { type SeenThing, type VaultEvent, type VaultItemEvent, VaultDBSourcelabel } from '../../src/shapes/shapes-vault-event'
import { SX } from 'safebyok-big/internals'
import { VacantAgerank, itemSeenOf, readTcNow } from '../../src/storage/agerank'
import { PlainThing } from './plain-thing'
import { WayinChecks } from '../../src/shapes/shapes-wayin'
import { type BirthBankAsk, type CitedOf, type GetAsk, type GetWorldAsk, type ListAsk, type PutAskDraft, type Track, type WriteAsk, VoidTrack, delAskOf, getAskOf, listAskOf, putAskOf } from '../../src/shapes/shapes-asks'
import { FirstLifetok, FirstRevtok, T0, revtokOf } from './models-world'

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

const FakeCiphered = Object.freeze({ cipher_iv_b64: 'aXY', ciphertext_b64: 'Y3Q' })

/** The main gate's passphrase wayin, its ciphertext fake. */
export const MainWayin = WayinChecks.passphraseWayinRecord.parse({
  wayinkind: 'passphrase', label: 'main', key_deriver_label: 'test', salt_b64: 'c2FsdHNhbHRzYWx0c2FsdA', device_tok: '00000000-0000-4000-8000-0000000000d1', born_at: T0, bank_key_wayin_wrapped: FakeCiphered,
})
/** The main gate's passkey wayin, its ciphertext fake. */
export const Passkey0Wayin = WayinChecks.passkeyWayinRecord.parse({
  wayinkind: 'passkey', label: 'passkey0', credential_id: 'cred1', prf_salt_b64: 'A'.repeat(43), device_tok: '00000000-0000-4000-8000-0000000000d1', born_at: T0, bank_key_wayin_wrapped: FakeCiphered,
})
/** Another passphrase wayin, as `replacePassphrase` puts. */
export const OtherMainWayin = WayinChecks.passphraseWayinRecord.parse({ ...MainWayin, salt_b64: 'b3RoZXJzYWx0b3RoZXJzYQ' })

/** The main gate's wayins: its passphrase wayin alone, its ciphertext fake. */
export const MainOnly = Object.freeze({ main: MainWayin, passkey0: null })
/** The main gate's wayins with a passkey wayin beside its passphrase wayin. */
export const WithPasskey = Object.freeze({ main: MainWayin, passkey0: Passkey0Wayin })
/** A sealed whisper with fake ciphertext: the concrete adapter checks only its shape. */
export const FakeSealed = Object.freeze({ key_wrapped: FakeCiphered, ciphered: FakeCiphered, codectag: 'json_v1', schematag: 'test_v1' })

/** Life 0's lifeseq, which is also a root's lifepath in its first life. */
export const Life0 = Lifeseq.ofLifenum(0)

/** The fields every Thing here starts from: revision 0 of life 0, born and written at {@link T0}. */
const FirstRevision = { am: 'a', revtok: FirstRevtok, revseq: 0, lifeseq: Life0, born_at: T0, written_at: T0 } as const

/** What a track reads of a record, of any life. */
export type TrackedRecord = Pick<ThingRecord, 'revseq' | 'lifepath'>

/** The track of the bank, main gate and root box `bank`, `gate` and `box`: their revseq and lifepath. */
export function trackOf(bank: TrackedRecord = bankThingOf(), gate: TrackedRecord = gateThingOf(), box: TrackedRecord = rootBoxOf()): Track {
  return {
    bank: { revseq: bank.revseq, lifepath: bank.lifepath },
    gate: { revseq: gate.revseq, lifepath: gate.lifepath },
    box:  { revseq: box.revseq,  lifepath: box.lifepath },
  }
}

/** The bank Thing at revision 0 of life 0, with `overrides` laid over it. */
export function bankThingOf(overrides: Partial<BankRecord> = {}): BankRecord {
  return { ...BankScope, label: 'bank', fmt: ThingFormat, lifetok: FirstLifetok, ...FirstRevision, lifepath: Life0, ...overrides }
}

/** The main gate at revision 0 of life 0, with `overrides` laid over it. */
export function gateThingOf(overrides: Partial<GateRecord> = {}): GateRecord {
  return {
    ...GateScope, label: 'gate', fmt: ThingFormat, ...FirstRevision, lifepath: Life0,
    wayins: MainOnly, auth: {}, sigs: {}, meta: {}, ...overrides,
  }
}

/** The root box at revision 0 of life 0, with `overrides` laid over it. */
export function rootBoxOf(overrides: Partial<BoxRecord> = {}): BoxRecord {
  return { ...RootScope, label: 'box', fmt: ThingFormat, ...FirstRevision, lifepath: Life0, sidecar: {}, whisper_sealed: FakeSealed, ...overrides }
}

/** A live box at revision 0 of life 0, one `label` under the root box's life 0, with `overrides` laid over it. */
export function boxThingOf(label = 'openai', overrides: Partial<BoxRecord> = {}): BoxRecord {
  return {
    ...ThingBank, labelpath: `box/${label}`, label, fmt: ThingFormat, ...FirstRevision, lifepath: `${Life0}/${Life0}`,
    sidecar: {}, whisper_sealed: FakeSealed, ...overrides,
  }
}

/** The sparse form of the live box `box`, as a listing carries it: its Thing fields, checked as a box's sparse form. */
export function boxSparseOf(box: BoxRecord): BoxSparse { return BoxChecks.sparse.parse(BaseThing.sparseOf(box)) }

/** The revision after `prior`, written a millisecond later, with `overrides` laid over it. */
export function nextOf<RecordT extends ThingRecord>(prior: RecordT, overrides: Partial<RecordT> = {}): RecordT {
  return { ...prior, revtok: revtokOf(String(prior.revseq + 1)), revseq: prior.revseq + 1, written_at: prior.written_at + 1, ...overrides }
}

/** The revision of the main gate after `prior`: see {@link nextOf}. */
export function nextGateOf(prior: GateRecord, overrides: Partial<GateRecord> = {}): GateRecord { return nextOf(prior, overrides) }

/** `lifepath` with its own lifeseq moved on by `lives`. */
export function lifepathPlus(lifepath: Lifepath, lives: number): Lifepath {
  const leading = lifepath.slice(0, lifepath.lastIndexOf('/') + 1)
  return `${leading}${Lifeseq.ofLifenum(Lifeseq.lifenumOf(Lifeseq.ofLifepath(lifepath)) + lives)}`
}

/** The tombstone of the live box `prior`: its next revision, in its next life, sealing an empty whisper, with the sidecar `{}`. */
export function boxTombOf(prior: BoxRecord, overrides: Partial<BoxRecord> = {}): BoxRecord {
  const next     = nextOf(prior)
  const lifepath = lifepathPlus(prior.lifepath, 1)
  return { ...next, am: 'x', lifepath, lifeseq: Lifeseq.ofLifepath(lifepath), sidecar: {}, ...overrides }
}

/** The box reborn over the tombstone `prior`: its next revision, in its next life, born when it is written. */
export function boxRebornOf(prior: BoxRecord, overrides: Partial<BoxRecord> = {}): BoxRecord {
  const next     = nextOf(prior)
  const lifepath = lifepathPlus(prior.lifepath, 1)
  return { ...next, am: 'a', lifepath, lifeseq: Lifeseq.ofLifepath(lifepath), born_at: next.written_at, sidecar: {}, ...overrides }
}

/** What a test's ask has of its bank by default: no root known stored, and the bank's first lifetok. */
export const SenderKnows = Object.freeze({ track: VoidTrack, banktok: FirstLifetok })

/** The ask that births `record` (the main gate by default) over the shell it `cited` (a root's by default). */
export function birthAskOf(record: ThingRecord = gateThingOf(), cited: ThingCited = Shell.Cited): WriteAsk {
  return putAskOf({ cited, record, ifPresent: 'fail', ...SenderKnows })
}

/** The ask that puts `record` over the live Thing it `cited`, under the storage policies of `options`. */
export function replaceAskOf<RecordT extends ThingRecord>(cited: CitedOf<RecordT>, record: RecordT, options?: PutAskDraft['options']): WriteAsk<RecordT> {
  return putAskOf({ cited, record, ifAbsent: 'fail', ...(options && { options }), ...SenderKnows })
}

/** The ask that deletes the Thing it `cited` with the tombstone `record`. */
export function delAskFor(cited: ThingCited, record: ThingRecord): WriteAsk { return delAskOf({ cited, record, ...SenderKnows }) }

/** The ask that gets the main gate, answering null for none under `'nil'`. */
export function getGateAskOf(ifAbsent: GetAsk['ifAbsent'] = 'nil'): GetAsk { return getAskAt('gate', ifAbsent) }

/** The ask that gets the Thing at `labelpath` in {@link ThingBank}. */
export function getAskAt(labelpath: Labelpath, ifAbsent: GetAsk['ifAbsent'] = 'nil'): GetAsk { return getAskOf({ ...ThingBank, labelpath, ifAbsent, ...SenderKnows }) }

/** The ask that lists the children of the Thing at `labelpath` in {@link ThingBank}. */
export function listAskAt(labelpath: Labelpath): ListAsk { return listAskOf({ ...ThingBank, labelpath, ...SenderKnows }) }

/** The ask that births {@link ThingBank} with its three roots, each at revision 0 of life 0, with `overrides` laid over it. */
export function birthBankAskOf(overrides: Partial<BirthBankAsk> = {}): BirthBankAsk {
  return { ...ThingBank, op: 'birth', bank: bankThingOf(), gate: gateThingOf(), root: rootBoxOf(), ...SenderKnows, ...overrides }
}

/** The ask that gets {@link ThingBank}'s three roots, with `overrides` laid over it. */
export function getWorldAskOf(overrides: Partial<GetWorldAsk> = {}): GetWorldAsk {
  return { ...ThingBank, op: 'getworld', ...SenderKnows, ...overrides }
}

/** The track of a sender with the main gate of another life. */
export const GateStaleTrack = trackOf(bankThingOf(), gateThingOf({ lifepath: Lifeseq.ofLifenum(2) }))
/** The track of a sender with the bank at another revision. */
export const BankStaleTrack = trackOf(bankThingOf({ revseq: 3 }), gateThingOf())
/** The track of a sender with the root box at another revision. */
export const RootStaleTrack = trackOf(bankThingOf(), gateThingOf(), rootBoxOf({ revseq: 3 }))

/** A UUID version 7, the shape of every `read_tc`. */
export const ReadTcPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** What {@link maskedReadTcsOf} puts in place of each `read_tc`, as an expected notice carries it. */
export const AnyReadTc = '(any read_tc)'

/** `events`, each with its `read_tc` read as {@link AnyReadTc} where it is a UUID version 7, to compare with expected notices. */
export function maskedReadTcsOf(events: readonly VaultEvent[]): VaultEvent[] {
  return events.map((event) => (ReadTcPattern.test(event.read_tc) ? { ...event, read_tc: AnyReadTc } : event))
}

/** The Thing a test's VaultMinder keeps at each labelpath: a plain one, as a device's is. */
export function makePlainThing(seen: SeenThing): PlainThing { return PlainThing.make(seen) }

/** The `item` notice a vaultDB's raw watch gets for `record`, at the liveness its record has, with the vacant agerank, at {@link AnyReadTc}, and with the void lifetok unless given another. */
export function itemEventOf(record: SeenThing, banktok: Lifetok = SX.VoidLifeTok): VaultItemEvent {
  const { userid, banklabel, labelpath } = record
  const unsorted = { agerank: VacantAgerank, agerankWas: VacantAgerank, banktok, sourcelabel: VaultDBSourcelabel, read_tc: AnyReadTc }
  return { eventkind: 'item', userid, banklabel, labelpath, modelkind: Labelpath.modelkindOf(labelpath), ...unsorted, ...itemSeenOf(record) }
}

// itemEventOf types its record as of any kind; a Thing of one kind receives only events of its own.
/** The `item` event a VaultMinder hands the Thing of `record` to receive, read now, typed as of `record`'s kind. */
export function thingEventOf<RecordT extends ThingRecord>(record: SeenThing<RecordT>): VaultItemEvent<RecordT> {
  return { ...itemEventOf(record), read_tc: readTcNow() } as VaultItemEvent<RecordT>
}
