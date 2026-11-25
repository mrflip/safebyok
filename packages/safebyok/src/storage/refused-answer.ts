/** The refused answer for a call that threw before the vaultDB answered. */

import { SX } from 'safebyok-big/internals'
import * as Throwers from '../refusals/throwers'
import { loggableAskOf } from '../shapes/shapes-asks'
import { readTcNow } from './agerank'
import type { BadAnswer } from '../shapes/shapes-answers'

/** The refused answer to `ask`, for a call that threw `thrown` before the vaultDB answered.
 * Its `err` is `thrown` if that is a refusal, else an `unexpected_error`. Its act is `unclassified_storing`, its `dbhas` is null, its `banktok` the void lifetok, its `tracked` `'unread'`, and its `read_tc` is when it was made.
 */
export function refusedAnswerOf(ask: unknown, thrown: unknown): BadAnswer<null> {
  return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', banktok: SX.VoidLifeTok, tracked: 'unread', read_tc: readTcNow(), dbhas: null, err: Throwers.refusalOfThrown(thrown) }
}
