import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import * as Phrases from '../../src/phrases'
import type { BirthBankAnswer, GetThingAnswer, GetBankAnswer, ListThingsAnswer, WriteThingAnswer } from '../../src/shapes/shapes-answers'
import { type GetAsk, type WriteAsk, birthPutsOf } from '../../src/shapes/shapes-asks'
import type {
  BirthManifest, CheckedGetBankManifest, GetManifest, ListManifest, RootRows, ScribedBirthManifest, ScribedGetManifest, ScribedListManifest, ScribedWriteManifest, StatsManifest, GetBankManifest, WriteManifest,
} from '../../src/shapes/shapes-manifest'
import * as ManifestActs from '../../src/storage/manifest-acts'
import * as ManifestTags from '../../src/storage/manifest-tags'
import * as ThreeWay from '../../src/storage/three-way'
import { readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** The bank's part of every manifest here: the void banktok, each root the same as tracked, and a read_tc made now. */
function besideOf() { return { banktok: SX.VoidLifeTok, tracked: { gate: 'same', root: 'same' }, read_tc: readTcNow() } }

/** A sound write's manifest and answer: `ask` over the `prior` row, written or not, checked, scribed and answered. `doctor` changes the manifest before the answer is made. */
function wroteOf(ask: WriteAsk, prior: unknown, written: boolean, doctor: (manifest: WriteManifest) => void = () => undefined): { manifest: ScribedWriteManifest, answer: WriteThingAnswer } {
  const manifest: WriteManifest = { tags: ManifestTags.writeTagsOf(ask, prior, written), actual: written ? structuredClone(ask.record) : prior, ancestor: null, ...besideOf() }
  doctor(manifest)
  ManifestActs.checkWriteObservations(ask, manifest)
  ManifestActs.scribeWriteAct(ask, manifest)
  return { manifest, answer: ManifestActs.writeAnswerOf(ask, manifest) }
}

/** A sound get's manifest and answer over the `actual` row, checked, scribed and answered. `doctor` changes the manifest before the answer is made. */
function gotOf(ask: GetAsk, actual: unknown, doctor: (manifest: GetManifest) => void = () => undefined): { manifest: ScribedGetManifest, answer: GetThingAnswer } {
  const manifest: GetManifest = { tags: ManifestTags.getTagsOf(actual), actual, ancestor: null, ...besideOf() }
  doctor(manifest)
  ManifestActs.checkGetObservations(ask, manifest)
  ManifestActs.scribeGetAct(ask, manifest)
  return { manifest, answer: ManifestActs.getAnswerOf(ask, manifest) }
}

/** A sound listing's manifest and answer under the `parent` row, with `children`. `doctor` changes the manifest before the answer is made. */
function listedOf(parent: unknown, children: readonly { labelpath: string }[], doctor: (manifest: ListManifest) => void = () => undefined): { manifest: ScribedListManifest, answer: ListThingsAnswer } {
  const manifest: ListManifest = { tags: ManifestTags.getTagsOf(parent), actual: parent, children: children.map((child) => ({ labelpath: child.labelpath, raw: child })), ...besideOf() }
  doctor(manifest)
  ManifestActs.checkListObservations(ListBox, manifest)
  ManifestActs.scribeListAct(ListBox, manifest)
  return { manifest, answer: ManifestActs.listAnswerOf(ListBox, manifest) }
}

/** A sound birth's manifest and answer over the `prior` roots, written or not. `doctor` changes the manifest before the answer is made. */
function bornOf(prior: RootRows, written: boolean, doctor: (manifest: BirthManifest) => void = () => undefined): { manifest: ScribedBirthManifest, answer: BirthBankAnswer } {
  const actual = written ? { gate: BirthBank.gate, root: BirthBank.root } : prior
  const manifest: BirthManifest = { tags: ManifestTags.birthTagsOf(birthPutsOf(BirthBank), prior, written), actual: structuredClone(actual), ...besideOf() }
  doctor(manifest)
  ManifestActs.checkBirthObservations(BirthBank, manifest)
  ManifestActs.scribeBirthAct(BirthBank, manifest)
  return { manifest, answer: ManifestActs.birthAnswerOf(BirthBank, manifest) }
}

/** A sound get of the bank's manifest and answer over the `roots`. */
function getBankOf(roots: RootRows): { manifest: CheckedGetBankManifest, answer: GetBankAnswer } {
  const manifest: GetBankManifest = { actual: roots, ...besideOf() }
  ManifestActs.checkGetBankObservations(TH.getBankAskOf(), manifest)
  return { manifest, answer: ManifestActs.getBankAnswerOf(TH.getBankAskOf(), manifest) }
}

const ListBox   = TH.listAskAt('box', 'box')
const BirthBank = TH.birthBankAskOf()
const NoRoots   = { gate: null, root: null }
/** A root box stored by another birth, without its gate: a birth over it is stale. */
const OtherRoot = TH.rootBoxOf({ revtok: TH.OtherRevtok })
const Gate      = TH.gateThingOf()
const OtherGate = TH.gateThingOf({ revtok: TH.OtherRevtok })
const Birth     = TH.birthAskOf()
const Replace   = TH.replaceAskOf(Gate, TH.nextGateOf(Gate))
const AddOver   = { ...Replace, ifAbsent: 'add' } as const
const Root        = TH.rootBoxOf()
const RootReplace = TH.replaceAskOf(Root, TH.nextOf(Root))

describe("ThreeWay.demandWriteConsistency(ask, manifest, answer)", () => {
  it("passes a sound write, written or not", () => {
    for (const [ask, prior, written] of [[Birth, null, true], [Birth, OtherGate, false], [Replace, Gate, true], [Replace, null, false]] as const) {
      const { manifest, answer } = wroteOf(ask, prior, written)
      expect(() => { ThreeWay.demandWriteConsistency(ask, manifest, answer) }).not.to.throw()
    }
  })

  const DoctoredCases = [
    [Phrases.WrittenOfOtherAct,  Birth,   null,      true,  (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, written: false } },        'refuses a write the act finds that the datastore says it did not make'],
    [Phrases.WrittenOfOtherAct,  Birth,   OtherGate, false, (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, written: true } },         'refuses a write the datastore says it made where the act finds none'],
    [Phrases.ProposedNotWritten, Birth,   null,      true,  (manifest: WriteManifest) => { manifest.actual = { ...Birth.record, revtok: TH.OtherRevtok } }, 'refuses a written row without the proposed revtok'],
    [Phrases.TagsOfOtherRow,     Birth,   OtherGate, false, (manifest: WriteManifest) => { manifest.actual = null },                                       'refuses unwritten tags that are not those of the row handed back'],
    [Phrases.TagsOfOtherAsk,     Birth,   null,      true,  (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, policies: { add_passkey: { ok: true } } } }, 'refuses a verdict for a storage policy the ask does not name'],
    [Phrases.TagsOfOtherAsk,     AddOver, Gate,      true,  (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, revtok_cmp: 'birth', presence: 'void' } }, 'refuses a birth the datastore reports where the ask cites no shell'],
    [Phrases.TagsOfOtherAsk,     Replace, Gate,      true,  (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, revtok_cmp: 'birth' } },                      'refuses written tags that are not those of a write the ask lets through: a birth over a live row'],
    [Phrases.TagsOfOtherAsk,     RootReplace, Root, true, (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, banktok_cmp: 'same' } },                     'refuses written tags that are not those of a write the ask lets through: a box\'s banktok judged'],
  ] as const

  for (const [message, ask, prior, written, doctor, blurb] of DoctoredCases) {
    it(blurb, () => {
      const { manifest, answer } = wroteOf(ask, prior, written, doctor)
      const err = TH.expectSyncRefusal(() => { ThreeWay.demandWriteConsistency(ask, manifest, answer) }, 'storage_issue')
      expect(err.message).to.eq(message)
    })
  }

  it("refuses an answer that does not copy the manifest: its record, banktok, tracked or read_tc", () => {
    const { manifest, answer } = wroteOf(Birth, null, true)
    const doctored = [{ ...answer, val: OtherGate }, { ...answer, banktok: TH.OtherBanktok }, { ...answer, tracked: { ...manifest.tracked } }, { ...answer, read_tc: readTcNow() }]
    for (const otherAnswer of doctored) {
      const err = TH.expectSyncRefusal(() => { ThreeWay.demandWriteConsistency(Birth, manifest, otherAnswer) }, 'unexpected_error')
      expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
    }
  })

  it("refuses a row at another address than asked: the actual row, or a root in tracked", () => {
    const elsewhere = TH.gateThingOf({ banklabel: 'other', labelpath: 'other', label: 'other', revtok: TH.OtherRevtok })
    const doctors = [
      (manifest: WriteManifest) => { manifest.actual = elsewhere },
      (manifest: WriteManifest) => { manifest.tracked = { gate: elsewhere, root: 'same' } },
    ]
    for (const doctor of doctors) {
      const { manifest, answer } = wroteOf(Birth, OtherGate, false, doctor)
      TH.expectSyncRefusal(() => { ThreeWay.demandWriteConsistency(Birth, manifest, answer) }, 'storage_issue')
    }
  })
})

describe("ThreeWay.demandGetConsistency(ask, manifest, answer)", () => {
  it("passes a sound get, of a row or of none", () => {
    for (const actual of [Gate, null]) {
      const { manifest, answer } = gotOf(TH.getGateAskOf(), actual)
      expect(() => { ThreeWay.demandGetConsistency(TH.getGateAskOf(), manifest, answer) }).not.to.throw()
    }
  })

  it("refuses tags that are not those of the row handed back", () => {
    const { manifest, answer } = gotOf(TH.getGateAskOf(), Gate, (doctored) => { doctored.tags = { presence: 'gone' } })
    const err = TH.expectSyncRefusal(() => { ThreeWay.demandGetConsistency(TH.getGateAskOf(), manifest, answer) }, 'storage_issue')
    expect(err.message).to.eq(Phrases.TagsOfOtherRow)
  })

  it("refuses an answer that does not copy the manifest", () => {
    const { manifest, answer } = gotOf(TH.getGateAskOf(), Gate)
    const err = TH.expectSyncRefusal(() => { ThreeWay.demandGetConsistency(TH.getGateAskOf(), manifest, { ...answer, banktok: TH.OtherBanktok }) }, 'unexpected_error')
    expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
  })

  it("refuses a row at another address than asked", () => {
    const { manifest, answer } = gotOf(TH.getGateAskOf(), TH.gateThingOf({ banklabel: 'other', labelpath: 'other', label: 'other' }))
    TH.expectSyncRefusal(() => { ThreeWay.demandGetConsistency(TH.getGateAskOf(), manifest, answer) }, 'storage_issue')
  })
})

describe("ThreeWay.demandListConsistency(ask, manifest, answer)", () => {
  it("passes a sound listing, under a live parent or none", () => {
    for (const [parent, children] of [[TH.rootBoxOf(), [TH.boxThingOf('anthropic'), TH.boxThingOf()]], [null, []]] as const) {
      const { manifest, answer } = listedOf(parent, children)
      expect(() => { ThreeWay.demandListConsistency(ListBox, manifest, answer) }).not.to.throw()
    }
  })

  it("refuses tags that are not those of the parent", () => {
    const { manifest, answer } = listedOf(TH.rootBoxOf(), [], (doctored) => { doctored.tags = { presence: 'gone' } })
    const err = TH.expectSyncRefusal(() => { ThreeWay.demandListConsistency(ListBox, manifest, answer) }, 'storage_issue')
    expect(err.message).to.eq(Phrases.TagsOfOtherRow)
  })

  it("refuses an answer that does not copy the manifest: its parent's life, or its refusal's dbhas", () => {
    const live = listedOf(TH.rootBoxOf(), [])
    const gone = listedOf(TH.boxTombOf(TH.rootBoxOf()), [])
    const doctored = [
      [live.manifest, { ...live.answer, val: { ...(live.answer.ok && live.answer.val), parentlife: TH.lifepathPlus(TH.Life0, 1) } }],
      [gone.manifest, { ...gone.answer, dbhas: TH.rootBoxOf() }],
    ] as const
    for (const [manifest, otherAnswer] of doctored) {
      const err = TH.expectSyncRefusal(() => { ThreeWay.demandListConsistency(ListBox, manifest, otherAnswer as ListThingsAnswer) }, 'unexpected_error')
      expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
    }
  })

  it("refuses a child listed more than one label under the parent", () => {
    const { manifest, answer } = listedOf(TH.rootBoxOf(), [], (doctored: ListManifest) => { doctored.children = [{ labelpath: 'box/aa/deep', raw: TH.boxThingOf('aa', { labelpath: 'box/aa/deep' }) }] })
    TH.expectSyncRefusal(() => { ThreeWay.demandListConsistency(ListBox, manifest, answer) }, 'storage_issue')
  })

  it("refuses an incompatible child listed at a labelpath no box may have", () => {
    const { manifest, answer } = listedOf(TH.rootBoxOf(), [], (doctored: ListManifest) => { doctored.children = [{ labelpath: 'box/Bad!', raw: { am: 'a' } }] })
    TH.expectSyncRefusal(() => { ThreeWay.demandListConsistency(ListBox, manifest, answer) }, 'storage_issue')
  })

  it("refuses a parent at another address than asked", () => {
    const { manifest, answer } = listedOf(TH.rootBoxOf(), [], (doctored: ListManifest) => { doctored.actual = TH.rootBoxOf({ banklabel: 'other' }) })
    TH.expectSyncRefusal(() => { ThreeWay.demandListConsistency(ListBox, manifest, answer) }, 'storage_issue')
  })
})

describe("ThreeWay.demandBirthConsistency(ask, manifest, answer)", () => {
  it("passes a sound birth, written or not", () => {
    for (const [prior, written] of [[NoRoots, true], [{ gate: OtherGate, root: OtherRoot }, false], [{ ...NoRoots, root: OtherRoot }, false]] as const) {
      const { manifest, answer } = bornOf(prior, written)
      expect(() => { ThreeWay.demandBirthConsistency(BirthBank, manifest, answer) }).not.to.throw()
    }
  })

  it("refuses a birth written without a root's proposed revision", () => {
    const { manifest, answer } = bornOf(NoRoots, true, (doctored) => { doctored.actual = { ...doctored.actual, root: TH.rootBoxOf({ revtok: TH.OtherRevtok }) } })
    const err = TH.expectSyncRefusal(() => { ThreeWay.demandBirthConsistency(BirthBank, manifest, answer) }, 'storage_issue')
    expect(err.message).to.eq(Phrases.ProposedNotWritten)
  })

  it("refuses an unwritten birth whose tags are not its roots'", () => {
    const { manifest, answer } = bornOf({ ...NoRoots, root: OtherRoot }, false, (doctored) => { doctored.actual = { ...doctored.actual, root: TH.boxTombOf(TH.rootBoxOf()) } })
    const err = TH.expectSyncRefusal(() => { ThreeWay.demandBirthConsistency(BirthBank, manifest, answer) }, 'storage_issue')
    expect(err.message).to.eq(Phrases.TagsOfOtherRow)
  })

  it("refuses an answer that does not copy the manifest: its roots, or its refusal's dbhas", () => {
    const born  = bornOf(NoRoots, true)
    const stale = bornOf({ ...NoRoots, root: OtherRoot }, false)
    const doctored = [[born.manifest, { ...born.answer, val: NoRoots }], [stale.manifest, { ...stale.answer, dbhas: Gate }]] as const
    for (const [manifest, otherAnswer] of doctored) {
      const err = TH.expectSyncRefusal(() => { ThreeWay.demandBirthConsistency(BirthBank, manifest, otherAnswer as BirthBankAnswer) }, 'unexpected_error')
      expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
    }
  })
})

describe("ThreeWay.demandGetBankConsistency(ask, manifest, answer)", () => {
  it("passes a sound get of the bank", () => {
    const { manifest, answer } = getBankOf({ ...NoRoots, gate: Gate })
    expect(() => { ThreeWay.demandGetBankConsistency(TH.getBankAskOf(), manifest, answer) }).not.to.throw()
  })

  it("refuses an answer that does not copy the manifest", () => {
    const { manifest, answer } = getBankOf({ ...NoRoots, gate: Gate })
    const err = TH.expectSyncRefusal(() => { ThreeWay.demandGetBankConsistency(TH.getBankAskOf(), manifest, { ...answer, val: { ...NoRoots, gate: OtherGate } } as unknown as GetBankAnswer) }, 'unexpected_error')
    expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
  })

  it("refuses a root at another address than asked", () => {
    const { manifest, answer } = getBankOf({ ...NoRoots, gate: TH.gateThingOf({ banklabel: 'other', labelpath: 'other', label: 'other' }) })
    TH.expectSyncRefusal(() => { ThreeWay.demandGetBankConsistency(TH.getBankAskOf(), manifest, answer) }, 'storage_issue')
  })
})

describe("ThreeWay.demandStatsConsistency(ask, manifest, answer)", () => {
  it("refuses an answer that does not copy the manifest's stats, banktok or read_tc", () => {
    const manifest: StatsManifest = { stats: { box: { count: 0, live_count: 0, size: 0 }, gate: { count: 0, live_count: 0, size: 0 }, max: { count: 100, size: 1e6 } }, ...besideOf() }
    ManifestActs.checkStatsObservations(TH.statsAskOf(), manifest)
    const answer   = ManifestActs.statsAnswerOf(TH.statsAskOf(), manifest)
    expect(() => { ThreeWay.demandStatsConsistency(TH.statsAskOf(), manifest, answer) }).not.to.throw()
    for (const otherAnswer of [{ ...answer, banktok: TH.OtherBanktok }, { ...answer, read_tc: readTcNow() }, { ...answer, val: { ...manifest.stats, max: { count: 1, size: 1 } } }]) {
      const err = TH.expectSyncRefusal(() => { ThreeWay.demandStatsConsistency(TH.statsAskOf(), manifest, otherAnswer) }, 'unexpected_error')
      expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
    }
  })
})
