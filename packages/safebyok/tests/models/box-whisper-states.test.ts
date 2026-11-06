/** A Box's whisper states: what `box.whisper` shows from each state, after each operation; the veil, putExposed, and hearing of a lock. */

import { describe, expect, it, vi } from 'vitest'
import { ENCRYPTED, LOCKED, VEILED } from '../../src/helpers/consts'
import type { BoxRecord, BoxSparse, Fetched } from '../../src/shapes/shapes-vaultish'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

const Exposed = { apiKey: 'sk-test-0000' }

/** A box built of `record`, with the same record in storage. */
const builtOf = (record: Fetched<BoxRecord, BoxSparse>): Promise<TestableBox> => {
  held.mw.seedStore(record)
  return boxListingOf(held.mw).build(record)
}

/** A box storing {@link Exposed}, none of it exposed. */
const unexposedOf = async (): Promise<TestableBox> => {
  const box = await builtOf(fullBoxRecord())
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

const locking = (box: TestableBox): TestableBox => {
  held.mw.setLockState('locked')
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
  lock:     (box: TestableBox) => { held.mw.setLockState('locked'); return box },
  unlock:   (box: TestableBox) => { held.mw.setLockState('unlocked'); return box },
}

const Shows = { value: Exposed, encrypted: ENCRYPTED, locked: LOCKED, veiled: VEILED } as const

/** Each cell is what `box.whisper` shows after the operation, or the refusal it throws, leaving the state as it was. */
const StateTable = [
  //                        shows         veil         unveil        unexpose     expose           lock        unlock
  ['unexposed',        'encrypted', 'encrypted', 'refused',    'encrypted', 'value',        'encrypted', 'encrypted'],
  ['unexposedLocked',  'encrypted', 'encrypted', 'refused',    'encrypted', 'vault_locked', 'encrypted', 'encrypted'],
  ['showing',          'value',     'veiled',    'value',      'encrypted', 'value',        'locked',    'value'],
  ['veiled',           'veiled',    'veiled',    'value',      'encrypted', 'value',        'locked',    'veiled'],
  ['locked',           'locked',    'locked',    'locked',     'encrypted', 'vault_locked', 'locked',    'value'],
  ['lockedVeiled',     'locked',    'locked',    'locked',     'encrypted', 'vault_locked', 'locked',    'veiled'],
] as const

const OperationOrder = ['veil', 'unveil', 'unexpose', 'expose', 'lock', 'unlock'] as const

const expectShows = (box: TestableBox, shown: keyof typeof Shows): void => {
  if (shown === 'value') { expect(box.whisper).to.deep.equal(Exposed) } else { expect(box.whisper).to.eq(Shows[shown]) }
  expect(box.isShowing).to.eq(shown === 'value')
}

describe("box.whisper, state by operation (the Coach, 2026-11-05)", () => {
  for (const [state, shows, ...cells] of StateTable) {
    it(`${state} shows ${shows}`, async () => {
      expectShows(await StateMakers[state](), shows)
    })

    for (const [idx, operation] of OperationOrder.entries()) {
      const cell = cells[idx]!
      it(`${state}, ${operation}: ${cell}`, async () => {
        const box = await StateMakers[state]()
        if ((cell === 'refused') || (cell === 'vault_locked')) {
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

// == [Through a lock]: what a veil or an unveil from behind a lock does once unlocked

describe("the veil from behind a lock", () => {
  it("a veil while locked shows veiled once unlocked", async () => {
    const box = locking(await showingOf())
    box.veil()
    expect(box.getSnapshot().veiled).to.be.true
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.eq(VEILED)
  })

  it("an unveil while locked shows the value once unlocked, and does not throw", async () => {
    const box = locking(await veiledOf())
    box.unveil()
    expect(box.getSnapshot().veiled).to.be.false
    expect(box.whisper).to.eq(LOCKED)
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal(Exposed)
  })

  it("the veil keeps the very object, and shows it again", async () => {
    const box = await showingOf()
    const exposed = box.whisper
    box.veil()
    expect(box.unveil().whisper).to.eq(exposed)
  })

  it("an expose after a veil shows the whisper again, and the snapshot says so (the Coach, 2026-11-05)", async () => {
    const box = await veiledOf()
    await box.expose()
    expect(box.whisper).to.deep.equal(Exposed)
    expect(box.getSnapshot()).to.deep.include({ exposed: true, veiled: false })
  })

  it("an unveil with nothing exposed says so, in plain words", async () => {
    const box = await unexposedOf()
    const err = TH.expectSyncRefusal(() => box.unveil())
    expect(err.message).to.include('box.expose()')
  })

  it("tells a listener at each of veil, unveil and unexpose", async () => {
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
    it(`a ${ending} clears the value, a veil still passes, and an unveil says nothing is exposed`, async () => {
      const box = await showingOf()
      end(box)
      expect(box.whisper).to.eq(ENCRYPTED)
      expect(box.veil()).to.eq(box)
      expect(box.unexpose()).to.eq(box)
      TH.expectSyncRefusal(() => box.unveil())
    })
  }

  it("a delete clears the value", async () => {
    const box = await showingOf()
    await box.del()
    expect(box.isPresent).to.be.false
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.getSnapshot().exposed).to.be.false
  })
})
// --

// == [putExposed]

describe("box.putExposed", () => {
  it("seals the value exposed, an edit in place included, and answers the box", async () => {
    const box = await showingOf()
    const exposed = box.whisper as { apiKey: string, org?: string }
    exposed.org = 'acme'
    expect(await box.putExposed()).to.eq(box)
    expect(await box.extractWhisper()).to.deep.equal({ ...Exposed, org: 'acme' })
    expect(box.whisper).to.eq(exposed)
  })

  it("takes a sidecar, and keeps the one in hand if given none", async () => {
    const box = await showingOf()
    await box.putExposed({ sidecar: { note: 'new' } })
    expect(box.sidecar).to.deep.equal({ note: 'new' })
    await box.putExposed()
    expect(box.sidecar).to.deep.equal({ note: 'new' })
    expect(await box.extractWhisper()).to.deep.equal(Exposed)
  })

  it("puts while veiled and unlocked: the veil hides, it does not discard (the Coach, 2026-11-05)", async () => {
    const box = await veiledOf()
    const { revision_seq } = box
    await box.putExposed({ sidecar: { note: 'veiled' } })
    expect(box.revision_seq).to.eq(revision_seq + 1)
    expect(box.whisper).to.eq(VEILED)
    expect(await box.extractWhisper()).to.deep.equal(Exposed)
  })

  it("refuses 'vault_locked' while locked, veiled or not (the Coach, 2026-11-05)", async () => {
    for (const makeState of [StateMakers.locked, StateMakers.lockedVeiled]) {
      const box = await makeState()
      held.mw.clearCalls()
      await TH.expectRefusal(box.putExposed(), 'vault_locked')
      expect(held.mw.callsOf('put')).to.deep.equal([])
      held.mw.setLockState('unlocked')
    }
  })

  it("refuses with nothing exposed, or a patch naming a whisper, storing nothing", async () => {
    const unexposed = await unexposedOf()
    const showing = await showingOf()
    held.mw.clearCalls()
    await TH.expectRefusal(unexposed.putExposed())
    await TH.expectRefusal(showing.putExposed({ whisper: Exposed } as never))
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("answers an Outcome from tryPutExposed", async () => {
    const box = await showingOf()
    expect(await box.tryPutExposed()).to.deep.include({ ok: true })
    box.unexpose()
    const outcome = await box.tryPutExposed()
    expect(outcome.ok).to.be.false
  })
})
// --

// == [Hearing of a lock]: subscribe, getSnapshot, lockState

describe("box.subscribe and box.getSnapshot, through a lock", () => {
  it("reads lockState live, and holds none of it on the box", async () => {
    const box = await unexposedOf()
    expect(box.lockState()).to.eq('unlocked')
    held.mw.setLockState('locked')
    expect(box.lockState()).to.eq('locked')
    expect(Object.keys(box)).to.not.include('lockState')
  })

  it("works detached, as useSyncExternalStore takes them, telling a lock once and keeping the snapshot", async () => {
    const box = await showingOf()
    const { subscribe, getSnapshot } = box
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    const before = getSnapshot()
    held.mw.setLockState('locked')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(box.whisper).to.eq(LOCKED)
    expect(getSnapshot()).to.eq(before)
    unsubscribe()
    held.mw.setLockState('unlocked')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("keeps the snapshot through a lock and an unlock, which are the vault's to show", async () => {
    const box = await unexposedOf()
    const before = box.getSnapshot()
    expect(before).to.not.have.property('lockState')
    held.mw.setLockState('locked')
    expect(box.getSnapshot()).to.eq(before)
    held.mw.setLockState('unlocked')
    expect(box.getSnapshot()).to.eq(before)
  })

  it("unsubscribes from the box and the vault both", async () => {
    const box = await unexposedOf()
    const listener = vi.fn()
    const unsubscribe = box.subscribe(listener)
    unsubscribe()
    await box.expose()
    held.mw.setLockState('locked')
    expect(listener).not.toHaveBeenCalled()
  })

  it("keeps one listener on two boxes through one's leaving", async () => {
    const one = await unexposedOf()
    const other = await builtOf(fullBoxRecord({ boxlabel: 'openai_api_key' }))
    const listener = vi.fn()
    const unsubscribeOne = one.subscribe(listener)
    other.subscribe(listener)
    unsubscribeOne()
    held.mw.setLockState('locked')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("keeps the value off the snapshot", async () => {
    const box = await showingOf()
    expect(JSON.stringify(box.getSnapshot())).to.not.include('sk-test-0000')
    box.veil()
    expect(JSON.stringify(box.getSnapshot())).to.not.include('sk-test-0000')
  })

  it("answers box.whisper with one identity between changes, so a store over it does not loop", async () => {
    const box = await showingOf()
    expect(box.whisper).to.eq(box.whisper)
    box.veil()
    expect(box.whisper).to.eq(box.whisper)
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(box.whisper)
  })
})
// --
