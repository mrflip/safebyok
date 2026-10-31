import { decorate, tattoo } from '../helpers'
import { type GateProps, type PasskeyWayinRecord, type PassphraseWayinRecord, type ProofClosure, type ProvingWorld, type VaultStamp, type WayinHeader, gateProps, vaultStamp } from './models-shapes'
import { NOVEL, Proving } from './proving'
import { Wayin } from './wayin'

// == [Gate]: build, novelWayins, pickle, toJSON

export class Gate {
  declare readonly passphrase_wayin: PassphraseWayinRecord
  declare readonly passkey_wayin:    PasskeyWayinRecord | null
  declare readonly ppWayin:          Wayin
  declare readonly pkWayin:          Wayin | null
  declare readonly stamp:            VaultStamp

  /** The gate of the vault `stamp` names (a record or a vault, stripped to its stamp), of `props`, its wayins' pickles. */
  constructor(stamp: VaultStamp, props: unknown) {
    const checked = vaultStamp.parse(stamp)
    const { passphrase_wayin, passkey_wayin } = gateProps.parse(props)
    const ppWayin = new Wayin(passphrase_wayin)
    const pkWayin = passkey_wayin === null ? null : new Wayin(passkey_wayin)
    tattoo(this, { passphrase_wayin: ppWayin.pickle(), passkey_wayin: pkWayin?.pickle() ?? null }, { writable: false })
    decorate<Gate>(this, { ppWayin, pkWayin, stamp: checked })
    Object.freeze(this)
  }

  /** A novel gate for the vault `stamp` names, its wayins made from what `proofClosure` answers; built before the vault record is born, as every vault record carries its gate. */
  static async build(stamp: VaultStamp, proofClosure: ProofClosure, world: ProvingWorld): Promise<Gate> {
    const wayins = await Gate.#novelWayins(stamp, proofClosure, world)
    return new Gate(stamp, { passphrase_wayin: wayins.passphrase.pickle(), passkey_wayin: wayins.passkey?.pickle() ?? null })
  }

  static async #novelWayins(stamp: VaultStamp, proofClosure: ProofClosure, world: ProvingWorld): Promise<{ passphrase: Wayin, passkey: Wayin | null }> {
    const { passphraseProving, passkeyProving } = await Proving.makeProvingPair(stamp, proofClosure, world)
    const passphrase = await passphraseProving.makeWayin(NOVEL)
    const passkey = passkeyProving === null ? null : await passkeyProving.makeWayin(passphraseProving)
    // not yet: passphraseProving.makeLease()
    return { passphrase, passkey }
  }

  // not yet: attemptProof, revokePasskey, replacePassphrase, addPasskey, gate_epoch

  pickle(): GateProps {
    const { passphrase_wayin, passkey_wayin } = this
    return Object.freeze({ passphrase_wayin, passkey_wayin })
  }

  toJSON(): { passphrase_wayin: WayinHeader, passkey_wayin: WayinHeader | null } {
    return { passphrase_wayin: this.ppWayin.toJSON(), passkey_wayin: this.pkWayin?.toJSON() ?? null }
  }
}
// --
