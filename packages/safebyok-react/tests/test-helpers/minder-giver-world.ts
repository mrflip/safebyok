/** A Device for the giver's tests over the new core's minder: one bank, born in a memory vaultDB, already started. */

import { type BoxCar, type DeviceSnapshot, type MinderFriend, PendingBank, ThingMinder } from 'safebyok'
import { type BoxRecord, type GetAsk, type ThingRecord, MemoryVaultDB, Shell, getAskOf, listAskOf } from 'safebyok/storage'
import * as LeanTH from 'safebyok/testing'
import { giverBankOfMinder } from '../../src/giver/minder-bank'
import type { GiverBank, GiverDevice } from '../../src/giver/shapes-giver'

// == [Asks]: minderGetAskOf

/** The get ask for the Thing at `labelpath` in the core's test bank, tracking its roots at revision 0. */
function minderGetAskOf({ labelpath, ifAbsent }: Readonly<{ labelpath: string, ifAbsent?: GetAsk['ifAbsent'] }>): GetAsk {
  return getAskOf({ ...LeanTH.ThingBank, labelpath, ...(ifAbsent && { ifAbsent }), track: LeanTH.trackOf() })
}
// --

// == [The world]: MinderGiverWorld, makeMinderGiverWorld, minderDeviceOf, NoFormVerbs, refuseNoGate, unsubscribeNothing

/** A Device over one started bank's minder, and the test's ways past it. */
export interface MinderGiverWorld {
  device:    GiverDevice<BoxCar>
  vaultDB:   MemoryVaultDB
  minder:    ThingMinder
  /** How many gets the vaultDB has answered. */
  counts:    { gets: number }
  /** Pause every get the vaultDB is asked from now on before it reads, until the function returned is called. */
  pauseGets(): () => void
  /** Pause every get the vaultDB is asked from now on after it reads, until the function returned is called: it answers what it read. */
  pauseAnswers(): () => void
  /** Put `box` under the root box, as its first revision. */
  _cheat_birthBox(box: BoxRecord): Promise<void>
  /** Put `next` over `prior`. */
  _cheat_replace(prior: ThingRecord, next: ThingRecord): Promise<void>
}

/** A Device signed in as the user of the core's test bank ({@link LeanTH.ThingBank}), that bank born with no box under its root, and the bank object started.
 * Unless `isWatching` is false, the minder hears each write to the vaultDB.
 */
export async function makeMinderGiverWorld({ isWatching = true } = {}): Promise<MinderGiverWorld> {
  const vaultDB = new MemoryVaultDB()
  if (! isWatching) { vaultDB.watch = () => unsubscribeNothing }
  const counts  = { gets: 0 }
  let askPause:    Promise<void> | null = null
  let answerPause: Promise<void> | null = null
  const tryGetThing = vaultDB.tryGetThing.bind(vaultDB)
  vaultDB.tryGetThing = async (ask) => {
    counts.gets += 1
    if (askPause !== null) { await askPause }
    const answering = tryGetThing(ask)
    if (answerPause !== null) { await answerPause }
    return answering
  }
  function pauseGets(): () => void {
    let release!: () => void
    askPause = new Promise<void>((resolve) => { release = resolve })
    return () => { askPause = null; release() }
  }
  function pauseAnswers(): () => void {
    let release!: () => void
    answerPause = new Promise<void>((resolve) => { release = resolve })
    return () => { answerPause = null; release() }
  }
  await LeanTH.expectGood(vaultDB.tryBirthBank(LeanTH.birthBankAskOf()))

  const friend: MinderFriend = Object.freeze({
    scope:       LeanTH.ThingBank,
    rootBox:     { ...LeanTH.rootBoxOf(), am: 'a' },
    makeGetAsk:  minderGetAskOf,
    makeListAsk: ({ labelpath }) => listAskOf({ ...LeanTH.ThingBank, labelpath, track: LeanTH.trackOf() }),
    tellBadNews: (badnews) => { throw new AggregateError(badnews, 'The minder told of bad news') },
  })
  const minder = ThingMinder.make({ vaultDB }, friend)
  minder.hello()

  return {
    device:          minderDeviceOf(minder, { ...giverBankOfMinder(minder), ...NoFormVerbs }),
    vaultDB,
    minder,
    counts,
    pauseGets,
    pauseAnswers,
    _cheat_birthBox: async (box) => {
      const shell = Shell.of({ ...LeanTH.ThingBank, labelpath: box.labelpath }, LeanTH.rootBoxOf())
      await LeanTH.expectGood(vaultDB.tryWriteThing(LeanTH.birthAskOf(box, shell)))
    },
    _cheat_replace:  async (prior, next) => { await LeanTH.expectGood(vaultDB.tryWriteThing(LeanTH.replaceAskOf(prior, next))) },
  }
}

/** A Device of `minder`'s user and bank, its one bank object `bank`, never ending. */
function minderDeviceOf(minder: ThingMinder, bank: GiverBank<BoxCar>): GiverDevice<BoxCar> {
  const snapshot: DeviceSnapshot = Object.freeze({ bank: PendingBank })
  return Object.freeze({
    userid:        minder.userid,
    banklabel:     minder.banklabel,
    subscribe:     () => unsubscribeNothing,
    getSnapshot:   () => snapshot,
    judgeStrength: refuseNoGate,
    ensureBank:    () => Promise.resolve(bank),
    onBankStart:   (starter: (started: GiverBank<BoxCar>) => () => void) => {
      starter(bank)
      return unsubscribeNothing
    },
  })
}

/** The form verbs of a bank object over a minder alone: each refuses, since this world has no gate to prove against. */
const NoFormVerbs = Object.freeze({
  birth:             refuseNoGate,
  unlock:            refuseNoGate,
  replacePassphrase: refuseNoGate,
  addPasskey:        refuseNoGate,
  revokePasskey:     refuseNoGate,
  dismissUnlock:     unsubscribeNothing,
})

/** Refuse a call this world cannot answer: it has no gate. */
function refuseNoGate(): Promise<never> { return Promise.reject(new Error('The minder giver world has no gate')) }

/** What a subscription that hears nothing returns: a stop with nothing to stop. */
function unsubscribeNothing(): void { /* nothing to stop */ }
// --
