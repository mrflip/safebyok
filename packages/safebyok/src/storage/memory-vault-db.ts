/** The vaultDB in memory. */

import { type EX, Helpers } from 'safebyok-big/internals'
import { AdapterVaultDB } from './adapter-vault-db'
import type { BirthBankAsk, BirthPuts, GetThingAsk, ListThingsAsk, Thing, ThingScope, ThingWatchScope, WriteThingAsk } from './shapes-thing'
import { type BankRootsFetched, isWriteAct, writtenRootsOf, writtenThingOf } from './thing-classifier'
import type { Actual, BirthBankActual, ListThingsActual } from './vault-db'

/** A watch: the bank it hears, and the function that hears each change. */
type Listener = { scope: ThingWatchScope, hear: (heard: { record: unknown, world: null }) => void }

/** A vaultDB kept in this tab's memory, gone when the tab closes. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #banks, #listeners

  // Each bank's Things, by labelpath, so that a listing reads one bank's. The modelkind at the base of each labelpath keeps the kinds apart.
  readonly #banks = new Map<string, Map<string, unknown>>()
  readonly #listeners = new Set<Listener>()
  // --

  // == [Things]: _cheat_things, ckeyOf, #thingsOf, #write, #rootsOf, #tell

  /** For tests: the Things stored in `scope`'s bank, by labelpath, to read or change in place. */
  _cheat_things(scope: ThingWatchScope): Map<string, unknown> { return this.#thingsOf(scope) } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the bank at `scope`, in `#banks`. */
  static ckeyOf({ userid, banklabel }: ThingWatchScope): string { return Helpers.ckeyOf(userid, banklabel) }

  /** The Things of `scope`'s bank, by labelpath. */
  #thingsOf(scope: ThingWatchScope): Map<string, unknown> {
    const ckey = MemoryVaultDB.ckeyOf(scope)
    const things = this.#banks.get(ckey) ?? new Map<string, unknown>()
    this.#banks.set(ckey, things)
    return things
  }

  /** Write `record` at `scope`, and return it as read back, checked. */
  #write(scope: ThingScope, record: Thing): Thing {
    const things = this.#thingsOf(scope)
    things.set(scope.labelpath, structuredClone(record))
    return writtenThingOf(scope, structuredClone(things.get(scope.labelpath)))
  }

  /** The raw roots of a bank's `things`, each a copy, or null for none. */
  #rootsOf(things: Map<string, unknown>): BankRootsFetched {
    return structuredClone({ bank: things.get('bank') ?? null, gate: things.get('gate') ?? null, root: things.get('box') ?? null })
  }

  // Each listener is called on a later microtask, so nothing it does runs inside the write that notified it.
  /** Notify each listener watching `thing`'s bank of it. */
  #tell(thing: Thing): void {
    for (const { scope, hear } of this.#listeners) {
      if ((scope.userid === thing.userid) && (scope.banklabel === thing.banklabel)) {
        queueMicrotask(() => { hear({ record: structuredClone(thing), world: null }) })
      }
    }
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doWatch

  protected doGetThing(ask: GetThingAsk): Actual<EX.GotAct> {
    const raw = this.#thingsOf(ask).get(ask.labelpath) ?? null
    return this.classifyGetThing(ask, structuredClone(raw))
  }

  protected doWriteThing(ask: WriteThingAsk): Actual<EX.PutAct | EX.DelAct> {
    const actual = this.classifyWriteThing(ask, structuredClone(this.#thingsOf(ask).get(ask.labelpath) ?? null))
    if (! (actual.ok && isWriteAct(actual.act))) { return actual }
    const record = this.#write(ask, ask.record)
    this.#tell(record)
    return { ...actual, record }
  }

  protected doListThings(ask: ListThingsAsk): ListThingsActual {
    const things   = this.#thingsOf(ask)
    const under    = `${ask.labelpath}/`
    const children = [...things]
      .filter(([labelpath]) => labelpath.startsWith(under) && (! labelpath.includes('/', under.length)))
      .map(([labelpath, raw]) => ({ labelpath, raw: structuredClone(raw) }))
    return this.classifyListThings(ask, { parent: structuredClone(things.get(ask.labelpath) ?? null), children })
  }

  protected doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthBankActual {
    const things = this.#thingsOf(ask)
    const actual = this.classifyBirthBank(puts, this.#rootsOf(things))
    if (! (actual.ok && (actual.act === 'born'))) { return actual }
    for (const { labelpath, record } of puts) { things.set(labelpath, structuredClone(record)) }
    const written = writtenRootsOf(puts, this.#rootsOf(things))
    for (const thing of Object.values(written)) { this.#tell(thing) }
    return { ...actual, things: written }
  }

  protected override doWatch(scope: ThingWatchScope, hear: Listener['hear']): () => void {
    const listener = { scope, hear }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  // --
}
