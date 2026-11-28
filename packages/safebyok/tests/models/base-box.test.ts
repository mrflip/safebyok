import { describe, expect, it, vi } from 'vitest'
import { BaseBox } from '../../src/models/base-box'
import * as Phrases from '../../src/phrases'
import type { BoxCleartexts, LiveOf, RevisionOf } from '../../src/shapes/shapes-sealers'
import type { BoxRecord } from '../../src/shapes/shapes-thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
import { Lifeseq } from '../../src/shapes/primitives'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** Fake sealed whispers, tagged as a box's: the sealer checks only their shape and tags. */
const Sealed = Object.freeze({ ...TH.FakeSealed, ...BaseBox.tags })
const OtherSealed = Object.freeze({ ...Sealed, key_wrapped: TH.fakeCiphered('k2') })

const Life0 = Lifeseq.ofLifenum(0)
const Life1 = Lifeseq.ofLifenum(1)
const Life2 = Lifeseq.ofLifenum(2)

/** The public props of a box's first seal: its sidecar. */
const PublicProps = Object.freeze({ sidecar: TH.Sidecar })

/** A live box at its first revision, without its sealed whisper: the first revision over {@link TH.boxShellOf}'s shell. */
function liveRevisionOf(): RevisionOf<LiveOf<BoxRecord>, BoxCleartexts> {
  return { ...TH.boxShellOf(), revtok: TH.revtokOf('box1'), revseq: 0, am: 'a', lifeseq: Life0, lifepath: `${Life0}/${Life0}`, sidecar: TH.Sidecar }
}

describe("BaseBox", () => {
  it("is frozen, its purposes and tags too", () => {
    expect(Object.isFrozen(BaseBox)).to.be.true
    expect(Object.isFrozen(BaseBox.purposes)).to.be.true
    expect(Object.isFrozen(BaseBox.tags)).to.be.true
    expect(BaseBox.purposes).to.deep.equal({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })
    expect(BaseBox.tags).to.deep.equal({ codectag: 'json_v1', schematag: 'whisper_v1' })
  })
})

describe("BaseBox.donorPropsOf(donor), publicPropsOf(publicProps) and secretPropsOf(secretProps)", () => {
  it("carries over a donor's Thing fields and sidecar, dropping its whisper, sealed or not, and any other field", () => {
    const live = liveRevisionOf()
    const donor = { ...live, whisper: TH.Whisper, whisper_sealed: Sealed, notes: 'dropped' }
    expect(BaseBox.donorPropsOf(donor)).to.deep.equal(live)
    expect(BaseBox.donorPropsOf(TH.boxShellOf())).to.deep.equal(TH.boxShellOf())
  })

  it("has the sidecar, am and written_at of publicProps, and the whisper of secretProps", () => {
    expect(BaseBox.publicPropsOf({ sidecar: TH.Sidecar, am: 'x', written_at: TH.T0 })).to.deep.equal({ sidecar: TH.Sidecar, am: 'x', written_at: TH.T0 })
    expect(BaseBox.secretPropsOf({ whisper: TH.Whisper })).to.deep.equal({ whisper: TH.Whisper })
  })

  it("refuses a field beside the sidecar, am and written_at of publicProps, and beside the whisper of secretProps", () => {
    TH.expectSyncRefusal(() => BaseBox.publicPropsOf({ sidcar: TH.Sidecar } as never), 'bad_record')
    TH.expectSyncRefusal(() => BaseBox.publicPropsOf({ sidecar: TH.Sidecar, whisper: TH.Whisper } as never), 'bad_record')
    TH.expectSyncRefusal(() => BaseBox.secretPropsOf({ whisper: TH.Whisper, sidecar: TH.Sidecar } as never), 'bad_record')
  })

  const PublicPropsCases = [
    [{ am: 'd' },                 'an am that is neither live nor a tombstone'],
    [{ written_at: 'now' },       'a written_at that is not epoch millis'],
    [{ sidecar: 'work' },         'a sidecar that is not an object'],
    [null,                        'null'],
  ] as const

  for (const [publicProps, blurb] of PublicPropsCases) {
    it(`refuses publicProps with ${blurb}`, () => {
      TH.expectSyncRefusal(() => BaseBox.publicPropsOf(publicProps as never), 'bad_record')
    })
  }

  it("refuses a donor of another kind, and secretProps with no whisper", () => {
    TH.expectSyncRefusal(() => BaseBox.donorPropsOf({ ...TH.boxShellOf(), labelpath: 'gate/main' }), 'bad_record')
    TH.expectSyncRefusal(() => BaseBox.secretPropsOf({} as never), 'bad_record')
  })

  it("gives a frozen empty whisper as the tombstone's secrets", () => {
    expect(BaseBox.tombstoneSecrets).to.deep.equal({ whisper: {} })
    expect(Object.isFrozen(BaseBox.tombstoneSecrets)).to.be.true
    expect(Object.isFrozen(BaseBox.tombstoneSecrets.whisper)).to.be.true
  })
})

describe("BaseBox.nextRevisionOf(donor, publicProps)", () => {
  it("starts the first life over the shell: born now, at revseq 0, with the shell's root lifeseq", () => {
    vi.setSystemTime(TH.T0 + 3)
    const shell = TH.boxShellOf()
    const next = BaseBox.nextRevisionOf(shell, PublicProps)
    expect(next).to.deep.include({ am: 'a', revseq: 0, lifeseq: Life0, lifepath: `${Life0}/${Life0}`, born_at: TH.T0 + 3, written_at: TH.T0 + 3, sidecar: TH.Sidecar })
    expect(next.revtok).to.not.eq(shell.revtok)
  })

  it("makes the revision at the written_at given, born then in a new life", () => {
    const next = BaseBox.nextRevisionOf(TH.boxShellOf(), { ...PublicProps, written_at: TH.T0 - 5 })
    expect(next).to.include({ written_at: TH.T0 - 5, born_at: TH.T0 - 5 })
  })

  it("carries over the donor's sidecar unless publicProps gives one", () => {
    const live = liveRevisionOf()
    expect(BaseBox.nextRevisionOf(live).sidecar).to.deep.equal(TH.Sidecar)
    expect(BaseBox.nextRevisionOf(live, { sidecar: { account: 'home' } }).sidecar).to.deep.equal({ account: 'home' })
  })

  it("refuses when neither the donor nor publicProps has a sidecar", () => {
    const err = TH.expectSyncRefusal(() => BaseBox.nextRevisionOf(TH.boxShellOf(), {}), 'bad_record')
    expect(TH.thrownText(err)).to.include(Phrases.SidecarMissing)
  })

  it("stays in a live box's life, at the next revision, written now", () => {
    const live = liveRevisionOf()
    vi.setSystemTime(TH.T0 + 5)
    const next = BaseBox.nextRevisionOf(live)
    expect(next).to.include({ lifeseq: live.lifeseq, lifepath: live.lifepath, born_at: live.born_at, revseq: live.revseq + 1, written_at: TH.T0 + 5, am: 'a' })
    expect(next.revtok).to.not.eq(live.revtok)
  })

  it("starts the next life over a tombstone: the next lifeseq, born now, the revseq still counting up", () => {
    const tombstone = BaseBox.tombstoneOf(liveRevisionOf())
    vi.setSystemTime(TH.T0 + 7)
    const next = BaseBox.nextRevisionOf(tombstone, { sidecar: { account: 'home' } })
    expect(next).to.deep.include({ am: 'a', revseq: 2, lifeseq: Life2, lifepath: `${Life0}/${Life2}`, born_at: TH.T0 + 7, sidecar: { account: 'home' } })
  })

  it("refuses a revival over a tombstone given no sidecar: the tombstone's `{}` is not inherited", () => {
    const tombstone = BaseBox.tombstoneOf(liveRevisionOf())
    const err = TH.expectSyncRefusal(() => BaseBox.nextRevisionOf(tombstone, {}), 'bad_record')
    expect(TH.thrownText(err)).to.include(Phrases.SidecarMissing)
  })

  it("leaves the donor it was handed unchanged", () => {
    const shell = TH.boxShellOf()
    const copy = structuredClone(shell)
    BaseBox.nextRevisionOf(shell, PublicProps)
    expect(shell).to.deep.equal(copy)
  })

  it("carries over none of a stored box's sealed whisper", () => {
    const stored = BaseBox.recordOf(liveRevisionOf(), Sealed)
    const next = BaseBox.nextRevisionOf(stored)
    expect(next).to.not.have.property('whisper_sealed')
  })

  const DonorCases = [
    [() => ({ ...TH.boxShellOf(), am: 'd' }),                'a donor of an incompatible row'],
    [() => ({ ...TH.boxShellOf(), revseq: 1.5 }),            'a revseq that is not an integer'],
    [() => ({ ...TH.boxShellOf(), revtok: TH.revtokOf('1') }),        'half the shell: its revtok moved, its revseq and lifeseq not'],
    [() => ({ ...TH.boxShellOf(), fmt: 5000 }),              'a donor of another fmt'],
    [() => ({ ...TH.boxShellOf(), labelpath: 'gate/main' }), 'a donor of another kind'],
    [() => TH.omitting(TH.boxShellOf(), 'lifepath'),         'a donor with no lifepath'],
    [() => null,                                             'null'],
  ] as const

  for (const [donorOf, blurb] of DonorCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => BaseBox.nextRevisionOf(donorOf() as never, PublicProps), 'bad_record')
    })
  }
})

describe("BaseBox.tombstoneOf(donor)", () => {
  it("makes the tombstone of a live box: its next revision, at the next lifeseq, written now, with the sidecar `{}`", () => {
    const live = liveRevisionOf()
    vi.setSystemTime(TH.T0 + 5)
    const next = BaseBox.tombstoneOf(live)
    expect(next).to.include({ am: 'x', revseq: live.revseq + 1, lifeseq: Life1, lifepath: `${Life0}/${Life1}`, born_at: live.born_at, written_at: TH.T0 + 5 })
    expect(next.revtok).to.not.eq(live.revtok)
    expect(next.sidecar).to.deep.equal({})
  })

  it("is written at the written_at given", () => {
    const next = BaseBox.tombstoneOf(liveRevisionOf(), { written_at: TH.T0 - 3 })
    expect(next).to.include({ am: 'x', written_at: TH.T0 - 3 })
  })

  it("accepts the sidecar `{}` given, a tombstone's own", () => {
    const next = BaseBox.tombstoneOf(liveRevisionOf(), { sidecar: {}, written_at: TH.T0 - 3 })
    expect(next).to.deep.include({ am: 'x', written_at: TH.T0 - 3, sidecar: {} })
  })

  // A tombstone's sidecar is always `{}`.
  it("refuses any other sidecar given", () => {
    const err = TH.expectSyncRefusal(() => BaseBox.tombstoneOf(liveRevisionOf(), { sidecar: { account: 'home' } }), 'bad_record')
    expect(TH.thrownText(err)).to.include(Phrases.TombstoneSidecarNotEmpty)
  })

  it("accepts the am `'x'` given, a tombstone's own", () => {
    expect(BaseBox.tombstoneOf(liveRevisionOf(), { am: 'x' })).to.include({ am: 'x' })
  })

  // A tombstone's am is always `'x'`.
  it("refuses the am `'a'` given", () => {
    TH.expectSyncRefusal(() => BaseBox.tombstoneOf(liveRevisionOf(), { am: 'a' }), 'bad_record')
  })

  it("never carries over the donor's sidecar, given `{}` or none", () => {
    const live = liveRevisionOf()
    expect(live.sidecar).to.not.deep.equal({})
    expect(BaseBox.tombstoneOf(live).sidecar).to.deep.equal({})
    expect(BaseBox.tombstoneOf(live, { sidecar: {} }).sidecar).to.deep.equal({})
  })

  it("refuses a tombstone or the shell", () => {
    const tombstone = BaseBox.tombstoneOf(liveRevisionOf())
    const err = TH.expectSyncRefusal(() => BaseBox.tombstoneOf(tombstone), 'bad_record')
    expect(TH.thrownText(err)).to.include(Phrases.TombstoneOfLiveOnly)
    TH.expectSyncRefusal(() => BaseBox.tombstoneOf(TH.boxShellOf()), 'bad_record')
  })
})

describe("BaseBox.stampOf(record)", () => {
  it("is the box's Thing fields but its label and lifeseq, the last segments of its labelpath and lifepath: no sidecar and no sealed whisper", () => {
    const live = liveRevisionOf()
    const { sidecar: _sidecar, label: _label, lifeseq: _lifeseq, ...thing } = live
    const stamp = BaseBox.stampOf(live)
    expect(stamp).to.deep.equal(thing)
    expect(Object.keys(stamp)).to.have.members(['modelkind', 'userid', 'banklabel', 'labelpath', 'banktok', 'fmt', 'revtok', 'revseq', 'am', 'lifepath', 'born_at', 'written_at'])
  })

  it("is the same for a record and its next revision without its seal", () => {
    const live = liveRevisionOf()
    const record = BaseBox.recordOf(live, Sealed)
    expect(BaseBox.stampOf(record)).to.deep.equal(BaseBox.stampOf(live))
  })

  it("is the same whatever the sidecar", () => {
    const live = liveRevisionOf()
    const resided = { ...live, sidecar: { account: 'home' } }
    expect(BaseBox.stampOf(resided)).to.deep.equal(BaseBox.stampOf(live))
  })

  it("refuses the shell, which has no revision to bind", () => {
    TH.expectSyncRefusal(() => BaseBox.stampOf(TH.boxShellOf() as never), 'bad_record')
  })
})

describe("BaseBox.encode(cleartexts) and decode(text)", () => {
  it("encodes the whisper as JSON with every object's keys sorted, and decodes it back", () => {
    const whisper = { orgId: 'org-test', apiKey: 'sk-test-0000', extra: { zeta: 1, alpha: [2, { yy: 3, xx: 4 }] } }
    const text = BaseBox.encode({ whisper })
    expect(text).to.eq('{"apiKey":"sk-test-0000","extra":{"alpha":[2,{"xx":4,"yy":3}],"zeta":1},"orgId":"org-test"}')
    expect(BaseBox.decode(text)).to.deep.equal({ whisper })
  })

  it("encodes two whispers of the same fields in another order alike", () => {
    expect(BaseBox.encode({ whisper: { aa: 1, bb: 2 } })).to.eq(BaseBox.encode({ whisper: { bb: 2, aa: 1 } }))
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
      TH.expectSyncRefusal(() => BaseBox.encode(cleartexts as never))
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
      const err = TH.expectSyncRefusal(() => BaseBox.decode(text), 'damaged_whisper')
      expect(err.cause).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('sk-test-0000')
    })
  }
})

describe("BaseBox.sealedOf(record) and recordOf(next, sealed)", () => {
  it("lays the sealed whisper into the record, and picks it out again", () => {
    const record = BaseBox.recordOf(liveRevisionOf(), Sealed)
    expect(record.whisper_sealed).to.deep.equal(Sealed)
    expect(Object.isFrozen(record)).to.be.true
    expect(BoxChecks.record.parse(record)).to.deep.equal(record)
    expect(BaseBox.sealedOf(record)).to.deep.equal(Sealed)
  })

  it("lays a sealed empty whisper into a tombstone, and picks it out again", () => {
    const record = BaseBox.recordOf(BaseBox.tombstoneOf(liveRevisionOf()), OtherSealed)
    expect(record).to.include({ am: 'x' })
    expect(BaseBox.sealedOf(record)).to.deep.equal(OtherSealed)
  })

  it("refuses to lay in a sealed whisper that is not ciphertexts and tags", () => {
    TH.expectSyncRefusal(() => BaseBox.recordOf(liveRevisionOf(), { ...Sealed, key_wrapped: 'k' } as never), 'bad_record')
    TH.expectSyncRefusal(() => BaseBox.recordOf(liveRevisionOf(), TH.omitting(Sealed, 'codectag')), 'bad_record')
  })

  it("refuses to make a record of the shell", () => {
    TH.expectSyncRefusal(() => BaseBox.recordOf(TH.boxShellOf() as never, Sealed), 'bad_record')
  })

  it("refuses 'damaged_whisper' for a sealed whisper of other tags, quoting none of it", () => {
    for (const tags of [{ codectag: 'json_v2' }, { schematag: 'whisper_v2' }]) {
      const record = BaseBox.recordOf(liveRevisionOf(), { ...Sealed, ...tags })
      const err = TH.expectSyncRefusal(() => BaseBox.sealedOf(record), 'damaged_whisper')
      expect(TH.thrownText(err)).to.not.include(Sealed.ciphered.ciphertext_b64)
    }
  })

  it("refuses to pick the sealed whisper of the shell or of null", () => {
    TH.expectSyncRefusal(() => BaseBox.sealedOf(TH.boxShellOf() as never), 'bad_record')
    TH.expectSyncRefusal(() => BaseBox.sealedOf(null as never), 'bad_record')
  })
})
