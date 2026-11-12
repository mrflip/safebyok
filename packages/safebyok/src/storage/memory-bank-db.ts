/** The bankDB in memory. */

import { type Tidied } from './bank-db'
import { type Heard, AdapterBankDB } from './adapter-bank-db'
import { isWriteAct } from './bank-classifier'
import type { BankBuildStored, BankDelStored, BankEnsureStored, BoxesStored, BoxStored, GateStored, VaultStored } from './bank-classifier'
import { DefaultMaxBoxes } from '../helpers/consts'
import { ckeyOf } from '../helpers/helpers'
import * as BX from '../shapes/shapes-bankdb'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import type { BoxTidyAsk, Capacity, WatchScope } from '../shapes/shapes-storage'
import type {
  BankBuildAsk, BankDelAsk, BankEnsureAsk, BankRow, BoxDelAsk, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxRow, GatePutAsk, GateRecord,
  MemoryBankDBOpts, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultRow,
} from '../shapes/shapes-bankdb'
export type { MemoryBankDBOpts } from '../shapes/shapes-bankdb'

/** The rows stored under one bank's scope: its bank row (null for none), its gate rows by gatelabel, and its vault rows by vaultlabel. */
type Shelf = { bank: unknown, gaterows: Map<string, unknown>, vaultrows: Map<string, unknown> }
type BoxLife = { scope: VaultScope, life: string, boxrows: Map<string, unknown> }
type Listener = { scope: WatchScope, hear: (heard: Heard) => void }

/** A bankDB kept in this tab's memory, gone when the tab closes. */
export class MemoryBankDB extends AdapterBankDB {
  // == [Props]: #shelves, #boxLives, #listeners, #maxBoxes

  readonly #shelves = new Map<string, Shelf>()
  readonly #boxLives = new Map<string, BoxLife>()
  readonly #listeners = new Set<Listener>()
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: MemoryBankDBOpts = {}) {
    const { maxBoxes = DefaultMaxBoxes, ...adapterBankDBOpts } = BX.memoryBankDBOpts.parse(opts)
    super(adapterBankDBOpts)
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Rows]: _cheat_shelfOf, _cheat_boxRowsOf, #boxRowsOf, #writeBankRow, #writeGateRow, #writeVaultRow, #writeBoxRow, #roomIn, #tell

  /** For tests: the rows stored under a bank's scope, to read or change in place. */
  _cheat_shelfOf({ user_id, banklabel }: BankScope): Shelf { // eslint-disable-line unicorn/prefer-private-class-fields
    const ckey  = ckeyOf(user_id, banklabel)
    const shelf = this.#shelves.get(ckey) ?? { bank: null, gaterows: new Map<string, unknown>(), vaultrows: new Map<string, unknown>() }
    this.#shelves.set(ckey, shelf)
    return shelf
  }

  /** For tests: the map of box rows of one life of a vault, under one life of its bank, by boxlabel. */
  _cheat_boxRowsOf({ user_id, banklabel, vaultlabel }: VaultScope, bank_tok: string, vault_tok: string): Map<string, unknown> { // eslint-disable-line unicorn/prefer-private-class-fields
    const life = BX.vaultLifeOf({ bank_tok, vault_tok })
    const ckey = ckeyOf(user_id, banklabel, vaultlabel, life)
    const boxLife = this.#boxLives.get(ckey) ?? { scope: { user_id, banklabel, vaultlabel }, life, boxrows: new Map<string, unknown>() }
    this.#boxLives.set(ckey, boxLife)
    return boxLife.boxrows
  }

  #boxRowsOf(ask: VaultScope & { bank_tok: string, vault_tok: string }): Map<string, unknown> { return this._cheat_boxRowsOf(ask, ask.bank_tok, ask.vault_tok) }

  #writeBankRow(record: BankRow): void {
    const row = structuredClone(record)
    this._cheat_shelfOf(record).bank = row
    this.#tell(record, { row })
  }

  #writeGateRow(bank: unknown, record: GateRecord): void {
    const row = structuredClone(record)
    this._cheat_shelfOf(record).gaterows.set(record.gatelabel, row)
    this.#tell(record, { row, parent: bank })
  }

  #writeVaultRow(bank: unknown, record: VaultRow): void {
    const row = structuredClone(record)
    this._cheat_shelfOf(record).vaultrows.set(record.vaultlabel, row)
    this.#tell(record, { row, parent: bank })
  }

  #writeBoxRow(boxrows: Map<string, unknown>, vault: unknown, record: BoxRow): void {
    const row = structuredClone(record)
    boxrows.set(record.boxlabel, row)
    this.#tell(record, { row, parent: vault })
  }

  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** The capacity of a vault life: its box rows, live and deleted, against `maxBoxes`. */
  #roomIn(boxrows: Map<string, unknown>): Capacity {
    return { boxes: { used: boxrows.size, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }

  // Each listener is called on a later microtask, so nothing it does runs inside the write that notified it. A bank or
  // gate row has no vaultlabel, so only a watch of the whole bank hears it.
  /** Notify each listener watching `scope` of `heard`. */
  #tell(scope: BankScope & { vaultlabel?: string }, heard: Heard): void {
    for (const { scope: heardScope, hear } of this.#listeners) {
      const isHeard = (heardScope.user_id === scope.user_id) && (heardScope.banklabel === scope.banklabel) && ((heardScope.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
      if (isHeard) { queueMicrotask(() => { hear(structuredClone(heard)) }) }
    }
  }
  // --

  // == [Protected, the generic calls of AdapterBankDB]: doEnsureBank, doBuildBank, doPutGate, doDelBank, doGetVault, doPutVault, doDelVault, doListBoxes, doGetBox, doPutBox, doDelBox, doTidyGone, doWatch

  protected doEnsureBank(ask: BankEnsureAsk): BankEnsureStored {
    const { bank, gaterows, vaultrows } = structuredClone(this._cheat_shelfOf(ask))
    const vaults = Array.from(vaultrows, ([vaultlabel, vault]) => ({ vaultlabel, vault }))
    return this.classifyEnsureBank(ask, { bank, gate: gaterows.get('main') ?? null, vaults })
  }

  protected doBuildBank(ask: BankBuildAsk): BankBuildStored {
    const { bank, gaterows } = this._cheat_shelfOf(ask)
    const stored = this.classifyBuildBank(ask, { bank, gate: gaterows.get('main') ?? null })
    if (isWriteAct(stored.act)) {
      this.#writeBankRow(ask.record)
      this.#writeGateRow(ask.record, ask.gate)
    }
    return stored
  }

  protected doPutGate(ask: GatePutAsk): GateStored {
    const { bank, gaterows } = this._cheat_shelfOf(ask)
    const stored = this.classifyStoredGate(ask, { bank, gate: gaterows.get(ask.gatelabel) ?? null })
    if (isWriteAct(stored.act)) { this.#writeGateRow(bank, ask.record) }
    return stored
  }

  protected doDelBank(ask: BankDelAsk): BankDelStored {
    const shelf  = this._cheat_shelfOf(ask)
    const stored = this.classifyDelBank(ask, { bank: shelf.bank })
    if (isWriteAct(stored.act)) {
      this.#writeBankRow(ask.record)
      // A bank's gates, vaults and boxes end with its life: nothing under it outlives the bank row.
      shelf.gaterows.clear()
      shelf.vaultrows.clear()
      for (const [ckey, { scope }] of this.#boxLives) {
        if ((scope.user_id === ask.user_id) && (scope.banklabel === ask.banklabel)) { this.#boxLives.delete(ckey) }
      }
    }
    return stored
  }

  protected doGetVault(ask: VaultGetAsk): VaultStored {
    const { bank, vaultrows } = this._cheat_shelfOf(ask)
    return this.classifyStoredVault(ask, { bank, vault: vaultrows.get(ask.vaultlabel) ?? null })
  }

  protected doPutVault(ask: VaultPutAsk): VaultStored {
    const { bank, vaultrows } = this._cheat_shelfOf(ask)
    const stored = this.classifyStoredVault(ask, { bank, vault: vaultrows.get(ask.vaultlabel) ?? null })
    if (isWriteAct(stored.act)) { this.#writeVaultRow(bank, ask.record) }
    return stored
  }

  protected doDelVault(ask: VaultDelAsk): VaultStored {
    const { bank, vaultrows } = this._cheat_shelfOf(ask)
    const stored = this.classifyStoredVault(ask, { bank, vault: vaultrows.get(ask.vaultlabel) ?? null })
    if (isWriteAct(stored.act)) {
      this.#writeVaultRow(bank, ask.record)
      // A vault's boxes end with its life: no call fetches a box row from a life that is over.
      this._cheat_boxRowsOf(ask, ask.bank_tok, ask.expected.vault_tok).clear()
    }
    return stored
  }

  protected doListBoxes(ask: BoxListAsk): BoxesStored {
    const parent = structuredClone(this._cheat_shelfOf(ask).vaultrows.get(ask.vaultlabel) ?? null)
    const boxes  = Array.from(this.#boxRowsOf(ask), ([boxlabel, box]) => ({ boxlabel, box: structuredClone(box) }))
    return this.classifyStoredBoxes(ask, { parent, boxes })
  }

  protected doGetBox(ask: BoxGetAsk): BoxStored {
    const parent = this._cheat_shelfOf(ask).vaultrows.get(ask.vaultlabel) ?? null
    const box    = this.#boxRowsOf(ask).get(ask.boxlabel) ?? null
    return this.classifyStoredBox(ask, { parent, box })
  }

  protected doPutBox(ask: BoxPutAsk): BoxStored {
    const boxrows  = this.#boxRowsOf(ask)
    const parent   = this._cheat_shelfOf(ask).vaultrows.get(ask.vaultlabel) ?? null
    const box      = boxrows.get(ask.boxlabel) ?? null
    const capacity = this.#roomIn(boxrows)
    const stored   = this.classifyStoredBox(ask, { parent, box, capacity })
    if (isWriteAct(stored.act)) { this.#writeBoxRow(boxrows, parent, ask.record) }
    return stored
  }

  protected doDelBox(ask: BoxDelAsk): BoxStored {
    const boxrows = this.#boxRowsOf(ask)
    const parent  = this._cheat_shelfOf(ask).vaultrows.get(ask.vaultlabel) ?? null
    const box     = boxrows.get(ask.boxlabel) ?? null
    const stored  = this.classifyStoredBox(ask, { parent, box })
    if (isWriteAct(stored.act)) { this.#writeBoxRow(boxrows, parent, ask.record) }
    return stored
  }

  // A row that fails its checks is left alone: it is neither of this life nor provably of an ended one.
  protected doTidyGone(ask: BoxTidyAsk): Tidied {
    const { bank, vaultrows } = this._cheat_shelfOf(ask)
    const liveBank = BX.bankRow.safeParse(bank)
    const bank_tok = (liveBank.success && (liveBank.data.am === 'a')) ? liveBank.data.bank_tok : null
    for (const [vaultlabel, raw] of vaultrows) {
      const vault = BX.vaultRow.safeParse(raw)
      if (vault.success && (vault.data.bank_tok !== bank_tok)) { vaultrows.delete(vaultlabel) }
    }
    let totalCount = 0
    for (const [ckey, { scope, life, boxrows }] of this.#boxLives) {
      if ((scope.user_id !== ask.user_id) || (scope.banklabel !== ask.banklabel)) { continue }
      if (isLifeOver(vaultrows.get(scope.vaultlabel) ?? null, life)) { this.#boxLives.delete(ckey) } else { totalCount += boxrows.size }
    }
    return { totalCount }
  }

  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void): () => void {
    const listener = { scope, hear }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  // --
}

// == [Helpers]: isLifeOver

/** True when `raw`, a vault row, is missing, a tombstone, or of a life other than `life`; false when it fails its checks. */
function isLifeOver(raw: unknown, life: string): boolean {
  if (raw === null) { return true }
  const parsed = BX.vaultRow.safeParse(raw)
  return parsed.success && ((parsed.data.am === 'x') || (BX.vaultLifeOf(parsed.data) !== life))
}
// --
