/** What a deviceDB's verbs are given beyond a lease record, what its listeners hear, and what an IdbDeviceDB is made with and files a record under. */

import type * as Z from 'zod'
import { Validator } from 'safebyok-big/internals'
import { objCheck } from 'safebyok-big/storage'
import type { BankScope } from './shapes-stamps'
import type { Banklabel, Userid } from './primitives'

// == [Listening]: LeaseListener, DeviceDBChecks

/** Called with the scope of a bank whose lease record was stored, in this tab or another. It gets the scope only: peek for the record. */
export type LeaseListener = (scope: BankScope) => void

/** The check of what `listen` is given. */
export const DeviceDBChecks = Object.freeze(Validator.Checkers('bad_record', ({ obj, fn }) => ({
  listenArgs: obj({ listener: fn<LeaseListener>() }),
})))
// --

// == [IndexedDB]: IdbDeviceDBOpts, idbDeviceDBOpts, LeaseScopepath

/** What an IdbDeviceDB is made with. */
export interface IdbDeviceDBOpts {
  /** Scopes the database's name and its bell's: `safebyok-<dbName>:…`, or `safebyok:…` if left out. */
  dbName?: string | undefined
}

/** The check of an IdbDeviceDB's options, which `browserOpts` takes too. */
export const idbDeviceDBOpts = objCheck(({ str }) => ({ dbName: str.min(1).optional() }), 'bad_record')

/** Where the lease database files a bank's lease record. */
export type LeaseScopepath = [userid: Userid, banklabel: Banklabel]
// --

true satisfies Z.core.util.AssertEqual<IdbDeviceDBOpts, Z.input<typeof idbDeviceDBOpts>>
