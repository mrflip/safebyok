import { type Modelkind, hasModelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { Checkers } from '../helpers/validator'
import { tattoo } from '../helpers/helpers'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { mainGateMissing, passkeyAlreadyAdded } from '../refusals/throwers'
import type { GateScope } from '../shapes/shapes-core'
import { type GateRecord, type GateSparse, type Wayins, GateFormat, gateRecord } from '../shapes/shapes-bankdb'
import { type BankStamp, type GateStamp, bankStamp, gateStamp } from '../shapes/shapes-gateish'
import { VoidRevision, nextRevisionOf } from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import type { Fetched, GateSnapshot } from '../shapes/shapes-vaultish'
import type { Bank } from './bank'
import type { GateListing } from './gate-listing'
import { Storable } from './storable'
import { Wayin } from './wayin'

// Defined here, not with the shapes: it names a model class.
/** The checks of {@link Gate.recordOfBirth}'s arguments. */
const Checks = Checkers('bad_option', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => hasModelkind(val, 'wayin'), 'Expected a Wayin')
  return { recordOfBirthArgs: obj({ bank: bankStamp, gate: gateStamp, main: wayin, passkey0: wayin.nullable() }) }
})

/** A bank's gate: its passphrase wayin, and its passkey wayin if it has one.
 * Change it with the `...Prompt` methods. Each asks the user for the current passphrase.
 */
export class Gate extends Storable<GateScope, GateRecord, GateSparse, GateSnapshot> {
  // == [Props]: user_id, banklabel, gatelabel, bank_tok, listing, #inHand

  // Set at construction: the scope by Storable's constructor, bank_tok by assignInitialProps.
  declare readonly user_id:   string
  declare readonly banklabel: string
  declare readonly gatelabel: GateScope['gatelabel']
  /** Which life of its bank this gate belongs to, fixed for this instance. */
  declare readonly bank_tok:  string
  declare readonly listing:   GateListing

  /** The current row's wayins, as records and as Wayins, remade when a row brings new ones */
  #inHand: WayinsInHand | null = null
  // --

  // == [Getters]: bank, gate_tok, wayins, main, passkey0, bankStamp, stamp

  /** The bank this gate is of. */
  get bank(): Bank { return this.listing.bank }

  // A Gate stands for its scope through its lives, as a Box does: its stamp follows the row in hand.
  /** The token of this gate's life, from its current row. No gate verb changes it. */
  get gate_tok(): string { return this.central.gate_tok }

  /** The current row's wayin records, frozen. */
  get wayins(): Wayins { return this.#wayinsInHand().wayins }

  /** The passphrase wayin. */
  get main(): Wayin { return this.#wayinsInHand().main }

  /** The passkey wayin, or null if the gate has none. */
  get passkey0(): Wayin | null { return this.#wayinsInHand().passkey0 }

  /** The stamp of this gate's bank. A wayin's wrapped bankKey is bound to it, and to the gate's own `stamp`. */
  get bankStamp(): BankStamp { return this.bank.stamp }

  /** This gate's stamp, fixed for its life. A wayin's wrapped bankKey is bound to it. */
  get stamp(): GateStamp { return gateStamp.parse(this) }

  // Made on first read, not at align: the base constructor aligns before this class's fields exist.
  #wayinsInHand(): WayinsInHand {
    const { wayins } = this.demandFullProps()
    if (this.#inHand?.received !== wayins) {
      const main = new Wayin(wayins.main)
      const passkey0 = wayins.passkey0 === undefined ? null : new Wayin(wayins.passkey0)
      this.#inHand = { received: wayins, wayins: wayinsOf(main, passkey0), main, passkey0 }
    }
    return this.#inHand
  }
  // --

  // == [Construction]: assignInitialProps, recordOfBirth

  /** Set `bank_tok`, which never changes, along with the base's props. */
  protected override assignInitialProps(central: Fetched<GateRecord, GateSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok }, { configurable: false })
    super.assignInitialProps(central)
  }

  /** The first record of a new gate `gate` of bank `bank`, holding the wayins `main` and `passkey0`. */
  static recordOfBirth(bank: BankStamp, gate: GateStamp, main: Wayin, passkey0: Wayin | null): GateRecord {
    const checked = Checks.recordOfBirthArgs.parse({ bank, gate, main, passkey0 })
    return gateRecord.parse({
      ...checked.gate, fmt: GateFormat, ...nextRevisionOf(VoidRevision, nowMillis()), am: 'a',
      bank_tok: checked.bank.bank_tok, wayins: wayinsOf(checked.main, checked.passkey0), auth: {}, sigs: {}, meta: {},
    })
  }
  // --

  // == [Changing the gate]: replacePassphrasePrompt, addPasskeyPrompt, revokePasskeyPrompt, each with its try form

  /** Replace the passphrase, asking the user for the current one and the new one.
   * The passkey stays, and the bankKey does not change.
   */
  async replacePassphrasePrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.bank.demandEnabled()
    await this.bank.prompt('replace_passphrase')
    return this
  }

  /** Non-throwing form of {@link replacePassphrasePrompt}. */
  tryReplacePassphrasePrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrasePrompt()) }

  /** Add a passkey, asking the user for the passphrase and the new passkey.
   * A gate has one passkey at most: revoke the one it has before adding another.
   */
  async addPasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.bank.demandEnabled()
    this.demandPasskeyAddable()
    await this.bank.prompt('add_passkey')
    return this
  }

  /** Non-throwing form of {@link addPasskeyPrompt}. */
  tryAddPasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskeyPrompt()) }

  /** Revoke the passkey, asking the user for the passphrase.
   * With no passkey, it returns at once and asks nobody.
   * The bankKey does not change: a device already unlocked stays unlocked until it locks.
   */
  async revokePasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.bank.demandEnabled()
    if (this.passkey0 === null) { return this }
    await this.bank.prompt('revoke_passkey')
    return this
  }

  /** Non-throwing form of {@link revokePasskeyPrompt}. */
  tryRevokePasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskeyPrompt()) }
  // --

  // == [Methods]: pickle

  /** This gate's current row, as a frozen plain {@link GateRecord}. */
  pickle(): GateRecord { return Object.freeze({ ...this.demandFullProps(), wayins: this.wayins }) }
  // --

  // == [Guards]: isLocked, demandPasskeyAddable, demandPresent, ensureTimely

  /** True while this gate's bank is locked. */
  get isLocked(): boolean { return this.bank.isLocked }

  /** Throw if this gate already has a passkey. */
  demandPasskeyAddable(): void {
    if (this.passkey0 !== null) { throw passkeyAlreadyAdded() }
  }

  // A gate row is never tombstoned: only the instance its listing has just made, before it receives its record, is not present.
  /** Demand that this gate is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw mainGateMissing(this.bank.sparse) }
    return this
  }

  /** This gate, refetched unless its row was refreshed within `maxMillis`, with its bank made timely too.
   * @param maxMillis by default, the listing's refresh horizon
   */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }
  // --

  // == [Protected, overriding Storable's]: children, isFullRecord, lifeTokPathOf, makeSnapshot

  /** None: a gate has nothing listed below it. */
  protected get children(): readonly [] { return [] }

  /** True for a live gate record that has its `wayins`. */
  protected isFullRecord(fetched: GateSparse): fetched is GateRecord {
    return fetched.am === 'a' && 'wayins' in fetched
  }

  /** The life of a gate record: its bank's `bank_tok` and its own `gate_tok`, joined. */
  protected lifeTokPathOf({ bank_tok, gate_tok }: Fetched<GateRecord, GateSparse>): string { return `${bank_tok}/${gate_tok}` }

  protected makeSnapshot(): GateSnapshot {
    const { main, passkey0 } = this
    return Object.freeze({
      ...this.scope,
      bank_tok:      this.bank_tok,
      gate_tok:      this.gate_tok,
      revision_tok:  this.revision_tok,
      revision_seq:  this.revision_seq,
      registered_at: this.registered_at,
      written_at:    this.written_at,
      wayins:        Object.freeze({ main: { registered_at: main.registered_at }, ...(passkey0 && { passkey0: { registered_at: passkey0.registered_at } }) }),
    })
  }
  // --

  /** Always `'gate'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'gate' { return 'gate' satisfies Modelkind }
}

// == [Helpers]: WayinsInHand, wayinsOf

/** A gate's wayins as Wayins and as frozen records, with the `received` wayins they were made from. */
type WayinsInHand = Readonly<{ received: Wayins, wayins: Wayins, main: Wayin, passkey0: Wayin | null }>

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen wayin records of `main` and, if given, `passkey0`. */
function wayinsOf(main: Wayin, passkey0: Wayin | null): Wayins {
  return Object.freeze({ main: main.pickle(), ...(passkey0 && { passkey0: passkey0.pickle() }) }) as Wayins
}
// --
