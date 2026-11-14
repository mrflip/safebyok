import { describe, expect, it } from 'vitest'
import {
  type WriteThingAsk, ShellCited, ShellLifeseq, checkedGetThingAsk, checkedWriteThingAsk, isGoneLifeseq, lifeseqOf, lifeseqOfLifepath, loggableAskOf, seqOfLifeseq,
} from '../../src/storage/shapes-thing'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'

describe("lifeseqOf(seq) and seqOfLifeseq(lifeseq)", () => {
  const LifeseqCases = [
    [0,              "0000000000",  'life 0, a birth'],
    [1,              "0000000001",  'life 1, its deletion'],
    [31,             "000000000v",  'the last one-digit life'],
    [32,             "0000000010",  'the first two-digit life'],
    [(32 ** 10) - 1, "vvvvvvvvvv",  'the last life ten digits hold'],
  ] as const

  for (const [seq, lifeseq, blurb] of LifeseqCases) {
    it(blurb, () => {
      expect(lifeseqOf(seq)).to.eq(lifeseq)
      expect(seqOfLifeseq(lifeseq)).to.eq(seq)
    })
  }

  it("sorts lifeseqs as their lives", () => {
    const seqs = [33, 2, 1024, 31, 0, 32]
    const sorted = seqs.map((seq) => lifeseqOf(seq)).toSorted((aa, bb) => aa.localeCompare(bb))
    expect(sorted.map((lifeseq) => seqOfLifeseq(lifeseq))).to.deep.equal(seqs.toSorted((aa, bb) => aa - bb))
  })

  it("reads the shell's lifeseq as life -1", () => { expect(seqOfLifeseq(ShellLifeseq)).to.eq(-1) })
})

describe("lifeseqOfLifepath(lifepath)", () => {
  it("is the last lifeseq of the lifepath", () => {
    expect(lifeseqOfLifepath(`/${lifeseqOf(3)}`)).to.eq(lifeseqOf(3))
    expect(lifeseqOfLifepath(`/${lifeseqOf(3)}/${lifeseqOf(4)}`)).to.eq(lifeseqOf(4))
    expect(lifeseqOfLifepath(ShellCited.lifepath)).to.eq(ShellLifeseq)
  })
})

describe("isGoneLifeseq(lifeseq)", () => {
  it("holds of odd lives, the shell's among them", () => {
    expect([ShellLifeseq, lifeseqOf(0), lifeseqOf(1), lifeseqOf(32), lifeseqOf(33)].map((lifeseq) => isGoneLifeseq(lifeseq))).to.deep.equal([true, false, true, false, true])
  })
})

describe("checkedGetThingAsk(ask)", () => {
  it("takes an ask for the main gate", () => { expect(checkedGetThingAsk(TH.getGateAskOf())).to.deep.equal(TH.getGateAskOf()) })

  const BadGetCases = [
    [{ ...TH.getGateAskOf(), labelpath: 'bank/main' },   'a kind not stored yet'],
    [{ ...TH.getGateAskOf(), labelpath: 'gate' },        'a labelpath with no label'],
    [{ ...TH.getGateAskOf(), labelpath: 'vault/main' },  'a labelpath of no kind of Thing'],
    [{ ...TH.getGateAskOf(), labelpath: 'gate/Main!' },  'a labelpath whose label is not one'],
    [{ ...TH.getGateAskOf(), ifAbsent: 'add' },          'a write flag'],
    [{ ...TH.getGateAskOf(), extra: 1 },                 'a field it does not take'],
  ] as const

  for (const [ask, blurb] of BadGetCases) {
    it(`refuses ${blurb}`, () => { TH.expectSyncRefusal(() => checkedGetThingAsk(ask), 'bad_option') })
  }
})

describe("checkedWriteThingAsk(ask)", () => {
  const stored = TH.gateThingOf()
  const next   = TH.nextGateOf(stored)
  const good   = TH.replaceAskOf(stored, next)

  it("takes a birth and a replacement", () => {
    expect(checkedWriteThingAsk(TH.birthAskOf())).to.deep.equal(TH.birthAskOf())
    expect(checkedWriteThingAsk(good)).to.deep.equal(good)
  })

  const lifeseq1 = lifeseqOf(1)
  const lifeseq2 = lifeseqOf(2)
  const noTestimony = { revtok: stored.revtok, revseq: 0, am: 'a' as const, lifepath: stored.lifepath }
  const BadRecordCases: readonly (readonly [WriteThingAsk, string, string])[] = [
    // the record does not follow the one cited:
    [{ ...good, record: { ...next, revseq: 2 } },                                    Phrases.RevseqNotNext,      'a revseq that skips one'],
    [{ ...good, record: { ...next, revtok: stored.revtok } },                        Phrases.RevtokNotNew,       'a revtok that is not new'],
    [TH.birthAskOf(TH.gateThingOf({ revtok: ShellCited.revtok })),                    Phrases.RevtokNotNew,       'the void revtok'],
    [{ ...good, record: { ...next, lifeseq: lifeseq2, lifepath: `/${lifeseq2}` } },  Phrases.LifeseqNotNext,     'a new life where am stays'],
    [TH.birthAskOf(TH.gateThingOf({ born_at: TH.T0 - 1 })),                          Phrases.BornAtNotNow,       'a birth born before it is written'],
    [{ ...good, record: { ...next, banklabel: 'other' } },                           Phrases.RecordOfOtherScope, 'a record at another scope'],
    [{ ...good, cited: noTestimony, options: { policies: ['replace_passphrase'] } }, Phrases.TestimonyMissing, 'replace_passphrase without the wayins it reads'],
    // the record is not a sound Thing:
    [{ ...good, record: { ...next, am: 'x', lifeseq: lifeseq1, lifepath: `/${lifeseq1}` } }, Phrases.MainGateDeleted, 'a tombstone of the main gate'],
    [{ ...good, record: { ...next, lifeseq: lifeseq1, lifepath: `/${lifeseq1}` } },          Phrases.LifeseqParity,   'an odd lifeseq on a live gate'],
    [{ ...good, record: { ...next, lifepath: `/${lifeseqOf(0)}/${lifeseqOf(0)}` } },        Phrases.LifepathNotOwn,  'a lifepath below depth 1'],
    [{ ...good, record: { ...next, lifeseq: '000000000w' } },                        Phrases.LifeseqShape,       'a lifeseq digit past v'],
    [{ ...good, record: { ...next, wayins: {} } } as never,                         'wayins.main',              'a gate with no passphrase wayin'],
    // the citation is not a sound one:
    [{ ...good, cited: { ...ShellCited, revtok: 'rev-0' } },                          Phrases.CitedHalfShell,     'a citation half the shell'],
    [{ ...good, cited: { revtok: 'rev-0', revseq: 0 } } as never,                   'lifepath',                 'a citation of too little'],
    [{ ...good, cited: { ...noTestimony, am: 'x' } },                                Phrases.LifeseqParity,      'a citation whose am its lifepath belies'],
    [{ ...good, cited: { ...noTestimony, lifepath: `${stored.lifepath}${stored.lifepath}` } }, Phrases.LifepathNotOwn, 'a citation below depth 1'],
    [{ ...good, cited: { ...stored, wayins: {} } } as never,                        'wayins.main',              'a cited gate whose wayins fail'],
  ]

  for (const [ask, said, blurb] of BadRecordCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => checkedWriteThingAsk(ask), 'bad_record')
      expect(err.message).to.include(said)
    })
  }

  // A tombstone over a tombstone cannot be asked yet: the main gate is never deleted, and it is the only Thing stored.

  it("refuses an ask of a kind not stored yet", () => {
    TH.expectSyncRefusal(() => checkedWriteThingAsk({ ...good, labelpath: 'box/main/openai' }), 'bad_option')
  })
})

describe("loggableAskOf(ask)", () => {
  it("keeps the scope, the flags and what each record cites, and drops a gate's wayins", () => {
    const loggable = loggableAskOf(TH.birthAskOf())
    expect(loggable).to.deep.include({ op: 'write', ...TH.GateScope, ifAbsent: 'add', ifPresent: 'fail' })
    expect(loggable.record).to.deep.equal({ revtok: 'rev-0', revseq: 0, am: 'a', lifepath: `/${lifeseqOf(0)}` })
    expect(JSON.stringify(loggable)).to.not.include(TH.BW.mainWayin.salt_b64)
  })

  it("gives nothing for an ask that will not parse", () => {
    expect(loggableAskOf(null)).to.deep.equal({})
    expect(loggableAskOf({ userid: 42 })).to.deep.equal({})
  })
})
