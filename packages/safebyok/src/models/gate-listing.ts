/** A bank's gate as this device has it: the stub listing a Gate is made in, whose row comes with its bank's. */

import type { Modelkind } from '../helpers/consts'
import * as Phrases from '../helpers/phrases'
import type { VaultError } from '../refusals/errors'
import { mainGateMissing, rowOfOtherWorld, writtenByOwnVerbs } from '../refusals/throwers'
import { type GateScope, gateScope } from '../shapes/shapes-core'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRow, BoxRow, GateRecord, GateSparse, VaultRow } from '../shapes/shapes-bankdb'
import type { Fetched, GateSnapshot, ListingOpts } from '../shapes/shapes-vaultish'
import type { Bank } from './bank'
import { Gate } from './gate'
import { Listing } from './listing'

// Nothing in the design extends this listing: there is no `bank.gates`. It uses what `Listing` gives, so that the gate
// row is delivered to its Gate, newer judged from older, as a vault's is.
/** One bank's gate, by gatelabel: `main`, the only one. */
export class GateListing extends Listing<GateScope, GateRecord, GateSparse, GateSnapshot, Gate> {
  // == [Props]: world

  declare readonly world: Bank
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  constructor(world: Bank, opts: ListingOpts) {
    super(world, opts)
    Object.freeze(this)
  }

  /** The scope of `gateish`, which must be this bank's: no listing answers for another's. */
  scopeOf(gateish: unknown):  GateScope  { return gateScope.parseConsistent(gateish, this.world.scope, { message: Phrases.otherScope }) }

  /** Parse `gateish` as a {@link GateSparse}. */
  sparseOf(gateish: unknown): GateSparse { return BX.gateSparse.parse(gateish) }

  /** Parse `gateish` as a {@link GateRecord} of this bank. */
  recordOf(gateish: unknown): GateRecord { return BX.gateRecord.parseConsistent(gateish, this.world.scope, { message: Phrases.otherScope }) }
  // --

  // == [Defined by the gate listing]: isOneLifePerInstance, demandOfWorld, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  protected get isOneLifePerInstance(): true { return true }

  protected demandOfWorld(record: Fetched<GateRecord, GateSparse>): void {
    if (record.bank_tok !== this.world.bank_tok) { throw rowOfOtherWorld(record, 'bank_tok') }
  }

  protected scopepathOf(scope: GateScope): string {
    return ['gate', scope.user_id, scope.banklabel, scope.gatelabel].join('^')
  }

  protected makeThing(central: Fetched<GateRecord, GateSparse>): Gate { return new Gate(this.world, this, central) }

  protected nothingStoredError(): VaultError { return mainGateMissing(this.world.sparse) }

  // ensureBank answers the bank's main gate row with it, the bank row as its parent.
  protected async doTryList() {
    const answer = await this.bankDB.tryEnsureBank({ op: 'ensure', ...this.world.scope, gates: ['main'] })
    if (! answer.ok) { return answer }
    const listed = (answer.val === null) ? [] : [answer.val.gates.main]
    return { ...answer, act: (answer.val === null) ? 'gotvoid' : 'got', val: { listed, damaged_rows: [] } } as const
  }

  // A gate row that fails its checks refuses its bank's ensureBank: no listing sets one aside.
  protected damagedStoredError(): VaultError { return mainGateMissing(this.world.sparse) }

  protected async doTryGet() {
    const answer = await this.bankDB.tryEnsureBank({ op: 'ensure', ...this.world.scope, gates: ['main'] })
    return answer.ok ? { ...answer, val: answer.val?.gates.main ?? null } : answer
  }

  protected doTryPut(): never { throw writtenByOwnVerbs() }

  protected tombstoneOver(): never { throw writtenByOwnVerbs() }

  protected doTryDel(): never { throw writtenByOwnVerbs() }

  // The bank's watch hears the gate row: no listing of its own starts one.
  protected watchRows(): () => void { return stopNoWatch }

  protected isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is GateRecord { return 'gatelabel' in row }
  // --

  /** Answers 'gate_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'gate_listing' { return 'gate_listing' satisfies Modelkind }
}

// == [Helpers]: stopNoWatch

/** Stops nothing: a stub listing starts no watch. */
function stopNoWatch(): void { /* no watch to stop */ }
// --
