/** The refused answer a caller outside the vaultDB makes for a call that threw. */

import { Errors } from 'safebyok-big/internals'
import * as Throwers from '../refusals/throwers'
import { loggableAskOf } from '../shapes/shapes-asks'
import type { BadAnswer } from './vault-db'

/** The refused answer to `ask` for a call that threw `thrown`: a refusal is kept, and anything else becomes `unexpected_error`. */
export function refusedAnswerOf(ask: unknown, thrown: unknown): BadAnswer<null> {
  const err = Errors.isVaultError(thrown) ? thrown : Throwers.unexpectedError(thrown)
  return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err }
}
