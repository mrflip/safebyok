/** `BankMinder`, which minds one bank's roots, the bank, its main gate and its root box, in a TanStack Query cache, its own or one it shares with minders of other banks. */

import { Validator } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import { type BankRecord, type BoxRecord, type GateRecord, type ThingScope } from '../shapes/shapes-thing'
import type { BankRoots, BirthBankAsk } from '../shapes/shapes-asks'
import { type MinderEvent, type MinderFriend, type MinderOpts, type QueryCacheOpts, MinderChecks, MinderEventFormat } from '../shapes/shapes-minder'
import type { BirthBankAnswer } from '../storage/vault-db'
import { Minder, MinderOptsChecks } from './minder'
import * as Throwers from '../refusals/throwers'

/** This device's cache of one bank's roots: the bank, its main gate and its root box, each an item ({@link Minder}).
 * Its world, read from those three items, is the one place the bank's roots are read from.
 */
export class BankMinder extends Minder {
  // == [Construction]: make, constructor

  /** Make a minder of `bank`'s roots. It does nothing until `hello`. */
  static make(opts: MinderOpts, bank: MinderFriend): BankMinder {
    const checked = Checks.bankMinderMakeArgs.parse({ opts, bank })
    return new BankMinder(checked.opts, checked.bank)
  }

  private constructor(opts: MinderOpts & Readonly<{ queryCacheOpts: QueryCacheOpts }>, bank: MinderFriend) {
    super(opts, bank)
    Object.freeze(this)
  }
  // --

  // == [What it minds]: mindsItemAt

  /** True for the bank, its main gate and its root box. */
  protected mindsItemAt(labelpath: Labelpath): boolean { return RootLabelpaths.has(labelpath) }
  // --

  // == [The world]: worldAt, fetchWorld, subscribe

  // Each call makes a new object of the items' own records, which stay the same until one lands.
  /** The bank's roots as last heard of, or undefined while any of the three is not cached, or is null. Never asks the vaultDB. */
  worldAt(): BankRoots | undefined {
    const bank = this.at(this.#scopeAt('bank'))
    const gate = this.at(this.#scopeAt(Labelpath.MainGate))
    const root = this.at(this.#scopeAt(Labelpath.RootBox))
    if ([bank, gate, root].some((record) => (record === undefined) || (record === null))) { return undefined }
    return Object.freeze({ bank: bank as BankRecord, gate: gate as GateRecord, root: root as BoxRecord })
  }

  // A get of the root box: its answer's world brings the bank and main gate.
  /** Fetch the bank's roots from the vaultDB, or null where none is stored.
   * Refuses where a root is stored without the others, or damaged beside them.
   */
  async fetchWorld(): Promise<BankRoots | null> {
    const root  = await this.get(this.#scopeAt(Labelpath.RootBox), { staleTime: 0 })
    const world = this.worldAt()
    if (world !== undefined) { return world }
    const isNoneStored = (root === null) && (this.deadAt(this.#scopeAt(Labelpath.RootBox)) === undefined)
      && (this.at(this.#scopeAt('bank')) === undefined) && (this.at(this.#scopeAt(Labelpath.MainGate)) === undefined)
    if (isNoneStored) { return null }
    throw Throwers.bankRootsMissing()
  }

  /** Call `listener` each time a record lands in one of the bank's roots, and return the function that stops it.
   * A landing that changes nothing calls it too. It is called with no argument: read {@link worldAt} again. What it throws goes to the bank's `tellBadNews`.
   */
  subscribe(listener: () => void): () => void {
    Checks.listener.parse(listener)
    return this.listen((event) => { if (isRootLanding(event)) { listener() } }, MinderEventFormat)
  }
  // --

  // == [Writing]: tryBirthBank

  /** Birth the bank through the vaultDB, and return its answer, a refusal included.
   * The three roots it answers, written or found stored, are cached before it answers, while minding.
   */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    const answer = await this.vaultDB.tryBirthBank(ask)
    if (answer.ok) {
      for (const record of [answer.val.bank, answer.val.gate, answer.val.root]) { this.sendToTSQ(record) }
    }
    return answer
  }
  // --

  // == [Scopes]: #scopeAt

  /** The scope of the Thing at `labelpath` in this bank. */
  #scopeAt(labelpath: Labelpath): ThingScope { return { ...this.scope, labelpath } }
  // --
}

// == [Helpers]: RootLabelpaths, isRootLanding

/** The labelpaths of a bank's roots: the bank, its main gate and its root box. */
const RootLabelpaths: ReadonlySet<Labelpath> = new Set(['bank', Labelpath.MainGate, Labelpath.RootBox])

/** True for an event of a record landing in an item, or of an item removed. */
function isRootLanding(event: MinderEvent): boolean {
  if (event.eventkind !== 'item') { return false }
  return (event.type === 'removed') || ((event.type === 'updated') && (event.action?.type === 'success'))
}
// --

// == [Checks]: Checks

/** The checks of a BankMinder's arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, fn }) => ({
  bankMinderMakeArgs: obj({ opts: MinderOptsChecks.minderOpts, bank: MinderChecks.minderFriend }),
  listener:           fn<() => void>(),
}))
// --
