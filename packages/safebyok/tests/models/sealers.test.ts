import { describe, expect, it, vi } from 'vitest'
import * as Sealers from '../../src/models/sealers'
import { BoxTombstone, BoxWhisper } from '../../src/models/sealers'
import * as Phrases from '../../src/phrases'
import { boxSparse, boxThing, lifeseqOfLifenum } from '../../src/storage/shapes-thing'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** Fake sealed whispers, tagged as a box's: the sealer checks only their shape and tags. */
const Sealed = Object.freeze({ ...TH.FakeSealed, ...BoxWhisper.tags })
const OtherSealed = Object.freeze({ ...Sealed, key_wrapped: TH.fakeCiphered('k2') })

const Life0 = lifeseqOfLifenum(0)
const Life1 = lifeseqOfLifenum(1)
const Life2 = lifeseqOfLifenum(2)

/** A live box at its first revision, as a seal over {@link TH.boxShellOf}'s shell leaves it, without its sealed whisper. */
function liveNext() { return BoxWhisper.nextRevisionOf(TH.boxShellOf()) }

describe("sealerkindVals", () => {
  it("names, for each kind, a frozen sealer exported under that name", () => {
    for (const sealerkind of Sealers.sealerkindVals) {
      const sealer: unknown = Sealers[sealerkind]
      expect(sealer).to.be.an('object')
      expect(Object.isFrozen(sealer)).to.be.true
    }
  })
})

describe("BoxWhisper and BoxTombstone", () => {
  it("are frozen, their purposes and tags too, and share all but their next revision", () => {
    expect(Object.isFrozen(BoxWhisper)).to.be.true
    expect(Object.isFrozen(BoxWhisper.purposes)).to.be.true
    expect(Object.isFrozen(BoxWhisper.tags)).to.be.true
    expect(BoxWhisper.purposes).to.deep.equal({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })
    expect(BoxWhisper.tags).to.deep.equal({ codectag: 'json_v1', schematag: 'whisper_v1' })
    expect({ ...BoxTombstone, nextRevisionOf: null }).to.deep.equal({ ...BoxWhisper, nextRevisionOf: null })
  })
})

describe("BoxWhisper.nextRevisionOf(prior)", () => {
  it("starts the first life over the shell: born now, at revseq 0, keeping the shell's root lifeseq", () => {
    vi.setSystemTime(TH.T0 + 3)
    const shell = TH.boxShellOf()
    const next = BoxWhisper.nextRevisionOf(shell)
    expect(next).to.deep.include({ am: 'a', revseq: 0, lifeseq: Life0, lifepath: `${Life0}/${Life0}`, born_at: TH.T0 + 3, written_at: TH.T0 + 3, sidecar: shell.sidecar })
    expect(next.revtok).to.not.eq(shell.revtok)
  })

  it("keeps a live box's life, at the next revision, written now", () => {
    const live = liveNext()
    vi.setSystemTime(TH.T0 + 5)
    const next = BoxWhisper.nextRevisionOf(live)
    expect(next).to.include({ lifeseq: live.lifeseq, lifepath: live.lifepath, born_at: live.born_at, revseq: live.revseq + 1, written_at: TH.T0 + 5, am: 'a' })
    expect(next.revtok).to.not.eq(live.revtok)
  })

  it("starts the next life over a tombstone: the next lifeseq, born now, the revseq still counting up", () => {
    const tombstone = BoxTombstone.nextRevisionOf(liveNext())
    vi.setSystemTime(TH.T0 + 7)
    const next = BoxWhisper.nextRevisionOf({ ...tombstone, sidecar: { account: 'home' } })
    expect(next).to.deep.include({ am: 'a', revseq: 2, lifeseq: Life2, lifepath: `${Life0}/${Life2}`, born_at: TH.T0 + 7, sidecar: { account: 'home' } })
  })

  it("leaves the prior it was handed as it was, and keeps none of a stored box's sealed whisper", () => {
    const shell = TH.boxShellOf()
    const copy = structuredClone(shell)
    BoxWhisper.nextRevisionOf(shell)
    expect(shell).to.deep.equal(copy)
    const stored = BoxWhisper.recordOf(liveNext(), Sealed)
    const next = BoxWhisper.nextRevisionOf(stored)
    expect(next).to.not.have.property('whisper_sealed')
  })

  const PriorCases = [
    [() => ({ ...TH.boxShellOf(), am: 'd' }),                'a prior of a damaged row'],
    [() => ({ ...TH.boxShellOf(), revseq: 1.5 }),            'a revseq that is not an integer'],
    [() => ({ ...TH.boxShellOf(), revtok: 'rev-1' }),        'half the shell: its revtok moved, its revseq and lifeseq not'],
    [() => ({ ...TH.boxShellOf(), fmt: 5000 }),              'a prior of another fmt'],
    [() => ({ ...TH.boxShellOf(), labelpath: 'gate/main' }), 'a prior of another kind'],
    [() => TH.omitting(TH.boxShellOf(), 'lifepath'),         'a prior with no lifepath'],
    [() => TH.omitting(TH.boxShellOf(), 'sidecar'),          'a prior with no sidecar'],
    [() => null,                                             'null'],
  ] as const

  for (const [priorOf, blurb] of PriorCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => BoxWhisper.nextRevisionOf(priorOf() as never), 'bad_option')
    })
  }
})

describe("BoxTombstone.nextRevisionOf(prior)", () => {
  it("makes the tombstone of a live box: its next revision, at the next lifeseq, written now, with no sidecar", () => {
    const live = liveNext()
    vi.setSystemTime(TH.T0 + 5)
    const next = BoxTombstone.nextRevisionOf(live)
    expect(next).to.include({ am: 'x', revseq: live.revseq + 1, lifeseq: Life1, lifepath: `${Life0}/${Life1}`, born_at: live.born_at, written_at: TH.T0 + 5 })
    expect(next.revtok).to.not.eq(live.revtok)
    expect(next).to.not.have.property('sidecar')
  })

  it("refuses a tombstone or the shell", () => {
    const tombstone = BoxTombstone.nextRevisionOf(liveNext())
    const err = TH.expectSyncRefusal(() => BoxTombstone.nextRevisionOf(tombstone), 'bad_option')
    expect(TH.thrownText(err)).to.include(Phrases.TombstoneOfLiveOnly)
    TH.expectSyncRefusal(() => BoxTombstone.nextRevisionOf(TH.boxShellOf()), 'bad_option')
  })
})

describe("BoxWhisper.stampsOf(record)", () => {
  it("is the box's Thing fields alone: no sidecar and no sealed whisper", () => {
    const live = liveNext()
    const stamps = BoxWhisper.stampsOf(live)
    expect(stamps).to.have.lengthOf(1)
    expect(stamps[0]).to.deep.equal(boxSparse.parse(live))
    expect(Object.keys(stamps[0] ?? {})).to.have.members(['userid', 'banklabel', 'labelpath', 'label', 'fmt', 'revtok', 'revseq', 'am', 'lifeseq', 'lifepath', 'born_at', 'written_at'])
  })

  it("is the same for a record and its next revision without its seal", () => {
    const live = liveNext()
    const record = BoxWhisper.recordOf(live, Sealed)
    expect(BoxWhisper.stampsOf(record)).to.deep.equal(BoxWhisper.stampsOf(live))
  })

  it("is the same whatever the sidecar", () => {
    const live = liveNext()
    const resided = { ...live, sidecar: { account: 'home' } }
    expect(BoxWhisper.stampsOf(resided)).to.deep.equal(BoxWhisper.stampsOf(live))
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
  it("lays the sealed whisper into the record, and picks it out again", () => {
    const record = BoxWhisper.recordOf(liveNext(), Sealed)
    expect(record.whisper_sealed).to.deep.equal(Sealed)
    expect(Object.isFrozen(record)).to.be.true
    expect(boxThing.parse(record)).to.deep.equal(record)
    expect(BoxWhisper.sealedOf(record)).to.deep.equal(Sealed)
  })

  it("lays a sealed empty whisper into a tombstone, and picks it out again", () => {
    const record = BoxTombstone.recordOf(BoxTombstone.nextRevisionOf(liveNext()), OtherSealed)
    expect(record).to.include({ am: 'x' })
    expect(BoxTombstone.sealedOf(record)).to.deep.equal(OtherSealed)
  })

  it("refuses to lay in a sealed whisper that is not ciphertexts and tags", () => {
    TH.expectSyncRefusal(() => BoxWhisper.recordOf(liveNext(), { ...Sealed, key_wrapped: 'k' } as never), 'bad_option')
    TH.expectSyncRefusal(() => BoxWhisper.recordOf(liveNext(), TH.omitting(Sealed, 'codectag')), 'bad_option')
  })

  it("refuses to make a record of the shell", () => {
    TH.expectSyncRefusal(() => BoxWhisper.recordOf(TH.boxShellOf(), Sealed), 'bad_option')
  })

  it("refuses 'damaged_whisper' for a sealed whisper of other tags, quoting none of it", () => {
    for (const tags of [{ codectag: 'json_v2' }, { schematag: 'whisper_v2' }]) {
      const record = BoxWhisper.recordOf(liveNext(), { ...Sealed, ...tags })
      const err = TH.expectSyncRefusal(() => BoxWhisper.sealedOf(record), 'damaged_whisper')
      expect(TH.thrownText(err)).to.not.include(Sealed.ciphered.ciphertext_b64)
    }
  })

  it("refuses to pick the sealed whisper of the shell or of null", () => {
    TH.expectSyncRefusal(() => BoxWhisper.sealedOf(TH.boxShellOf() as never), 'bad_option')
    TH.expectSyncRefusal(() => BoxWhisper.sealedOf(null as never), 'bad_option')
  })
})
