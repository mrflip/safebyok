/** Gates: a vault's ways in as one frozen value, its passphrase wayin and its passkey wayin or none, at one `gate_epoch`.
 * A chain builds the next gate from the one it captured at its start, its base, and
 * `vault.putGate` stores it over that base alone. The vault record holds it as its `gate`, a
 * {@link GateRecord}, its `gate_epoch` beside it.
 */

import { VaultError } from './errors'
import { stableJsonify } from './stable-jsonify'
import type { KeyDeriver } from './key-deriver'
import { type GatedVaultRecord, type GateRecord, type VaultRecord, type VaultStamp, isGated } from './shapes/vault'
import type { VaultScope } from './shapes/scopes'
import { type PasskeyWayin, type PassphraseWayin, Wayin } from './wayin'

/** The wayins a gate holds: the passphrase's, and the passkey's or none. */
export type GateWayins = { passphrase: PassphraseWayin, passkey: PasskeyWayin | null }

/** A vault's ways in, frozen, at one `gate_epoch`, built on the gate at `base_epoch`, one below it.
 * `vault.demandConsistentWith(gate)` asks that the gate the vault holds is this one's base, or,
 * once a read has taken it in after it was stored, this one itself ({@link Gate.isHeldBy}). A
 * spread, JSON or a log line shows what it was made under (the scope, `vault_tok` and its epochs)
 * and its wayins' visible fields.
 *
 * @example const next = Gate.make(vault, { base: Gate.of(vaultRecord, { keyDeriver }), passphrase: wayin, passkey: null })
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

  private constructor(vault: VaultScope, vaultTok: string, baseEpoch: number, wayins: GateWayins) {
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

  /** The gate a chain builds on `base`, one epoch past it, holding `wayins`: the base's, with the chain's changes.
   * `base` is the gate the chain captured at its start, null for a novel vault's first. It refuses
   * 'bad_option' for wayins of another `vault_tok` than the base's, or the vault's.
   *
   * @example Gate.make(vault, { base: null, ...await passphraseProving.sealWayins() })   // gate_epoch 1
   * @example Gate.make(vault, { base, passphrase: base.passphrase, passkey: null })      // base.gate_epoch + 1
   */
  static make(vault: VaultScope & Pick<VaultStamp, 'vault_tok'>, given: { base: Gate | null } & GateWayins): Gate {
    const vaultTok = given.base?.vault_tok ?? vault.vault_tok
    if (given.passphrase.vault_tok !== vaultTok || (given.passkey !== null && given.passkey.vault_tok !== vaultTok)) {
      throw new VaultError('bad_option', "A gate's wayins are sealed for the vault it lets into: seal them under its vault_tok.")
    }
    return new Gate(vault, vaultTok, given.base?.gate_epoch ?? 0, { passphrase: given.passphrase, passkey: given.passkey })
  }

  /** The gate `vaultRecord` holds, as stored: its scope and `vault_tok` the record's, its base one epoch below, its wayins judged by `kit.keyDeriver`, the vault's.
   *
   * @example Gate.of(vaultRecord, { keyDeriver }).gate_epoch === vaultRecord.gate_epoch   // true
   */
  static of(vaultRecord: GatedVaultRecord, kit: { keyDeriver: KeyDeriver }): Gate {
    const { gate } = vaultRecord
    return new Gate(vaultRecord, vaultRecord.vault_tok, vaultRecord.gate_epoch - 1, {
      passphrase: Wayin.make(vaultRecord, gate.passphrase, kit),
      passkey:    gate.passkey === null ? null : Wayin.make(vaultRecord, gate.passkey, kit),
    })
  }

  /** True when `vaultRecord` holds this gate: its epoch, and each of its wayins' records.
   *
   * @example Gate.of(vaultRecord, { keyDeriver }).isHeldBy(vaultRecord)   // true
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
