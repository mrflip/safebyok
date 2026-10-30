/** A stub of the box's seal, until the vault's seal lands: it fills a box record's sealed parts with placeholders. */

import type { Sidecar, Whisper } from '../shapes/box'
import { type BoxRecord, type BoxSparse, boxRecord } from './models-shapes'

// == [The stub seal]: StubBoxKeyWrapped, StubWhisperCiphered, stubSeal

/** The placeholder a stub-sealed record holds as its `box_key_wrapped`: a constant that wraps no key and opens under none. */
export const StubBoxKeyWrapped = Object.freeze({ cipher_iv_b64: 'stub', ciphertext_b64: 'stub-box-key-wrapped' })

/** The placeholder a stub-sealed record holds as its `whisper_ciphered`: a constant that ciphers nothing and opens under no key. */
export const StubWhisperCiphered = Object.freeze({ cipher_iv_b64: 'stub', ciphertext_b64: 'stub-whisper-ciphered' })

/** The full {@link BoxRecord} of `staged`, sealed over the whisper: `staged` as given, its sealed parts the constant placeholders. A stub, until the vault's seal lands.
 * The seal that replaces it makes a fresh boxKey, wraps it under the vaultKey through the vault's
 * lease, and ciphers the whisper under that boxKey, bound to the record's stamp. This stub does none
 * of that: it never looks at the whisper, and nothing it returns is derived from the whisper or any
 * key. A stub-sealed record opens to nothing; `staged`'s sealed parts, where it carries any, are
 * replaced. It refuses 'bad_record' a `staged` that does not make a full record.
 *
 * @param staged  - Record to seal, under the revision it is staged at, with the sidecar the seal binds.
 * @param _whisper - Whisper to seal; null for a box made with none.
 * @example await stubSeal({ ...sparse, sidecar: {} }, 'sk-test')   // { ...sparse, sidecar: {}, box_key_wrapped: StubBoxKeyWrapped, whisper_ciphered: StubWhisperCiphered }
 */
export const stubSeal = (staged: BoxSparse & { sidecar: Sidecar }, _whisper: Whisper | null): Promise<BoxRecord> =>
  Promise.resolve(boxRecord.parse({ ...staged, box_key_wrapped: StubBoxKeyWrapped, whisper_ciphered: StubWhisperCiphered }))
// --
