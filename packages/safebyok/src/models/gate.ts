import type * as Z from 'zod'
import { objCheck } from '../checks/validator'
import { decorate, tattoo } from '../helpers'
import { NOVEL, type ProofClosure, Proving, type ProvingWorld } from './proving'
import { vaultStamp } from './stamps'
import type { Vault } from './vault'
import { type PasskeyWayinRecord, type PassphraseWayinRecord, Wayin, type WayinHeader, passkeyWayinRecord, passphraseWayinRecord } from './wayin'

// == [Shapes]: gateProps, GateProps

export const gateProps = objCheck(() => ({
  passphrase_wayin: passphraseWayinRecord,
  passkey_wayin:    passkeyWayinRecord.nullable(),
}), 'bad_record')

export type GateProps = Z.infer<typeof gateProps>
// --

// == [Gate]: build, novelWayins, pickle, toJSON

export class Gate {
  declare readonly passphrase_wayin: PassphraseWayinRecord
  declare readonly passkey_wayin:    PasskeyWayinRecord | null
  declare readonly ppWayin:          Wayin
  declare readonly pkWayin:          Wayin | null
  declare readonly vault:            Vault

  constructor(vault: Vault, props: unknown) {
    vaultStamp.parse(vault)
    const { passphrase_wayin, passkey_wayin } = gateProps.parse(props)
    const ppWayin = new Wayin(passphrase_wayin)
    const pkWayin = passkey_wayin === null ? null : new Wayin(passkey_wayin)
    tattoo(this, { passphrase_wayin: ppWayin.pickle(), passkey_wayin: pkWayin?.pickle() ?? null }, { writable: false })
    decorate<Gate>(this, { ppWayin, pkWayin, vault })
    Object.freeze(this)
  }

  static async build(vault: Vault, proofClosure: ProofClosure, world: ProvingWorld): Promise<Gate> {
    const wayins = await Gate.#novelWayins(vault, proofClosure, world)
    return new Gate(vault, { passphrase_wayin: wayins.passphrase.pickle(), passkey_wayin: wayins.passkey?.pickle() ?? null })
  }

  static async #novelWayins(vault: Vault, proofClosure: ProofClosure, world: ProvingWorld): Promise<{ passphrase: Wayin, passkey: Wayin | null }> {
    const { passphraseProving, passkeyProving } = await Proving.makeProvingPair(vault, proofClosure, world)
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
