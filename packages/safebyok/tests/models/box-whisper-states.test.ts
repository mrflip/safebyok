/** A Box's whisper states: what `box.whisper` and `box.exposure` show from each state, after each operation; the veil, putExposed, and hearing of a lock. */

import { describe, expect, it, vi } from 'vitest'
import { ENCRYPTED, LOCKED, VEILED } from '../../src/helpers/consts'
import type { BoxExposure } from '../../src/shapes/shapes-enums'
import type { Fetched } from '../../src/shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

const Exposed = { apiKey: 'sk-test-0000' }

/** A box built of `record`, with the same record in storage. */
function builtOf(record: Fetched<BoxRecord, BoxSparse>): TestableBox {
  world.mw.seedPut(record)
  return boxListingOf(world.mw).deliverRecord(record)
}

/** A box whose whisper is {@link Exposed}, none of it exposed. */
const unexposedOf = async (): Promise<TestableBox> => {
  const box = builtOf(fullBoxRecord())
  await box.put({ whisper: Exposed })
  return box
}

const showingOf = async (): Promise<TestableBox> => {
  const box = await unexposedOf()
  return box.expose()
}

const veiledOf = async (): Promise<TestableBox> => {
  const box = await showingOf()
  return box.veil()
}

function locking(box: TestableBox): TestableBox {
  world.mw.setLocked(true)
  return box
}

// == [The table]: every state by every operation

const StateMakers = {
  unexposed:        unexposedOf,
  unexposedLocked:  async () => locking(await unexposedOf()),
  showing:          showingOf,
  veiled:           veiledOf,
  locked:           async () => locking(await showingOf()),
  lockedVeiled:     async () => locking(await veiledOf()),
}

const Operations = {
  veil:     (box: TestableBox) => box.veil(),
  unveil:   (box: TestableBox) => box.unveil(),
  unexpose: (box: TestableBox) => box.unexpose(),
  expose:   (box: TestableBox) => box.expose(),
  lock:     (box: TestableBox) => { world.mw.setLocked(true); return box },
  unlock:   (box: TestableBox) => { world.mw.setLocked(false); return box },
}

const Shows = { value: Exposed, encrypted: ENCRYPTED, locked: LOCKED, veiled: VEILED } as const

/** What `box.exposure` answers beside each thing `box.whisper` shows. */
const BoxExposures: Record<keyof typeof Shows, BoxExposure> = { value: 'showing', encrypted: 'unexposed', locked: 'locked', veiled: 'veiled' }

/** Each cell is what `box.whisper` shows after the operation, or the refusal it throws, leaving the state as it was. */
const StateTable = [
  //                        shows         veil         unveil        unexpose     expose           lock        unlock
  ['unexposed',        'encrypted', 'encrypted', 'refused',    'encrypted', 'value',        'encrypted', 'encrypted'],
  ['unexposedLocked',  'encrypted', 'encrypted', 'refused',    'encrypted', 'bank_locked', 'encrypted', 'encrypted'],
  ['showing',          'value',     'veiled',    'value',      'encrypted', 'value',        'locked',    'value'],
  ['veiled',           'veiled',    'veiled',    'value',      'encrypted', 'value',        'locked',    'veiled'],
  ['locked',           'locked',    'locked',    'locked',     'encrypted', 'bank_locked', 'locked',    'value'],
  ['lockedVeiled',     'locked',    'locked',    'locked',     'encrypted', 'bank_locked', 'locked',    'veiled'],
] as const

const OperationOrder = ['veil', 'unveil', 'unexpose', 'expose', 'lock', 'unlock'] as const

function expectShows(box: TestableBox, shown: keyof typeof Shows): void {
  if (shown === 'value') { expect(box.whisper).to.deep.equal(Exposed) } else { expect(box.whisper).to.eq(Shows[shown]) }
  expect(box.exposure).to.eq(BoxExposures[shown])
  expect(box.isShowing).to.eq(shown === 'value')
}

describe("box.whisper, state by operation", () => {
  for (const [state, shows, ...cells] of StateTable) {
    it(`${state} shows ${shows}`, async () => {
      expectShows(await StateMakers[state](), shows)
    })

    for (const [idx, operation] of OperationOrder.entries()) {
      const cell = cells[idx]!
      it(`${state}, ${operation}: ${cell}`, async () => {
        const box = await StateMakers[state]()
        if ((cell === 'refused') || (cell === 'bank_locked')) {
          await TH.expectRefusal((async () => Operations[operation](box))(), (cell === 'refused') ? undefined : cell)
          expectShows(box, shows)
          return
        }
        expect(await Operations[operation](box)).to.eq(box)
        expectShows(box, cell)
      })
    }
  }
})
// --

// == [isVeiled]: whether the veil is on, apart from what the whisper shows

describe("box.isVeiled", () => {
  it("is false for a box showing its whisper", async () => {
    const box = await showingOf()
    expect(box.isVeiled).to.be.false
  })

  it("is true for a veiled box, locked or not", async () => {
    const box = await veiledOf()
    expect(box.isVeiled).to.be.true
    locking(box)
    expect(box.whisper).to.eq(LOCKED)
    expect(box.isVeiled).to.be.true
  })

  it("is false once unveiled or exposed again", async () => {
    const unveiled = await veiledOf()
    expect(unveiled.unveil().isVeiled).to.be.false
    const exposed = await veiledOf()
    await exposed.expose()
    expect(exposed.isVeiled).to.be.false
  })

  it("is false once unexposed", async () => {
    const box = await veiledOf()
    expect(box.unexpose().isVeiled).to.be.false
    expect(box.getSnapshot().isVeiled).to.be.false
  })

  it("is true for an unexposed box veiled", async () => {
    const box = await unexposedOf()
    expect(box.veil().isVeiled).to.be.true
    expect(box.exposure).to.eq('unexposed')
  })
})
// --

// == [Through a lock]: what a veil or an unveil from behind a lock does once unlocked

describe("the veil from behind a lock", () => {
  it("a veil while locked shows veiled once unlocked", async () => {
    const box = locking(await showingOf())
    box.veil()
    expect(box.getSnapshot().isVeiled).to.be.true
    world.mw.setLocked(false)
    expect(box.whisper).to.eq(VEILED)
  })

  it("an unveil while locked shows the value once unlocked, and does not throw", async () => {
    const box = locking(await veiledOf())
    box.unveil()
    expect(box.getSnapshot().isVeiled).to.be.false
    expect(box.whisper).to.eq(LOCKED)
    world.mw.setLocked(false)
    expect(box.whisper).to.deep.equal(Exposed)
  })

  it("the veil keeps the very object, and shows it again", async () => {
    const box = await showingOf()
    const exposed = box.whisper
    box.veil()
    expect(box.unveil().whisper).to.eq(exposed)
  })

  it("an expose after a veil shows the whisper again", async () => {
    const box = await veiledOf()
    await box.expose()
    expect(box.whisper).to.deep.equal(Exposed)
    expect(box.getSnapshot()).to.deep.include({ isExposed: true, isVeiled: false })
  })

  it("an unveil with nothing exposed refuses, pointing to box.expose()", async () => {
    const box = await unexposedOf()
    const err = TH.expectSyncRefusal(() => box.unveil())
    expect(err.message).to.include('box.expose()')
  })

  it("notifies a listener at each of veil, unveil and unexpose", async () => {
    const box = await showingOf()
    const listener = vi.fn()
    box.subscribe(listener)
    box.veil()
    expect(listener).toHaveBeenCalledTimes(1)
    box.unveil()
    expect(listener).toHaveBeenCalledTimes(2)
    box.unexpose()
    expect(listener).toHaveBeenCalledTimes(3)
  })
})

describe("the endings of a box exposed", () => {
  const EndingCases = [
    ['sweep',  (box: TestableBox) => box.sweep()],
    ['vacate', (box: TestableBox) => box.vacate()],
  ] as const
  for (const [ending, end] of EndingCases) {
    it(`a ${ending} clears the value`, async () => {
      const box = await showingOf()
      end(box)
      expect(box.whisper).to.eq(ENCRYPTED)
      expect(box.veil()).to.eq(box)
      expect(box.unexpose()).to.eq(box)
      TH.expectSyncRefusal(() => box.unveil())
    })

    it(`a ${ending} clears the veil`, async () => {
      const box = await veiledOf()
      end(box)
      expect(box.isVeiled).to.be.false
      expect(box.getSnapshot().isVeiled).to.be.false
    })
  }

  it("a tombstone received clears the value and the veil", async () => {
    const box = await veiledOf()
    box.listing.deliverRecord(world.mw.tombstoneBoxRecord({ box_tok: box.box_tok, revision_seq: box.revision_seq + 1, revision_tok: 'rev-gone' }))
    expect(box.isPresent).to.be.false
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.isVeiled).to.be.false
    expect(box.getSnapshot()).to.deep.include({ isExposed: false, isVeiled: false })
  })

  it("a delete clears the value and the veil", async () => {
    const box = await veiledOf()
    await box.del(box.scope)
    expect(box.isVeiled).to.be.false
    expect(box.getSnapshot().isVeiled).to.be.false
  })

  it("a delete clears the value", async () => {
    const box = await showingOf()
    await box.del(box.scope)
    expect(box.isPresent).to.be.false
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.getSnapshot().isExposed).to.be.false
  })
})
// --

// == [putExposed]

describe("box.putExposed", () => {
  it("seals the exposed value, including edits made in place", async () => {
    const box = await showingOf()
    const exposed = box.whisper as { apiKey: string, org?: string }
    exposed.org = 'acme'
    expect(await box.putExposed()).to.eq(box)
    expect(await box.extractWhisper()).to.deep.equal({ ...Exposed, org: 'acme' })
    expect(box.whisper).to.eq(exposed)
  })

  it("takes a sidecar, and keeps the current one if given none", async () => {
    const box = await showingOf()
    await box.putExposed({ sidecar: { note: 'new' } })
    expect(box.sidecar).to.deep.equal({ note: 'new' })
    await box.putExposed()
    expect(box.sidecar).to.deep.equal({ note: 'new' })
    expect(await box.extractWhisper()).to.deep.equal(Exposed)
  })

  it("puts while veiled and unlocked", async () => {
    const box = await veiledOf()
    const { revision_seq } = box
    await box.putExposed({ sidecar: { note: 'veiled' } })
    expect(box.revision_seq).to.eq(revision_seq + 1)
    expect(box.whisper).to.eq(VEILED)
    expect(await box.extractWhisper()).to.deep.equal(Exposed)
  })

  it("refuses 'bank_locked' while locked, veiled or not", async () => {
    for (const makeState of [StateMakers.locked, StateMakers.lockedVeiled]) {
      const box = await makeState()
      world.mw.clearCalls()
      await TH.expectRefusal(box.putExposed(), 'bank_locked')
      expect(world.mw.callsOf('put')).to.deep.equal([])
      world.mw.setLocked(false)
    }
  })

  it("refuses with nothing exposed, or a patch naming a whisper, writing nothing", async () => {
    const unexposed = await unexposedOf()
    const showing = await showingOf()
    world.mw.clearCalls()
    await TH.expectRefusal(unexposed.putExposed())
    await TH.expectRefusal(showing.putExposed({ whisper: Exposed } as never))
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("tryPutExposed returns an Outcome", async () => {
    const box = await showingOf()
    expect(await box.tryPutExposed()).to.deep.include({ ok: true })
    box.unexpose()
    const outcome = await box.tryPutExposed()
    expect(outcome.ok).to.be.false
  })
})
// --

// == [Hearing of a lock]: subscribe, getSnapshot, isLocked

describe("box.subscribe and box.getSnapshot, through a lock", () => {
  it("reads isLocked live without storing it on the box", async () => {
    const box = await unexposedOf()
    expect(box.isLocked).to.be.false
    world.mw.setLocked(true)
    expect(box.isLocked).to.be.true
    expect(Object.keys(box)).to.not.include('isLocked')
  })

  it("works when detached from the box, notifying of a lock once with a new snapshot", async () => {
    const box = await showingOf()
    const { subscribe, getSnapshot } = box
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    const before = getSnapshot()
    world.mw.setLocked(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(box.whisper).to.eq(LOCKED)
    expect(getSnapshot()).to.not.eq(before)
    expect(getSnapshot()).to.deep.equal({ ...before, isLocked: true })
    unsubscribe()
    world.mw.setLocked(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("shows the vault's lock on the snapshot through a lock and an unlock, notifying a listener once each", async () => {
    const box = await unexposedOf()
    const listener = vi.fn()
    box.subscribe(listener)
    const before = box.getSnapshot()
    expect(before.isLocked).to.be.false
    world.mw.setLocked(true)
    const locked = box.getSnapshot()
    expect(locked).to.deep.equal({ ...before, isLocked: true })
    expect(listener).toHaveBeenCalledTimes(1)
    world.mw.setLocked(false)
    expect(box.getSnapshot()).to.not.eq(locked)
    expect(box.getSnapshot()).to.deep.equal(before)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("notifies an unsubscribed listener of nothing, not even a lock", async () => {
    const box = await unexposedOf()
    const listener = vi.fn()
    const unsubscribe = box.subscribe(listener)
    unsubscribe()
    await box.expose()
    world.mw.setLocked(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it("keeps a listener on one box when it unsubscribes from the other", async () => {
    const one = await unexposedOf()
    const other = builtOf(fullBoxRecord({ boxlabel: 'openai_api_key' }))
    const listener = vi.fn()
    const unsubscribeOne = one.subscribe(listener)
    other.subscribe(listener)
    unsubscribeOne()
    world.mw.setLocked(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("keeps the value off the snapshot", async () => {
    const box = await showingOf()
    expect(JSON.stringify(box.getSnapshot())).to.not.include('sk-test-0000')
    box.veil()
    expect(JSON.stringify(box.getSnapshot())).to.not.include('sk-test-0000')
  })

  it("returns the same box.whisper object until it changes", async () => {
    const box = await showingOf()
    expect(box.whisper).to.eq(box.whisper)
    box.veil()
    expect(box.whisper).to.eq(box.whisper)
    world.mw.setLocked(true)
    expect(box.whisper).to.eq(box.whisper)
  })
})
// --
