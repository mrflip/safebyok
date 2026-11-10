/** A Box's own props, sidecar and snapshot, the records it receives, and the arguments its entries check first. */

import * as Phrases from '../../src/helpers/phrases'
import { describe, expect, it, vi } from 'vitest'
import { ENCRYPTED, LOCKED } from '../../src/helpers/consts'
import type { BoxSnapshot, Fetched } from '../../src/shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { type TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

/** A box with `record` (the full box record `anthropic_api_key` at revision 1, by default) as received, through a listing over the test world. */
/** A box built of `record`, with the same record in storage. */
const builtOf = (record: Fetched<BoxRecord, BoxSparse>): Promise<TestableBox> => {
  world.mw.seedPut(record)
  return boxListingOf(world.mw).build(record)
}

const boxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<TestableBox> => builtOf(record)

/** The snapshot of a box with `record`, as `getSnapshot` answers it. */
const snapshotOf = async (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<BoxSnapshot> => {
  const box = await boxOf(record)
  return box.getSnapshot()
}

const SnapshotKeys = ['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'sidecar', 'isFull', 'isPresent', 'isExposed', 'isVeiled']

describe("Box own props", () => {
  it("are exactly the nine the base tattoos: the four of the scope, registered_at, vault_tok and the three revision props", async () => {
    const box = await boxOf()
    expect(Object.keys(box)).to.have.members(['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'registered_at', 'vault_tok', 'revision_tok', 'revision_seq', 'written_at'])
    expect(Object.keys(box)).to.have.lengthOf(9)
  })

  it("stay nine through a receive, a put and a del", async () => {
    const box = await boxOf()
    const keys = Object.keys(box)
    const received = world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' })
    world.mw.seedPut(received)
    box.receive(received)
    expect(Object.keys(box)).to.have.members(keys)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'edited' } })
    expect(Object.keys(box)).to.have.members(keys)
    await box.del()
    expect(Object.keys(box)).to.have.members(keys)
  })

  it("leave out the world, the listing, the whisper exposed, the record's sealed parts and fmt, which are adorned, private or on the prototype", async () => {
    const box = await boxOf()
    for (const ckey of ['world', 'listing', 'whisper', 'sidecar', 'fmt', 'box_key_wrapped', 'whisper_codec', 'whisper_schema_version', 'whisper_ciphered', 'scope', 'am']) {
      expect(Object.keys(box), ckey).to.not.include(ckey)
    }
    expect(box.fmt).to.eq(fullBoxRecord().fmt)
    expect(box.box_key_wrapped).to.deep.equal(fullBoxRecord().box_key_wrapped)
  })

  it("duck as the record's sparse form where the host JSON-stringifies them", async () => {
    const box = await boxOf()
    expect(JSON.stringify(box)).to.eq(JSON.stringify(world.mw.sparseBoxRecord()))
  })
})

describe("Box sidecar, locked or not", () => {
  it("ENCRYPTED is the bag the whisper answers while unexposed, locked or not", async () => {
    const box = await boxOf()
    expect(box.whisper).to.eq(ENCRYPTED)
    world.mw.setLocked(true)
    expect(box.whisper).to.eq(ENCRYPTED)
  })

  it("answers itself, whether the vault is unlocked or locked", async () => {
    const box = await boxOf()
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
    world.mw.setLocked(true)
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
    world.mw.setLocked(false)
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
  })

  it("is null where the record in hand is not full, locked or not", async () => {
    const sparse = await boxOf(world.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    const gone = await boxOf(world.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
    for (const isLocked of [false, true]) {
      world.mw.setLocked(isLocked)
      expect(sparse.sidecar).to.be.null
      expect(gone.sidecar).to.be.null
    }
  })

  it("is the snapshot's sidecar too, which a lock leaves alone: a listener is told through the vault, and the snapshot has", async () => {
    const box = await boxOf()
    const listener = vi.fn()
    box.subscribe(listener)
    const before = box.getSnapshot()
    world.mw.setLocked(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(box.getSnapshot()).to.eq(before)
    expect(box.getSnapshot().sidecar).to.deep.equal({ note: 'a test box' })
    box.align()
    expect(box.getSnapshot()).to.eq(before)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("tells an empty sidecar from an absent one in the snapshot, locked or not", async () => {
    const empty = await boxOf(fullBoxRecord({ sidecar: {} }))
    const sparse = await boxOf(world.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    for (const isLocked of [false, true]) {
      world.mw.setLocked(isLocked)
      expect(empty.getSnapshot().sidecar).to.deep.equal({})
      expect(sparse.getSnapshot().sidecar).to.be.null
    }
  })

  it("follows a receive of a record with another sidecar into the snapshot while locked, telling its listeners", async () => {
    const box = await boxOf()
    world.mw.setLocked(true)
    const before = box.getSnapshot()
    const listener = vi.fn()
    box.subscribe(listener)
    box.receive(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', sidecar: { note: 'newer' } }))
    expect(listener.mock.calls).to.have.lengthOf(1)
    expect(box.getSnapshot()).to.not.eq(before)
    expect(box.getSnapshot().sidecar).to.deep.equal({ note: 'newer' })
    expect(box.sidecar).to.deep.equal({ note: 'newer' })
  })

  it("is never on the sparse form or a tombstone, locked or not: those have no sidecar at all", async () => {
    const box = await boxOf()
    const gone = await boxOf(world.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
    for (const isLocked of [false, true]) {
      world.mw.setLocked(isLocked)
      for (const form of [box.sparse, box.toJSON(), gone.sparse, gone.toJSON(), gone._cheat_central]) {
        expect(form).to.not.have.property('sidecar')
      }
      expect(box.sparse).to.not.have.property('sidecar')
      expect(box._cheat_central).to.deep.equal(fullBoxRecord())
    }
  })
})

describe("Box snapshot", () => {
  it("carries the scope, the revision props, registered_at, written_at, the sidecar, and the states full, present, exposed and veiled, and no more", async () => {
    const box = await boxOf()
    expect(box.getSnapshot()).to.deep.equal({
      ...world.mw.boxscope('anthropic_api_key'),
      revision_tok:  'rev-a1',
      revision_seq:  1,
      registered_at: T0,
      written_at:    T0,
      sidecar:       { note: 'a test box' },
      isFull:        true,
      isPresent:     true,
      isExposed:     false,
      isVeiled:      false,
    })
    expect(Object.keys(box.getSnapshot())).to.have.members(SnapshotKeys)
  })

  it("is plain data: no vault_tok, no sealed parts, no scope prop, no methods", async () => {
    const snapshot = await snapshotOf()
    for (const ckey of ['vault_tok', 'scope', 'fmt', 'box_key_wrapped', 'whisper_ciphered', 'whisper_codec', 'whisper_schema_version', 'am']) {
      expect(snapshot, ckey).to.not.have.property(ckey)
    }
    expect(Object.getPrototypeOf(snapshot)).to.eq(Object.prototype)
    expect(Object.values(snapshot).filter((val) => typeof val === 'function')).to.deep.equal([])
  })

  it("is flat in the scope, so that it ducks as one", async () => {
    const snapshot = await snapshotOf()
    expect(snapshot).to.deep.include(world.mw.boxscope('anthropic_api_key'))
  })

  describe("for a box in each state", () => {
    it("full: the sidecar of the record in hand, full and present", async () => {
      const snapshot = await snapshotOf()
      expect(snapshot).to.include({ isFull: true, isPresent: true, isExposed: false })
      expect(snapshot.sidecar).to.deep.equal({ note: 'a test box' })
    })

    it("sparse: present and not full, the sidecar null", async () => {
      const snapshot = await snapshotOf(world.mw.sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(snapshot).to.include({ isFull: false, isPresent: true, isExposed: false, sidecar: null, revision_seq: 2, written_at: T0 + 20 })
    })

    it("gone: not present and not full, the sidecar null", async () => {
      const snapshot = await snapshotOf(world.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
      expect(snapshot).to.include({ isFull: false, isPresent: false, isExposed: false, sidecar: null, revision_seq: 2, revision_tok: 'rev-x2' })
    })

    it("born from a dna: present, full, the sidecar empty, at revision 0 registered and written now", async () => {
      world.mw.setNow(T0 + 7000)
      const box = await boxListingOf(world.mw).create(boxDnaOf(world.mw.boxscope('openai_api_key')))
      expect(box.getSnapshot()).to.deep.equal({
        ...world.mw.boxscope('openai_api_key'),
        revision_tok:  box.revision_tok,
        revision_seq:  0,
        registered_at: T0 + 7000,
        written_at:    T0 + 7000,
        sidecar:       {},
        isFull:        true,
        isPresent:     true,
        isExposed:     false,
        isVeiled:      false,
      })
    })

    it("put: the record put is the record in hand, so the sidecar and the revision are the put's", async () => {
      const box = await boxOf()
      world.mw.setNow(T0 + 500)
      await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'edited' } })
      expect(box.getSnapshot()).to.deep.include({ sidecar: { note: 'edited' }, revision_seq: 2, written_at: T0 + 500, isFull: true, isPresent: true })
    })

    it("exposed: follows the whisper the box keeps open", async () => {
      const box = await boxOf()
      await box.put({ whisper: { apiKey: 'sk-ant-fake-for-test' } })
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      await box.expose()
      expect(box.getSnapshot().isExposed).to.be.true
      expect(listener.mock.calls).to.have.lengthOf(1)
      expect(JSON.stringify(box.getSnapshot())).to.not.contain('sk-ant-fake-for-test')
      box.unexpose()
      expect(box.getSnapshot().isExposed).to.be.false
      expect(listener.mock.calls).to.have.lengthOf(2)
    })
  })
})

// == [Receive]: success noted on a whole record, registered_at over a tombstone, another vault_tok throws

describe("box.receive(rcvd): a whole record makes the box timely", () => {
  const ReceivedCases = [
    // whole:
    [() => fullBoxRecord(),                true,  'a full record'],
    [() => tombstoneBoxRecord(),           true,  "a deletion's tombstone"],
    // not whole:
    [() => sparseBoxRecord(),              false, 'a sparse record'],
  ] as const satisfies readonly (readonly [() => Fetched<BoxRecord, BoxSparse> | null, boolean, string])[]

  for (const [rcvdOf, timely, blurb] of ReceivedCases) {
    it(`${timely ? 'notes success on' : 'notes no success on'} ${blurb}, newer than a box just created and left to age`, async () => {
      const box = await boxListingOf(world.mw, { maxMillisSinceRefresh: 1000 }).create(boxDnaOf(world.mw.boxscope('anthropic_api_key')))
      world.mw.setNow(T0 + 1000)
      expect(box.isTimely).to.be.false
      box.receive(rcvdOf())
      expect(box.isTimely).to.eq(timely)
    })
  }

  const ConfirmingCases = [
    [() => fullBoxRecord(),   'a full record'],
    [() => sparseBoxRecord(), 'a sparse record'],
  ] as const

  for (const [rcvdOf, blurb] of ConfirmingCases) {
    it(`notes success on ${blurb} that only confirms the full central is set`, async () => {
      const box = await boxListingOf(world.mw, { maxMillisSinceRefresh: 1000 }).build(fullBoxRecord())
      world.mw.setNow(T0 + 1000)
      expect(box.isTimely).to.be.false
      box.receive(rcvdOf())
      expect(box.isTimely).to.be.true
      expect(box.revision_seq).to.eq(1)
    })
  }
})

describe("box.receive(rcvd): registered_at, set at a birthday; another vault_tok throws", () => {
  it("keeps registered_at over a newer living record registered at another time", async () => {
    const box = await builtOf(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', registered_at: T0 + 7 }))
    expect(box.registered_at).to.eq(T0)
    expect(box.revision_seq).to.eq(2)
  })

  it("takes registered_at and box_tok from a record of another life received over a tombstone world", async () => {
    const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    box.receive(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-b3', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', vault_tok: 'vault-tok-u1', revision_seq: 3 })
  })

  it("takes registered_at and box_tok from a newer record of another life received over a box world alive, a birthday elsewhere after a deletion this device never received", async () => {
    const box = await builtOf(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-b4', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', revision_seq: 4 })
  })

  const ListedCases = [
    ['a box world alive',          () => fullBoxRecord()],
    ['a box world deleted',        () => tombstoneBoxRecord({ revision_seq: 1 }, 'x')],
  ] as const
  const OtherVaultCases = [
    [2, 'a newer record'],
    [1, 'a record at the revision world'],
    [0, 'an older record, which the revisions of another life of the vault do not order'],
  ] as const
  for (const [listedBlurb, listedOf] of ListedCases) {
    for (const [seq, blurb] of OtherVaultCases) {
      it(`throws for ${blurb} under another vault_tok over ${listedBlurb}, keeping its own copy`, async () => {
        const box = await boxListingOf(world.mw).build(listedOf())
        const central = box._cheat_central
        TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: seq, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })))
        expect(box._cheat_central).to.eq(central)
        expect(box.vault_tok).to.eq('vault-tok-u1')
      })
    }
  }

  it("throws for a record under another vault_tok whose life tok path, joined, is the box's own", async () => {
    const box = await builtOf(fullBoxRecord())
    const central = box._cheat_central
    TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-u1-box', box_tok: 'tok-a' })))
    expect(box._cheat_central).to.eq(central)
  })

  it("throws over a box just created, and for a tombstone under another vault_tok", async () => {
    const box = await boxListingOf(world.mw).create(boxDnaOf(world.mw.boxscope('drafted')))
    const other = { boxlabel: 'drafted', vault_tok: 'vault-tok-other' }
    TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ ...other, revision_seq: 1 })))
    TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ ...other, revision_seq: 1 }, 'x')))
    expect(box).to.include({ vault_tok: 'vault-tok-u1', revision_seq: 0 })
  })

  it("throws from a fetch that meets a record under another vault_tok", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(fullBoxRecord())
    world.mw.willGet(world.mw.answerOf(box.scope, fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })))
    await TH.expectRefusal(box.fetch())
    expect(box.revision_seq).to.eq(1)
  })

  it("passes over a notice under another vault_tok, keeping its own copy", async () => {
    const listing = boxListingOf(world.mw)
    await listing.hello()
    const box = await listing.build(fullBoxRecord())
    await world.mw.notify(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' }))
    expect(world.mw.badnews).to.deep.equal([])
    expect(box).to.include({ vault_tok: 'vault-tok-u1', revision_seq: 1 })
  })
})
// --

// == [Arguments first]: every entry of Box and Storable checks its arguments before any guard; edit and put take a duckish

describe("Box and Storable entries: arguments checked before any demand", () => {
  const whisper = { apiKey: 'sk-test-0000' }
  const BadArgCases = [
    [(box: TestableBox) => box.put({ whisper, sidecar: {} }, { maxMillisSinceRefresh: -1 }),     'put with opts out of range'],
    [(box: TestableBox) => box.fetch({ ifAbsent: 'shrug' as never }),                             'fetch with an ifAbsent it does not accept'],
    [(box: TestableBox) => box.hydrate({ maxMillisSinceRefresh: -1 }),                            'hydrate with opts out of range'],
    [(box: TestableBox) => box.del({ maxWorldMillis: -1 }),                                       'del with opts out of range'],
    [(box: TestableBox) => box.extractWhisper({ maxWorldMillis: -1 }),                             'extractWhisper with opts out of range'],
    [(box: TestableBox) => box.expose({ maxWorldMillis: -1 }),                                    'expose with opts out of range'],
  ] as const

  for (const [call, blurb] of BadArgCases) {
    it(`refuses ${blurb} while the vault is locked, calling nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      world.mw.setLocked(true)
      world.mw.clearCalls()
      await TH.expectRefusal(call(box))
      expect(world.mw.calls).to.deep.equal([])
    })
  }

  it("refuses put with a sidecar that fails its check while the vault is locked, putting nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    world.mw.setLocked(true)
    await TH.expectRefusal(box.put({ whisper, sidecar: [] as never }))
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses subscribing anything but a function", async () => {
    const box = await builtOf(fullBoxRecord())
    TH.expectSyncRefusal(() => box.subscribe('call me' as never))
  })

  it("refuses a bag handed to put, naming whisper and saying it is no whisper", async () => {
    const box = await builtOf(fullBoxRecord())
    world.mw.setLocked(true)
    world.mw.clearCalls()
    expect(box.whisper).to.eq(ENCRYPTED)
    for (const call of [() => box.put({ whisper: box.whisper, sidecar: {} }), () => box.put({ whisper: LOCKED, sidecar: {} })]) {
      const err = await TH.expectRefusal(call())
      expect(err.message).to.include(Phrases.WhisperedIsNoWhisper)
      expect(err.meta?.fieldnames).to.deep.equal(['whisper'])
    }
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses a put whose scope fields name another box, naming them, putting nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    world.mw.clearCalls()
    const err = await TH.expectRefusal(box.put({ ...fullBoxRecord({ boxlabel: 'openai_api_key' }), whisper, sidecar: {} }))
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses a put whose factory field fails its check, naming it, though the field would be ignored", async () => {
    const box = await builtOf(fullBoxRecord())
    const err = await TH.expectRefusal(box.put({ ...fullBoxRecord(), am: 'q' as never, whisper, sidecar: {} }))
    expect(err.meta?.fieldnames).to.deep.equal(['am'])
  })

  it("refuses a put carrying a field no box record has", async () => {
    const box = await builtOf(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper, sidecar: {}, sidecarr: {} } as never))
  })

  /** A record handed back as a patch, every field the box controls given and none of it heeded. */
  const roundTripOf = (record: BoxRecord) => ({
    ...record, revision_tok: 'rev-ignored', revision_seq: 99, am: 'x' as never, written_at: T0 + 99, registered_at: T0 + 99,
    whisper: { apiKey: 'sk-test-1111' }, sidecar: { note: 'round trip' },
  } as const)

  it("takes { ...record, whisper, sidecar } to put, putting the next revision over the one world", async () => {
    const record = fullBoxRecord()
    world.mw.seedPut(record)
    const box = await builtOf(record)
    world.mw.clearCalls()
    await expect(box.put(roundTripOf(record), { maxMillisSinceRefresh: Infinity, maxWorldMillis: Infinity })).resolves.to.eq(box)
    const [put] = world.mw.callsOf('put')
    expect(put?.priorRevisionTok).to.eq('rev-a1')
    expect(put?.record).to.deep.include({ am: 'a', revision_seq: 2, registered_at: T0, sidecar: { note: 'round trip' } })
    expect(box._cheat_central).to.deep.include({ revision_seq: 2, sidecar: { note: 'round trip' } })
  })
})
// --

describe("registered_at over a rebirth", () => {
  it("registers a box deleted and reborn at the rebirth's put, as a new life", async () => {
    world.mw.seedPut(fullBoxRecord())
    const box = await fakeSealBoxListingOf(world.mw).build(fullBoxRecord())
    await box.del()
    world.mw.setNow(T0 + 5000)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
  })
})
