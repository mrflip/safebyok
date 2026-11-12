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

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => hasModelkind(val, 'wayin'), 'Expected a Wayin')
  return { recordOfBirthArgs: obj({ bank: bankStamp, gate: gateStamp, main: wayin, passkey0: wayin.nullable() }) }
})

/** A bank's gate as this device has it, kept in step with its row: a change is a bankDB gate verb's, and the gate receives the row it puts. */
export class Gate extends Storable<GateScope, GateRecord, GateSparse, GateSnapshot> {
  // == [Props]: user_id, banklabel, gatelabel, bank_tok, gate_tok, world, listing, #inHand

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly user_id:   string
  declare readonly banklabel: string
  declare readonly gatelabel: GateScope['gatelabel']
  /** The life of the bank this gate is of, inscribed once by `assignInitialProps`. */
  declare readonly bank_tok:  string
  /** This gate's life, inscribed once by `assignInitialProps` and kept by every gate verb. */
  declare readonly gate_tok:  string
  declare readonly world:     Bank
  declare readonly listing:   GateListing

  /** The wayins of the record in hand, as records and as Wayins, made again when a record received brings others. */
  #inHand: WayinsInHand | null = null
  // --

  // == [Getters]: wayins, main, passkey0, bankStamp, stamp

  /** The wayin records of the record in hand, frozen. */
  get wayins(): Wayins { return this.#wayinsInHand().wayins }

  /** The passphrase wayin. */
  get main(): Wayin { return this.#wayinsInHand().main }

  /** The passkey wayin, null where the gate has none. */
  get passkey0(): Wayin | null { return this.#wayinsInHand().passkey0 }

  /** The stamp of the bank this gate is of: what each wayin's ctx binds before the gate's own. */
  get bankStamp(): BankStamp { return this.world.stamp }

  /** This gate's stamp, fixed for its life: what each wayin's ctx binds. */
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

  /** Inscribes this gate's `bank_tok` and `gate_tok` beside what the base inscribes. */
  protected override assignInitialProps(central: Fetched<GateRecord, GateSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok, gate_tok: central.gate_tok }, { configurable: false })
    super.assignInitialProps(central)
  }

  /** The record of a gate born with `bank`, under the stamp `gate`, at the first revision of its row. */
  static recordOfBirth(bank: BankStamp, gate: GateStamp, main: Wayin, passkey0: Wayin | null): GateRecord {
    const checked = Checks.recordOfBirthArgs.parse({ bank, gate, main, passkey0 })
    return gateRecord.parse({
      ...checked.gate, fmt: GateFormat, ...nextRevisionOf(VoidRevision, nowMillis()), am: 'a',
      bank_tok: checked.bank.bank_tok, wayins: wayinsOf(checked.main, checked.passkey0), auth: {}, sigs: {}, meta: {},
    })
  }
  // --

  // == [Changing the gate]: replacePassphrasePrompt, addPasskeyPrompt, revokePasskeyPrompt, each with its try form

  /** Replace the passphrase through a replace_passphrase gating. The passkey stays, and the vaultKey does not change. */
  async replacePassphrasePrompt(): Promise<this> {
    await this.ensureTimely(); this.world.demandPromptable()
    await this.world.prompt('replace_passphrase')
    return this
  }

  /** Non-throwing form of {@link replacePassphrasePrompt}. */
  tryReplacePassphrasePrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrasePrompt()) }

  /** Add a passkey through an add_passkey gating. */
  async addPasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.world.demandPromptable()
    this.demandPasskeyAddable()
    await this.world.prompt('add_passkey')
    return this
  }

  /** Non-throwing form of {@link addPasskeyPrompt}. */
  tryAddPasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskeyPrompt()) }

  /** Revoke the passkey through a revoke_passkey gating. With none it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock. */
  async revokePasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.world.demandPromptable()
    if (this.passkey0 === null) { return this }
    await this.world.prompt('revoke_passkey')
    return this
  }

  /** Non-throwing form of {@link revokePasskeyPrompt}. */
  tryRevokePasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskeyPrompt()) }
  // --

  // == [Methods]: pickle

  /** This gate as a frozen, plain {@link GateRecord}: the row in hand. */
  pickle(): GateRecord { return Object.freeze({ ...this.demandFullProps(), wayins: this.wayins }) }
  // --

  // == [Guards]: isLocked, demandPasskeyAddable, demandPresent, ensureTimely

  /** Whether the bank is locked, read live. */
  get isLocked(): boolean { return this.world.isLocked }

  /** Demands that this gate have no passkey: the one check before anyone is asked for one. */
  demandPasskeyAddable(): void {
    if (this.passkey0 !== null) { throw passkeyAlreadyAdded() }
  }

  // A gate row is never tombstoned: only the instance its listing has just made, before it receives its record, is not present.
  /** Demand that this gate is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw mainGateMissing(this.world.sparse) }
    return this
  }

  /** This gate, with its bank's row, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }
  // --

  // == [Protected, overriding Storable's]: isFullRecord, lifeTokPathOf, makeSnapshot

  /** A full gate record is one alive that carries its `wayins`; a sparse one is not. */
  protected isFullRecord(fetched: GateSparse): fetched is GateRecord {
    return fetched.am === 'a' && 'wayins' in fetched
  }

  /** A gate's life is its bank's `bank_tok` and its own `gate_tok`. */
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
      wayins:        Object.freeze({ main: main.toJSON(), ...(passkey0 && { passkey0: passkey0.toJSON() }) }),
    })
  }
  // --

  /** Answers 'gate', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'gate' { return 'gate' satisfies Modelkind }
}

// == [Helpers]: WayinsInHand, wayinsOf

/** A gate's wayins as received, as records frozen, and as Wayins. */
type WayinsInHand = Readonly<{ received: Wayins, wayins: Wayins, main: Wayin, passkey0: Wayin | null }>

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen bag of `main`'s record and `passkey0`'s, where there is one. */
function wayinsOf(main: Wayin, passkey0: Wayin | null): Wayins {
  return Object.freeze({ main: main.pickle(), ...(passkey0 && { passkey0: passkey0.pickle() }) }) as Wayins
}
// --
