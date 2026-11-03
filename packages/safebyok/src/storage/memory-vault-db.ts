/** The vaultDB in memory: one JavaScript step is one transaction, so each generic call is atomic by being straight code. */

import { type BoxFetched, type BoxLanding, type Heard, type Landing, type PutTerms, type RowOfVault, type Tidied, type VaultFetched, VaultDB } from './vault-db-new'
import * as Refuse from './vault-db-refusals'
import * as VS from './vault-db-shapes'
import type { BankScope, BoxQuery, BoxRecord, BoxTombstone, MemoryVaultDBOpts, Revision, VaultRecord, VaultScope, VaultTombstone, WatchScope } from './vault-db-shapes'

export type { MemoryVaultDBOpts } from './vault-db-shapes'

type BoxLife = { scope: VaultScope, vault_tok: string, boxrows: Map<string, unknown> }
type Heeder = { scope: WatchScope, hear: (heard: Heard) => void }

const ckeyOf = (...parts: string[]): string => JSON.stringify(parts)

export class MemoryVaultDB extends VaultDB {
  readonly #vaultrowsOfBank = new Map<string, Map<string, unknown>>()
  readonly #boxLives = new Map<string, BoxLife>()
  readonly #heeders = new Set<Heeder>()
  readonly #maxBoxes: number

  constructor(opts: MemoryVaultDBOpts = {}) {
    const { maxBoxes = Infinity, ...vaultDBOpts } = VS.memoryVaultDBOpts.parse(opts)
    super(vaultDBOpts)
    this.#maxBoxes = maxBoxes
  }

  // == [Generic calls]: doGetBank, doGetVault, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected doGetBank(scope: BankScope): RowOfVault[] {
    return Array.from(this._cheat_vaultRowsOf(scope), ([vaultlabel, vault]) => ({ vaultlabel, vault: structuredClone(vault) }))
  }

  protected doGetVault(scope: VaultScope): VaultFetched {
    const vault = this.#vaultRowOf(scope)
    const vault_tok = VS.rowPeek.safeParse(vault).data?.vault_tok
    const boxes = (vault_tok === undefined) ? [] : Array.from(this._cheat_boxRowsOf(scope, vault_tok), ([boxlabel, box]) => ({ boxlabel, box: structuredClone(box) }))
    return { vault: structuredClone(vault), boxes }
  }

  protected doGetBox(asked: BoxQuery): BoxFetched {
    return { vault: structuredClone(this.#vaultRowOf(asked)), box: structuredClone(this._cheat_boxRowsOf(asked, asked.vault_tok).get(asked.boxlabel) ?? null) }
  }

  protected doPutVault(record: VaultRecord, { prior, mayReplaceLive }: PutTerms): Landing {
    const ante = this.#vaultRowOf(record)
    const landed = VS.isRowAt(ante, prior) && (mayReplaceLive || (! VS.isLiveRow(ante)))
    if (landed) { this.#storeVaultRow(record) }
    return { landed, ante: structuredClone(ante) }
  }

  protected doPutBox(record: BoxRecord, { prior, mayReplaceLive }: PutTerms): BoxLanding {
    const vault = this.#vaultRowOf(record)
    const boxrows = this._cheat_boxRowsOf(record, record.vault_tok)
    const ante = boxrows.get(record.boxlabel) ?? null
    const landed = VS.isCheckedLiveVault(vault, record.vault_tok) && VS.isRowAt(ante, prior) && (mayReplaceLive || (! VS.isLiveRow(ante)))
    if (landed) {
      this.#demandRoom(boxrows, ante)
      this.#storeBoxRow(boxrows, vault, record)
    }
    return { landed, ante: structuredClone(ante), vault: structuredClone(vault) }
  }

  protected doDelVault(tombstone: VaultTombstone, prior: Revision): Landing {
    const ante = this.#vaultRowOf(tombstone)
    const isOurs = VS.isLiveRowUnder(ante, tombstone.vault_tok)
    const isNamedDamage = VS.isDamagedVaultAt(ante, tombstone, prior)
    const isStopped = isOurs ? (! VS.isRowAt(ante, prior)) : ((ante !== null) && (! VS.vaultRow.safeParse(ante).success) && (! isNamedDamage))
    if (isStopped) { return { landed: false, ante: structuredClone(ante) } }
    const landed = isOurs || isNamedDamage
    if (landed) { this.#storeVaultRow(tombstone) }
    const boxrows = this._cheat_boxRowsOf(tombstone, tombstone.vault_tok)
    for (const [boxlabel, box] of boxrows) {
      const boxTombstone = VS.boxTombstoneOf(box, tombstone.written_at)
      if (boxTombstone === null) { continue }
      boxrows.set(boxlabel, boxTombstone)
      this.#tell(tombstone, { vault: this.#vaultRowOf(tombstone), box: boxTombstone })
    }
    return { landed, ante: structuredClone(ante) }
  }

  protected doDelBox(tombstone: BoxTombstone, prior: Revision): BoxLanding {
    const vault = this.#vaultRowOf(tombstone)
    const boxrows = this._cheat_boxRowsOf(tombstone, tombstone.vault_tok)
    const ante = boxrows.get(tombstone.boxlabel) ?? null
    const isDeletable = (VS.isLiveRow(ante) && VS.isRowAt(ante, prior)) || VS.isDamagedBoxAt(ante, tombstone, prior)
    const landed = VS.isCheckedLiveVault(vault, tombstone.vault_tok) && isDeletable
    if (landed) { this.#storeBoxRow(boxrows, vault, tombstone) }
    return { landed, ante: structuredClone(ante), vault: structuredClone(vault) }
  }

  protected doTidyGone(scope: BankScope): Tidied {
    let totalCount = 0
    for (const [ckey, { scope: vaultScope, vault_tok, boxrows }] of this.#boxLives) {
      if ((vaultScope.applabel !== scope.applabel) || (vaultScope.user_id !== scope.user_id)) { continue }
      if (VS.isLifeOver(this.#vaultRowOf(vaultScope), vault_tok)) { this.#boxLives.delete(ckey) } else { totalCount += boxrows.size }
    }
    return { totalCount }
  }

  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void): () => void {
    const heeder = { scope, hear }
    this.#heeders.add(heeder)
    return () => { this.#heeders.delete(heeder) }
  }
  // --

  // == [Rows]: _cheat_vaultRowsOf, _cheat_boxRowsOf, #vaultRowOf, #storeVaultRow, #storeBoxRow, #demandRoom, #tell

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

  /** Demands room in the vault for a new live box, under its `maxBoxes`. */
  #demandRoom(boxrows: Map<string, unknown>, ante: unknown): void {
    if (VS.isLiveRow(ante)) { return }
    const used = [...boxrows.values()].filter((box) => VS.isLiveRow(box)).length
    if (used >= this.#maxBoxes) { throw Refuse.vaultFull({ boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }) }
  }

  /** Each heeder hears on a later tick, so that nothing it does touches the transaction that told it. */
  #tell(scope: VaultScope, heard: Heard): void {
    for (const { scope: heardScope, hear } of this.#heeders) {
      const isHeard = (heardScope.applabel === scope.applabel) && (heardScope.user_id === scope.user_id) && ((heardScope.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
      if (isHeard) { queueMicrotask(() => { hear(structuredClone(heard)) }) }
    }
  }
  // --
}
