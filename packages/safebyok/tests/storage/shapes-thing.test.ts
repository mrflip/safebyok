import { describe, expect, it } from 'vitest'
import {
  type WriteThingAsk, ShellCited, ShellLifeseq, checkedBirthBankAsk, checkedGetThingAsk, checkedListThingsAsk, checkedWriteThingAsk, delAskOf, getAskOf,
  isGoneLifeseq, isLabelpathOfKind, lifeseqOf, lifeseqOfLifepath, listAskOf, loggableAskOf, modelkindOf, putAskOf, seqOfLifeseq, childShellCited, sparseOf, boxSparse,
} from '../../src/storage/shapes-thing'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'

const { Life0 } = TH
/** What a strict check says of a field it does not accept, which it never names. */
const Unaccepted = 'There is a field it does not accept'

describe("lifeseqOf(seq) and seqOfLifeseq(lifeseq)", () => {
  const LifeseqCases = [
    [0,              "0000000000",  'life 0, a birth'],
    [1,              "0000000001",  'life 1, its deletion'],
    [31,             "000000000v",  'the last one-digit life'],
    [32,             "0000000010",  'the first two-digit life'],
    [(32 ** 10) - 1, "vvvvvvvvvv",  'the last life ten digits can name'],
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
  it("is the last lifeseq of the lifepath, a root's whole lifepath", () => {
    expect(lifeseqOfLifepath(lifeseqOf(3))).to.eq(lifeseqOf(3))
    expect(lifeseqOfLifepath(`${lifeseqOf(3)}/${lifeseqOf(4)}`)).to.eq(lifeseqOf(4))
    expect(lifeseqOfLifepath(ShellCited.lifepath)).to.eq(ShellLifeseq)
    expect(lifeseqOfLifepath(childShellCited(Life0).lifepath)).to.eq(ShellLifeseq)
  })
})

describe("isGoneLifeseq(lifeseq)", () => {
  it("is true of odd lives, the shell's among them", () => {
    expect([ShellLifeseq, lifeseqOf(0), lifeseqOf(1), lifeseqOf(32), lifeseqOf(33)].map((lifeseq) => isGoneLifeseq(lifeseq))).to.deep.equal([true, false, true, false, true])
  })
})

describe("ShellCited and childShellCited(parentLifepath)", () => {
  it("cite the void sentinel at revision -1, a root's at lifepath '-1', a child's at its parent's lifepath then '-1'", () => {
    expect(Object.isFrozen(ShellCited)).to.be.true
    expect(ShellCited).to.deep.equal({ revtok: '00000000-0000-0000-0000-000000000000', revseq: -1, lifepath: '-1', am: 'x' })
    expect(childShellCited(`${Life0}/${lifeseqOf(2)}`)).to.deep.equal({ ...ShellCited, lifepath: `${Life0}/${lifeseqOf(2)}/-1` })
  })
})

describe("modelkindOf(labelpath) and isLabelpathOfKind(labelpath, modelkind)", () => {
  const LabelpathCases = [
    ['bank',             'bank', true,  "the bank's root"],
    ['bank/main',        'bank', false, 'a label under bank'],
    ['gate',             'gate', true,  'the main gate'],
    ['gate/second',      'gate', false, 'a label under gate'],
    ['box',              'box',  true,  'the root box'],
    ['box/openai',       'box',  true,  'a box under the root box'],
    ['box/aa/bb',        'box',  false, 'two labels under box'],
    ['box/Main!',        'box',  false, 'a label that is not one'],
    ['box/',             'box',  false, 'an empty label'],
  ] as const

  for (const [labelpath, modelkind, isKind, blurb] of LabelpathCases) {
    it(`${isKind ? 'accepts' : 'refuses'} ${blurb}`, () => {
      expect(modelkindOf(labelpath)).to.eq(modelkind)
      expect(isLabelpathOfKind(labelpath, modelkind)).to.eq(isKind)
    })
  }

  it("refuses a labelpath of one kind as another's", () => {
    expect(isLabelpathOfKind('box/gate', 'gate')).to.be.false
    expect(isLabelpathOfKind('gatebox', 'box')).to.be.false
  })
})

describe("checkedGetThingAsk(ask) and checkedListThingsAsk(ask)", () => {
  it("accepts an ask of each kind", () => {
    for (const labelpath of ['bank', 'gate', 'box', 'box/openai']) {
      expect(checkedGetThingAsk(TH.getAskAt(labelpath))).to.deep.equal(TH.getAskAt(labelpath))
      expect(checkedListThingsAsk(TH.listAskAt(labelpath))).to.deep.equal(TH.listAskAt(labelpath))
    }
  })

  const BadGetCases = [
    [{ ...TH.getGateAskOf(), modelkind: 'box' },          'a modelkind not its labelpath\'s'],
    [{ ...TH.getGateAskOf(), labelpath: 'vault/main' },   'a labelpath of no kind of Thing'],
    [{ ...TH.getGateAskOf(), labelpath: 'gate/second' },  'a labelpath past its kind\'s depth'],
    [{ ...TH.getGateAskOf(), labelpath: 'gate/Main!' },   'a labelpath whose label is not one'],
    [{ ...TH.getGateAskOf(), labelpath: '/gate' },        'a labelpath with a leading /'],
    [{ ...TH.getGateAskOf(), ifAbsent: 'add' },           'a write flag'],
    [{ ...TH.getGateAskOf(), op: 'list' },                'another op'],
    [{ ...TH.getGateAskOf(), extra: 1 },                  'a field it does not accept'],
  ] as const

  for (const [ask, blurb] of BadGetCases) {
    it(`refuses ${blurb}`, () => { TH.expectSyncRefusal(() => checkedGetThingAsk(ask), 'bad_option') })
  }

  it("refuses a list ask that is a get", () => {
    TH.expectSyncRefusal(() => checkedListThingsAsk(TH.getAskAt('box')), 'bad_option')
  })
})

describe("checkedWriteThingAsk(ask), of the main gate", () => {
  const stored = TH.gateThingOf()
  const next   = TH.nextGateOf(stored)
  // The helper builds an ask of any kind: this one is the gate's.
  const good   = TH.replaceAskOf(stored, next)

  it("accepts a birth and a replacement", () => {
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
    [{ ...good, cited: { ...ShellCited, revtok: 'rev-0' } },                          Phrases.CitedHalfShell,     'a citation half the shell'],
    [{ ...good, cited: { revtok: 'rev-0', revseq: 0 } } as never,                   'lifepath',                 'a citation of too little'],
    [{ ...good, cited: { ...noTestimony, am: 'x' } },                                Phrases.LifeseqParity,      'a citation whose am its lifepath belies'],
    [{ ...good, cited: { ...noTestimony, lifepath: `${Life0}/${Life0}` } },          Phrases.LifepathNotKept,    'a citation of another lifepath'],
    [{ ...good, cited: { ...stored, wayins: {} } } as never,                        'wayins.main',              'a cited gate whose wayins fail'],
  ]

  for (const [ask, said, blurb] of BadRecordCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => checkedWriteThingAsk(ask), 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("checkedWriteThingAsk(ask), of each kind", () => {
  const box   = TH.boxThingOf()
  const tomb  = TH.boxTombOf(box)
  const under = childShellCited(Life0)

  it("accepts a box's birth under its parent's life, its deletion, and its rebirth", () => {
    for (const ask of [TH.birthAskOf(box, under), TH.delAskFor(box, tomb), TH.replaceAskOf(tomb, TH.boxRebornOf(tomb))]) {
      expect(checkedWriteThingAsk(ask)).to.deep.equal(ask)
    }
  })

  it("accepts a box's birth citing its whole shell, as a bank gives it", () => {
    const ask = TH.birthAskOf(box, TH.boxShellOf({ labelpath: box.labelpath, label: box.label }))
    expect(checkedWriteThingAsk(ask)).to.deep.equal(ask)
  })

  it("accepts the bank's and the root box's births", () => {
    for (const ask of [TH.birthAskOf(TH.bankThingOf()), TH.birthAskOf(TH.rootBoxOf())]) {
      expect(checkedWriteThingAsk(ask)).to.deep.equal(ask)
    }
  })

  const BadOptionCases: readonly (readonly [WriteThingAsk, string, string])[] = [
    [{ ...TH.birthAskOf(box, under), modelkind: 'gate' } as never,                   Phrases.ModelkindNotOwn, 'a modelkind not its labelpath\'s'],
    [{ ...TH.birthAskOf(box, under), op: 'del' },                                    Phrases.DelFlagsFixed,   'a del under ifAbsent add'],
    [{ ...TH.delAskFor(box, box) },                                                  Phrases.OpNotOfRecord,   'a del of a live record'],
    [{ ...TH.replaceAskOf(box, tomb) },                                              Phrases.OpNotOfRecord,   'a put of a tombstone'],
    [{ ...TH.delAskFor(box, tomb), ifPresent: 'fail' },                              Phrases.DelFlagsFixed,   'a del under ifPresent fail'],
    [{ ...TH.delAskFor(box, tomb), options: { policies: [] } },                      Phrases.DelFlagsFixed,   'a del naming storage policies'],
    [TH.replaceAskOf(box, TH.nextOf(box), { policies: ['add_passkey'] }),            Phrases.PolicyNotOwn,    'a box put naming a storage policy'],
  ]

  for (const [ask, said, blurb] of BadOptionCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => checkedWriteThingAsk(ask), 'bad_option')
      expect(err.message).to.include(said)
    })
  }

  const BadRecordCases: readonly (readonly [WriteThingAsk, string, string])[] = [
    [TH.birthAskOf(box),                                                             Phrases.LifepathNotKept,    'a box\'s birth citing a root\'s shell'],
    [TH.birthAskOf(box, childShellCited(lifeseqOf(2))),                              Phrases.LifepathNotKept,    'a box\'s birth under another life of its parent'],
    [TH.birthAskOf(TH.boxThingOf('openai', { lifepath: Life0 }), under),             Phrases.LifepathDepth,      'a box whose lifepath is shallower than its labelpath'],
    [TH.birthAskOf(TH.boxThingOf('openai', { label: 'other' }), under),              Phrases.LabelNotLast,       'a box whose label is not its last'],
    [TH.birthAskOf({ ...box, sidecar: undefined } as never, under),                  'sidecar',                  'a live box with no sidecar'],
    [TH.delAskFor(box, { ...tomb, sidecar: {} } as never),                           Unaccepted,                 'a tombstone with a sidecar'],
    [TH.birthAskOf({ ...box, whisper_sealed: { ...TH.FakeSealed, codectag: 1 } } as never, under), 'codectag', 'a box whose sealed whisper is misshapen'],
    [TH.birthAskOf({ ...box, whisper_sealed: { ...TH.FakeSealed, schematag: 'Whisper v1' } }, under), 'schematag', 'a box whose schematag is not a label'],
    [TH.birthAskOf({ ...box, whisper_sealed: { ...TH.FakeSealed, nonce: 'n' } } as never, under), Unaccepted, 'a box whose sealed whisper has a field no sealed part has'],
    [TH.birthAskOf({ ...TH.bankThingOf(), note: 'hi' } as never),                    Unaccepted,                 'a bank with a body'],
    [TH.birthAskOf(TH.rootBoxOf({ labelpath: 'box/root' })),                         Phrases.LabelNotLast,       'a root box at a child\'s labelpath'],
  ]

  for (const [ask, said, blurb] of BadRecordCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => checkedWriteThingAsk(ask), 'bad_record')
      expect(err.message).to.include(said)
    })
  }

  it("refuses a del citing a tombstone as the act dubdel", () => {
    const tomb = TH.boxTombOf(box)
    const err  = TH.expectSyncRefusal(() => checkedWriteThingAsk(TH.delAskFor(tomb, TH.nextOf(tomb))), 'absent_vault')
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
    const life1 = lifeseqOf(1)
    const ask   = TH.birthBankAskOf({ bank: TH.bankThingOf({ am: 'x', lifeseq: life1, lifepath: life1 }) })
    const err   = TH.expectSyncRefusal(() => checkedBirthBankAsk(ask), 'bad_option')
    expect(err.message).to.include(Phrases.OpNotOfRecord)
  })

  it("refuses a field it does not accept, and a root of another bank", () => {
    TH.expectSyncRefusal(() => checkedBirthBankAsk({ ...TH.birthBankAskOf(), extra: 1 }), 'bad_option')
    TH.expectSyncRefusal(() => checkedBirthBankAsk(TH.birthBankAskOf({ gate: TH.gateThingOf({ banklabel: 'other' }) })), 'bad_record')
  })
})

describe("the ask builders", () => {
  const box = TH.boxThingOf()

  it("fill in a get's ifAbsent 'nil' and a list's 'fail', and drop what is not a scope", () => {
    expect(getAskOf(box)).to.deep.equal(TH.getAskAt('box/openai', 'nil'))
    expect(listAskOf(TH.RootScope)).to.deep.equal(TH.listAskAt('box', 'fail'))
    expect(getAskOf({ ...TH.GateScope, ifAbsent: 'fail' })).to.deep.equal(TH.getGateAskOf('fail'))
  })

  it("fill in a put's ifAbsent 'add' and ifPresent 'repl', keeping its policies, at its record's scope", () => {
    const next = TH.nextGateOf(TH.gateThingOf())
    const ask  = putAskOf({ cited: TH.gateThingOf(), record: next, options: { policies: ['add_passkey'] } })
    expect(ask).to.deep.equal({ ...TH.GateScope, op: 'put', modelkind: 'gate', cited: TH.gateThingOf(), record: next, ifAbsent: 'add', ifPresent: 'repl', options: { policies: ['add_passkey'] } })
    expect(putAskOf({ cited: childShellCited(Life0), record: box, ifPresent: 'fail' })).to.deep.include({ ...TH.BoxScope, modelkind: 'box', ifAbsent: 'add', ifPresent: 'fail' })
  })

  it("fix a del's flags", () => {
    const tomb = TH.boxTombOf(box)
    expect(delAskOf({ cited: box, record: tomb })).to.deep.equal(TH.delAskFor(box, tomb))
    expect(checkedWriteThingAsk(delAskOf({ cited: box, record: tomb }))).to.deep.equal(TH.delAskFor(box, tomb))
  })

  it("write a del's fixed flags over any given", () => {
    const tomb = TH.boxTombOf(box)
    expect(delAskOf({ cited: box, record: tomb, ifAbsent: 'add' } as never)).to.deep.include({ ifAbsent: 'fail', ifPresent: 'repl' })
  })

  it("pass through what they do not accept, for the verb's checks to refuse", () => {
    const tomb = TH.boxTombOf(box)
    TH.expectSyncRefusal(() => checkedWriteThingAsk(delAskOf({ cited: box, record: tomb, options: { policies: [] } } as never)), 'bad_option')
    TH.expectSyncRefusal(() => checkedWriteThingAsk(putAskOf({ cited: box, record: box, extra: 1 } as never)), 'bad_option')
    TH.expectSyncRefusal(() => checkedGetThingAsk(getAskOf({ ...TH.GateScope, ifAbsent: 'add' } as never)), 'bad_option')
  })

  it("never throw: a record with no scope, or args that are not a bag, go to the verb as given", () => {
    const noScope = putAskOf({ cited: ShellCited, record: { revtok: 'rev-0' } } as never)
    TH.expectSyncRefusal(() => checkedWriteThingAsk(noScope), 'bad_option')
    expect(putAskOf(null as never)).to.eq(null)
    expect(listAskOf(7 as never)).to.eq(7)
  })
})

describe("sparseOf(record)", () => {
  it("keeps a Thing's fields and drops its body", () => {
    const { sidecar: _sidecar, whisper_sealed: _sealed, ...thingFields } = TH.boxThingOf() as ReturnType<typeof TH.boxThingOf> & { sidecar: unknown }
    expect(sparseOf(TH.boxThingOf())).to.deep.equal(thingFields)
  })
})

describe("boxSparse", () => {
  const shell = Object.freeze({
    ...TH.ThingBank, labelpath: 'box/openai', label: 'openai', fmt: 5103, revtok: ShellCited.revtok, revseq: ShellCited.revseq, am: 'x',
    lifeseq: ShellLifeseq, lifepath: `${Life0}/${ShellLifeseq}`, born_at: TH.T0, written_at: TH.T0,
  })

  it("accepts a live box's, a tombstone's and the shell's Thing fields, stripping the body", () => {
    const box = TH.boxThingOf()
    expect(boxSparse.parse(box)).to.deep.equal(sparseOf(box))
    const tomb = TH.boxTombOf(box)
    expect(boxSparse.parse(tomb)).to.deep.equal(sparseOf(tomb))
    expect(boxSparse.parse(shell)).to.deep.equal(shell)
  })

  const BadSparseCases = [
    [{ ...shell, revseq: 0 },                                     Phrases.SparseHalfShell, 'half the shell: its revseq moved'],
    [{ ...shell, revtok: 'rev-0' },                               Phrases.SparseHalfShell, 'half the shell: its revtok moved'],
    [{ ...shell, lifeseq: Life0, lifepath: `${Life0}/${Life0}` }, Phrases.LifeseqParity,   'the shell made live in its lifeseq alone'],
    [{ ...shell, lifeseq: Life0 },                                Phrases.LifeseqNotOwn,   'a lifeseq not the last of its lifepath'],
    [{ ...shell, revseq: -2 },                                    'revseq',                'a revseq below the shell\'s'],
    [{ ...shell, labelpath: 'gate/openai' },                      'labelpath',             'a Thing of another kind'],
  ] as const

  for (const [sparse, said, blurb] of BadSparseCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => boxSparse.parse(sparse), 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("loggableAskOf(ask)", () => {
  it("keeps the scope, the flags and what each record cites, and drops a gate's wayins", () => {
    const loggable = loggableAskOf(TH.birthAskOf())
    expect(loggable).to.deep.include({ op: 'put', modelkind: 'gate', ...TH.GateScope, ifAbsent: 'add', ifPresent: 'fail' })
    expect(loggable.record).to.deep.equal({ revtok: 'rev-0', revseq: 0, am: 'a', lifepath: Life0 })
    expect(JSON.stringify(loggable)).to.not.include(TH.BW.mainWayin.salt_b64)
  })

  it("keeps what a bank's birth cites of each root, and drops their bodies", () => {
    const loggable = loggableAskOf(TH.birthBankAskOf())
    expect(loggable).to.deep.include({ op: 'birth', ...TH.ThingBank })
    expect(loggable.root).to.deep.equal({ revtok: 'rev-0', revseq: 0, am: 'a', lifepath: Life0 })
    expect(JSON.stringify(loggable)).to.not.include(TH.BW.mainWayin.salt_b64)
    expect(JSON.stringify(loggable)).to.not.include(TH.FakeSealed.codectag)
  })

  it("gives nothing for an ask that will not parse", () => {
    expect(loggableAskOf(null)).to.deep.equal({})
    expect(loggableAskOf({ userid: 42 })).to.deep.equal({})
  })
})
