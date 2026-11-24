/** The refused answer for a call that threw before the vaultDB answered. */

import { Errors } from 'safebyok-big/internals'
import * as Throwers from '../refusals/throwers'
import { loggableAskOf } from '../shapes/shapes-asks'
import { readTcNow } from './thing-classifier'
import type { BadAnswer } from './vault-db'

/** The refused answer to `ask`, for a call that threw `thrown` before the vaultDB answered.
 * Its `err` is `thrown` if that is a refusal, else an `unexpected_error`. Its act is `unclassified_storing`, its `world`, `banktok` and `dbhas` are null, and its `read_tc` is when it was made.
 */
export function refusedAnswerOf(ask: unknown, thrown: unknown): BadAnswer<null> {
  const err = Errors.isVaultError(thrown) ? thrown : Throwers.unexpectedError(thrown)
  return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, banktok: null, read_tc: readTcNow(), dbhas: null, err }
}
