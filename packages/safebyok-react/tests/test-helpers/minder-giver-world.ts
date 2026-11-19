/** A Device for the giver's tests over the new core's minder: one bank, born in a memory vaultDB, already started. */

import { type BoxCar, type MinderFriend, ThingMinder } from 'safebyok'
import { type BoxThing, type GetAsk, type Thing, MemoryVaultDB, Shell, getAskOf, listAskOf } from 'safebyok/storage'
import * as LeanTH from 'safebyok/testing'
import { giverBankOfMinder } from '../../src/giver/minder-bank'
import type { DeviceSnapshot, GiverBank, GiverDevice } from '../../src/giver/react-giver'

// == [Asks]: minderGetAskOf

/** The get ask for the Thing at `labelpath` in the core's test bank, tracking its roots at revision 0. */
function minderGetAskOf({ labelpath, ifAbsent }: Readonly<{ labelpath: string, ifAbsent?: GetAsk['ifAbsent'] }>): GetAsk {
  return getAskOf({ ...LeanTH.ThingBank, labelpath, ...(ifAbsent && { ifAbsent }), track: LeanTH.trackOf() })
}
// --

// == [The world]: MinderGiverWorld, makeMinderGiverWorld, minderDeviceOf, unsubscribeNothing

/** A Device over one started bank's minder, and the test's ways past it. */
export interface MinderGiverWorld {
  device:    GiverDevice<BoxCar>
  vaultDB:   MemoryVaultDB
  minder:    ThingMinder
  /** How many gets the vaultDB has answered. */
  counts:    { gets: number }
  /** Hold every get the vaultDB is asked from now on, until the function returned is called. */
  holdGets(): () => void
  /** Store `box` under the root box, as its first revision. */
  _cheat_birthBox(box: BoxThing): Promise<void>
  /** Store `next` over `prior`. */
  _cheat_replace(prior: Thing, next: Thing): Promise<void>
}

/** A Device signed in as the user of the core's test bank ({@link LeanTH.ThingBank}), that bank born with no box under its root, and the bank object started.
 * Unless `isWatching` is false, the minder hears each write to the vaultDB.
 */
export async function makeMinderGiverWorld({ isWatching = true } = {}): Promise<MinderGiverWorld> {
  const vaultDB = new MemoryVaultDB()
  if (! isWatching) { vaultDB.watch = () => unsubscribeNothing }
  const counts  = { gets: 0 }
  let held: Promise<void> | null = null
  const tryGetThing = vaultDB.tryGetThing.bind(vaultDB)
  vaultDB.tryGetThing = async (ask) => {
    counts.gets += 1
    if (held !== null) { await held }
    return tryGetThing(ask)
  }
  function holdGets(): () => void {
    let release!: () => void
    held = new Promise<void>((resolve) => { release = resolve })
    return () => { held = null; release() }
  }
  await LeanTH.expectGood(vaultDB.tryBirthBank(LeanTH.birthBankAskOf()))

  const friend: MinderFriend = Object.freeze({
    scope:       LeanTH.ThingBank,
    rootBox:     LeanTH.rootBoxOf(),
    makeGetAsk:  minderGetAskOf,
    makeListAsk: ({ labelpath }) => listAskOf({ ...LeanTH.ThingBank, labelpath, track: LeanTH.trackOf() }),
    tellBadNews: (badnews) => { throw new AggregateError(badnews, 'The minder told of bad news') },
  })
  const minder = ThingMinder.make({ vaultDB }, friend)
  minder.hello()

  return {
    device:          minderDeviceOf(giverBankOfMinder(minder)),
    vaultDB,
    minder,
    counts,
    holdGets,
    _cheat_birthBox: async (box) => {
      const shell = Shell.of({ ...LeanTH.ThingBank, labelpath: box.labelpath }, LeanTH.rootBoxOf())
      await LeanTH.expectGood(vaultDB.tryWriteThing(LeanTH.birthAskOf(box, shell)))
    },
    _cheat_replace:  async (prior, next) => { await LeanTH.expectGood(vaultDB.tryWriteThing(LeanTH.replaceAskOf(prior, next))) },
  }
}

/** A Device signed in as `bank`'s user, its one bank object `bank`, never ending. */
function minderDeviceOf(bank: GiverBank<BoxCar>): GiverDevice<BoxCar> {
  const snapshot: DeviceSnapshot = Object.freeze({ userid: bank.userid, banks: Object.freeze({}) })
  return Object.freeze({
    subscribe:         () => unsubscribeNothing,
    getSnapshot:       () => snapshot,
    getServerSnapshot: () => snapshot,
    ensureBank:        () => Promise.resolve(bank),
    onBankStart:       (starter: (started: GiverBank<BoxCar>) => () => void) => {
      starter(bank)
      return unsubscribeNothing
    },
  })
}

/** What a subscription that hears nothing returns: a stop with nothing to stop. */
function unsubscribeNothing(): void { /* nothing to stop */ }
// --
