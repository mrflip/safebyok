import { describe, expect, expectTypeOf, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import {
  type AnyThingRecord, type BankRecord, type BoxRecord, type GateRecord, type ThingRecord, type VoidSentinel,
  Shell, ThingFormat,
} from '../../src/shapes/shapes-thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
import { Thing } from '../../src/models/thing'
import { type Tracked, type WriteAsk, AskChecks, VoidTrack, checkedBirthBankAsk, checkedWriteAsk, delAskOf, getAskOf, listAskOf, loggableAskOf, putAskOf } from '../../src/shapes/shapes-asks'
import { Labelpath, Lifeseq } from '../../src/shapes/primitives'
import type { LiveOf, ShellOf, TombstoneOf } from '../../src/shapes/shapes-sealers'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'

const { Life0 } = TH
/** The message of a strict check on a field it does not accept, which it never names. */
const Unaccepted = 'There is a field it does not accept'

describe("Lifeseq.ofLifenum(lifenum) and Lifeseq.lifenumOf(lifeseq)", () => {
  const LifeseqCases = [
    [-1,             "-000000001",  "life -1, the shell's"],
    [0,              "0000000000",  'life 0, a birth'],
    [1,              "0000000001",  'life 1, its deletion'],
    [31,             "000000000v",  'the last one-digit life'],
    [32,             "0000000010",  'the first two-digit life'],
    [(32 ** 10) - 1, "vvvvvvvvvv",  'the last life ten digits can name'],
  ] as const

  for (const [lifenum, lifeseq, blurb] of LifeseqCases) {
    it(blurb, () => {
      expect(Lifeseq.ofLifenum(lifenum)).to.eq(lifeseq)
      expect(Lifeseq.lifenumOf(lifeseq)).to.eq(lifenum)
    })
  }

  it("sorts lifeseqs as their lives", () => {
    const lifenums = [33, 2, 1024, 31, 0, 32]
    const sorted = lifenums.map((lifenum) => Lifeseq.ofLifenum(lifenum)).toSorted((aa, bb) => aa.localeCompare(bb))
    expect(sorted.map((lifeseq) => Lifeseq.lifenumOf(lifeseq))).to.deep.equal(lifenums.toSorted((aa, bb) => aa - bb))
  })

  it("reads the shell's lifeseq, ten characters like every lifeseq, as life -1, sorting below every life's", () => {
    expect(Shell.VoidLifeseq).to.have.length(10)
    expect(Lifeseq.lifenumOf(Shell.VoidLifeseq)).to.eq(-1)
    const isFirst = Shell.VoidLifeseq < Lifeseq.ofLifenum(0)
    expect(isFirst).to.be.true
  })
})

describe("Lifeseq.ofLifepath(lifepath)", () => {
  it("is the last lifeseq of the lifepath, a root's whole lifepath", () => {
    expect(Lifeseq.ofLifepath(Lifeseq.ofLifenum(3))).to.eq(Lifeseq.ofLifenum(3))
    expect(Lifeseq.ofLifepath(`${Lifeseq.ofLifenum(3)}/${Lifeseq.ofLifenum(4)}`)).to.eq(Lifeseq.ofLifenum(4))
    expect(Lifeseq.ofLifepath(Shell.Cited.lifepath)).to.eq(Shell.VoidLifeseq)
    expect(Lifeseq.ofLifepath(Shell.childCited(Life0).lifepath)).to.eq(Shell.VoidLifeseq)
  })
})

describe("Lifeseq.isTombstone(lifeseq)", () => {
  it("is true of odd lives, the shell's among them", () => {
    expect([Shell.VoidLifeseq, Lifeseq.ofLifenum(0), Lifeseq.ofLifenum(1), Lifeseq.ofLifenum(32), Lifeseq.ofLifenum(33)].map((lifeseq) => Lifeseq.isTombstone(lifeseq))).to.deep.equal([true, false, true, false, true])
  })
})

describe("Shell.Cited and Shell.childCited(parentLifepath)", () => {
  it("cite the shell at revision -1, a root's at lifepath '-000000001', a child's at its parent's lifepath then '-000000001'", () => {
    expect(Object.isFrozen(Shell.Cited)).to.be.true
    expect(Shell.Cited).to.deep.equal({ revtok: '00000000-0000-0000-0000-000000000000', revseq: -1, lifepath: '-000000001', am: 'x' })
    expect(Shell.childCited(`${Life0}/${Lifeseq.ofLifenum(2)}`)).to.deep.equal({ ...Shell.Cited, lifepath: `${Life0}/${Lifeseq.ofLifenum(2)}/-000000001` })
  })
})

describe("Shell.of(scoped, parent?)", () => {
  const Void = { revtok: Shell.Cited.revtok, revseq: -1, am: 'x', lifeseq: Shell.VoidLifeseq, born_at: SX.VoidTime, written_at: SX.VoidTime } as const
  const rootShell = { ...TH.RootScope, label: 'box', fmt: ThingFormat, ...Void, lifepath: Shell.VoidLifeseq } as const
  const boxShell  = { ...TH.BoxScope, label: 'openai', fmt: ThingFormat, ...Void, lifepath: `${Life0}/${Shell.VoidLifeseq}` } as const

  it("is a root's shell at lifepath '-000000001', given only its scope", () => {
    expect(Shell.of(TH.RootScope)).to.deep.equal(rootShell)
    expect(Shell.of(TH.GateScope)).to.deep.include({ label: 'gate', fmt: ThingFormat, lifepath: Shell.VoidLifeseq })
    expect(Object.isFrozen(Shell.of(TH.BankScope))).to.be.true
  })

  it("is a child's shell under its parent's life, from the parent's labelpath and lifepath, or from its own lifepath", () => {
    const root = TH.rootBoxOf()
    expect(Shell.of(TH.BoxScope, root)).to.deep.equal(boxShell)
    expect(Shell.of({ ...TH.ThingBank, label: 'openai' }, { labelpath: 'box', lifepath: Life0 })).to.deep.equal(boxShell)
    expect(Shell.of({ ...TH.BoxScope, lifepath: `${Life0}/${Shell.VoidLifeseq}` })).to.deep.equal(boxShell)
  })

  it("reads only the scope, labelpath, label and lifepath of an ask or a record", () => {
    const ask = getAskOf({ ...TH.BoxScope, ...TH.SenderKnows, track: TH.trackOf() })
    expect(Shell.of(ask, TH.rootBoxOf())).to.deep.equal(boxShell)
  })

  it("gives back a shell handed to it", () => {
    expect(Shell.of(boxShell)).to.deep.equal(boxShell)
    expect(Shell.of(rootShell)).to.deep.equal(rootShell)
  })

  const BadShellCases: [() => unknown, string, string][] = [
    [() => Shell.of(TH.boxThingOf()),                                                    'revseq',                   'a live record, on its revseq'],
    [() => Shell.of(TH.boxTombOf(TH.boxThingOf())),                                      'revseq',                   'a tombstone, on its revseq'],
    [() => Shell.of({ ...boxShell, fmt: 'a010502' as never }),                           'expected "a010501"',       'a fmt that is not the Thing format'],
    [() => Shell.of(TH.BoxScope),                                                        "expected string",          'a Thing below a root given no life'],
    [() => Shell.of({ ...TH.ThingBank, label: 'openai' }),                               "expected string",      'a label with no parent'],
    [() => Shell.of({ ...TH.ThingBank, labelpath: 'gate/openai' }, TH.rootBoxOf()),      "another labelpath than",      'a labelpath not one label under its parent'],
    [() => Shell.of({ ...TH.BoxScope, lifepath: `${Lifeseq.ofLifenum(2)}/${Shell.VoidLifeseq}` }, TH.rootBoxOf()), "another lifepath than", 'a lifepath under another life than its parent'],
    [() => Shell.of(TH.BoxScope, TH.rootBoxOf({ userid: 'u2' })),                        'userid',                   'a parent of another user'],
    [() => Shell.of({ ...TH.BoxScope, lifepath: `${Life0}/${Life0}` }),                  Phrases.LifepathShape,      'a lifepath not a shell\'s'],
    [() => Shell.of({ ...TH.BoxScope, lifepath: Shell.VoidLifeseq }),                    Phrases.LifepathDepth,      'a lifepath shallower than its labelpath'],
    [() => Shell.of({ ...TH.BoxScope, label: 'other', lifepath: `${Life0}/${Shell.VoidLifeseq}` }), Phrases.LabelNotLast, 'a label not the last of its labelpath'],
  ]

  for (const [call, said, blurb] of BadShellCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(call, 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("Shell.labelpathWithParentage(raw, parent?)", () => {
  const boxLabelled  = { labelpath: 'box/openai', label: 'openai' }
  const rootLabelled = { labelpath: 'box', label: 'box' }

  it("is the labelpath and label of a labelpath given whole", () => {
    expect(Shell.labelpathWithParentage(TH.BoxScope)).to.deep.equal(boxLabelled)
    expect(Shell.labelpathWithParentage(TH.RootScope)).to.deep.equal(rootLabelled)
  })

  it("is a label under its parent's labelpath", () => {
    expect(Shell.labelpathWithParentage({ label: 'openai' }, TH.rootBoxOf())).to.deep.equal(boxLabelled)
    expect(Shell.labelpathWithParentage({ label: 'openai' }, { labelpath: 'box' })).to.deep.equal(boxLabelled)
  })

  it("reads only the labelpath and label of a record", () => {
    expect(Shell.labelpathWithParentage(TH.boxThingOf())).to.deep.equal(boxLabelled)
  })

  const BadScopedCases: [() => unknown, string, string][] = [
    [() => Shell.labelpathWithParentage({ label: 'openai' }),                                     "expected string",      'a label with no parent'],
    [() => Shell.labelpathWithParentage({}, TH.rootBoxOf()),                                      "expected string",      'a parent with neither labelpath nor label'],
    [() => Shell.labelpathWithParentage({ label: 'other' }, TH.boxThingOf()),                     Phrases.LabelpathShape, 'a labelpath deeper than its kind nests'],
    [() => Shell.labelpathWithParentage({ labelpath: 'box/openai', label: 'Not A Label' }),       'label',                'a label not of a label\'s shape'],
  ]

  for (const [call, said, blurb] of BadScopedCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(call, 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("Shell.lifepathWithParentage(raw, parent?)", () => {
  const Life2 = Lifeseq.ofLifenum(2)

  it("is the lifeseq of a lifepath given whole", () => {
    expect(Shell.lifepathWithParentage({ lifepath: `${Life0}/${Life2}` })).to.deep.equal({ lifeseq: Life2, lifepath: `${Life0}/${Life2}` })
  })

  it("is a lifeseq under its parent's lifepath", () => {
    expect(Shell.lifepathWithParentage({ lifeseq: Life2 }, TH.rootBoxOf())).to.deep.equal({ lifeseq: Life2, lifepath: `${Life0}/${Life2}` })
    expect(Shell.lifepathWithParentage({ lifeseq: Life2 }, { lifepath: Life0 })).to.deep.equal({ lifeseq: Life2, lifepath: `${Life0}/${Life2}` })
  })

  it("is the shell's life, at a root or under its parent", () => {
    expect(Shell.lifepathWithParentage({ lifepath: Shell.VoidLifeseq })).to.deep.equal({ lifeseq: Shell.VoidLifeseq, lifepath: Shell.VoidLifeseq })
    expect(Shell.lifepathWithParentage({ lifeseq: Shell.VoidLifeseq }, TH.rootBoxOf())).to.deep.equal({ lifeseq: Shell.VoidLifeseq, lifepath: `${Life0}/${Shell.VoidLifeseq}` })
  })

  it("reads only the lifeseq and lifepath of a record", () => {
    expect(Shell.lifepathWithParentage(TH.boxThingOf())).to.deep.equal({ lifeseq: Life0, lifepath: `${Life0}/${Life0}` })
  })

  const BadLivedCases: [() => unknown, string, string][] = [
    [() => Shell.lifepathWithParentage({ lifeseq: Life0 }, { lifepath: Shell.VoidLifeseq }),        Phrases.LifepathShape,  'a life under a shell'],
    [() => Shell.lifepathWithParentage({ lifeseq: Life2 }),                                    "expected string",      'a lifeseq with no parent'],
    [() => Shell.lifepathWithParentage({ lifeseq: 'nope' }, TH.rootBoxOf()),                   Phrases.LifeseqShape,   'a lifeseq of the wrong shape'],
    [() => Shell.lifepathWithParentage({ lifepath: `${Life0}/nope` }),                         'lifepath',             'a lifepath of the wrong shape'],
  ]

  for (const [call, said, blurb] of BadLivedCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(call, 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("Shell.under(scope, ancestor)", () => {
  it("is a root's shell, where nothing is above it", () => {
    expect(Shell.under(TH.RootScope, null)).to.deep.equal(Shell.of(TH.RootScope))
  })

  it("is the shell under the ancestor's lifepath, live or a tombstone, the shell's lifeseq for its own level", () => {
    const tomb = TH.boxTombOf(TH.rootBoxOf())
    expect(Shell.under(TH.BoxScope, TH.rootBoxOf())).to.deep.equal(Shell.of(TH.BoxScope, TH.rootBoxOf()))
    expect(Shell.under(TH.BoxScope, tomb).lifepath).to.eq(`${tomb.lifepath}/${Shell.VoidLifeseq}`)
  })

  it("is the shell's lifeseq at every level, where nothing is stored above it", () => {
    expect(Shell.under(TH.BoxScope, null).lifepath).to.eq(`${Shell.VoidLifeseq}/${Shell.VoidLifeseq}`)
  })

  it("reads only the labelpath and lifepath of an ancestor", () => {
    expect(Shell.under(TH.BoxScope, { labelpath: 'box', lifepath: Life0 })).to.deep.equal(Shell.under(TH.BoxScope, TH.rootBoxOf()))
  })

  const BadAncestorCases: [() => unknown, string, string][] = [
    [() => Shell.under(TH.BoxScope, TH.boxThingOf('open')),                             'labelpath',            'a sibling whose labelpath begins the same'],
    [() => Shell.under(TH.BoxScope, TH.gateThingOf()),                                  'labelpath',            'a root of another kind'],
    [() => Shell.under(TH.BoxScope, TH.boxThingOf()),                                   Phrases.LifepathShape,  'the Thing at the scope itself'],
    [() => Shell.under(TH.BoxScope, { labelpath: 'box', lifepath: Shell.VoidLifeseq }), Phrases.LifepathShape,  "an ancestor with the shell's lifepath"],
  ]

  for (const [call, said, blurb] of BadAncestorCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(call, 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("Labelpath.ancestorsOf(labelpath)", () => {
  it("is each labelpath above, nearest first, and none for a root", () => {
    expect(Labelpath.ancestorsOf('box')).to.deep.equal([])
    expect(Labelpath.ancestorsOf('box/openai')).to.deep.equal(['box'])
    expect(Labelpath.ancestorsOf('box/aa/bb')).to.deep.equal(['box/aa', 'box'])
  })
})

describe("Labelpath.modelkindOf(labelpath), Labelpath.isOfModelkind(labelpath, modelkind) and Labelpath.isBox(labelpath)", () => {
  const LabelpathCases = [
    ['bank',             'bank', true,  "the bank's root"],
    ['bank/main',        'bank', false, 'a label under bank'],
    ['gate',             'gate', true,  'the main gate'],
    ['gate/second',      'gate', true,  'a further gate'],
    ['gate/second/more', 'gate', false, 'two labels under gate'],
    ['box',              'box',  true,  'the root box'],
    ['box/openai',       'box',  true,  'a box under the root box'],
    ['box/aa/bb',        'box',  false, 'two labels under box'],
    ['box/Main!',        'box',  false, 'a label that is not one'],
    ['box/',             'box',  false, 'an empty label'],
  ] as const

  for (const [labelpath, modelkind, isKind, blurb] of LabelpathCases) {
    it(`${isKind ? 'accepts' : 'refuses'} ${blurb}`, () => {
      expect(Labelpath.modelkindOf(labelpath)).to.eq(modelkind)
      expect(Labelpath.isOfModelkind(labelpath, modelkind)).to.eq(isKind)
      expect(Labelpath.isBox(labelpath)).to.eq(isKind && (modelkind === 'box'))
    })
  }

  it("refuses a labelpath of one kind as another's", () => {
    expect(Labelpath.isOfModelkind('box/gate', 'gate')).to.be.false
    expect(Labelpath.isOfModelkind('gatebox', 'box')).to.be.false
  })
})

describe("AskChecks.getAsk and AskChecks.listAsk", () => {
  it("accepts an ask of each kind", () => {
    for (const labelpath of ['bank', 'gate', 'gate/second', 'box', 'box/openai']) {
      expect(AskChecks.getAsk.parse(TH.getAskAt(labelpath))).to.deep.equal(TH.getAskAt(labelpath))
      expect(AskChecks.listAsk.parse(TH.listAskAt(labelpath))).to.deep.equal(TH.listAskAt(labelpath))
    }
  })

  const BadGetCases = [
    [{ ...TH.getGateAskOf(), modelkind: 'box' },          'a modelkind not its labelpath\'s'],
    [{ ...TH.getGateAskOf(), labelpath: 'vault/main' },   'a labelpath of no kind of Thing'],
    [{ ...TH.getGateAskOf(), labelpath: 'gate/a/b' },     'a labelpath past its kind\'s depth'],
    [{ ...TH.getGateAskOf(), labelpath: 'gate/Main!' },   'a labelpath whose label is not one'],
    [{ ...TH.getGateAskOf(), labelpath: '/gate' },        'a labelpath with a leading /'],
    [{ ...TH.getGateAskOf(), ifAbsent: 'add' },           'a write flag'],
    [{ ...TH.getGateAskOf(), op: 'list' },                'another op'],
    [{ ...TH.getGateAskOf(), extra: 1 },                  'a field it does not accept'],
  ] as const

  for (const [ask, blurb] of BadGetCases) {
    it(`refuses ${blurb}`, () => { TH.expectSyncRefusal(() => AskChecks.getAsk.parse(ask), 'bad_record') })
  }

  it("refuses a list ask that is a get", () => {
    TH.expectSyncRefusal(() => AskChecks.listAsk.parse(TH.getAskAt('box')), 'bad_record')
  })

  it("accepts a banktok that is a UUID, and refuses one that is not", () => {
    expect(AskChecks.getAsk.parse({ ...TH.getGateAskOf(), banktok: TH.FirstLifetok })).to.deep.include({ banktok: TH.FirstLifetok })
    expect(AskChecks.listAsk.parse({ ...TH.listAskAt('box'), banktok: TH.FirstLifetok })).to.deep.include({ banktok: TH.FirstLifetok })
    TH.expectSyncRefusal(() => AskChecks.getAsk.parse({ ...TH.getGateAskOf(), banktok: 'life' }), 'bad_record')
  })
})

describe("checkedWriteAsk(ask), of the main gate", () => {
  const stored = TH.gateThingOf()
  const next   = TH.nextGateOf(stored)
  // The helper builds an ask of any kind: this one is the gate's.
  const good   = TH.replaceAskOf(stored, next)

  it("accepts a birth and a replacement", () => {
    expect(checkedWriteAsk(TH.birthAskOf())).to.deep.equal(TH.birthAskOf())
    expect(checkedWriteAsk(good)).to.deep.equal(good)
  })

  const lifeseq1 = Lifeseq.ofLifenum(1)
  const lifeseq2 = Lifeseq.ofLifenum(2)
  const noTestimony = { revtok: stored.revtok, revseq: 0, am: 'a' as const, lifepath: stored.lifepath }
  const BadRecordCases: readonly (readonly [WriteAsk, string, string])[] = [
    // the record does not follow the one cited:
    [{ ...good, record: { ...next, revseq: 2 } },                                    Phrases.RevseqNotNext,      'a revseq that skips one'],
    [{ ...good, record: { ...next, revtok: stored.revtok } },                        Phrases.RevtokNotNew,       'a revtok that is not new'],
    [TH.birthAskOf(TH.gateThingOf({ revtok: Shell.Cited.revtok })),                  Phrases.RevtokNotNew,       'the void revtok'],
    [{ ...good, record: { ...next, lifeseq: lifeseq2, lifepath: lifeseq2 } },        Phrases.LifeseqNotNext,     'a new life where am stays'],
    [TH.birthAskOf(TH.gateThingOf({ born_at: TH.T0 - 1 })),                          Phrases.BornAtNotNow,       'a birth born before it is written'],
    [{ ...good, record: { ...next, banklabel: 'other' } },                           Phrases.RecordOfOtherScope, 'a record at another scope'],
    [{ ...good, cited: noTestimony, options: { policies: ['replace_passphrase'] } }, Phrases.TestimonyMissing,   'replace_passphrase without the wayins it reads'],
    // the record is not a sound Thing:
    [{ ...good, record: { ...next, am: 'x', lifeseq: lifeseq1, lifepath: lifeseq1 } }, Phrases.MainGateDeleted,  'a tombstone of the main gate'],
    [{ ...good, record: { ...next, lifeseq: lifeseq1, lifepath: lifeseq1 } },        Phrases.LifeseqParity,      'an odd lifeseq on a live gate'],
    [{ ...good, record: { ...next, lifepath: `${Life0}/${Life0}` } },                Phrases.LifepathDepth,      'a lifepath deeper than its labelpath'],
    [{ ...good, record: { ...next, lifepath: `/${Life0}` } },                        Phrases.LifepathShape,      'a lifepath with a leading /'],
    [{ ...good, record: { ...next, lifeseq: lifeseq2 } },                            Phrases.LifeseqNotOwn,      'a lifeseq not the last of its lifepath'],
    [{ ...good, record: { ...next, lifeseq: '000000000w' } },                        Phrases.LifeseqShape,       'a lifeseq digit past v'],
    [{ ...good, record: { ...next, label: 'main' } },                                Phrases.LabelNotLast,       'a label not the last of its labelpath'],
    [{ ...good, record: { ...next, wayins: {} } } as never,                         'wayins.main',              'a gate with no passphrase wayin'],
    // the citation is not a sound one:
    [{ ...good, cited: { ...Shell.Cited, revtok: TH.revtokOf('0') } },               Phrases.CitedHalfShell,     'a citation half the shell'],
    [{ ...good, cited: { revtok: TH.revtokOf('0'), revseq: 0 } } as never,                   'lifepath',                 'a citation of too little'],
    [{ ...good, cited: { ...noTestimony, am: 'x' } },                                Phrases.LifeseqParity,      'a citation whose am its lifepath belies'],
    [{ ...good, cited: { ...noTestimony, lifepath: `${Life0}/${Life0}` } },          Phrases.LifepathNotKept,    'a citation of another lifepath'],
    [{ ...good, cited: { ...stored, wayins: {} } } as never,                        'wayins.main',              'a cited gate whose wayins fail'],
  ]

  for (const [ask, said, blurb] of BadRecordCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => checkedWriteAsk(ask), 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("checkedWriteAsk(ask), of each kind", () => {
  const box   = TH.boxThingOf()
  const tomb  = TH.boxTombOf(box)
  const under = Shell.childCited(Life0)

  it("accepts a box's birth under its parent's life, its deletion, and its rebirth", () => {
    for (const ask of [TH.birthAskOf(box, under), TH.delAskFor(box, tomb), TH.replaceAskOf(tomb, TH.boxRebornOf(tomb))]) {
      expect(checkedWriteAsk(ask)).to.deep.equal(ask)
    }
  })

  // A bank cites a box's whole shell.
  it("accepts a box's birth citing its whole shell", () => {
    const ask = TH.birthAskOf(box, TH.boxShellOf({ labelpath: box.labelpath, label: box.label }))
    expect(checkedWriteAsk(ask)).to.deep.equal(ask)
  })

  it("accepts the bank's and the root box's births, and a further gate's deletion", () => {
    const second = TH.gateThingOf({ labelpath: 'gate/second', label: 'second', lifepath: `${Life0}/${Life0}` })
    const secondGone = TH.nextOf(second, { am: 'x', lifeseq: Lifeseq.ofLifenum(1), lifepath: `${Life0}/${Lifeseq.ofLifenum(1)}` })
    for (const ask of [TH.birthAskOf(TH.bankThingOf()), TH.birthAskOf(TH.rootBoxOf()), TH.delAskFor(second, secondGone)]) {
      expect(checkedWriteAsk(ask)).to.deep.equal(ask)
    }
  })

  const BadRecordCases: readonly (readonly [WriteAsk, string, string])[] = [
    [{ ...TH.birthAskOf(box, under), modelkind: 'gate' } as never,                   Phrases.ModelkindNotOwn, 'a modelkind not its labelpath\'s'],
    [{ ...TH.birthAskOf(box, under), op: 'del' },                                    Phrases.DelFlagsFixed,   'a del under ifAbsent add'],
    [{ ...TH.delAskFor(box, box) },                                                  Phrases.OpNotOfRecord,   'a del of a live record'],
    [{ ...TH.replaceAskOf(box, tomb) },                                              Phrases.OpNotOfRecord,   'a put of a tombstone'],
    [{ ...TH.delAskFor(box, tomb), ifPresent: 'fail' },                              Phrases.DelFlagsFixed,   'a del under ifPresent fail'],
    [{ ...TH.delAskFor(box, tomb), options: { policies: [] } },                      Phrases.DelFlagsFixed,   'a del naming storage policies'],
    [TH.replaceAskOf(box, TH.nextOf(box), { policies: ['add_passkey'] }),            Phrases.PolicyNotOwn,    'a box put naming a storage policy'],
    [TH.birthAskOf(box),                                                             Phrases.LifepathNotKept,    'a box\'s birth citing a root\'s shell'],
    [TH.birthAskOf(box, Shell.childCited(Lifeseq.ofLifenum(2))),                              Phrases.LifepathNotKept,    'a box\'s birth under another life of its parent'],
    [TH.birthAskOf(TH.boxThingOf('openai', { lifepath: Life0 }), under),             Phrases.LifepathDepth,      'a box whose lifepath is shallower than its labelpath'],
    [TH.birthAskOf(TH.boxThingOf('openai', { label: 'other' }), under),              Phrases.LabelNotLast,       'a box whose label is not its last'],
    [TH.birthAskOf({ ...box, sidecar: undefined } as never, under),                  'sidecar',                  'a live box with no sidecar'],
    [TH.delAskFor(box, { ...tomb, sidecar: undefined } as never),                    'sidecar',                  'a tombstone with no sidecar'],
    [TH.delAskFor(box, { ...tomb, sidecar: { account: 'home' } }),                   Phrases.TombstoneSidecarNotEmpty, 'a tombstone whose sidecar is not empty'],
    [TH.birthAskOf({ ...box, whisper_sealed: { ...TH.FakeSealed, codectag: 1 } } as never, under), 'codectag', 'a box whose sealed whisper is misshapen'],
    [TH.birthAskOf({ ...box, whisper_sealed: { ...TH.FakeSealed, schematag: 'Whisper v1' } }, under), 'schematag', 'a box whose schematag is not a label'],
    [TH.birthAskOf({ ...box, whisper_sealed: { ...TH.FakeSealed, nonce: 'n' } } as never, under), Unaccepted, 'a box whose sealed whisper has a field no sealed part has'],
    [TH.birthAskOf({ ...TH.bankThingOf(), note: 'hi' } as never),                    Unaccepted,                 'a bank with a body'],
    [TH.birthAskOf(TH.omitting(TH.bankThingOf(), 'lifetok')),                        'lifetok',                  'a bank with no lifetok'],
    [TH.birthAskOf(TH.bankThingOf({ lifetok: 'not-a-uuid' })),                       Phrases.LifetokShape,       'a bank whose lifetok is not a UUID'],
    [TH.birthAskOf(TH.rootBoxOf({ labelpath: 'box/root' })),                         Phrases.LabelNotLast,       'a root box at a child\'s labelpath'],
  ]

  for (const [ask, said, blurb] of BadRecordCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => checkedWriteAsk(ask), 'bad_record')
      expect(err.message).to.include(said)
    })
  }

  it("refuses a del citing a tombstone as the act dubdel", () => {
    const tomb = TH.boxTombOf(box)
    const err  = TH.expectSyncRefusal(() => checkedWriteAsk(TH.delAskFor(tomb, TH.nextOf(tomb))), 'absent_vault')
    expect(err.message).to.include(Phrases.TombstoneOverTombstone)
    expect(err.meta).to.deep.include({ act: 'dubdel' })
  })
})

describe("checkedBirthBankAsk(ask)", () => {
  it("accepts a bank's three roots", () => { expect(checkedBirthBankAsk(TH.birthBankAskOf())).to.deep.equal(TH.birthBankAskOf()) })

  it("refuses a root at another root's labelpath", () => {
    const err = TH.expectSyncRefusal(() => checkedBirthBankAsk(TH.birthBankAskOf({ root: TH.boxThingOf() })), 'bad_record')
    expect(err.message).to.include(Phrases.RecordOfOtherScope)
  })

  it("refuses a root that is not born live", () => {
    const life1 = Lifeseq.ofLifenum(1)
    const ask   = TH.birthBankAskOf({ bank: TH.bankThingOf({ am: 'x', lifeseq: life1, lifepath: life1 }) })
    const err   = TH.expectSyncRefusal(() => checkedBirthBankAsk(ask), 'bad_record')
    expect(err.message).to.include(Phrases.OpNotOfRecord)
  })

  it("refuses a field it does not accept, and a root of another bank", () => {
    TH.expectSyncRefusal(() => checkedBirthBankAsk({ ...TH.birthBankAskOf(), extra: 1 }), 'bad_record')
    TH.expectSyncRefusal(() => checkedBirthBankAsk(TH.birthBankAskOf({ gate: TH.gateThingOf({ banklabel: 'other' }) })), 'bad_record')
  })
})

describe("the ask builders", () => {
  const box = TH.boxThingOf()

  it("fill in a get's ifAbsent 'nil', and drop what is not a scope", () => {
    expect(getAskOf({ ...box, ...TH.SenderKnows })).to.deep.equal(TH.getAskAt('box/openai', 'nil'))
    expect(listAskOf({ ...TH.RootScope, ...TH.SenderKnows })).to.deep.equal(TH.listAskAt('box'))
    expect(getAskOf({ ...TH.GateScope, ifAbsent: 'fail', ...TH.SenderKnows })).to.deep.equal(TH.getGateAskOf('fail'))
  })

  it("fill in a put's ifAbsent 'add' and ifPresent 'repl', leaving its policies as given, at its record's scope", () => {
    const next = TH.nextGateOf(TH.gateThingOf())
    const ask  = putAskOf({ cited: TH.gateThingOf(), record: next, options: { policies: ['add_passkey'] }, ...TH.SenderKnows })
    expect(ask).to.deep.equal({ ...TH.GateScope, op: 'put', modelkind: 'gate', cited: TH.gateThingOf(), record: next, ifAbsent: 'add', ifPresent: 'repl', options: { policies: ['add_passkey'] }, ...TH.SenderKnows })
    expect(putAskOf({ cited: Shell.childCited(Life0), record: box, ifPresent: 'fail', ...TH.SenderKnows })).to.deep.include({ ...TH.BoxScope, modelkind: 'box', ifAbsent: 'add', ifPresent: 'fail' })
  })

  it("carry the track and banktok given", () => {
    const tomb  = TH.boxTombOf(box)
    const given = { track: TH.trackOf(), banktok: TH.FirstLifetok }
    expect(getAskOf({ ...TH.BoxScope, ...given })).to.deep.equal({ ...TH.getAskAt('box/openai', 'nil'), ...given })
    expect(listAskOf({ ...TH.RootScope, ...given })).to.deep.equal({ ...TH.listAskAt('box'), ...given })
    expect(putAskOf({ cited: Shell.childCited(Life0), record: box, ...given })).to.deep.include(given)
    expect(delAskOf({ cited: box, record: tomb, ...given })).to.deep.equal({ ...TH.delAskFor(box, tomb), ...given })
  })

  it("fix a del's flags", () => {
    const tomb = TH.boxTombOf(box)
    expect(delAskOf({ cited: box, record: tomb, ...TH.SenderKnows })).to.deep.equal(TH.delAskFor(box, tomb))
    expect(checkedWriteAsk(delAskOf({ cited: box, record: tomb, ...TH.SenderKnows }))).to.deep.equal(TH.delAskFor(box, tomb))
  })

  it("write a del's fixed flags over any given", () => {
    const tomb = TH.boxTombOf(box)
    expect(delAskOf({ cited: box, record: tomb, ifAbsent: 'add', ...TH.SenderKnows } as never)).to.deep.include({ ifAbsent: 'fail', ifPresent: 'repl' })
  })

  it("pass through what they do not accept, for the verb's checks to refuse", () => {
    const tomb = TH.boxTombOf(box)
    TH.expectSyncRefusal(() => checkedWriteAsk(delAskOf({ cited: box, record: tomb, options: { policies: [] } } as never)), 'bad_record')
    TH.expectSyncRefusal(() => checkedWriteAsk(putAskOf({ cited: box, record: box, extra: 1 } as never)), 'bad_record')
    TH.expectSyncRefusal(() => AskChecks.getAsk.parse(getAskOf({ ...TH.GateScope, ifAbsent: 'add' } as never)), 'bad_record')
  })

  it("never throw: a record with no scope, or args that are not a bag, go to the verb as given", () => {
    const noScope = putAskOf({ cited: Shell.Cited, record: { revtok: TH.revtokOf('0') } } as never)
    TH.expectSyncRefusal(() => checkedWriteAsk(noScope), 'bad_record')
    expect(putAskOf(null as never)).to.eq(null)
    expect(listAskOf(7 as never)).to.eq(7)
  })
})

describe("an ask's track and banktok", () => {
  const box = TH.boxThingOf()
  const unknown = { track: VoidTrack, banktok: SX.VoidLifeTok }

  it("may track each root at the void revision", () => {
    expect(AskChecks.getAsk.parse(TH.getAskAt('box/openai'))).to.deep.include({ track: VoidTrack })
  })

  it("is a get's to leave as the void lifetok, where its sender knows no bank", () => {
    expect(AskChecks.getAsk.parse({ ...TH.getAskAt('box/openai'), ...unknown })).to.deep.include(unknown)
  })

  it("is the bank's lifetok on a list, a write and a birth", () => {
    for (const parse of [
      () => AskChecks.listAsk.parse({ ...TH.listAskAt('box'), ...unknown }),
      () => checkedWriteAsk({ ...TH.birthAskOf(box, Shell.childCited(Life0)), ...unknown }),
      () => checkedBirthBankAsk(TH.birthBankAskOf(unknown)),
    ]) {
      const err = TH.expectSyncRefusal(parse, 'bad_record')
      expect(err.message).to.include(Phrases.BanktokVoid)
    }
  })

  it("is never left out", () => {
    TH.expectSyncRefusal(() => AskChecks.getAsk.parse(TH.omitting(TH.getAskAt('box/openai'), 'track')), 'bad_record')
    TH.expectSyncRefusal(() => AskChecks.getAsk.parse(TH.omitting(TH.getAskAt('box/openai'), 'banktok')), 'bad_record')
  })
})

describe("BoxChecks.sealable", () => {
  const shell = Object.freeze({
    ...TH.ThingBank, labelpath: 'box/openai', label: 'openai', fmt: ThingFormat, revtok: Shell.Cited.revtok, revseq: Shell.Cited.revseq, am: 'x',
    lifeseq: Shell.VoidLifeseq, lifepath: `${Life0}/${Shell.VoidLifeseq}`, born_at: TH.T0, written_at: TH.T0,
  })

  it("accepts a live box's, a tombstone's and the shell's Thing fields and sidecar, stripping the rest", () => {
    const box = TH.boxThingOf()
    expect(BoxChecks.sealable.parse(box)).to.deep.equal({ ...Thing.sparseOf(box), sidecar: {} })
    const tomb = TH.boxTombOf(box)
    expect(BoxChecks.sealable.parse(tomb)).to.deep.equal({ ...Thing.sparseOf(tomb), sidecar: {} })
    expect(BoxChecks.sealable.parse(shell)).to.deep.equal(shell)
  })

  it("leaves a sidecar on the shell, and strips a whisper in the clear", () => {
    expect(BoxChecks.sealable.parse({ ...shell, sidecar: { account: 'work' }, whisper: { apiKey: 'sk-test' } })).to.deep.equal({ ...shell, sidecar: { account: 'work' } })
  })

  const BadSparseCases = [
    [{ ...shell, revseq: 0 },                                     Phrases.SealableHalfShell,  'half the shell: its revseq moved'],
    [{ ...shell, revtok: TH.revtokOf('0') },                               Phrases.SealableHalfShell,  'half the shell: its revtok moved'],
    [{ ...shell, lifeseq: Life0, lifepath: `${Life0}/${Life0}` }, Phrases.LifeseqParity,   'the shell made live in its lifeseq alone'],
    [{ ...shell, lifeseq: Life0 },                                Phrases.LifeseqNotOwn,   'a lifeseq not the last of its lifepath'],
    [{ ...shell, revseq: -2 },                                    'revseq',                'a revseq below the shell\'s'],
    [{ ...shell, labelpath: 'gate/openai' },                      'labelpath',             'a Thing of another kind'],
  ] as const

  for (const [sparse, said, blurb] of BadSparseCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => BoxChecks.sealable.parse(sparse), 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("loggableAskOf(ask)", () => {
  it("carries over the scope, the flags and what each record cites, and drops a gate's wayins", () => {
    const loggable = loggableAskOf(TH.birthAskOf())
    expect(loggable).to.deep.include({ op: 'put', modelkind: 'gate', ...TH.GateScope, ifAbsent: 'add', ifPresent: 'fail' })
    expect(loggable.record).to.deep.equal({ revtok: TH.revtokOf('0'), revseq: 0, am: 'a', lifepath: Life0 })
    expect(JSON.stringify(loggable)).to.not.include(TH.MainWayin.salt_b64)
  })

  it("carries over what a bank's birth cites of each root, and drops their bodies", () => {
    const loggable = loggableAskOf(TH.birthBankAskOf())
    expect(loggable).to.deep.include({ op: 'birth', ...TH.ThingBank })
    expect(loggable.root).to.deep.equal({ revtok: TH.revtokOf('0'), revseq: 0, am: 'a', lifepath: Life0 })
    expect(JSON.stringify(loggable)).to.not.include(TH.MainWayin.salt_b64)
    expect(JSON.stringify(loggable)).to.not.include(TH.FakeSealed.codectag)
  })

  it("carries over the banktok an ask carries", () => {
    expect(loggableAskOf({ ...TH.getGateAskOf(), banktok: TH.FirstLifetok })).to.deep.include({ banktok: TH.FirstLifetok })
    expect(loggableAskOf({ ...TH.birthBankAskOf(), banktok: TH.FirstLifetok })).to.deep.include({ op: 'birth', banktok: TH.FirstLifetok })
  })

  it("gives nothing for an ask that will not parse", () => {
    expect(loggableAskOf(null)).to.deep.equal({})
    expect(loggableAskOf({ userid: 42 })).to.deep.equal({})
  })
})

describe("Tracked", () => {
  it("is, for each of the bank, main gate and root box, its record or 'same'", () => {
    expectTypeOf<Tracked['bank']>().toEqualTypeOf<BankRecord | 'same'>()
    expectTypeOf<Tracked[typeof Labelpath.MainGate]>().toEqualTypeOf<GateRecord | 'same'>()
    expectTypeOf<Tracked[typeof Labelpath.RootBox]>().toEqualTypeOf<BoxRecord | 'same'>()
  })
})

describe("LiveOf, TombstoneOf and ShellOf", () => {
  it("mark a gate, whose am is one field, as they mark a box", () => {
    expectTypeOf<LiveOf<GateRecord>['am']>().toEqualTypeOf<'a'>()
    expectTypeOf<TombstoneOf<GateRecord>['am']>().toEqualTypeOf<'x'>()
    expectTypeOf<ShellOf<GateRecord>['am']>().toEqualTypeOf<'x'>()
  })

  it("mark a box, whose am is one field, as they mark a gate", () => {
    expectTypeOf<LiveOf<BoxRecord>['am']>().toEqualTypeOf<'a'>()
    expectTypeOf<TombstoneOf<BoxRecord>['am']>().toEqualTypeOf<'x'>()
    expectTypeOf<ShellOf<BoxRecord>['am']>().toEqualTypeOf<'x'>()
  })

  it("give a box tombstone every field of a live box, and the shell none of its body", () => {
    expectTypeOf<TombstoneOf<BoxRecord>>().toHaveProperty('sidecar')
    expectTypeOf<TombstoneOf<BoxRecord>>().toHaveProperty('whisper_sealed')
    expectTypeOf<ShellOf<BoxRecord>>().not.toHaveProperty('sidecar')
    expectTypeOf<ShellOf<BoxRecord>>().not.toHaveProperty('whisper_sealed')
  })

  it("pin the shell to the void revision", () => {
    expectTypeOf<ShellOf<BoxRecord>['revseq']>().toEqualTypeOf<typeof SX.VoidRevisionSeq>()
    expectTypeOf<ShellOf<BoxRecord>['revtok']>().toEqualTypeOf<typeof SX.VoidRevisionTok>()
    expectTypeOf<ShellOf<GateRecord>['lifeseq']>().toEqualTypeOf<typeof Shell.VoidLifeseq>()
    expectTypeOf<VoidSentinel>().toEqualTypeOf<ShellOf<ThingRecord>>()
  })
})

describe("AnyThingRecord", () => {
  it("has the fields every kind has as they are, and each kind's own fields optional", () => {
    expectTypeOf<AnyThingRecord['revseq']>().toEqualTypeOf<number>()
    expectTypeOf<AnyThingRecord['fmt']>().toEqualTypeOf<typeof ThingFormat>()
    expectTypeOf<AnyThingRecord['sidecar']>().toEqualTypeOf<BoxRecord['sidecar'] | undefined>()
    expectTypeOf<AnyThingRecord['wayins']>().toEqualTypeOf<GateRecord['wayins'] | undefined>()
    expectTypeOf<AnyThingRecord['label']>().toEqualTypeOf<string>()
  })
})
