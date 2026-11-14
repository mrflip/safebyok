/** The vaultDB in memory. */

import { type EX, Helpers } from 'safebyok-big/internals'
import { AdapterVaultDB } from './adapter-vault-db'
import type { GetThingAsk, Thing, ThingScope, ThingWatchScope, WriteThingAsk } from './shapes-thing'
import { isWriteAct, writtenThingOf } from './thing-classifier'
import type { Actual } from './vault-db'

/** A watch: the bank it hears, and the function that hears each change. */
type Listener = { scope: ThingWatchScope, hear: (heard: { record: unknown, world: null }) => void }

/** A vaultDB kept in this tab's memory, gone when the tab closes. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #things, #listeners

  // The modelkind at the base of each labelpath keeps the kinds apart, so one map holds them all.
  readonly #things = new Map<string, unknown>()
  readonly #listeners = new Set<Listener>()
  // --

  // == [Things]: _cheat_things, ckeyOf, #tell

  /** For tests: the Things stored, by {@link MemoryVaultDB.ckeyOf} their scope, to read or change in place. */
  _cheat_things(): Map<string, unknown> { return this.#things } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The map key of the Thing at `scope`. */
  static ckeyOf({ userid, banklabel, labelpath }: ThingScope): string { return Helpers.ckeyOf(userid, banklabel, labelpath) }

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

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doWatch

  protected doGetThing(ask: GetThingAsk): Actual<EX.GotAct> {
    const raw = this.#things.get(MemoryVaultDB.ckeyOf(ask)) ?? null
    return this.classifyGetThing(ask, structuredClone(raw))
  }

  protected doWriteThing(ask: WriteThingAsk): Actual<EX.PutAct | EX.DelAct> {
    const ckey   = MemoryVaultDB.ckeyOf(ask)
    const actual = this.classifyWriteThing(ask, structuredClone(this.#things.get(ckey) ?? null))
    if (! (actual.ok && isWriteAct(actual.act))) { return actual }
    this.#things.set(ckey, structuredClone(ask.record))
    const record = writtenThingOf(ask, structuredClone(this.#things.get(ckey)))
    this.#tell(record)
    return { ...actual, record }
  }

  protected override doWatch(scope: ThingWatchScope, hear: Listener['hear']): () => void {
    const listener = { scope, hear }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  // --
}
