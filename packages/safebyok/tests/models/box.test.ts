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
function builtOf(record: Fetched<BoxRecord, BoxSparse>): TestableBox {
  world.mw.seedPut(record)
  return boxListingOf(world.mw).deliverRecord(record)
}

function boxOf(record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): TestableBox { return builtOf(record) }

/** The snapshot of a box with `record`, as `getSnapshot` answers it. */
function snapshotOf(record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): BoxSnapshot {
  const box = boxOf(record)
  return box.getSnapshot()
}

const SnapshotKeys = ['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'sidecar', 'isFull', 'isPresent', 'isExposed', 'isVeiled', 'isLocked']

describe("Box own props", () => {
  it("are exactly nine: the four scope fields, registered_at, vault_tok and the three revision fields", () => {
    const box = boxOf()
    expect(Object.keys(box)).to.have.members(['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'registered_at', 'vault_tok', 'revision_tok', 'revision_seq', 'written_at'])
    expect(Object.keys(box)).to.have.lengthOf(9)
  })

  it("stay nine through a receive, a put and a del", async () => {
    const box = boxOf()
    const keys = Object.keys(box)
    const received = world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' })
    world.mw.seedPut(received)
    box.listing.deliverRecord(received)
    expect(Object.keys(box)).to.have.members(keys)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'edited' } })
    expect(Object.keys(box)).to.have.members(keys)
    await box.del(box.scope)
    expect(Object.keys(box)).to.have.members(keys)
  })

  it("leave out the world, the listing, the exposed whisper, the sealed parts and fmt", () => {
    const box = boxOf()
    for (const ckey of ['world', 'listing', 'whisper', 'sidecar', 'fmt', 'box_key_wrapped', 'whisper_codec', 'whisper_schema_version', 'whisper_ciphered', 'scope', 'am']) {
      expect(Object.keys(box), ckey).to.not.include(ckey)
    }
    expect(box.fmt).to.eq(fullBoxRecord().fmt)
    expect(box.box_key_wrapped).to.deep.equal(fullBoxRecord().box_key_wrapped)
  })

  it("serialize to the record's sparse form under JSON.stringify", () => {
    const box = boxOf()
    expect(JSON.stringify(box)).to.eq(JSON.stringify(world.mw.sparseBoxRecord()))
  })
})

describe("Box sidecar, locked or not", () => {
  it("box.whisper is ENCRYPTED while unexposed, locked or not", () => {
    const box = boxOf()
    expect(box.whisper).to.eq(ENCRYPTED)
    world.mw.setLocked(true)
    expect(box.whisper).to.eq(ENCRYPTED)
  })

  it("is readable whether the vault is locked or not", () => {
    const box = boxOf()
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
    world.mw.setLocked(true)
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
    world.mw.setLocked(false)
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
  })

  it("is null when the cached record is not full, locked or not", () => {
    const sparse = boxOf(world.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    const gone = boxOf(world.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
    for (const isLocked of [false, true]) {
      world.mw.setLocked(isLocked)
      expect(sparse.sidecar).to.be.null
      expect(gone.sidecar).to.be.null
    }
  })

  it("is the snapshot's sidecar too, which a lock leaves alone", () => {
    const box = boxOf()
    const listener = vi.fn()
    box.subscribe(listener)
    const before = box.getSnapshot()
    world.mw.setLocked(true)
    expect(listener).toHaveBeenCalledTimes(1)
    const locked = box.getSnapshot()
    expect(locked).to.deep.equal({ ...before, isLocked: true })
    expect(locked.sidecar).to.deep.equal({ note: 'a test box' })
    box.align()
    expect(box.getSnapshot()).to.eq(locked)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("tells an empty sidecar from an absent one in the snapshot, locked or not", () => {
    const empty = boxOf(fullBoxRecord({ sidecar: {} }))
    const sparse = boxOf(world.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    for (const isLocked of [false, true]) {
      world.mw.setLocked(isLocked)
      expect(empty.getSnapshot().sidecar).to.deep.equal({})
      expect(sparse.getSnapshot().sidecar).to.be.null
    }
  })

  it("shows a received record's new sidecar in the snapshot while locked, and notifies its listeners", () => {
    const box = boxOf()
    world.mw.setLocked(true)
    const before = box.getSnapshot()
    const listener = vi.fn()
    box.subscribe(listener)
    box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', sidecar: { note: 'newer' } }))
    expect(listener.mock.calls).to.have.lengthOf(1)
    expect(box.getSnapshot()).to.not.eq(before)
    expect(box.getSnapshot().sidecar).to.deep.equal({ note: 'newer' })
    expect(box.sidecar).to.deep.equal({ note: 'newer' })
  })

  it("is never on the sparse form or a tombstone, locked or not", () => {
    const box = boxOf()
    const gone = boxOf(world.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
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
  it("carries the scope, the revision props, registered_at, written_at, the sidecar, and the states full, present, exposed, veiled and locked, and no more", () => {
    const box = boxOf()
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
      isLocked:      false,
    })
    expect(Object.keys(box.getSnapshot())).to.have.members(SnapshotKeys)
  })

  it("is plain data: no vault_tok, no sealed parts, no scope prop, no methods", () => {
    const snapshot = snapshotOf()
    for (const ckey of ['vault_tok', 'scope', 'fmt', 'box_key_wrapped', 'whisper_ciphered', 'whisper_codec', 'whisper_schema_version', 'am']) {
      expect(snapshot, ckey).to.not.have.property(ckey)
    }
    expect(Object.getPrototypeOf(snapshot)).to.eq(Object.prototype)
    expect(Object.values(snapshot).filter((val) => typeof val === 'function')).to.deep.equal([])
  })

  it("has the scope fields at the top level", () => {
    const snapshot = snapshotOf()
    expect(snapshot).to.deep.include(world.mw.boxscope('anthropic_api_key'))
  })

  describe("for a box in each state", () => {
    it("full: the cached record's sidecar, full and present", () => {
      const snapshot = snapshotOf()
      expect(snapshot).to.include({ isFull: true, isPresent: true, isExposed: false })
      expect(snapshot.sidecar).to.deep.equal({ note: 'a test box' })
    })

    it("sparse: present and not full, the sidecar null", () => {
      const snapshot = snapshotOf(world.mw.sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(snapshot).to.include({ isFull: false, isPresent: true, isExposed: false, sidecar: null, revision_seq: 2, written_at: T0 + 20 })
    })

    it("gone: not present and not full, the sidecar null", () => {
      const snapshot = snapshotOf(world.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
      expect(snapshot).to.include({ isFull: false, isPresent: false, isExposed: false, sidecar: null, revision_seq: 2, revision_tok: 'rev-x2' })
    })

    it("born from a dna: present, full, unlocked, the sidecar empty, at revision 0 registered and written now", async () => {
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
        isLocked:      false,
      })
    })

    it("put: shows the sidecar and revision of the record just put", async () => {
      const box = boxOf()
      world.mw.setNow(T0 + 500)
      await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'edited' } })
      expect(box.getSnapshot()).to.deep.include({ sidecar: { note: 'edited' }, revision_seq: 2, written_at: T0 + 500, isFull: true, isPresent: true })
    })

    it("exposed: isExposed follows expose and unexpose", async () => {
      const box = boxOf()
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

describe("box.listing.deliverRecord(rcvd): a whole record makes the box timely", () => {
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
      box.listing.deliverRecord(rcvdOf())
      expect(box.isTimely).to.eq(timely)
    })
  }

  const ConfirmingCases = [
    [() => fullBoxRecord(),   'a full record'],
    [() => sparseBoxRecord(), 'a sparse record'],
  ] as const

  for (const [rcvdOf, blurb] of ConfirmingCases) {
    it(`notes success on ${blurb} that only confirms the full central is set`, () => {
      const box = boxListingOf(world.mw, { maxMillisSinceRefresh: 1000 }).deliverRecord(fullBoxRecord())
      world.mw.setNow(T0 + 1000)
      expect(box.isTimely).to.be.false
      box.listing.deliverRecord(rcvdOf())
      expect(box.isTimely).to.be.true
      expect(box.revision_seq).to.eq(1)
    })
  }
})

describe("box.listing.deliverRecord(rcvd): registered_at, and a record of another vault_tok", () => {
  it("keeps registered_at over a newer living record registered at another time", () => {
    const box = builtOf(fullBoxRecord())
    box.listing.deliverRecord(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', registered_at: T0 + 7 }))
    expect(box.registered_at).to.eq(T0)
    expect(box.revision_seq).to.eq(2)
  })

  it("takes registered_at and box_tok from a record of another life received over a listed tombstone", () => {
    const box = builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    box.listing.deliverRecord(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-b3', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', vault_tok: 'vault-tok-u1', revision_seq: 3 })
  })

  it("takes registered_at and box_tok from a newer record of another life received over a box listed alive", () => {
    const box = builtOf(fullBoxRecord())
    box.listing.deliverRecord(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-b4', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', revision_seq: 4 })
  })

  const ListedCases = [
    ['a box listed alive',          () => fullBoxRecord()],
    ['a box listed deleted',        () => tombstoneBoxRecord({ revision_seq: 1 })],
  ] as const
  const OtherVaultCases = [
    [2, 'a newer record'],
    [1, 'a record at the same revision'],
    [0, 'an older record'],
  ] as const
  for (const [listedBlurb, listedOf] of ListedCases) {
    for (const [seq, blurb] of OtherVaultCases) {
      it(`throws for ${blurb} under another vault_tok over ${listedBlurb}, keeping its own copy`, () => {
        const box = boxListingOf(world.mw).deliverRecord(listedOf())
        const central = box._cheat_central
        TH.expectSyncRefusal(() => box.listing.deliverRecord(fullBoxRecord({ revision_seq: seq, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })))
        expect(box._cheat_central).to.eq(central)
        expect(box.vault_tok).to.eq('vault-tok-u1')
      })
    }
  }

  it("throws for a record under another vault_tok even when its joined tok path equals the box's own", () => {
    const box = builtOf(fullBoxRecord())
    const central = box._cheat_central
    TH.expectSyncRefusal(() => box.listing.deliverRecord(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-u1-box', box_tok: 'tok-a' })))
    expect(box._cheat_central).to.eq(central)
  })

  it("throws over a box just created, and for a tombstone under another vault_tok", async () => {
    const box = await boxListingOf(world.mw).create(boxDnaOf(world.mw.boxscope('drafted')))
    const other = { boxlabel: 'drafted', vault_tok: 'vault-tok-other' }
    TH.expectSyncRefusal(() => box.listing.deliverRecord(fullBoxRecord({ ...other, revision_seq: 1 })))
    TH.expectSyncRefusal(() => box.listing.deliverRecord(tombstoneBoxRecord({ ...other, revision_seq: 1 })))
    expect(box).to.include({ vault_tok: 'vault-tok-u1', revision_seq: 0 })
  })

  it("throws from a fetch that meets a record under another vault_tok", async () => {
    const listing = boxListingOf(world.mw)
    const box = listing.deliverRecord(fullBoxRecord())
    world.mw.willGet(world.mw.answerOf(box.scope, fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })))
    await TH.expectRefusal(box.fetch(), 'storage_issue')
    expect(box.revision_seq).to.eq(1)
  })

  it("ignores a notice under another vault_tok, keeping its own copy", async () => {
    const listing = boxListingOf(world.mw)
    await listing.hello()
    const box = listing.deliverRecord(fullBoxRecord())
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
    [(box: TestableBox) => box.del(box.scope, { maxWorldMillis: -1 }),                                       'del with opts out of range'],
    [(box: TestableBox) => box.extractWhisper({ maxWorldMillis: -1 }),                             'extractWhisper with opts out of range'],
    [(box: TestableBox) => box.expose({ maxWorldMillis: -1 }),                                    'expose with opts out of range'],
  ] as const

  for (const [call, blurb] of BadArgCases) {
    it(`refuses ${blurb} while the vault is locked, calling nothing`, async () => {
      const box = builtOf(fullBoxRecord())
      world.mw.setLocked(true)
      world.mw.clearCalls()
      await TH.expectRefusal(call(box))
      expect(world.mw.calls).to.deep.equal([])
    })
  }

  it("refuses put with a sidecar that fails its check while the vault is locked, putting nothing", async () => {
    const box = builtOf(fullBoxRecord())
    world.mw.setLocked(true)
    await TH.expectRefusal(box.put({ whisper, sidecar: [] as never }))
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses subscribing anything but a function", () => {
    const box = builtOf(fullBoxRecord())
    TH.expectSyncRefusal(() => box.subscribe('call me' as never))
  })

  it("refuses a sentinel bag as the whisper of a put, naming whisper", async () => {
    const box = builtOf(fullBoxRecord())
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
    const box = builtOf(fullBoxRecord())
    world.mw.clearCalls()
    const err = await TH.expectRefusal(box.put({ ...fullBoxRecord({ boxlabel: 'openai_api_key' }), whisper, sidecar: {} }))
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses a put whose factory field fails its check, naming it, though the field would be ignored", async () => {
    const box = builtOf(fullBoxRecord())
    const err = await TH.expectRefusal(box.put({ ...fullBoxRecord(), am: 'q' as never, whisper, sidecar: {} }))
    expect(err.meta?.fieldnames).to.deep.equal(['am'])
  })

  it("refuses a put carrying a field no box record has", async () => {
    const box = builtOf(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper, sidecar: {}, sidecarr: {} } as never))
  })

  /** A record handed back as a patch, every field the box controls given and none of it heeded. */
  function roundTripOf(record: BoxRecord) {
    return {
      ...record, revision_tok: 'rev-ignored', revision_seq: 99, am: 'x' as never, written_at: T0 + 99, registered_at: T0 + 99,
      whisper: { apiKey: 'sk-test-1111' }, sidecar: { note: 'round trip' },
    } as const
  }

  it("takes { ...record, whisper, sidecar } and puts the next revision over the cached one", async () => {
    const record = fullBoxRecord()
    world.mw.seedPut(record)
    const box = builtOf(record)
    world.mw.clearCalls()
    await expect(box.put(roundTripOf(record), { maxMillisSinceRefresh: Infinity, maxWorldMillis: Infinity })).resolves.to.eq(box)
    const [put] = world.mw.callsOf('put')
    expect(put?.expectedRevisionTok).to.eq('rev-a1')
    expect(put?.record).to.deep.include({ am: 'a', revision_seq: 2, registered_at: T0, sidecar: { note: 'round trip' } })
    expect(box._cheat_central).to.deep.include({ revision_seq: 2, sidecar: { note: 'round trip' } })
  })
})
// --

describe("registered_at over a rebirth", () => {
  it("is set anew when a deleted box is put again", async () => {
    world.mw.seedPut(fullBoxRecord())
    const box = fakeSealBoxListingOf(world.mw).deliverRecord(fullBoxRecord())
    await box.del(box.scope)
    world.mw.setNow(T0 + 5000)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
  })
})
