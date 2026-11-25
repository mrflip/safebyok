/** What a deviceDB's verbs are given beyond a lease row, and what its listeners hear. */

import { Validator } from 'safebyok-big/internals'
import type { BankScope } from './shapes-stamps'

// == [Listening]: LeaseListener, DeviceDBChecks

/** Called with the scope of a bank whose lease row was stored, in this tab or another. It gets the scope only: peek for the row. */
export type LeaseListener = (scope: BankScope) => void

/** The check of what `listen` is given. */
export const DeviceDBChecks = Object.freeze(Validator.Checkers('bad_record', ({ obj, fn }) => ({
  listenArgs: obj({ listener: fn<LeaseListener>() }),
})))
// --
