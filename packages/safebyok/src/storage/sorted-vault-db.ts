/** `SortedVaultDB`, which answers a vaultDB's verbs over another, and tells one bank's records that are news as an ordered feed. */

import { once } from 'es-toolkit'
import { Errors, Validator } from 'safebyok-big/internals'
import { type Lifetok, Labelpath } from '../shapes/primitives'
import { type BirthBankAsk, type GetAsk, type ListAsk, type LoggableAsk, type Tracked, type WorldRecord, type WriteAsk, AskChecks } from '../shapes/shapes-asks'
import { type ThingRecord, type ThingScope, type VoidSentinel, ThingChecks, isLifepathDeep, isParityRight } from '../shapes/shapes-thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type SeenThing, type VaultEvent, livenessVals, vaultEventkindVals } from '../shapes/shapes-vault-event'
import { BaseThing } from '../models/base-thing'
import { type Adoptable, type Thing, SeenChecks } from '../models/thing'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'
import { itemSeenOf } from './agerank'
import { ReadTcPattern, readTcNow } from './thing-classifier'
import type { BirthBankAnswer, GetThingAnswer, ListThingsAnswer, ReadTc, VaultDB, WriteThingAnswer } from './vault-db'

// == [SortedVaultDB]: ReceivingThing, ThingMaker, SortedVaultDBOpts, SortedVaultDBListener, Stamp, Listening, SortedVaultDB

/** What a {@link SortedVaultDB} calls of each Thing it keeps. */
export type ReceivingThing = Pick<Thing<ThingRecord, unknown, unknown, Adoptable<ThingRecord>>, 'receive' | 'agerank'>

/** Make the Thing a {@link SortedVaultDB} keeps at a labelpath, from `seen`, the first record it learns of there. */
export type ThingMaker<ThingT extends ReceivingThing = ReceivingThing> = (seen: SeenThing) => ThingT

/** Options for {@link SortedVaultDB.make}. */
export interface SortedVaultDBOpts<ThingT extends ReceivingThing = ReceivingThing> {
  /** The vaultDB to wrap. */
  vaultDB: VaultDB
  /** Makes the Thing kept at each labelpath, once, from the first record learned of there: a device's world's `makeThing`. */
  makeThing: ThingMaker<ThingT>
}

/** What listens to a {@link SortedVaultDB}: it hears each event that is news, and is told of trouble. */
export type SortedVaultDBListener = Readonly<{
  /** Hear `event`, of a record that is news. */
  hear: (event: VaultEvent) => void
  /** Be told of `news`, trouble no caller is waiting on: a record that fails its checks, or what `hear` threw. */
  onBadNews: (news: Errors.VaultError) => void
}>

/** Who dispatched a record, when it was read, and its bank's lifetok where known: every event of it carries all three. */
type Stamp = Readonly<{ sourcelabel: string, read_tc: ReadTc, banktok: Lifetok | undefined }>

/** One call of `listen`, holding its listener: a listener that listens twice is told twice, and each end stops one. */
type Listening = Readonly<{ listener: SortedVaultDBListener }>

/** A vaultDB's four verbs over another vaultDB, for one bank, telling its listeners each record it learns of that is news, in order.
 * It learns of the records each answer carries, of what the wrapped vaultDB's watch notifies, and of the events a device database rings, handed to its `receive`.
 * It keeps a Thing for each labelpath it learns of a record at, for as long as it lives, and each Thing's `receive` says what is news.
 * It watches the wrapped vaultDB from when it is made until its `sweep`. A record it learns of while no one listens is
 * taken all the same, and reaches no one, then or later: listen before asking it anything.
 */
export class SortedVaultDB<ThingT extends ReceivingThing = ReceivingThing> implements Omit<VaultDB, 'watch'> {
  // == [Props]: VaultDBSourcelabel, #vaultDB, #scope, #makeThing, #things, #listenings, #newestBanktok, #unwatchWrapped

  /** The `sourcelabel` of each event of a record from the wrapped vaultDB, from an answer or its watch. */
  static get VaultDBSourcelabel(): 'vault_db' { return 'vault_db' }

  /** The wrapped vaultDB. */
  readonly #vaultDB: VaultDB
  /** The bank this vaultDB serves. */
  readonly #scope: BankScope
  readonly #makeThing: ThingMaker<ThingT>
  /** The Thing at each labelpath a record was learned of at. */
  readonly #things = new Map<Labelpath, ThingT>()
  readonly #listenings = new Set<Listening>()
  /** The `banktok` of the newest answer that read the bank, for a notice or an event rung that carries none. */
  #newestBanktok: Lifetok | undefined = undefined
  /** The stop of the wrapped vaultDB's watch, which runs once. */
  readonly #unwatchWrapped: () => void
  // --

  // == [Construction]: make, constructor

  /** Wrap `opts.vaultDB` for the bank at `scope`, and start watching it. */
  static make<ThingT extends ReceivingThing>(scope: BankScope, opts: SortedVaultDBOpts<ThingT>): SortedVaultDB<ThingT> { return new SortedVaultDB(scope, opts) }

  private constructor(scope: BankScope, opts: SortedVaultDBOpts<ThingT>) {
    const { scope: bankScope, opts: { vaultDB } } = Checks.makeArgs.parse({ scope, opts })
    this.#vaultDB   = vaultDB
    this.#scope     = Object.freeze({ userid: bankScope.userid, banklabel: bankScope.banklabel })
    this.#makeThing = opts.makeThing
    this.#unwatchWrapped = once(vaultDB.watch(bankScope, (notice) => { this.#tellNotice(notice) }, (news) => { this.#tellBadNews(news) }))
    Object.freeze(this)
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank
  // Each verb hands what it is given to the wrapped vaultDB, which checks it and answers a refusal rather than throwing, and
  // returns that answer unchanged. The records it carries are told first, out to in, at the answer's read_tc.

  /** {@link VaultDB.tryGetThing}: a get that finds nothing tells the shell its answer carries. */
  async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> {
    const answer = await this.#vaultDB.tryGetThing(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#tellAnswer(answer, [...rootsOf(answer), ...gotRecordsOf(answer)])
    return answer
  }

  /** {@link VaultDB.tryWriteThing}: a write refused over nothing stored tells the shell its answer carries. */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    const answer = await this.#vaultDB.tryWriteThing(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#tellAnswer(answer, [...rootsOf(answer), ...writtenRecordsOf(answer)])
    return answer
  }

  /** {@link VaultDB.tryListThings}: the parent and each Thing listed are told sparse, in labelpath order. */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> {
    const answer = await this.#vaultDB.tryListThings(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#tellAnswer(answer, [...rootsOf(answer), ...answer.parentage, ...answer.deltas])
    return answer
  }

  /** {@link VaultDB.tryBirthBank} */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    const answer = await this.#vaultDB.tryBirthBank(ask)
    if (! this.#isOwnBank(answer.ask)) { return answer }
    this.#tellAnswer(answer, [...rootsOf(answer), ...bornRecordsOf(answer)])
    return answer
  }

  // --

  // == [Listening]: listen

  /** Tell `listener` each event of this bank's records that is news, and of trouble, until the function it returns is called.
   * - Each event is a {@link VaultEvent} with its `sourcelabel`, `read_tc` and `banktok`. An answer's events carry the
   *   answer's `banktok`, or undefined where it is null; a notice's or an event rung's carry its own, else that of the
   *   newest answer that read the bank.
   * - The events of a verb's answer reach every listener, in order, before the verb resolves.
   * - Of the records an answer carries, the bank comes first, then the main gate, the root box, a list's parent and the
   *   Things it lists, and last the answer's own record.
   * - A record no newer than one seen of its Thing is told to no one, unless it is the newest revision seen, read in a
   *   later span of 65.536 seconds than that revision was last seen in.
   * - What `hear` throws goes to the listener's own `onBadNews`.
   */
  listen(listener: SortedVaultDBListener): () => void {
    Checks.listener.parse(listener)
    const listening: Listening = Object.freeze({ listener })
    this.#listenings.add(listening)
    return () => { this.#listenings.delete(listening) }
  }
  // --

  // == [Receiving]: receive

  /** Take an event a device database rang, and tell every listener, before returning, the events of its `val` that are news, at its `sourcelabel`, `read_tc` and `banktok`.
   * An `item` event's `val` is taken as an answer's record is, a void sentinel at the lifepath it carries.
   * A `life` or `aged` event tells nothing, and its agerank is never read: the Thing at its labelpath keeps its own.
   * Refuses an event of another bank.
   */
  receive(event: VaultEvent): void {
    const rung = Checks.rungEvent.parse(event)
    Validator.demandConsistent(rung, this.#scope)
    if (event.eventkind !== 'item') { return }
    const { liveness } = Checks.rungItem.parse(event)
    if (liveness === 'void') { Checks.rungVoid.parseConsistent(event.val, rung) } else { Checks.rungThing.parseConsistent(event.val, rung) }
    this.#tell([event.val], { sourcelabel: rung.sourcelabel, read_tc: rung.read_tc, banktok: rung.banktok ?? this.#newestBanktok })
  }
  // --

  // == [Reading]: thingAt

  /** The Thing at `scoped`, a labelpath of this vaultDB's bank, or undefined where no record of it has been learned of. The same object across records and lives. */
  thingAt(scoped: ThingScope): ThingT | undefined {
    const { labelpath } = ThingChecks.thingScope.parseConsistent(scoped, this.#scope)
    return this.#things.get(labelpath)
  }
  // --

  // == [Ending]: sweep

  /** Stop watching the wrapped vaultDB, for good: what its watch notifies after reaches no one. A second call does nothing.
   * Its answers still pass through, and their records are still told. What the wrapped vaultDB's stop throws is thrown.
   */
  sweep(): this {
    this.#unwatchWrapped()
    return this
  }
  // --

  // == [Telling]: #isOwnBank, #tellAnswer, #tellNotice, #tell, #receiveAtThing, #tellBadNews

  /** True when `scoped` is of this vaultDB's bank. */
  #isOwnBank(scoped: LoggableAsk): boolean {
    return (scoped.userid === this.#scope.userid) && (scoped.banklabel === this.#scope.banklabel)
  }

  /** Tell every listener the events of `seens`, the records `answer` carries, from the wrapped vaultDB at the answer's `read_tc` and `banktok`. */
  #tellAnswer(answer: { banktok: Lifetok | null, read_tc: ReadTc }, seens: readonly SeenThing[]): void {
    const banktok = answer.banktok ?? undefined
    if (banktok !== undefined) { this.#newestBanktok = banktok }
    this.#tell(seens, { sourcelabel: SortedVaultDB.VaultDBSourcelabel, read_tc: answer.read_tc, banktok })
  }

  /** Tell every listener the events of the record in `notice`, a notice of the wrapped vaultDB's watch. */
  #tellNotice(notice: VaultEvent): void {
    if (notice.eventkind !== 'item') { return }
    // The wrapped vaultDB stamps its notices when it classifies their records; one that does not is read now.
    this.#tell([notice.val], { sourcelabel: SortedVaultDB.VaultDBSourcelabel, read_tc: notice.read_tc ?? readTcNow(), banktok: notice.banktok ?? this.#newestBanktok })
  }

  /** Tell every listener each event the Things return for `seens`, in order, each carrying `stamp`. A record refused goes to every listener's `onBadNews`. */
  #tell(seens: readonly SeenThing[], stamp: Stamp): void {
    for (const seen of seens) {
      let events: readonly VaultEvent[]
      try { events = this.#receiveAtThing(seen, stamp) } catch (err) { this.#tellBadNews(Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)); continue }
      for (const event of events) {
        for (const { listener } of this.#listenings) {
          // A listener whose hear throws has a bug in the host's code, not trouble in storage.
          try { listener.hear(event) } catch (err) { listener.onBadNews(Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)) }
        }
      }
    }
  }

  // A Thing is kept only once it has received its first record, so a refused record leaves no Thing behind.
  /** The events the Thing at `seen`'s labelpath returns for `seen` at `stamp`, the Thing made first where there is none */
  #receiveAtThing(seen: SeenThing, stamp: Stamp): readonly VaultEvent[] {
    const { labelpath } = SeenChecks.seenCited.parseConsistent(seen, this.#scope)
    const proposed = Object.freeze({
      eventkind: 'item', ...this.#scope, labelpath, modelkind: Labelpath.modelkindOf(labelpath), agerank: undefined, agerankWas: undefined, ...stamp, ...itemSeenOf(seen),
    } as const)
    const thing  = this.#things.get(labelpath) ?? this.#makeThing(seen)
    const events = thing.receive(proposed)
    this.#things.set(labelpath, thing)
    return events
  }

  /** Tell `news` to every listener's `onBadNews`. */
  #tellBadNews(news: Errors.VaultError): void {
    for (const { listener } of this.#listenings) { listener.onBadNews(news) }
  }
  // --
}
// --

// == [Recognizing]: SortedVaultDBMembernames, isSortedVaultDB

/** The members of {@link SortedVaultDB} that are functions. */
const SortedVaultDBMembernames = [
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'listen', 'receive', 'thingAt', 'sweep',
] as const satisfies readonly (keyof SortedVaultDB)[]

/** True for an object with a function for each member of {@link SortedVaultDB}. */
export function isSortedVaultDB(val: unknown): val is SortedVaultDB {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return SortedVaultDBMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

// == [Records of an answer]: rootsOf, bankOfWorld, gotRecordsOf, writtenRecordsOf, bornRecordsOf

// The world and tracked of one step agree, so a root they both carry is told once: its Thing drops the second.
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

/** The checks of {@link SortedVaultDB.make}'s arguments, of a listener, and of what a device database rang, handed to `receive`. */
const Checks = Validator.Checkers('bad_record', ({ obj, oneof, str, custom, fn }) => ({
  makeArgs:          obj({ scope: ThingChecks.bankScope, opts: obj({ vaultDB: ThingChecks.vaultDBShape, makeThing: fn<ThingMaker>() }) }),
  listener:          obj({ hear: fn(), onBadNews: fn() }),
  /** An event rung: its kind and scope, who dispatched it, when it was read, and its bank's lifetok if any. Its `val` is checked apart, and the rest is not read. */
  rungEvent:         obj({
    ...ThingChecks.thingScope.shape,
    eventkind:    oneof(vaultEventkindVals),
    sourcelabel:  ThingChecks.label,
    read_tc:      str.regex(ReadTcPattern, Phrases.ReadTcShape),
    banktok:      AskChecks.loggableAsk.shape.banktok,
  }),
  /** The liveness of an `item` event rung, which says which check its `val` gets. */
  rungItem:          obj({ liveness: oneof(livenessVals) }),
  /** The `val` of a `void` event rung: the void sentinel, its lifepath as deep as its labelpath. */
  rungVoid:          custom<VoidSentinel>((val) => BaseThing.isVoidSentinel(val), Phrases.VoidSentinelExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
  /** The `val` of any other `item` event rung: a Thing's fields, sparse or whole, never the void sentinel; its lifepath as deep as its labelpath, its own lifeseq odd exactly for a tombstone. */
  rungThing:         ThingChecks.sparse
    .refine((val) => ! BaseThing.isVoidSentinel(val), Phrases.ThingFieldsExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
}))
// --
