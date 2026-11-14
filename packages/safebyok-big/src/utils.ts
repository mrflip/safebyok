/** `safebyok-big/utils`: small helpers for the app around a vault, which pull in none of the vault.
 * `toB64` and `fromB64` are the base64url codec of every stored `_b64` field, for an API that wants bytes, as WebAuthn does.
 */

import { toB64 } from './helpers/crypto'
import { Checker } from './helpers/validator'

export { mask } from './helpers/mask'
export type { MaskOpts } from './shapes/shapes-utils'
export { fromB64, toB64 } from './helpers/crypto'
export { WhisperFieldAttributes } from './helpers/whisper-field'

const mashArgs = Checker(({ str }) => str, 'bad_option')

/** The SHA-256 of `text` as 43 characters of unpadded base64url: a one-way stand-in for an id you would rather not hand over, such as `user_id: await mash(email)`.
 * It is unsalted, so equal text always mashes alike. Its 43 characters pass `user_id` but never `label`, which stops at 40.
 *
 * @example await mash('abc')  // 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0'
 */
export async function mash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(mashArgs.parse(text))
  return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}
