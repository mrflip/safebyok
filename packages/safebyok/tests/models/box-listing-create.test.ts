/** BoxListing.create: the box it makes, sealed at birth, with its whisper and sidecar defaults, over a dna world to boxDna. */

import { ENCRYPTED } from '../../src/helpers/consts'
import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import * as SX from '../../src/shapes/shapes-storage'
import type { BoxDna } from '../../src/shapes/shapes-vaultish'
import * as TH from '../test-helpers'
import { FakeBoxKeyWrapped, FakeWhisperCiphered, boxDnaOf, boxListingOf, fullBoxRecord, sentinelBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

const dna = (boxlabel = 'anthropic_api_key') => boxDnaOf(world.mw.boxscope(boxlabel))

const scope   = () => world.mw.boxscope('anthropic_api_key')

/** The revision a stale_write says storage has stored. */
const stored = { revision_tok: 'rev-s5', revision_seq: 5 }

describe("BoxListing", () => {
  describe("listing.create(dna)", () => {
    it("has a box of the record it stored, at revision 0, once it is written", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.create(dna())
      expect(box).to.be.instanceOf(Box)
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.revision_seq).to.eq(0)
      expect(box._cheat_central.am).to.eq('a')
      expect(world.mw.stored.get('anthropic_api_key')).to.deep.equal(box._cheat_central)
    })

    it("stamps the record with the clock's reading", async () => {
      world.mw.setNow(T0 + 5000)
      const box = await boxListingOf(world.mw).create(dna())
      expect(box.registered_at).to.eq(T0 + 5000)
      expect(box.written_at).to.eq(T0 + 5000)
    })

    it("makes a box present and puts it in the snapshot", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.create(dna())
      expect(box.isPresent).to.be.true
      expect(box.am).to.eq('a')
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(listing.snapshot[0]).to.include({ boxlabel: 'anthropic_api_key' })
    })

    it("goes straight through: ensureTimely, put, receiveWorld, and no get", async () => {
      await boxListingOf(world.mw).create(dna())
      expect(world.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely', 'put', 'receiveWorld'])
    })

    it("leaves the scope free for another create when the put is refused", async () => {
      const listing = boxListingOf(world.mw)
      world.mw.willPut(world.mw.staleWriteOf(scope(), undefined))
      await TH.expectRefusal(listing.create(dna()), 'stale_write')
      const shell = listing.at(scope())
      expect(shell?.isPresent).to.be.false
      expect(listing.things).to.deep.equal([shell])
      expect(listing.snapshot).to.deep.equal([])
      const again = await listing.create(dna())
      expect(again).to.eq(shell)
      expect(again.revision_seq).to.eq(0)
    })

    it("refuses 'stale_write' over a live row it does not have, and lists that row", async () => {
      const listing = boxListingOf(world.mw)
      world.mw.seedPut(fullBoxRecord(stored))
      await TH.expectRefusal(listing.create(dna()), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })

    it("refuses a dna naming another vault, sealing and putting nothing", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.create({ ...dna(), vaultlabel: 'another_vault' }))
      expect(listing.things).to.deep.equal([])
      expect(world.mw.calls.map(({ verb }) => verb)).to.deep.equal([])
    })

    it("refuses another vault's box, asking storage nothing", async () => {
      const listing = boxListingOf(world.mw)
      const { whisper: _whisper, sidecar: _sidecar, ...scope } = dna()
      const mary = { ...scope, vaultlabel: 'mary' }
      TH.expectSyncRefusal(() => listing.at(mary))
      await TH.expectRefusal(listing.fetch(mary))
      expect(world.mw.callsOf('get')).to.deep.equal([])
    })

    it("refuses a put of another vault's record, putting nothing", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.put({ ...fullBoxRecord(), vaultlabel: 'mary' }, { expected: sentinelBoxRecord() }))
      expect(world.mw.callsOf('put')).to.deep.equal([])
    })

    it("refuses 'camped' over a live box it already lists, leaving that box unchanged", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.create(dna())
      await TH.expectRefusal(listing.create(dna()), 'camped')
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.revision_seq).to.eq(0)
    })

    it("fills the record's defaults beside the dna's scope: the format, the vault's tok, an empty sidecar, sealed", async () => {
      const box = await boxListingOf(world.mw).create(dna())
      expect(box.fmt).to.eq(fullBoxRecord().fmt)
      expect(box.vault_tok).to.eq(world.mw.world.vault_tok)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({})
    })

    it("notifies the snapshot's listener once", async () => {
      const listing = boxListingOf(world.mw)
      let told = 0
      listing.subscribe(() => { told += 1 })
      await listing.create(dna())
      expect(told).to.eq(1)
    })

    it("creates two boxes, each listed under its own boxlabel", async () => {
      const listing = boxListingOf(world.mw)
      const one = await listing.create(dna('one'))
      const two = await listing.create(dna('two'))
      expect(listing.things).to.deep.equal([one, two])
      expect(listing.snapshot.map(({ boxlabel }) => boxlabel)).to.have.members(['one', 'two'])
    })
  })

  describe("listing.create(dna with a whisper)", () => {
    it("seals the whisper in at birth: the box is full at revision 0, and has none of the whisper", async () => {
      const box = await boxListingOf(world.mw).create({ ...dna(), whisper: { key: 'sk-ant-secret' } })
      expect(box.isFull).to.be.true
      expect(box.revision_seq).to.eq(0)
      expect(JSON.stringify(box._cheat_central)).to.not.include('sk-ant-secret')
    })
  })
})

describe("BoxListing: create checks its dna with boxDna", () => {
  it("refuses a one-letter boxlabel, naming boxlabel, listing and calling nothing", async () => {
    const listing = boxListingOf(world.mw)
    const err = await TH.expectRefusal(listing.create({ ...dna(), boxlabel: 'B' }))
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
    expect(listing.things).to.deep.equal([])
    expect(world.mw.calls).to.deep.equal([])
  })

  it("refuses a field a dna does not accept", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.create({ ...dna(), sidcar: {} } as unknown as BoxDna))
    expect(listing.things).to.deep.equal([])
  })

  it("refuses a bad whisper before the box is built", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.create({ ...dna(), whisper: null } as unknown as BoxDna))
    expect(listing.things).to.deep.equal([])
  })

  it("ignores the props the factory controls: the box is born alive, in the world's vault, at revision 0, under the clock's time", async () => {
    world.mw.setNow(T0 + 5000)
    const box = await boxListingOf(world.mw).create({ ...dna(), am: 'x', vault_tok: 'vault-tok-other', box_tok: 'box-tok-given', revision_tok: 'rev-given', registered_at: T0, written_at: T0 })
    expect(box.am).to.eq('a')
    expect(box.box_tok).to.be.a('string').and.not.eq('box-tok-given')
    expect(box.isPresent).to.be.true
    expect(box.vault_tok).to.eq(world.mw.world.vault_tok)
    expect(box.revision_seq).to.eq(0)
    expect(box.revision_tok).to.not.eq('rev-given')
    expect(box.registered_at).to.eq(T0 + 5000)
  })

  it("refuses a revision_seq in the dna", async () => {
    await TH.expectRefusal(boxListingOf(world.mw).create({ ...dna(), revision_seq: 3 } as never))
  })

  it("gives each new box its own box_tok", async () => {
    const listing = boxListingOf(world.mw)
    const one = await listing.create(dna())
    const two = await listing.create({ ...dna(), boxlabel: 'openai_api_key' })
    expect(one._cheat_central).to.have.property('box_tok').that.is.a('string')
    expect(one.box_tok).to.not.eq(two.box_tok)
  })

  it("refuses a factory prop that fails its check, though it would be ignored", async () => {
    await TH.expectRefusal(boxListingOf(world.mw).create({ ...dna(), fmt: 8 } as unknown as BoxDna))
  })

  it("fills the record's defaults for props given as undefined", async () => {
    const box = await boxListingOf(world.mw).create({ ...dna(), whisper_codec: undefined, whisper_schema_version: undefined })
    expect(box._cheat_central).to.deep.include({ whisper_codec: 'json_v1', whisper_schema_version: 1 })
  })
})

describe("boxListing.create(dna, opts)", () => {
  it("refuses a whole record, putting nothing", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.create({ ...fullBoxRecord() }))
    expect(world.mw.callsOf('put')).to.deep.equal([])
    expect(listing.things).to.deep.equal([])
  })

  it("refuses ifAbsent 'fail'", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.create(dna(), { ifAbsent: 'fail' } as never))
    expect(listing.things).to.deep.equal([])
  })

  it("replaces a live box where told ifPresent 'repl', asking nothing first", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.create(dna())
    world.mw.clearCalls()
    await expect(listing.create(dna(), { ifPresent: 'repl' })).resolves.to.eq(box)
    expect(box.revision_seq).to.eq(1)
    expect(world.mw.callsOf('get')).to.deep.equal([])
  })

  it("tryCreate returns a refusal as an Outcome", async () => {
    const listing = boxListingOf(world.mw)
    await listing.create(dna())
    expect(await listing.tryCreate(dna())).to.deep.include({ ok: false })
  })
})

// == [Sealed at birth]: create, boxDna, the vault's lease

describe("boxListing.create(dna): the box is sealed at birth", () => {
  it("puts a full record at revision 0, sealed by the vault's lease", async () => {
    const box = await boxListingOf(world.mw).create(dna())
    expect(box.isFull).to.be.true
    expect(box.revision_seq).to.eq(0)
    expect(box.box_key_wrapped).to.deep.equal(FakeBoxKeyWrapped)
    expect(box.whisper_ciphered).to.deep.equal(FakeWhisperCiphered)
    const [put] = world.mw.callsOf('put')
    expect(put?.expectedRevisionTok).to.be.null
    expect(put?.record).to.include({ revision_seq: 0, am: 'a' })
    expect(SX.boxRecord.parse(put?.record)).to.deep.equal(put?.record)
  })

  it("seals the dna's sidecar in beside the whisper", async () => {
    const box = await boxListingOf(world.mw).create({ ...dna(), sidecar: { account: 'work' }, whisper: { apiKey: 'sk-test-0000' } })
    expect(box.sidecar).to.deep.equal({ account: 'work' })
    expect(box.isFull).to.be.true
  })

  it("refuses 'vault_locked' while the vault is locked, listing and sealing nothing", async () => {
    world.mw.setLocked(true)
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.create({ ...dna(), whisper: { apiKey: 'sk-test-0000' } }), 'vault_locked')
    expect(listing.snapshot).to.deep.equal([])
    expect(world.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely'])
  })

  it("builds from a record while the vault is locked", async () => {
    world.mw.setLocked(true)
    const box = await boxListingOf(world.mw).build(fullBoxRecord())
    expect(box.revision_seq).to.eq(1)
  })

  it("refuses a dna carrying sealed parts, listing nothing", async () => {
    const listing = boxListingOf(world.mw)
    const { box_key_wrapped, whisper_ciphered } = fullBoxRecord()
    await TH.expectRefusal(listing.create({ ...dna(), box_key_wrapped, whisper_ciphered } as never))
    expect(listing.things).to.deep.equal([])
  })
})

describe("boxListing.create(dna): no secret material", () => {
  it("leaves none of the whisper in the cached record, the snapshots or the listing", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.create({ ...dna(), whisper: { key: 'sk-test-SECRET' } })
    for (const form of [box.toJSON(), box._cheat_central, box.snapshot, listing.snapshot, world.mw.calls]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
    expect(box.whisper).to.eq(ENCRYPTED)
  })

  it("seals the same placeholders whatever the whisper", async () => {
    const listing = boxListingOf(world.mw)
    const one = await listing.create({ ...dna('one_box'), whisper: { apiKey: 'sk-test-one' } })
    const other = await listing.create({ ...dna('other_box'), whisper: { apiKey: 'sk-test-other' } })
    expect(one.whisper_ciphered).to.deep.equal(other.whisper_ciphered)
    expect(one.box_key_wrapped).to.deep.equal(other.box_key_wrapped)
  })
})
// --

// == [A whisper and a sidecar at birth]: create, boxDna

describe("boxListing.create(dna): a whisper and a sidecar, each defaulting", () => {
  const DnaCases = [
    [{ whisper: undefined },                     'a whisper given as undefined'],
    [{ sidecar: undefined },                     'a sidecar given as undefined'],
    [{ whisper: undefined, sidecar: undefined }, 'neither'],
  ] as const

  for (const [lacks, blurb] of DnaCases) {
    it(`creates a box from a dna with ${blurb}`, async () => {
      const box = await boxListingOf(world.mw).create({ ...dna(), ...lacks } as unknown as BoxDna)
      expect(box.isPresent).to.be.true
      expect(world.mw.callsOf('put')).to.have.lengthOf(1)
    })
  }

  it("creates a box from a dna of the scope alone, with sidecar {}", async () => {
    const box = await boxListingOf(world.mw).create(world.mw.boxscope('anthropic_api_key'))
    expect(box.isPresent).to.be.true
    expect(box.sidecar).to.deep.equal({})
  })
})
// --

// == [The whisper at birth]: build, boxDna

describe("boxListing.create(dna): the whisper", () => {
  const BadWhisperCases = [
    [null,                            ['whisper'], 'null'],
    [['sk-test-SECRET', undefined],   ['whisper'], 'an array with undefined'],
    [{ SECRET_NOTE: new Map() },      ['whisper'], 'an object with a Map'],
  ] as const

  for (const [whisper, fieldnames, blurb] of BadWhisperCases) {
    it(`refuses a dna whose whisper is ${blurb}`, async () => {
      const listing = boxListingOf(world.mw)
      const err = await TH.expectRefusal(listing.create({ ...dna(), whisper: whisper as never }))
      expect(err.meta?.fieldnames).to.deep.equal([...fieldnames])
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(listing.things).to.deep.equal([])
      expect(world.mw.calls).to.deep.equal([])
    })
  }

  it("leaves the host's own whisper object as given", async () => {
    const whisper = { apiKey: 'sk-test-0000' }
    const box = await boxListingOf(world.mw).create({ ...dna(), whisper })
    expect(box.isFull).to.be.true
    expect(Object.isFrozen(whisper)).to.be.false
  })
})
// --
