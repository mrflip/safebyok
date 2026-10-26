import { VaultError } from './errors'
import { stableJsonify } from './stable-jsonify'
import { type GateRecord, type VaultRecord, type VaultStamp, isGated } from './vault-record'
import type { Vault } from './vault'
import { type PasskeyWayin, type PassphraseWayin, Wayin, type WayinVault } from './wayin'

/** Gates: a vault's ways in as one frozen value, its passphrase wayin and its passkey wayin or none, at one `gate_epoch`.
 * A chain builds the next gate from the one it captured at its start, its base, and
 * `vault.putGate` stores it over that base alone. The vault record holds it as its `gate`, a
 * {@link GateRecord}, its `gate_epoch` beside it.
 */

/** The slice of a {@link Vault} a gate reads: its scope, the `vault_tok` it is of, and what its wayins read. */
export type GateVault = WayinVault & Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_tok'>

/** The wayins a gate holds: the passphrase's, and the passkey's or none. */
export type GateWayins = { passphrase: PassphraseWayin, passkey: PasskeyWayin | null }

/** A vault's ways in, frozen, at one `gate_epoch`, built on the gate at `base_epoch`, one below it.
 * Its demand ({@link Vault.demandConsistentWith} handed the gate) asks that the gate in hand is
 * its base, or is itself ({@link Gate.isHeldBy}), as once a read took it after it was stored. A spread, JSON or a log line shows its stamp and
 * its wayins' visible fields.
 *
 * @example const next = Gate.make(vault, { base: Gate.of(vault, vaultRecord), passphrase: wayin, passkey: null })
 * @example next.gate_epoch === next.base_epoch + 1   // true
 */
export class Gate {
  /** The scope's app. */
  readonly applabel: string
  /** The scope's user. */
  readonly user_id: string
  /** The scope's vault label. */
  readonly vaultlabel: string
  /** The `vault_tok` of the vault it lets into. */
  readonly vault_tok: string
  /** Its own epoch: its base's and one. */
  readonly gate_epoch: number
  /** The epoch of the gate it was built on, 0 for a novel vault's first. */
  readonly base_epoch: number
  /** The passphrase's way in. */
  readonly passphrase: PassphraseWayin
  /** The passkey's way in, or null. */
  readonly passkey: PasskeyWayin | null

  private constructor(vault: GateVault, vaultTok: string, baseEpoch: number, wayins: GateWayins) {
    this.applabel = vault.applabel
    this.user_id = vault.user_id
    this.vaultlabel = vault.vaultlabel
    this.vault_tok = vaultTok
    this.gate_epoch = baseEpoch + 1
    this.base_epoch = baseEpoch
    this.passphrase = wayins.passphrase
    this.passkey = wayins.passkey
    Object.freeze(this)
  }

  /** The gate a chain builds on `base`, the gate it captured at its start (null for a novel vault's first): one epoch past it, holding `wayins`, the base's with the chain's changes.
   * It refuses 'bad_option' for wayins of another `vault_tok` than the base's, or the vault's.
   *
   * @example Gate.make(vault, { base: null, ...await passphraseProving.sealWayins() })   // gate_epoch 1
   * @example Gate.make(vault, { base, passphrase: base.passphrase, passkey: null })      // base.gate_epoch + 1
   */
  static make(vault: GateVault, props: { base: Gate | null } & GateWayins): Gate {
    const vaultTok = props.base?.vault_tok ?? vault.vault_tok
    if (props.passphrase.vault_tok !== vaultTok || (props.passkey !== null && props.passkey.vault_tok !== vaultTok)) {
      throw new VaultError('bad_option', "A gate's wayins are sealed for the vault it lets into: seal them under its vault_tok.")
    }
    return new Gate(vault, vaultTok, props.base?.gate_epoch ?? 0, { passphrase: props.passphrase, passkey: props.passkey })
  }

  /** The gate `vaultRecord` holds, as stored: its base one epoch below.
   *
   * @example Gate.of(vault, vaultRecord).gate_epoch === vaultRecord.gate_epoch   // true
   */
  static of(vault: GateVault, vaultRecord: VaultStamp & Pick<VaultRecord, 'gate_epoch'> & { gate: GateRecord }): Gate {
    const { gate } = vaultRecord
    return new Gate(vault, vaultRecord.vault_tok, vaultRecord.gate_epoch - 1, {
      passphrase: Wayin.make(vault, vaultRecord, gate.passphrase),
      passkey:    gate.passkey === null ? null : Wayin.make(vault, vaultRecord, gate.passkey),
    })
  }

  /** True when `vaultRecord` holds this gate: its epoch, and each of its wayins' records.
   *
   * @example Gate.of(vault, vaultRecord).isHeldBy(vaultRecord)   // true
   */
  isHeldBy(vaultRecord: Pick<VaultRecord, 'gate_epoch' | 'gate'>): boolean {
    if (! isGated(vaultRecord)) { return false }
    return vaultRecord.gate_epoch === this.gate_epoch && stableJsonify(vaultRecord.gate) === stableJsonify(this.record)
  }

  /** The gate as the vault record holds it, its `gate`: each wayin's record, the passkey's or null. Its `gate_epoch` rides beside it in the record. */
  get record(): GateRecord {
    return { passphrase: this.passphrase.record, passkey: this.passkey?.record ?? null }
  }
}
