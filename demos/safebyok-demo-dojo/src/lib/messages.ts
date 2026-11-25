/** The words a form shows for what stopped it. */

import { isVaultError } from 'safebyok'
import { refusalTextOf } from 'safebyok-react/kit'

/** What a form shows for `err`: the kit's words for a refusal, as its own forms show them, or the message of anything else, such as a host's own check. */
export function messageOf(err: Error): string { return isVaultError(err) ? refusalTextOf(err) : err.message }

/** The refusal's kind, for the readout, or `(not a refusal)` for anything else. */
export function refusalkindOf(err: Error): string { return isVaultError(err) ? err.refusalkind : '(not a refusal)' }
