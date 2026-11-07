/** The vaultDB in memory. */

import { type BoxesFetched, type BoxFetched, type BoxLanding, type Heard, type Landing, type RowOfVault, type Tidied, AdapterVaultDB } from './vault-db'
import { ckeyOf } from '../helpers/helpers'
import * as Refuse from '../refusals/throwers'
import * as SX from '../shapes/shapes-storage'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import type { BoxQuery, BoxRecord, BoxTombstone, DelOpts, MemoryVaultDBOpts, PutOptsGiven, VaultQuery, VaultRecord, VaultTombstone, WatchScope } from '../shapes/shapes-storage'
export type { MemoryVaultDBOpts } from '../shapes/shapes-storage'


type BoxLife = { scope: VaultScope, vault_tok: string, boxrows: Map<string, unknown> }
type Heeder = { scope: WatchScope, hear: (heard: Heard) => void }

/** True when a put under `opts` may land over `ante`, the row it would replace. */
const isPutAllowed = (ante: unknown, { prior, ifAbsent, ifPresent }: PutOptsGiven): boolean => (
  SX.isRowAt(ante, prior) && (SX.isLiveRow(ante) ? (ifPresent === 'repl') : (ifAbsent === 'add'))
)

export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #vaultrowsOfBank, #boxLives, #heeders, #maxBoxes

  readonly #vaultrowsOfBank = new Map<string, Map<string, unknown>>()
  readonly #boxLives = new Map<string, BoxLife>()
  readonly #heeders = new Set<Heeder>()
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: MemoryVaultDBOpts = {}) {
    const { maxBoxes = Infinity, ...adapterVaultDBOpts } = SX.memoryVaultDBOpts.parse(opts)
    super(adapterVaultDBOpts)
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Rows]: _cheat_vaultRowsOf, _cheat_boxRowsOf, #vaultRowOf, #storeVaultRow, #storeBoxRow, #demandRoom, #tombstoneBoxes, #tell

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

  #storeVaultRow(record: VaultRecord | VaultTombstone): void {
    const row = structuredClone(record)
    this._cheat_vaultRowsOf(record).set(record.vaultlabel, row)
    this.#tell(record, { vault: row })
  }

  #storeBoxRow(boxrows: Map<string, unknown>, vault: unknown, record: BoxRecord | BoxTombstone): void {
    const row = structuredClone(record)
    boxrows.set(record.boxlabel, row)
    this.#tell(record, { vault, box: row })
  }

  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** Demands room in the vault for a new live box, under its soft cap `maxBoxes`. */
  #demandRoom(boxrows: Map<string, unknown>, ante: unknown): void {
    if (SX.isLiveRow(ante)) { return }
    const used = [...boxrows.values()].filter((box) => SX.isLiveRow(box)).length
    if (used >= this.#maxBoxes) { throw Refuse.vaultFull({ boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }) }
  }

  /** Tombstones every live box row of the life `tombstone` ends. */
  #tombstoneBoxes(tombstone: VaultTombstone): void {
    const boxrows = this._cheat_boxRowsOf(tombstone, tombstone.vault_tok)
    for (const [boxlabel, box] of boxrows) {
      const boxTombstone = SX.boxTombstoneOf(box, tombstone.written_at)
      if (boxTombstone === null) { continue }
      boxrows.set(boxlabel, boxTombstone)
      this.#tell(tombstone, { vault: this.#vaultRowOf(tombstone), box: boxTombstone })
    }
  }

  // Each heeder hears on a later tick, so that nothing it does touches the transaction that told it.
  /** Tell each heeder of `scope` what was `heard`. */
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

  protected doGetVault(scope: VaultScope): unknown { return structuredClone(this.#vaultRowOf(scope)) }

  protected doListBoxes(asked: VaultQuery): BoxesFetched {
    const boxes = Array.from(this._cheat_boxRowsOf(asked, asked.vault_tok), ([boxlabel, box]) => ({ boxlabel, box: structuredClone(box) }))
    return { vault: structuredClone(this.#vaultRowOf(asked)), boxes }
  }

  protected doGetBox(asked: BoxQuery): BoxFetched {
    return { vault: structuredClone(this.#vaultRowOf(asked)), box: structuredClone(this._cheat_boxRowsOf(asked, asked.vault_tok).get(asked.boxlabel) ?? null) }
  }

  protected doPutVault(record: VaultRecord, opts: PutOptsGiven): Landing {
    const ante = this.#vaultRowOf(record)
    const landed = isPutAllowed(ante, opts)
    if (landed) { this.#storeVaultRow(record) }
    return { landed, ante: structuredClone(ante) }
  }

  protected doPutBox(record: BoxRecord, opts: PutOptsGiven): BoxLanding {
    const vault = this.#vaultRowOf(record)
    const boxrows = this._cheat_boxRowsOf(record, record.vault_tok)
    const ante = boxrows.get(record.boxlabel) ?? null
    const landed = SX.isCheckedLiveVault(vault, record.vault_tok) && isPutAllowed(ante, opts)
    if (landed) {
      this.#demandRoom(boxrows, ante)
      this.#storeBoxRow(boxrows, vault, record)
    }
    return { landed, ante: structuredClone(ante), vault: structuredClone(vault) }
  }

  protected doDelVault(tombstone: VaultTombstone, { prior }: DelOpts): Landing {
    const ante = this.#vaultRowOf(tombstone)
    const isOurs = SX.isLiveRowUnder(ante, tombstone.vault_tok)
    const isDamaged = (ante !== null) && (! SX.vaultRow.safeParse(ante).success)
    const landed = (isOurs && SX.isRowAt(ante, prior)) || SX.isDamagedVaultAt(ante, tombstone, prior)
    // A live row of this life, or damage, that the tombstone does not name stops the del whole; any other row lets a repeat sweep the boxes.
    if ((! landed) && (isOurs || isDamaged)) { return { landed, ante: structuredClone(ante) } }
    if (landed) { this.#storeVaultRow(tombstone) }
    this.#tombstoneBoxes(tombstone)
    return { landed, ante: structuredClone(ante) }
  }

  protected doDelBox(tombstone: BoxTombstone, { prior }: DelOpts): BoxLanding {
    const vault = this.#vaultRowOf(tombstone)
    const boxrows = this._cheat_boxRowsOf(tombstone, tombstone.vault_tok)
    const ante = boxrows.get(tombstone.boxlabel) ?? null
    const isDeletable = (SX.isLiveRow(ante) && SX.isRowAt(ante, prior)) || SX.isDamagedBoxAt(ante, tombstone, prior)
    const landed = SX.isCheckedLiveVault(vault, tombstone.vault_tok) && isDeletable
    if (landed) { this.#storeBoxRow(boxrows, vault, tombstone) }
    return { landed, ante: structuredClone(ante), vault: structuredClone(vault) }
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
