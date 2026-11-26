import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import * as Phrases from '../../src/phrases'
import type { GetThingAnswer, WriteThingAnswer } from '../../src/shapes/shapes-answers'
import type { GetAsk, WriteAsk } from '../../src/shapes/shapes-asks'
import type { GetManifest, ScribedGetManifest, ScribedWriteManifest, WriteManifest } from '../../src/shapes/shapes-manifest'
import { checkGetObservations, checkWriteObservations, getAnswerOf, scribeGetAct, scribeWriteAct, writeAnswerOf } from '../../src/storage/manifest-acts'
import { getTagsOf, writeTagsOf } from '../../src/storage/manifest-tags'
import { demandGetConsistency, demandWriteConsistency } from '../../src/storage/three-way'
import { readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** What every manifest here carries beside its tags and rows: the void banktok, each root the same as tracked, and a read_tc made now. */
function besideOf() { return { banktok: SX.VoidLifeTok, tracked: { bank: 'same', gate: 'same', box: 'same' }, read_tc: readTcNow() } }

/** A sound write's manifest and answer: `ask` over the `ante` row, written or not, checked, scribed and answered. `doctor` changes the manifest before the answer is made. */
function wroteOf(ask: WriteAsk, ante: unknown, written: boolean, doctor: (manifest: WriteManifest) => void = () => undefined): { manifest: ScribedWriteManifest, answer: WriteThingAnswer } {
  const manifest: WriteManifest = { tags: writeTagsOf(ask, ante, written), actual: written ? structuredClone(ask.record) : ante, ancestor: null, ...besideOf() }
  doctor(manifest)
  checkWriteObservations(ask, manifest)
  scribeWriteAct(ask, manifest)
  return { manifest, answer: writeAnswerOf(ask, manifest) }
}

/** A sound get's manifest and answer over the `actual` row, checked, scribed and answered. `doctor` changes the manifest before the answer is made. */
function gotOf(ask: GetAsk, actual: unknown, doctor: (manifest: GetManifest) => void = () => undefined): { manifest: ScribedGetManifest, answer: GetThingAnswer } {
  const manifest: GetManifest = { tags: getTagsOf(actual), actual, ancestor: null, ...besideOf() }
  doctor(manifest)
  checkGetObservations(ask, manifest)
  scribeGetAct(ask, manifest)
  return { manifest, answer: getAnswerOf(ask, manifest) }
}

const Gate      = TH.gateThingOf()
const OtherGate = TH.gateThingOf({ revtok: TH.OtherRevtok })
const Birth     = TH.birthAskOf()
const Replace   = TH.replaceAskOf(Gate, TH.nextGateOf(Gate))
const AddOver   = { ...Replace, ifAbsent: 'add' } as const

describe("demandWriteConsistency(ask, manifest, answer)", () => {
  it("passes a sound write, written or not", () => {
    for (const [ask, ante, written] of [[Birth, null, true], [Birth, OtherGate, false], [Replace, Gate, true], [Replace, null, false]] as const) {
      const { manifest, answer } = wroteOf(ask, ante, written)
      expect(() => { demandWriteConsistency(ask, manifest, answer) }).not.to.throw()
    }
  })

  const DoctoredCases = [
    [Phrases.WrittenOfOtherAct,  Birth,   null,      true,  (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, written: false } },        'refuses a write the act finds that the datastore says it did not make'],
    [Phrases.WrittenOfOtherAct,  Birth,   OtherGate, false, (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, written: true } },         'refuses a write the datastore says it made where the act finds none'],
    [Phrases.ProposedNotWritten, Birth,   null,      true,  (manifest: WriteManifest) => { manifest.actual = { ...Birth.record, revtok: TH.OtherRevtok } }, 'refuses a written row without the proposed revtok'],
    [Phrases.TagsOfOtherRow,     Birth,   OtherGate, false, (manifest: WriteManifest) => { manifest.actual = null },                                       'refuses unwritten tags that are not those of the row handed back'],
    [Phrases.TagsOfOtherAsk,     Birth,   null,      true,  (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, policies: { add_passkey: { ok: true } } } }, 'refuses a verdict for a storage policy the ask does not name'],
    [Phrases.TagsOfOtherAsk,     AddOver, Gate,      true,  (manifest: WriteManifest) => { manifest.tags = { ...manifest.tags, revtok_cmp: 'birth', presence: 'void' } }, 'refuses a birth the datastore reports where the ask cites no shell'],
  ] as const

  for (const [message, ask, ante, written, doctor, blurb] of DoctoredCases) {
    it(blurb, () => {
      const { manifest, answer } = wroteOf(ask, ante, written, doctor)
      const err = TH.expectSyncRefusal(() => { demandWriteConsistency(ask, manifest, answer) }, 'storage_issue')
      expect(err.message).to.eq(message)
    })
  }

  it("refuses an answer that does not copy the manifest: its record, banktok, tracked or read_tc", () => {
    const { manifest, answer } = wroteOf(Birth, null, true)
    const doctored = [{ ...answer, val: OtherGate }, { ...answer, banktok: TH.OtherLifetok }, { ...answer, tracked: { ...manifest.tracked } }, { ...answer, read_tc: readTcNow() }]
    for (const otherAnswer of doctored) {
      const err = TH.expectSyncRefusal(() => { demandWriteConsistency(Birth, manifest, otherAnswer) }, 'storage_issue')
      expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
    }
  })

  it("refuses a row at another address than asked: the actual row, or a root in tracked", () => {
    const elsewhere = TH.gateThingOf({ banklabel: 'other', revtok: TH.OtherRevtok })
    const doctors = [
      (manifest: WriteManifest) => { manifest.actual = elsewhere },
      (manifest: WriteManifest) => { manifest.tracked = { bank: 'same', gate: elsewhere, box: 'same' } },
    ]
    for (const doctor of doctors) {
      const { manifest, answer } = wroteOf(Birth, OtherGate, false, doctor)
      TH.expectSyncRefusal(() => { demandWriteConsistency(Birth, manifest, answer) }, 'storage_issue')
    }
  })
})

describe("demandGetConsistency(ask, manifest, answer)", () => {
  it("passes a sound get, of a row or of none", () => {
    for (const actual of [Gate, null]) {
      const { manifest, answer } = gotOf(TH.getGateAskOf(), actual)
      expect(() => { demandGetConsistency(TH.getGateAskOf(), manifest, answer) }).not.to.throw()
    }
  })

  it("refuses tags that are not those of the row handed back", () => {
    const { manifest, answer } = gotOf(TH.getGateAskOf(), Gate, (doctored) => { doctored.tags = { presence: 'gone' } })
    const err = TH.expectSyncRefusal(() => { demandGetConsistency(TH.getGateAskOf(), manifest, answer) }, 'storage_issue')
    expect(err.message).to.eq(Phrases.TagsOfOtherRow)
  })

  it("refuses an answer that does not copy the manifest", () => {
    const { manifest, answer } = gotOf(TH.getGateAskOf(), Gate)
    const err = TH.expectSyncRefusal(() => { demandGetConsistency(TH.getGateAskOf(), manifest, { ...answer, banktok: TH.OtherLifetok }) }, 'storage_issue')
    expect(err.message).to.eq(Phrases.AnswerOfOtherManifest)
  })

  it("refuses a row at another address than asked", () => {
    const { manifest, answer } = gotOf(TH.getGateAskOf(), TH.gateThingOf({ banklabel: 'other' }))
    TH.expectSyncRefusal(() => { demandGetConsistency(TH.getGateAskOf(), manifest, answer) }, 'storage_issue')
  })
})
