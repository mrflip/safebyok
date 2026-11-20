/** A fake Device for the giver's tests: its bank started on demand, box cars the test stores and announces, and form verbs that record what they hear. */

import { type BankSnapshot, type DeviceSnapshot, type PassphraseVerdict, PendingBank } from 'safebyok'
import { boxCarQueryKey } from '../../src/giver/react-giver'
import type { CarFields, GiverBank, GiverDevice, GiverEvent } from '../../src/giver/shapes-giver'

/** A box record as the fake vaultDB stores it: enough to tell revisions apart. */
export type FakeBoxRecord = Readonly<{ labelpath: string, revseq: number, sidecar: Readonly<{ mask: string }> }>

/** A car of fake box records, as a bank's minder would cache it. */
export type FakeBoxCar = Readonly<{ liveness: CarFields['liveness'], agerank: string, newest: FakeBoxRecord, fullest: FakeBoxRecord | null | undefined }>

/** A fake box record at `labelpath`, of revision `revseq`. */
export function fakeBoxRecordOf(labelpath: string, revseq: number): FakeBoxRecord {
  return Object.freeze({ labelpath, revseq, sidecar: Object.freeze({ mask: `****${String(revseq)}` }) })
}

// A fake agerank, ordered as the minder's is for one box: by the newest's revseq, then liveness, then the fullest's revseq.
/** `revseq` padded so that two compare as strings as they do as numbers */
function padded(revseq: number): string { return String(revseq).padStart(10, '0') }

/** The car of a box whose whole newest revision is in hand. */
export function fullCarOf(record: FakeBoxRecord): FakeBoxCar {
  return Object.freeze({ liveness: 'full', agerank: `${padded(record.revseq)}~full~${padded(record.revseq)}`, newest: record, fullest: record })
}

/** The car of a box whose newest revision is known only sparse, beside an older whole one. */
export function bhndCarOf(newest: FakeBoxRecord, fullest: FakeBoxRecord): FakeBoxCar {
  return Object.freeze({ liveness: 'bhnd', agerank: `${padded(newest.revseq)}~bhnd~${padded(fullest.revseq)}`, newest, fullest })
}

/** The car of a box whose newest revision is known only sparse, with no whole one in hand. */
export function bareCarOf(newest: FakeBoxRecord): FakeBoxCar {
  return Object.freeze({ liveness: 'bare', agerank: `${padded(newest.revseq)}~bare~-`, newest, fullest: undefined })
}

/** The car of a box none is stored at. */
export function voidCarOf(labelpath: string): FakeBoxCar {
  return Object.freeze({ liveness: 'void', agerank: '-~void', newest: fakeBoxRecordOf(labelpath, -1), fullest: null })
}

/** The snapshot of an unlocked bank whose lease runs a while yet. */
export const UnlockedBank: BankSnapshot = Object.freeze({
  stage: 'unlocked', isLocked: false, isEnded: false, endCause: null, leaseEndsAt: 1_800_000_000_000, lastErr: null, isUnlockWanted: false,
})

/** The verbs of a giver's bank that a form calls. */
export type FakeFormVerb = 'birth' | 'unlock' | 'replacePassphrase' | 'addPasskey' | 'revokePasskey' | 'dismissUnlock'

/** The fake strength checker's verdict: strong at twelve characters or more. */
export function fakeVerdictOf(passphrase: string): PassphraseVerdict {
  return (passphrase.length >= 12) ? { strong: true } : { strong: false, reason: 'Twelve characters or more, please.' }
}

/** A fake Device, and the test's ways past it. */
export interface FakeGiverWorld {
  device:  GiverDevice<FakeBoxCar>
  /** Each labelpath's car as the vaultDB would answer it now. A labelpath left out answers the void car. */
  stored:  Map<string, FakeBoxCar>
  /** How many cars the bank objects have asked the vaultDB for. */
  counts:  { gets: number }
  /** Each form verb the bank objects have heard, in order, with the cleartexts it was handed. */
  formCalls: Readonly<{ verb: FakeFormVerb, cleartexts: unknown }>[]
  /** Hold each car the vaultDB reads from now on until the function returned is called: it then answers what it read. */
  pauseAnswers(): () => void
  /** Hold each strength verdict from now on until the function returned is called. */
  pauseVerdicts(): () => void
  /** Have each form verb from now on reject with `err`, or resolve again for null. */
  refuseFormVerbs(err: Error | null): void
  /** Have each strength verdict from now on reject with `err`, or land again for null. */
  refuseVerdicts(err: Error | null): void
  /** Replace the Device's snapshot of its bank. */
  _cheat_setBank(snapshot: BankSnapshot): void
  /** Announce `car` to the bank object's listeners, as its minder would on caching it at `dataUpdatedAt`. */
  _cheat_hear(labelpath: string, car: FakeBoxCar, dataUpdatedAt?: number): void
  /** Announce that the minder let go of the car at `labelpath`. */
  _cheat_hearRemoved(labelpath: string): void
  /** End the bank object: the next ensureBank starts another, with nothing cached. */
  _cheat_endBank(): void
}

/** A fake Device for user `u1` and bank `acme`, no bank object started, and nothing stored. */
export function makeFakeGiverWorld(): FakeGiverWorld {
  type Starter = (bank: GiverBank<FakeBoxCar>) => () => void
  const userid    = 'u1'
  const banklabel = 'acme'
  let snapshot: DeviceSnapshot = Object.freeze({ bank: PendingBank })
  let answerPause:    Promise<void> | null = null
  let verdictPause:   Promise<void> | null = null
  let formRefusal:    Error | null = null
  let verdictRefusal: Error | null = null
  let bank: GiverBank<FakeBoxCar> | null = null
  const deviceListeners = new Set<() => void>()
  const carListeners    = new Set<(event: GiverEvent<FakeBoxCar>) => void>()
  // For each starter, the function it returned for the bank object it was handed, or null for none.
  const endings         = new Map<Starter, (() => void) | null>()
  const stored          = new Map<string, FakeBoxCar>()
  // Each labelpath's car as the minder last cached it: by a get, or heard.
  const cached          = new Map<string, FakeBoxCar>()
  const counts          = { gets: 0 }
  const formCalls: FakeGiverWorld['formCalls'] = []

  function publish(next: DeviceSnapshot): void {
    snapshot = Object.freeze(next)
    for (const listener of deviceListeners) { listener() }
  }

  function emit(event: GiverEvent<FakeBoxCar>): void {
    for (const listener of carListeners) { listener(event) }
  }

  // As the minder's get does, a car in hand that the vaultDB is not known to hold newer than answers at once.
  async function getBoxCar(labelpath: string): Promise<FakeBoxCar> {
    const held = cached.get(labelpath)
    if ((held !== undefined) && (held.liveness !== 'bhnd') && (held.liveness !== 'bare')) { return held }
    counts.gets += 1
    const car = stored.get(labelpath) ?? voidCarOf(labelpath)
    if (answerPause !== null) { await answerPause }
    cached.set(labelpath, car)
    return car
  }

  // As the bank's verbs do, it answers once the verb is done, or rejects with the refusal.
  async function hearForm(verb: FakeFormVerb, cleartexts: unknown): Promise<void> {
    formCalls.push(Object.freeze({ verb, cleartexts }))
    await Promise.resolve()
    if (formRefusal !== null) { throw formRefusal }
  }

  async function judgeStrength(passphrase: string): Promise<PassphraseVerdict> {
    if (verdictPause !== null) { await verdictPause }
    if (verdictRefusal !== null) { throw verdictRefusal }
    return fakeVerdictOf(passphrase)
  }

  function startBank(): GiverBank<FakeBoxCar> {
    const started: GiverBank<FakeBoxCar> = Object.freeze({
      getBoxCar,
      listenBoxCars: (listener: (event: GiverEvent<FakeBoxCar>) => void) => {
        carListeners.add(listener)
        return () => { carListeners.delete(listener) }
      },
      birth:             (cleartexts: unknown) => hearForm('birth', cleartexts),
      unlock:            (cleartexts: unknown) => hearForm('unlock', cleartexts),
      replacePassphrase: (cleartexts: unknown) => hearForm('replacePassphrase', cleartexts),
      addPasskey:        (cleartexts: unknown) => hearForm('addPasskey', cleartexts),
      revokePasskey:     (cleartexts: unknown) => hearForm('revokePasskey', cleartexts),
      dismissUnlock:     () => { formCalls.push(Object.freeze({ verb: 'dismissUnlock', cleartexts: undefined })) },
    })
    bank = started
    for (const starter of endings.keys()) { endings.set(starter, starter(started)) }
    return started
  }

  const device: GiverDevice<FakeBoxCar> = Object.freeze({
    userid,
    banklabel,
    subscribe: (listener: () => void) => {
      deviceListeners.add(listener)
      return () => { deviceListeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    judgeStrength,
    ensureBank:  () => Promise.resolve(bank ?? startBank()),
    onBankStart: (starter: Starter) => {
      endings.set(starter, (bank === null) ? null : starter(bank))
      return () => { endings.delete(starter) }
    },
  })

  return {
    device,
    stored,
    counts,
    formCalls,
    pauseAnswers: () => {
      let release!: () => void
      answerPause = new Promise<void>((resolve) => { release = resolve })
      return () => { answerPause = null; release() }
    },
    pauseVerdicts: () => {
      let release!: () => void
      verdictPause = new Promise<void>((resolve) => { release = resolve })
      return () => { verdictPause = null; release() }
    },
    refuseFormVerbs: (err) => { formRefusal = err },
    refuseVerdicts:  (err) => { verdictRefusal = err },
    _cheat_setBank:  (bankSnapshot) => { publish({ ...snapshot, bank: bankSnapshot }) },
    _cheat_hear:     (labelpath, car, dataUpdatedAt = Date.now()) => {
      cached.set(labelpath, car)
      emit({ type: 'updated', queryKey: boxCarQueryKey({ userid, banklabel, labelpath }), state: { data: car, dataUpdatedAt } })
    },
    _cheat_hearRemoved: (labelpath) => {
      cached.delete(labelpath)
      emit({ type: 'removed', queryKey: boxCarQueryKey({ userid, banklabel, labelpath }), state: { data: undefined, dataUpdatedAt: 0 } })
    },
    _cheat_endBank: () => {
      bank = null
      cached.clear()
      for (const [starter, ending] of endings) {
        ending?.()
        endings.set(starter, null)
      }
    },
  }
}
