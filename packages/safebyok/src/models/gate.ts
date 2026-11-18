import type { Consts } from 'safebyok-big/internals'
import { Crypto, Validator } from 'safebyok-big/internals'
import { Thing } from './thing'
import * as Phrases from '../phrases'
import type { GateBank, GateDna, GateOpts } from '../shapes/shapes-gateish'
import { type BankStamp, type GateStamp, StampChecks } from '../shapes/shapes-stamps'
import { Wayin } from './wayin'
import { type GateRecord, type ThingScope, type Wayins, GateChecks, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import * as Throwers from '../refusals/throwers'

/** One revision of a bank's gate: its passphrase wayin, and its passkey wayin if it has one.
 * A gate verb makes the next revision as a new Gate; this one never changes.
 */
export class Gate extends Thing<GateRecord, ThingScope, GateStamp> implements GateStamp {
  // == [Props]: #bank, #main, #passkey0

  readonly #bank:     GateBank
  readonly #main:     Wayin
  readonly #passkey0: Wayin | null
  // --

  // == [Getters]: wayins, main, passkey0, scope, stamp, bankStamp

  /** The wayin records, frozen. */
  get wayins(): Wayins { return this.pickle().wayins }

  /** The passphrase wayin. */
  get main(): Wayin { return this.#main }

  /** The passkey wayin, or null if the gate has none. */
  get passkey0(): Wayin | null { return this.#passkey0 }

  /** This gate's scope: its bank's, and its `labelpath`. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  /** This gate's stamp, fixed for its life. A wayin's wrapped bankKey is bound to it. */
  get stamp(): GateStamp { return StampChecks.gateStamp.parse(this) }

  /** The stamp of this gate's bank. A wayin's wrapped bankKey is bound to it, and to the gate's own `stamp`. */
  get bankStamp(): BankStamp { return this.#bank.stamp }
  // --

  // == [Construction]: make, constructor, makeRecord

  /** Make the gate of `record`, which must be of `opts.bank`'s scope. */
  static make(record: GateRecord, opts: GateOpts): Gate {
    const { record: gateRecord, opts: { bank } } = Checks.gateMakeArgs.parse({ record, opts })
    // A gate's life is its own, so only the bank's scope is checked: a gate of another life of the bank passes.
    Validator.checkedConsistent(gateRecord, StampChecks.bankScope.parse(bank.stamp), { kind: 'record_conflict' })
    return new Gate(gateRecord, opts)
  }

  private constructor(gateRecord: GateRecord, opts: GateOpts) {
    const main = Wayin.make(gateRecord.wayins.main)
    const passkey0 = (gateRecord.wayins.passkey0 === null) ? null : Wayin.make(gateRecord.wayins.passkey0)
    super({ ...gateRecord, wayins: wayinsOf({ main, passkey0 }) })
    this.#bank = opts.bank
    this.#main = main
    this.#passkey0 = passkey0
    Object.freeze(this)
  }

  /** The first record of a new main gate, made from `dna`, born at its stamp's `born_at`. */
  static makeRecord(dna: GateDna): GateRecord {
    const { wayins, ...stamp } = Checks.makeRecordArgs.parse(dna)
    return GateChecks.record.parse({
      ...stamp, label: stamp.labelpath, fmt: ThingFormat, revtok: Crypto.randomId(), revseq: 0, am: 'a',
      lifepath: stamp.lifeseq, written_at: stamp.born_at, wayins: wayinsOf(wayins), auth: {}, sigs: {}, meta: {},
    })
  }
  // --

  // == [Guards]: demandPasskeyAddable

  /** Demand that this gate has no passkey wayin yet. */
  demandPasskeyAddable(): void {
    if (this.#passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
  }
  // --

  /** Always `'gate'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'gate' { return 'gate' satisfies Consts.Modelkind }

  /** A gate's modelkind: the guards this class inherits answer for gates alone. */
  static override readonly modelkind = 'gate'
}

// == [Helpers]: wayinsOf

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen records of `wayins`, its passkey0 null for none. */
function wayinsOf({ main, passkey0 }: GateDna['wayins']): Wayins {
  return Object.freeze({ main: main.pickle(), passkey0: passkey0?.pickle() ?? null }) as Wayins
}
// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Gate.make}'s and {@link Gate.makeRecord}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => val instanceof Wayin, Phrases.WayinExpected)
  return {
    gateMakeArgs:   obj({ record: GateChecks.record, opts: obj({ bank: obj({ stamp: StampChecks.bankStamp }) }) }),
    makeRecordArgs: StampChecks.gateStamp.extend({ wayins: obj({ main: wayin, passkey0: wayin.nullable() }) }),
  }
})
// --
