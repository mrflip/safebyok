/** The vaultDB in memory. */

import { type BoxesFetched, type Heard, type RowOfVault, type Tidied, AdapterVaultDB } from './vault-db'
import { isWriteAct } from './classifier'
import type { BoxClassified, VaultClassified } from './classifier'
import { DefaultMaxBoxes } from '../helpers/consts'
import { ckeyOf } from '../helpers/helpers'
import * as SX from '../shapes/shapes-storage'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import type { BoxDelAsk, BoxGetAsk, BoxPutAsk, BoxRecord, BoxTombstone, Capacity, MemoryVaultDBOpts, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultQuery, VaultRecord, VaultTombstone, WatchScope } from '../shapes/shapes-storage'
export type { MemoryVaultDBOpts } from '../shapes/shapes-storage'


type BoxLife = { scope: VaultScope, vault_tok: string, boxrows: Map<string, unknown> }
type Heeder = { scope: WatchScope, hear: (heard: Heard) => void }

/** A vaultDB kept in this tab's memory, gone when the tab closes. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #vaultrowsOfBank, #boxLives, #heeders, #maxBoxes

  readonly #vaultrowsOfBank = new Map<string, Map<string, unknown>>()
  readonly #boxLives = new Map<string, BoxLife>()
  readonly #heeders = new Set<Heeder>()
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: MemoryVaultDBOpts = {}) {
    const { maxBoxes = DefaultMaxBoxes, ...adapterVaultDBOpts } = SX.memoryVaultDBOpts.parse(opts)
    super(adapterVaultDBOpts)
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Rows]: _cheat_vaultRowsOf, _cheat_boxRowsOf, #vaultRowOf, #writeVaultRow, #writeBoxRow, #roomIn, #tell

  /** For tests: the bank's own map of vault rows, by vaultlabel. */
  _cheat_vaultRowsOf({ applabel, user_id }: BankScope): Map<string, unknown> { // eslint-disable-line unicorn/prefer-private-class-fields
    const ckey = ckeyOf(applabel, user_id)
    const vaultrows = this.#vaultrowsOfBank.get(ckey) ?? new Map<string, unknown>()
    this.#vaultrowsOfBank.set(ckey, vaultrows)
    return vaultrows
  }

  /** For tests: the map of box rows of one life of a vault, by boxlabel. */
  _cheat_boxRowsOf({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string): Map<string, unknown> { // eslint-disable-line unicorn/prefer-private-class-fields
    const ckey = ckeyOf(applabel, user_id, vaultlabel, vault_tok)
    const life = this.#boxLives.get(ckey) ?? { scope: { applabel, user_id, vaultlabel }, vault_tok, boxrows: new Map<string, unknown>() }
    this.#boxLives.set(ckey, life)
    return life.boxrows
  }

  #vaultRowOf(scope: VaultScope): unknown {
    return this._cheat_vaultRowsOf(scope).get(scope.vaultlabel) ?? null
  }

  #writeVaultRow(record: VaultRecord | VaultTombstone): void {
    const row = structuredClone(record)
    this._cheat_vaultRowsOf(record).set(record.vaultlabel, row)
    this.#tell(record, { vault: row })
  }

  #writeBoxRow(boxrows: Map<string, unknown>, vault: unknown, record: BoxRecord | BoxTombstone): void {
    const row = structuredClone(record)
    boxrows.set(record.boxlabel, row)
    this.#tell(record, { vault, box: row })
  }

  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** The capacity of a vault life: its box rows, live and deleted, against `maxBoxes`. */
  #roomIn(boxrows: Map<string, unknown>): Capacity {
    return { boxes: { used: boxrows.size, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }


  // Each heeder is called on a later microtask, so nothing it does runs inside the write that notified it.
  /** Notify each heeder watching `scope` of `heard`. */
  #tell(scope: VaultScope, heard: Heard): void {
    for (const { scope: heardScope, hear } of this.#heeders) {
      const isHeard = (heardScope.applabel === scope.applabel) && (heardScope.user_id === scope.user_id) && ((heardScope.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
      if (isHeard) { queueMicrotask(() => { hear(structuredClone(heard)) }) }
    }
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected doListVaults(scope: BankScope): RowOfVault[] {
    return Array.from(this._cheat_vaultRowsOf(scope), ([vaultlabel, vault]) => ({ vaultlabel, vault: structuredClone(vault) }))
  }

  protected doGetVault(ask: VaultGetAsk): VaultClassified {
    return this.classifyVault(ask, { vault: this.#vaultRowOf(ask) })
  }

  protected doListBoxes(asked: VaultQuery): BoxesFetched {
    const boxes = Array.from(this._cheat_boxRowsOf(asked, asked.vault_tok), ([boxlabel, box]) => ({ boxlabel, box: structuredClone(box) }))
    return { vault: structuredClone(this.#vaultRowOf(asked)), boxes }
  }

  protected doGetBox(ask: BoxGetAsk): BoxClassified {
    const box = this._cheat_boxRowsOf(ask, ask.vault_tok).get(ask.boxlabel) ?? null
    return this.classifyBox(ask, { world: this.#vaultRowOf(ask), box })
  }

  protected doPutVault(ask: VaultPutAsk): VaultClassified {
    const classified = this.classifyVault(ask, { vault: this.#vaultRowOf(ask) })
    if (isWriteAct(classified.act)) { this.#writeVaultRow(ask.record) }
    return classified
  }

  protected doPutBox(ask: BoxPutAsk): BoxClassified {
    const boxrows = this._cheat_boxRowsOf(ask, ask.vault_tok)
    const vault = this.#vaultRowOf(ask)
    const box = boxrows.get(ask.boxlabel) ?? null
    const classified = this.classifyBox(ask, { world: vault, box, capacity: this.#roomIn(boxrows) })
    if (isWriteAct(classified.act)) { this.#writeBoxRow(boxrows, vault, ask.record) }
    return classified
  }

  protected doDelVault(ask: VaultDelAsk): VaultClassified {
    const classified = this.classifyVault(ask, { vault: this.#vaultRowOf(ask) })
    if (isWriteAct(classified.act)) {
      this.#writeVaultRow(ask.record)
      // A vault's boxes end with its life: no call fetches a box row from a life that is over.
      this._cheat_boxRowsOf(ask, ask.expected.vault_tok).clear()
    }
    return classified
  }

  protected doDelBox(ask: BoxDelAsk): BoxClassified {
    const boxrows = this._cheat_boxRowsOf(ask, ask.vault_tok)
    const vault = this.#vaultRowOf(ask)
    const box = boxrows.get(ask.boxlabel) ?? null
    const classified = this.classifyBox(ask, { world: vault, box })
    if (isWriteAct(classified.act)) { this.#writeBoxRow(boxrows, vault, ask.record) }
    return classified
  }

  protected doTidyGone(scope: BankScope): Tidied {
    let totalCount = 0
    for (const [ckey, { scope: vaultScope, vault_tok, boxrows }] of this.#boxLives) {
      if ((vaultScope.applabel !== scope.applabel) || (vaultScope.user_id !== scope.user_id)) { continue }
      if (SX.isLifeOver(this.#vaultRowOf(vaultScope), vault_tok)) { this.#boxLives.delete(ckey) } else { totalCount += boxrows.size }
    }
    return { totalCount }
  }

  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void): () => void {
    const heeder = { scope, hear }
    this.#heeders.add(heeder)
    return () => { this.#heeders.delete(heeder) }
  }
  // --
}
