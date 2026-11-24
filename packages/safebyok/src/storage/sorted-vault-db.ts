/** `SortedVaultDB`, a vaultDB that wraps another and notifies one bank's records as an ordered feed. */

import { once } from 'es-toolkit'
import { Errors, Validator } from 'safebyok-big/internals'
import { type Lifetok, Labelpath } from '../shapes/primitives'
import { type BirthBankAsk, type GetAsk, type ListAsk, type LoggableAsk, type ThingWatchScope, type Tracked, type WorldRecord, type WriteAsk, AskChecks } from '../shapes/shapes-asks'
import { type ThingRecord, type VoidSentinel, ThingChecks, isLifepathDeep, isParityRight } from '../shapes/shapes-thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type SeenThing, type VaultEvent, livenessVals, vaultEventkindVals } from '../shapes/shapes-vault-event'
import { Thing } from '../models/thing'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'
import { FeedSorter } from './feed-sorter'
import { ReadTcPattern, readTcNow } from './thing-classifier'
import type { BirthBankAnswer, GetThingAnswer, ListThingsAnswer, ReadTc, VaultDB, WriteThingAnswer } from './vault-db'

// == [SortedVaultDB]: SortedVaultDBOpts, Stamp, SortedWatcher, SortedVaultDB

/** Options for {@link SortedVaultDB.make}. */
export interface SortedVaultDBOpts {
  /** The vaultDB to wrap. */
  vaultDB: VaultDB
}

/** Who dispatched a record, when it was read, and its bank's lifetok where known: every notice of it carries all three. */
type Stamp = Readonly<{ sourcelabel: string, read_tc: ReadTc, bank_lifetok: Lifetok | undefined }>

/** One watcher: its handlers. */
type SortedWatcher = Readonly<{ onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void }>

/** A vaultDB that wraps another and serves one bank, notifying each record it learns of that is news, in order.
 * It learns of the records each answer carries, of what the wrapped vaultDB's watch notifies, and of the notices a device database rings to its `bell`.
 * It watches the wrapped vaultDB from when it is made until its `sweep`. A record it learns of while no one watches it is
 * sorted all the same, and reaches no one, then or later: watch it before asking it anything.
 */
export class SortedVaultDB implements VaultDB {
  // == [Props]: VaultDBSourcelabel, #vaultDB, #watchers, #sorter, #bankLifetok, #unwatchWrapped

  /** The `sourcelabel` of each notice of a record from the wrapped vaultDB, from an answer or its watch. */
  static get VaultDBSourcelabel(): 'vault_db' { return 'vault_db' }

  /** The wrapped vaultDB. */
  readonly #vaultDB: VaultDB
  readonly #watchers = new Set<SortedWatcher>()
  /** The sorter of this bank's records. */
  readonly #sorter: FeedSorter
  /** The lifetok of the newest answer's world, for a notice whose dispatch carries none. */
  #bankLifetok: Lifetok | undefined = undefined
  /** The stop of the wrapped vaultDB's watch, which runs once. */
  readonly #unwatchWrapped: () => void
  // --

  // == [Construction]: make, constructor

  /** Wrap `opts.vaultDB` for the bank at `scope`, and start watching it. */
  static make(scope: BankScope, opts: SortedVaultDBOpts): SortedVaultDB { return new SortedVaultDB(scope, opts) }

  private constructor(scope: BankScope, opts: SortedVaultDBOpts) {
    const { scope: bankScope, opts: { vaultDB } } = Checks.makeArgs.parse({ scope, opts })
    this.#vaultDB = vaultDB
    this.#sorter  = new FeedSorter(bankScope)
    this.#unwatchWrapped = once(vaultDB.watch(bankScope, (event) => { this.#notifyEventsOfNotice(event) }, (news) => { this.#sendBadNews(news) }))
    Object.freeze(this)
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, watch
  // Each verb hands what it is given to the wrapped vaultDB, which checks it and answers a refusal rather than throwing, and
  // returns that answer unchanged. The records it carries are notified first, out to in, at the answer's read_tc.

  /** {@link VaultDB.tryGetThing}: a get that finds nothing notifies the shell its answer carries. */
  async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> {
    const answer = await this.#vaultDB.tryGetThing(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#notifyEventsOfAnswer(answer, [...rootsOf(answer), ...gotRecordsOf(answer)])
    return answer
  }

  /** {@link VaultDB.tryWriteThing}: a write refused over nothing stored notifies the shell its answer carries. */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    const answer = await this.#vaultDB.tryWriteThing(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#notifyEventsOfAnswer(answer, [...rootsOf(answer), ...writtenRecordsOf(answer)])
    return answer
  }

  /** {@link VaultDB.tryListThings}: the parent and each Thing listed are notified sparse, in labelpath order. */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> {
    const answer = await this.#vaultDB.tryListThings(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#notifyEventsOfAnswer(answer, [...rootsOf(answer), ...answer.parentage, ...answer.deltas])
    return answer
  }

  /** {@link VaultDB.tryBirthBank} */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    const answer = await this.#vaultDB.tryBirthBank(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#notifyEventsOfAnswer(answer, [...rootsOf(answer), ...bornRecordsOf(answer)])
    return answer
  }

  /** Watch this vaultDB's bank ({@link VaultDB.watch}): each notice is a {@link VaultEvent} of a record that is news, with its `sourcelabel`, `read_tc` and `bank_lifetok`.
   * - A notice's `bank_lifetok` is the one its dispatch carries: an answer's ask's, else its world's. Else it is that of
   *   the newest answer's world.
   * - The notices of a verb's answer reach every watcher, in order, before the verb resolves.
   * - Of the records an answer carries, the bank comes first, then the main gate, the root box, a list's parent and the
   *   Things it lists, and last the answer's own record.
   * - A record no newer than one seen of its Thing is notified to no one, unless it is the newest revision seen, read in a
   *   later span of 65.536 seconds than that revision was last seen in.
   * Refuses a watch of another bank than this vaultDB's.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void): () => void {
    const { scope: bankScope } = Checks.watchArgs.parse({ scope, onNotice, onBadNews })
    ThingChecks.bankScope.parseConsistent(bankScope, this.#sorter)
    const watcher: SortedWatcher = { onNotice, onBadNews }
    this.#watchers.add(watcher)
    return () => { this.#watchers.delete(watcher) }
  }
  // --

  // == [Ringing]: bell

  /** Take a notice a device database rings, and notify every watcher, before returning, of the events of its `val` that are news, at its `sourcelabel`, `read_tc` and `bank_lifetok`.
   * An `item` notice's `val` is sorted as an answer's record is, a void sentinel at the lifepath it carries.
   * A `life` or `aged` notice notifies nothing, and its agerank is never read: the sorter makes its own.
   * Refuses a notice of another bank.
   */
  bell(event: VaultEvent): void {
    const rung = Checks.rungEvent.parse(event)
    Validator.demandConsistent(rung, this.#sorter)
    if (event.eventkind !== 'item') { return }
    const { liveness } = Checks.rungItem.parse(event)
    if (liveness === 'void') { Checks.rungVoid.parseConsistent(event.val, rung) } else { Checks.rungThing.parseConsistent(event.val, rung) }
    this.#notifyEventsOf([event.val], { sourcelabel: rung.sourcelabel, read_tc: rung.read_tc, bank_lifetok: rung.bank_lifetok ?? this.#bankLifetok })
  }
  // --

  // == [Ending]: sweep

  /** Stop watching the wrapped vaultDB, for good: what its watch notifies after reaches no one. A second call does nothing.
   * Its answers still pass through, and their records are still notified. What the wrapped vaultDB's stop throws is thrown.
   */
  sweep(): this {
    this.#unwatchWrapped()
    return this
  }
  // --

  // == [Notifying]: #isOwnBank, #notifyEventsOfAnswer, #notifyEventsOfNotice, #notifyEventsOf, #sendBadNews

  /** True when `scoped` is of this vaultDB's bank. */
  #isOwnBank(scoped: LoggableAsk): boolean {
    return (scoped.userid === this.#sorter.userid) && (scoped.banklabel === this.#sorter.banklabel)
  }

  /** Notify every watcher of the events of `seens`, the records `answer` carries, from the wrapped vaultDB at the answer's `read_tc`, with the lifetok its ask carries, else its world's. */
  #notifyEventsOfAnswer(answer: { ask: LoggableAsk, world: WorldRecord | null, read_tc: ReadTc }, seens: readonly SeenThing[]): void {
    if (answer.world !== null) { this.#bankLifetok = answer.world.lifetok }
    this.#notifyEventsOf(seens, { sourcelabel: SortedVaultDB.VaultDBSourcelabel, read_tc: answer.read_tc, bank_lifetok: answer.ask.bank_lifetok ?? this.#bankLifetok })
  }

  /** Notify every watcher of the events of the record in `event`, a notice of the wrapped vaultDB's watch. */
  #notifyEventsOfNotice(event: VaultEvent): void {
    if (event.eventkind !== 'item') { return }
    // The wrapped vaultDB stamps its notices when it classifies their records; one that does not is read now.
    this.#notifyEventsOf([event.val], { sourcelabel: SortedVaultDB.VaultDBSourcelabel, read_tc: event.read_tc ?? readTcNow(), bank_lifetok: event.bank_lifetok ?? this.#bankLifetok })
  }

  /** Notify every watcher of each event the sorter returns for `seens`, in order, each carrying `stamp`. A record the sorter refuses goes to every watcher's `onBadNews`. */
  #notifyEventsOf(seens: readonly SeenThing[], stamp: Stamp): void {
    for (const seen of seens) {
      let events: readonly VaultEvent[]
      try { events = this.#sorter.eventify(seen, stamp.read_tc) } catch (err) { this.#sendBadNews(Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)); continue }
      for (const event of events) {
        const notice = Object.freeze({ ...event, ...stamp })
        for (const { onNotice, onBadNews } of this.#watchers) {
          // A notice handler that throws is a bug in the host's code, not trouble in storage.
          try { onNotice(notice) } catch (err) { onBadNews(Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)) }
        }
      }
    }
  }

  /** Send `news` to every watcher's `onBadNews`. */
  #sendBadNews(news: Errors.VaultError): void {
    for (const { onBadNews } of this.#watchers) { onBadNews(news) }
  }
  // --
}
// --

// == [Records of an answer]: rootsOf, bankOfWorld, gotRecordsOf, writtenRecordsOf, bornRecordsOf

// The world and tracked of one step agree, so a root they both carry is notified once: the sorter drops the second.
// Unspecified for a missing or damaged row: notes/wontfix.md.
/** The roots `answer` carries: its world's bank and main gate, then each root its `tracked` reports other than `'same'`, the bank first and the root box last. */
function rootsOf({ world, tracked }: { world: WorldRecord | null, tracked?: Tracked }): ThingRecord[] {
  const worldRoots   = (world === null) ? [] : [bankOfWorld(world), world.maingate]
  const trackedRoots = (tracked === undefined) ? [] : [tracked.bank, tracked[Labelpath.MainGate], tracked[Labelpath.RootBox]]
  return [...worldRoots, ...trackedRoots.filter((root) => root !== 'same')]
}

/** The bank record of `world`, without its main gate. */
function bankOfWorld(world: WorldRecord): ThingRecord {
  const { maingate: _maingate, ...bank } = world
  return bank
}

/** The record a get's `answer` carries of its own Thing: the live Thing, the tombstone or shell, or a refusal's dbhas, none where the verb threw. */
function gotRecordsOf(answer: GetThingAnswer): SeenThing[] {
  if (! answer.ok) { return (answer.dbhas === null) ? [] : [answer.dbhas] }
  return (answer.act === 'gotlive') ? [answer.val] : [answer.dbhas]
}

/** The record a write's `answer` carries of its own Thing: the Thing written or found, or a refusal's dbhas, the shell where none is stored, none where the verb threw. */
function writtenRecordsOf(answer: WriteThingAnswer): SeenThing[] {
  if (answer.ok) { return [answer.val] }
  return (answer.dbhas === null) ? [] : [answer.dbhas]
}

/** The records a birth's `answer` carries of its own: the three roots, or a refusal's dbhas, none where the verb threw. */
function bornRecordsOf(answer: BirthBankAnswer): SeenThing[] {
  if (answer.ok) { return [answer.val.bank, answer.val.gate, answer.val.root] }
  return (answer.dbhas === null) ? [] : [answer.dbhas]
}
// --

// == [Checks]: Checks

/** The checks of {@link SortedVaultDB.make}'s arguments, of a watch, and of what is rung to its bell. */
const Checks = Validator.Checkers('bad_record', ({ obj, oneof, str, custom }) => ({
  makeArgs:          obj({ scope: ThingChecks.bankScope, opts: obj({ vaultDB: ThingChecks.vaultDBShape }) }),
  watchArgs:         AskChecks.watchArgs,
  /** A notice rung to the bell: its kind and scope, who dispatched it, when it was read, and its bank's lifetok if any. Its `val` is checked apart, and the rest is not read. */
  rungEvent:         obj({
    ...ThingChecks.thingScope.shape,
    eventkind:    oneof(vaultEventkindVals),
    sourcelabel:  ThingChecks.label,
    read_tc:      str.regex(ReadTcPattern, Phrases.ReadTcShape),
    bank_lifetok: AskChecks.loggableAsk.shape.bank_lifetok,
  }),
  /** The liveness of an `item` notice rung to the bell, which says which check its `val` gets. */
  rungItem:          obj({ liveness: oneof(livenessVals) }),
  /** The `val` of a `void` notice rung to the bell: the void sentinel, its lifepath as deep as its labelpath. */
  rungVoid:          custom<VoidSentinel>((val) => Thing.isVoidSentinel(val), Phrases.VoidSentinelExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
  /** The `val` of any other `item` notice rung to the bell: a Thing's fields, sparse or whole, never the void sentinel; its lifepath as deep as its labelpath, its own lifeseq odd exactly for a tombstone. */
  rungThing:         ThingChecks.sparse
    .refine((val) => ! Thing.isVoidSentinel(val), Phrases.ThingFieldsExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
}))
// --
