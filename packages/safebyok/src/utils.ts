/** `safebyok/utils`: small helpers for the app around a vault, which pull in none of the vault.
 * `toB64` and `fromB64` are the base64url codec of every stored `_b64` field, for an API that wants bytes, as WebAuthn does.
 */

import { hex } from '@scure/base'
import { Checker } from './helpers/validator'

export { mask } from './helpers/mask'
export type { MaskOpts } from './shapes/shapes-utils'
export { fromB64, toB64 } from './helpers/crypto'
export { WhisperFieldAttributes } from './helpers/whisper-field'

const mashInput = Checker(({ str }) => str, 'bad_option')

/** The SHA-256 of `text` as 64 lowercase hex characters: a one-way stand-in for an id you would rather not hand over, such as `user_id: await mash(email)`.
 * It is unsalted, so equal text always mashes alike. Its 64 characters pass `user_id` but never `label`, which stops at 40.
 *
 * @example await mash('abc')  // 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
 */
export const mash = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(mashInput.parse(text))
  return hex.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}
