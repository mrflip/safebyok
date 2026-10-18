import * as Z from 'zod/mini'
import { Ciphered } from './crypto'
import { stableJsonify } from './stable-jsonify'
import { EpochMillis, vaultKeyEpoch } from './types'
import { NameFloor } from './validators'

/**
 * True when `text` is a sidecar's JSON exactly as the vault writes it: parsed and serialized
 * again, keys sorted, it comes back the same. Text respaced, reordered, or nested too deep to
 * serialize is not, and the lockbox holding it reads as damaged, its refusal a calm one.
 */
const isStableJsonText = (text: string): boolean => {
  try {
    return stableJsonify(JSON.parse(text)) === text
  } catch {
    // Not JSON, or nested past what the stack can serialize (a RangeError).
    return false
  }
}

/**
 * One lockbox as the storage layer holds it: the whisper ciphered under its own lockboxKey, that
 * lockboxKey wrapped under the vaultKey, and the public shell -- boxlabel, sidecar, the times
 * it was first stored and last written -- a locked vault may show. Nothing in this record opens
 * without the vaultKey.
 *
 * `revision_id` is minted fresh on every write and bound into both encryptions, so ciphertext
 * moved between revisions (or boxes, or vaults) refuses to open. So is every other field but the
 * two encrypted ones: an altered sidecar, time or codec refuses to open as well.
 *
 * Stored fields are underbar_case: this record is written to the storage layer as-is, and it is
 * plain JSON -- any backend that can hold text can hold it. Its boxlabel is checked here against
 * the floor every name is held to (`NameFloor`); the vault's validators check it only where a
 * host hands it in.
 */
export const Lockbox = Z.object({
  format:                 Z.literal('safebyok-lockbox-v5'),
  boxlabel:               NameFloor,
  revision_id:            Z.string().check(Z.minLength(1)),
  /**
   * Which vaultKey this lockbox's lockboxKey is wrapped under: the bundle's `vault_key_epoch` when
   * it was written. Public, so a locked vault's listing shows which lockboxes stand under which.
   */
  vault_key_epoch:        vaultKeyEpoch,
  /** This lockbox's lockboxKey, wrapped under the vaultKey. */
  lockbox_key_wrapped:    Ciphered,
  /** The whisper, ciphered under this lockbox's lockboxKey. */
  whisper_ciphered:       Ciphered,
  /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
  whisper_codec:          Z.literal('json_v1'),
  /** Which generation of the whisper's own shape this lockbox holds: 1, the only one so far. */
  whisper_schema_version: Z.literal(1),
  /**
   * The lockbox's {@link Sidecar}, as JSON with every object's keys sorted and no spacing,
   * exactly as `stableJsonify` writes it: `{}` when the host gave none. Always written, so a lockbox with no sidecar and one with an empty sidecar are one record.
   */
  sidecar_json:           Z.string().check(Z.refine(isStableJsonText, "sidecar_json holds the lockbox's sidecar as the JSON text the vault writes, keys sorted")),
  /** When this boxlabel was first stored, an {@link EpochMillis}: every later store carries it forward. */
  registered_at:          EpochMillis,
  /**
   * When this revision was written, an {@link EpochMillis}: every store stamps it anew. It says
   * nothing of whether the whisper changed -- a store of the same whisper moves it too.
   */
  written_at:             EpochMillis,
})
export type Lockbox = Z.infer<typeof Lockbox>
