/** A fake Device for the giver's tests: banks started on demand, and box cars the test stores and announces. */

import type { BankSnapshot, CarFields, DeviceSnapshot, GiverBank, GiverDevice } from '../../src/giver/react-giver'

/** A box record as the fake vaultDB stores it: enough to tell revisions apart. */
export type FakeBoxRecord = Readonly<{ labelpath: string, revseq: number, sidecar: Readonly<{ mask: string }> }>

/** A car of fake box records, as a bank's minder would cache it. */
export type FakeBoxCar = Readonly<{ liveness: CarFields['liveness'], newest: FakeBoxRecord, fullest: FakeBoxRecord | null | undefined }>

/** A fake box record at `labelpath`, of revision `revseq`. */
export function fakeBoxRecordOf(labelpath: string, revseq: number): FakeBoxRecord {
  return Object.freeze({ labelpath, revseq, sidecar: Object.freeze({ mask: `****${String(revseq)}` }) })
}

/** The car of a box whose whole newest revision is in hand. */
export function fullCarOf(record: FakeBoxRecord): FakeBoxCar { return Object.freeze({ liveness: 'full', newest: record, fullest: record }) }

/** The car of a box whose newest revision is known only sparse, beside an older whole one. */
export function bhndCarOf(newest: FakeBoxRecord, fullest: FakeBoxRecord): FakeBoxCar { return Object.freeze({ liveness: 'bhnd', newest, fullest }) }

/** The car of a box none is stored at. */
export function voidCarOf(labelpath: string): FakeBoxCar { return Object.freeze({ liveness: 'void', newest: fakeBoxRecordOf(labelpath, -1), fullest: null }) }

const ServerSnapshot: DeviceSnapshot = Object.freeze({ userid: null, banks: Object.freeze({}) })

/** A fake Device, and the test's ways past it. */
export interface FakeGiverWorld {
  device:  GiverDevice<FakeBoxCar>
  /** Each labelpath's car as the vaultDB would answer it now. A labelpath left out answers the void car. */
  stored:  Map<string, FakeBoxCar>
  /** How many cars the bank objects have been asked for. */
  counts:  { gets: number }
  /** Sign `userid` in, or nobody, as a host's provider would. */
  _cheat_signIn(userid: string | null): void
  /** Replace the Device's snapshot of the bank at `banklabel`. */
  _cheat_setBank(banklabel: string, snapshot: BankSnapshot): void
  /** Announce `car` to every bank object's listeners, as its minder would on caching it. */
  _cheat_hear(labelpath: string, car: FakeBoxCar): void
  /** End the bank object at `banklabel`: the next ensureBank starts another. */
  _cheat_endBank(banklabel: string): void
}

/** A fake Device with `userid` signed in, no bank started, and nothing stored. */
export function makeFakeGiverWorld(userid: string | null = 'u1'): FakeGiverWorld {
  type Starter = (bank: GiverBank<FakeBoxCar>) => () => void
  let snapshot: DeviceSnapshot = Object.freeze({ userid, banks: Object.freeze({}) })
  const deviceListeners = new Set<() => void>()
  const carListeners    = new Set<(labelpath: string, car: FakeBoxCar) => void>()
  const banks           = new Map<string, GiverBank<FakeBoxCar>>()
  // For each starter, the function it returned for each bank object it was handed, by banklabel.
  const endings         = new Map<Starter, Map<string, () => void>>()
  const stored          = new Map<string, FakeBoxCar>()
  // Each labelpath's car as the minder last cached it: by a get, or heard.
  const cached          = new Map<string, FakeBoxCar>()
  const counts          = { gets: 0 }

  function publish(next: DeviceSnapshot): void {
    snapshot = Object.freeze(next)
    for (const listener of deviceListeners) { listener() }
  }

  function startBank(banklabel: string, signedIn: string): GiverBank<FakeBoxCar> {
    const bank: GiverBank<FakeBoxCar> = Object.freeze({
      userid:        signedIn,
      banklabel,
      getBoxCar:     (labelpath: string) => {
        counts.gets += 1
        const car = stored.get(labelpath) ?? voidCarOf(labelpath)
        cached.set(labelpath, car)
        return Promise.resolve(car)
      },
      peekBoxCar:    (labelpath: string) => cached.get(labelpath),
      listenBoxCars: (listener: (labelpath: string, car: FakeBoxCar) => void) => {
        carListeners.add(listener)
        return () => { carListeners.delete(listener) }
      },
    })
    banks.set(banklabel, bank)
    for (const [starter, ends] of endings) { ends.set(banklabel, starter(bank)) }
    return bank
  }

  const device: GiverDevice<FakeBoxCar> = Object.freeze({
    subscribe: (listener: () => void) => {
      deviceListeners.add(listener)
      return () => { deviceListeners.delete(listener) }
    },
    getSnapshot:       () => snapshot,
    getServerSnapshot: () => ServerSnapshot,
    ensureBank:        ({ userid: asking, banklabel }: Readonly<{ userid: string, banklabel: string }>) => {
      if (asking !== snapshot.userid) { return Promise.reject(new Error('That user is no longer signed in.')) }
      return Promise.resolve(banks.get(banklabel) ?? startBank(banklabel, asking))
    },
    onBankStart: (starter: Starter) => {
      const ends = new Map<string, () => void>()
      endings.set(starter, ends)
      for (const [banklabel, bank] of banks) { ends.set(banklabel, starter(bank)) }
      return () => { endings.delete(starter) }
    },
  })

  return {
    device,
    stored,
    counts,
    _cheat_signIn:  (signedIn) => { publish({ ...snapshot, userid: signedIn }) },
    _cheat_setBank: (banklabel, bankSnapshot) => { publish({ ...snapshot, banks: Object.freeze({ ...snapshot.banks, [banklabel]: bankSnapshot }) }) },
    _cheat_hear:    (labelpath, car) => {
      cached.set(labelpath, car)
      for (const listener of carListeners) { listener(labelpath, car) }
    },
    _cheat_endBank: (banklabel) => {
      banks.delete(banklabel)
      for (const ends of endings.values()) {
        ends.get(banklabel)?.()
        ends.delete(banklabel)
      }
    },
  }
}
