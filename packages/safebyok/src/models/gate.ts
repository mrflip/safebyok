import { type Modelkind, hasModelkind } from '../helpers/consts'
import { Checkers } from '../helpers/validator'
import { decorate, tattoo } from '../helpers/helpers'
import { passkeyHeldAlready } from '../refusals/throwers'
import { type GateProps, type PasskeyWayinRecord, type PassphraseWayinRecord, type VaultStamp, type WayinHeader, FirstGateEpoch, gateProps, vaultStamp } from '../shapes/shapes-gateish'
import { Wayin } from './wayin'

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => hasModelkind(val, 'wayin'), 'Expected a Wayin')
  return { gateMakeArgs: obj({ passphraseWayin: wayin, passkeyWayin: wayin.nullable() }) }
})

/** The wayins of a vault's record as of one `gate_epoch`, a read-only view: a change is a vaultDB verb's, and a new `Gate` is read from the record it writes. */
export class Gate {
  // == [Props]: gate_epoch, passphrase_wayin, passkey_wayin, ppWayin, pkWayin, stamp

  declare readonly gate_epoch:       number
  declare readonly passphrase_wayin: PassphraseWayinRecord
  declare readonly passkey_wayin:    PasskeyWayinRecord | null
  declare readonly ppWayin:          Wayin
  declare readonly pkWayin:          Wayin | null
  declare readonly stamp:            VaultStamp
  // --

  // == [Construction]: constructor, make

  constructor(stamp: VaultStamp, props: unknown) {
    const checked = vaultStamp.parse(stamp)
    const { gate_epoch, passphrase_wayin, passkey_wayin } = gateProps.parse(props)
    const ppWayin = new Wayin(passphrase_wayin)
    const pkWayin = passkey_wayin === null ? null : new Wayin(passkey_wayin)
    tattoo(this, { gate_epoch, passphrase_wayin: ppWayin.pickle(), passkey_wayin: pkWayin?.pickle() ?? null })
    decorate<Gate>(this, { ppWayin, pkWayin, stamp: checked })
    Object.freeze(this)
  }

  /** The first gate of the vault `stamp` names, of `gate_epoch` 1. */
  static make(stamp: VaultStamp, passphraseWayin: Wayin, passkeyWayin: Wayin | null): Gate {
    const checked = Checks.gateMakeArgs.parse({ passphraseWayin, passkeyWayin })
    return new Gate(stamp, { gate_epoch: FirstGateEpoch, passphrase_wayin: checked.passphraseWayin.pickle(), passkey_wayin: checked.passkeyWayin?.pickle() ?? null })
  }
  // --

  // == [Methods]: pickle, toJSON

  /** A frozen, plain {@link GateProps} object of this gate and its wayins. */
  pickle(): GateProps {
    const { gate_epoch, passphrase_wayin, passkey_wayin } = this
    return Object.freeze({ gate_epoch, passphrase_wayin, passkey_wayin })
  }

  /** This gate for `JSON.stringify`, showing only each wayin's header. */
  toJSON(): { gate_epoch: number, passphrase_wayin: WayinHeader, passkey_wayin: WayinHeader | null } {
    return { gate_epoch: this.gate_epoch, passphrase_wayin: this.ppWayin.toJSON(), passkey_wayin: this.pkWayin?.toJSON() ?? null }
  }
  // --

  // == [Guards]: demandPasskeyAddable

  /** Demands that this gate hold no passkey: the one check before anyone is asked for one. */
  demandPasskeyAddable(): void {
    if (this.pkWayin !== null) { throw passkeyHeldAlready() }
  }
  // --

  /** Answers 'gate', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'gate' { return 'gate' satisfies Modelkind }
}
