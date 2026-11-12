/** A bank's gate as this device has it: the stub listing a Gate is made in, whose row comes with its bank's. */

import { nowMillis } from '../helpers/clock'
import { type Modelkind, UNANSWERED } from '../helpers/consts'
import * as Phrases from '../helpers/phrases'
import type { VaultError } from '../refusals/errors'
import { valOf } from '../refusals/outcome'
import { mainGateMissing, rowOfOtherWorld, writtenByOwnVerbs } from '../refusals/throwers'
import { type GateScope, gateScope } from '../shapes/shapes-core'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRow, BoxRow, GateRecord, GateSparse, VaultRow, Wayins } from '../shapes/shapes-bankdb'
import * as SX from '../shapes/shapes-storage'
import type { Fetched, GateSnapshot, ListingOpts, ThingAnswer } from '../shapes/shapes-vaultish'
import { type GateAnswer, answerWithVal, refusedAnswerOf } from '../storage/bank-db'
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

  // == [The gate verbs]: replacePassphrase, addPasskey, revokePasskey, each with its try form, gateMoveOf
  // The val is the record the verb wrote: the gate listed may have a newer one by the time the answer is delivered.

  /** Lay a new passphrase wayin on the gate at `ante`, and answer the record stored. Nothing locks: the bankKey does not change. */
  async replacePassphrase(ante: GateRecord, main: Wayins['main']): Promise<GateRecord> { return valOf(await this.tryReplacePassphrase(ante, main)) }

  /** {@link replacePassphrase}, answering the bankDB's own answer.
   * Chute: tryReplacePassphrase → bankDB.tryReplacePassphrase → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryReplacePassphrase(ante: GateRecord, main: Wayins['main']): Promise<ThingAnswer<GateRecord>> {
    let answer: GateAnswer | typeof UNANSWERED = UNANSWERED
    try {
      const { record, expected } = this.#gateMoveOf(ante, (wayins) => ({ ...wayins, main }))
      answer = await this.bankDB.tryReplacePassphrase({ op: 'put', ...this.scopeOf(record), bank_tok: record.bank_tok, expected, record })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** Lay a passkey wayin on the gate at `ante`, and answer the record stored. */
  async addPasskey(ante: GateRecord, passkey0: NonNullable<Wayins['passkey0']>): Promise<GateRecord> { return valOf(await this.tryAddPasskey(ante, passkey0)) }

  /** {@link addPasskey}, answering the bankDB's own answer.
   * Chute: tryAddPasskey → bankDB.tryAddPasskey → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryAddPasskey(ante: GateRecord, passkey0: NonNullable<Wayins['passkey0']>): Promise<ThingAnswer<GateRecord>> {
    let answer: GateAnswer | typeof UNANSWERED = UNANSWERED
    try {
      const { record, expected } = this.#gateMoveOf(ante, (wayins) => ({ ...wayins, passkey0 }))
      answer = await this.bankDB.tryAddPasskey({ op: 'put', ...this.scopeOf(record), bank_tok: record.bank_tok, expected, record })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** Take the passkey wayin off the gate at `ante`, and answer the record stored, or the row stored where it has no passkey wayin. */
  async revokePasskey(ante: GateRecord): Promise<GateRecord> { return valOf(await this.tryRevokePasskey(ante)) }

  /** {@link revokePasskey}, answering the bankDB's own answer.
   * Chute: tryRevokePasskey → bankDB.tryRevokePasskey → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryRevokePasskey(ante: GateRecord): Promise<ThingAnswer<GateRecord>> {
    let answer: GateAnswer | typeof UNANSWERED = UNANSWERED
    try {
      const { record, expected } = this.#gateMoveOf(ante, ({ main }) => ({ main }))
      answer = await this.bankDB.tryRevokePasskey({ op: 'put', ...this.scopeOf(record), bank_tok: record.bank_tok, expected, record })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  // A gate verb moves only the gate row's revision: its gate_tok, and the bank's, stay as they are.
  /** The record of the gate at `ante` with its wayins moved by `move`, at the next revision, and the row it expects. */
  #gateMoveOf(ante: GateRecord, move: (wayins: Wayins) => Wayins): { record: GateRecord, expected: GateRecord } {
    const expected = this.recordOf(ante)
    this.demandEnabled()
    const record: GateRecord = { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), wayins: move(expected.wayins) }
    return { record, expected }
  }
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
