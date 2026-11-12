import type { PassphraseSaltSize } from '../helpers/consts'
import { type KeyDeriverSpec, TestLabelPrefix, keyDeriverSpec } from './shapes'

// == [KeyDeriver]: KeyDeriver, Argon2idKeyDeriver

/** What `Device.make` accepts to make a key from a passphrase: `argon2idWebV1Deriver` from `safebyok/browser`, or your own. */
export interface KeyDeriver {
  /** The name each wayin records for how its key was derived, so a later device derives it alike. */
  readonly key_deriver_label: string
  /** How many bytes of salt each derivation takes: {@link PassphraseSaltSize}, for every deriver. */
  readonly salt_size:        typeof PassphraseSaltSize
  /** The name of the derivation algorithm, as the supplied derivers carry it (`argon2id`). */
  readonly algorithm?:        string | undefined
  /** Derive the key's bytes from the passphrase and the wayin's salt, the same bytes for the same two. */
  readonly deriveKeyBytes:    (passphrase: string, saltBytes: Uint8Array) => Promise<Uint8Array>
  /** Get ready to derive, such as by fetching a WebAssembly module, at each device's `ensureBank()`. */
  readonly load?:             (() => void | Promise<void>) | undefined
}

/** A key deriver that carries the settings of its {@link KeyDeriverSpec}. */
export type Argon2idKeyDeriver = KeyDeriverSpec & KeyDeriver
// --

// == [Checks]: parseKeyDeriverSpec, isTestDeriver

/** Parse `candidate` into a {@link KeyDeriverSpec}, refusing a spec that misuses a supplied label. */
export function parseKeyDeriverSpec(candidate: unknown): KeyDeriverSpec { return keyDeriverSpec.parse(candidate) }

/** True when `keyDeriver`'s label starts with {@link TestLabelPrefix}. */
export function isTestDeriver(keyDeriver: Pick<KeyDeriver, 'key_deriver_label'>): boolean { return keyDeriver.key_deriver_label.startsWith(TestLabelPrefix) }
// --
