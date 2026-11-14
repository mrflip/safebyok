import { describe, expect, it, vi } from 'vitest'
import { BX } from 'safebyok-big/internals'
import * as Sealers from '../../src/models/sealers'
import { BoxWhisper } from '../../src/models/sealers'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** A live box ante at its first revision, as a seal over {@link TH.boxAnteOf}'s shell leaves it, without its sealed fields. */
function liveAnte() { return BoxWhisper.nextRevisionOf(TH.boxAnteOf()) }

describe("sealerkindVals", () => {
  it("names, for each kind, a frozen sealer exported under that name", () => {
    for (const sealerkind of Sealers.sealerkindVals) {
      const sealer: unknown = Sealers[sealerkind]
      expect(sealer).to.be.an('object')
      expect(Object.isFrozen(sealer)).to.be.true
    }
  })
})

describe("BoxWhisper", () => {
  it("is frozen, its purposes too", () => {
    expect(Object.isFrozen(BoxWhisper)).to.be.true
    expect(Object.isFrozen(BoxWhisper.purposes)).to.be.true
    expect(BoxWhisper.purposes).to.deep.equal({ key: 'box_key_wrapped', cipher: 'whisper_ciphered' })
  })
})

describe("BoxWhisper.nextRevisionOf(ante)", () => {
  it("starts a new life over a tombstone: a fresh box_tok, registered now, at the next revision", () => {
    vi.setSystemTime(TH.T0 + 3)
    const shell = TH.boxAnteOf()
    const next = BoxWhisper.nextRevisionOf(shell)
    expect(next).to.deep.include({ am: 'a', revision_seq: shell.revision_seq + 1, registered_at: TH.T0 + 3, written_at: TH.T0 + 3, sidecar: shell.sidecar })
    expect(next.box_tok).to.not.eq(shell.box_tok)
    expect(next.revision_tok).to.not.eq(shell.revision_tok)
  })

  it("keeps a live box's life, at the next revision, written now", () => {
    const live = liveAnte()
    vi.setSystemTime(TH.T0 + 5)
    const next = BoxWhisper.nextRevisionOf(live)
    expect(next).to.include({ box_tok: live.box_tok, registered_at: live.registered_at, revision_seq: live.revision_seq + 1, written_at: TH.T0 + 5, am: 'a' })
    expect(next.revision_tok).to.not.eq(live.revision_tok)
  })

  it("leaves the ante it was handed as it was", () => {
    const shell = TH.boxAnteOf()
    const copy = structuredClone(shell)
    BoxWhisper.nextRevisionOf(shell)
    expect(shell).to.deep.equal(copy)
  })

  const AnteCases = [
    [() => ({ ...TH.boxAnteOf(), whisper_ciphered: TH.fakeCiphered('w') }), 'an ante carrying a sealed field'],
    [() => ({ ...TH.boxAnteOf(), am: 'd' }),                                'an ante of a damaged row'],
    [() => ({ ...TH.boxAnteOf(), revision_seq: 1.5 }),                      'a revision_seq that is not an integer'],
    [() => TH.omitting(TH.boxAnteOf(), 'box_tok'),                          'an ante with no box_tok'],
    [() => null,                                                            'null'],
  ] as const

  for (const [anteOf, blurb] of AnteCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => BoxWhisper.nextRevisionOf(anteOf() as never), 'bad_option')
    })
  }
})

describe("BoxWhisper.stampsOf(record)", () => {
  it("is the box's sparse fields alone: no sidecar and no sealed field", () => {
    const live = liveAnte()
    const stamps = BoxWhisper.stampsOf(live)
    expect(stamps).to.have.lengthOf(1)
    expect(stamps[0]).to.deep.equal(BX.boxSparse.parse(live))
    expect(stamps[0]).to.not.have.property('sidecar')
  })

  it("is the same for a record and its ante", () => {
    const live = liveAnte()
    const record = BoxWhisper.recordOf(live, { keyWrapped: TH.fakeCiphered('k'), ciphered: TH.fakeCiphered('w') })
    expect(BoxWhisper.stampsOf(record)).to.deep.equal(BoxWhisper.stampsOf(live))
    expect(BoxWhisper.stampsOf(record)[0]).to.not.have.property('box_key_wrapped')
  })

  it("is the same whatever the sidecar", () => {
    const live = liveAnte()
    expect(BoxWhisper.stampsOf({ ...live, sidecar: { account: 'home' } })).to.deep.equal(BoxWhisper.stampsOf(live))
  })
})

describe("BoxWhisper.encode(cleartexts) and decode(text)", () => {
  it("encodes the whisper as JSON with every object's keys sorted, and decodes it back", () => {
    const whisper = { orgId: 'org-test', apiKey: 'sk-test-0000', extra: { zeta: 1, alpha: [2, { yy: 3, xx: 4 }] } }
    const text = BoxWhisper.encode({ whisper })
    expect(text).to.eq('{"apiKey":"sk-test-0000","extra":{"alpha":[2,{"xx":4,"yy":3}],"zeta":1},"orgId":"org-test"}')
    expect(BoxWhisper.decode(text)).to.deep.equal({ whisper })
  })

  it("encodes two whispers of the same fields in another order alike", () => {
    expect(BoxWhisper.encode({ whisper: { aa: 1, bb: 2 } })).to.eq(BoxWhisper.encode({ whisper: { bb: 2, aa: 1 } }))
  })

  const EncodeCases = [
    [{ whisper: 'sk-test-0000' }, 'a whisper that is a string'],
    [{ whisper: ['sk-test'] },    'a whisper that is an array'],
    [{ whisper: null },           'a null whisper'],
    [{},                          'no whisper'],
    [null,                        'null'],
  ] as const

  for (const [cleartexts, blurb] of EncodeCases) {
    it(`refuses to encode ${blurb}`, () => {
      TH.expectSyncRefusal(() => BoxWhisper.encode(cleartexts as never))
    })
  }

  const DecodeCases = [
    ['{"apiKey":"sk-test-0000"',  'text that is not JSON'],
    ['"sk-test-0000"',            'a JSON string'],
    ['["sk-test-0000"]',          'a JSON array'],
    ['null',                      'JSON null'],
    ['',                          'no text'],
  ] as const

  for (const [text, blurb] of DecodeCases) {
    it(`refuses 'damaged_whisper' for ${blurb}, quoting none of it`, () => {
      const err = TH.expectSyncRefusal(() => BoxWhisper.decode(text), 'damaged_whisper')
      expect(err.cause).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('sk-test-0000')
    })
  }
})

describe("BoxWhisper.sealedOf(record) and recordOf(next, sealed)", () => {
  it("lays the sealed parts into the record, and picks them out again", () => {
    const sealed = { keyWrapped: TH.fakeCiphered('k'), ciphered: TH.fakeCiphered('w') }
    const record = BoxWhisper.recordOf(liveAnte(), sealed)
    expect(record).to.deep.include({ box_key_wrapped: sealed.keyWrapped, whisper_ciphered: sealed.ciphered })
    expect(BX.boxRecord.parse(record)).to.deep.equal(record)
    expect(BoxWhisper.sealedOf(record)).to.deep.equal(sealed)
  })

  it("refuses to lay in sealed parts that are not ciphertexts", () => {
    TH.expectSyncRefusal(() => BoxWhisper.recordOf(liveAnte(), { keyWrapped: 'k', ciphered: TH.fakeCiphered('w') } as never), 'bad_option')
  })

  it("refuses to pick the sealed parts of a tombstone or of null", () => {
    TH.expectSyncRefusal(() => BoxWhisper.sealedOf({ ...TH.boxAnteOf(), am: 'x' } as never), 'bad_option')
    TH.expectSyncRefusal(() => BoxWhisper.sealedOf(null as never), 'bad_option')
  })

  it("refuses to make a record of a tombstone ante", () => {
    TH.expectSyncRefusal(() => BoxWhisper.recordOf({ ...TH.boxAnteOf(), am: 'x' }, { keyWrapped: TH.fakeCiphered('k'), ciphered: TH.fakeCiphered('w') }), 'bad_option')
  })
})
