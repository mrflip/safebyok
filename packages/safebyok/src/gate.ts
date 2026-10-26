import { VaultError } from './errors'
import { stableJsonify } from './stable-jsonify'
import { type GatedVaultProps, type VaultProps, isGated } from './types/types'
import type { Vault } from './vault'
import { type PasskeyWayin, type PassphraseWayin, Wayin, type WayinVault } from './wayin'

/** Gates: a vault's ways in as one frozen value, its passphrase wayin and its passkey wayin or none, at one `gate_epoch`.
 * A chain builds the next gate from the one it captured at its start, its base, and
 * `vault.putGate` stores it over that base alone. The stored vault props keep the gate's fields
 * flat beside the vault's own.
 */

/** The slice of a {@link Vault} a gate reads: its scope, the `vault_tok` it is of, and what its wayins read. */
export type GateVault = WayinVault & Pick<Vault, 'vault_tok'>

/** The wayins a gate holds: the passphrase's, and the passkey's or none. */
export type GateWayins = { passphrase: PassphraseWayin, passkey: PasskeyWayin | null }

/** A vault's ways in, frozen, at one `gate_epoch`, built on the gate at `base_epoch`, one below it.
 * Its demand ({@link Vault.demandConsistentWith} handed the gate) asks that the gate in hand is
 * its base, or is itself ({@link Gate.isHeldBy}), as once a read took it after it was stored. A spread, JSON or a log line shows its stamp and
 * its wayins' visible fields.
 *
 * @example const next = Gate.make(vault, { base: Gate.of(vault, vaultProps), passphrase: wayin, passkey: null })
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

  /** The gate `vaultProps` hold, as stored: its base one epoch below.
   *
   * @example Gate.of(vault, vaultProps).gate_epoch === vaultProps.gate_epoch   // true
   */
  static of(vault: GateVault, vaultProps: GatedVaultProps): Gate {
    return new Gate(vault, vaultProps.vault_tok, vaultProps.gate_epoch - 1, {
      passphrase: Wayin.make(vault, vaultProps.vault_tok, vaultProps.passphrase),
      passkey:    vaultProps.passkey === null ? null : Wayin.make(vault, vaultProps.vault_tok, vaultProps.passkey),
    })
  }

  /** True when `vaultProps` hold this gate: its epoch, and each of its wayins' records.
   *
   * @example Gate.of(vault, vaultProps).isHeldBy(vaultProps)   // true
   */
  isHeldBy(vaultProps: VaultProps): boolean {
    if (! isGated(vaultProps)) { return false }
    const { gate_epoch, passphrase, passkey } = vaultProps
    return stableJsonify({ gate_epoch, passphrase, passkey }) === stableJsonify(this.storedFields)
  }

  /** The gate's fields as the stored vault props hold them, flat: its epoch and each wayin's record. */
  get storedFields(): Pick<GatedVaultProps, 'gate_epoch' | 'passphrase' | 'passkey'> {
    return { gate_epoch: this.gate_epoch, passphrase: this.passphrase.record, passkey: this.passkey?.record ?? null }
  }
}
