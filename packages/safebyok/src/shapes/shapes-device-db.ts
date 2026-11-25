/** What a deviceDB is, what its verbs are given beyond a lease record or a devicetok, what its listeners hear, and what an IdbDeviceDB is made with and files a record under. */

import type * as Z from 'zod'
import { Validator } from 'safebyok-big/internals'
import { objCheck } from 'safebyok-big/storage'
import type { DeviceDB } from '../storage/device-db'
import * as Phrases from '../phrases'
import type { LeaseLabelpath, LeaseScope } from './shapes-stamps'
import type { Banklabel, Userid } from './primitives'

// == [The deviceDB]: isDeviceDB, LeaseListener, DeviceDBChecks

/** True for an object with a function for each of a {@link DeviceDB}'s verbs. */
export function isDeviceDB(val: unknown): val is DeviceDB {
  if ((typeof val !== 'object') || (val === null)) { return false }
  const members: Partial<Record<string, unknown>> = val
  return DeviceDBMembernames.every((membername) => typeof members[membername] === 'function')
}

/** The verbs of a {@link DeviceDB}. */
const DeviceDBMembernames = ['peekLease', 'stowLease', 'listen', 'ensureDevicetok'] as const satisfies readonly (keyof DeviceDB)[]

/** Called with the scope of a lease record stored, in this tab or another. It gets the scope only: peek for the record. */
export type LeaseListener = (scope: LeaseScope) => void

/** The check of a deviceDB, and of what `listen` is given. */
export const DeviceDBChecks = Object.freeze(Validator.Checkers('bad_record', ({ obj, fn, custom }) => ({
  deviceDB:   custom<DeviceDB>(isDeviceDB, Phrases.DeviceDBExpected),
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

/** Where the lease database files a gate's lease record. */
export type LeaseScopepath = [userid: Userid, banklabel: Banklabel, labelpath: LeaseLabelpath]
// --

true satisfies Z.core.util.AssertEqual<IdbDeviceDBOpts, Z.input<typeof idbDeviceDBOpts>>
