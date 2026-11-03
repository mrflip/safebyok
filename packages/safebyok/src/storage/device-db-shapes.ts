/** What the deviceDB stores and takes, and their checkers, imported as `DS`. A scope or query refuses 'bad_scope'; a row or record, 'bad_record'; a cutoff, 'bad_option'. */

import type * as Z from 'zod'
import { Checker, Checkers } from '../checks/validator'
import * as FX from '../shapes/fields'

export const leaseQuery = Checker(({ obj, applabel, user_id, vaultlabel, vault_tok }) => obj({ applabel, user_id, vaultlabel, vault_tok }), 'bad_scope', [FX])

/** A lease row is structural here: the lease's own shape is the models'. The rest of it is carried as it came, a `lease_key` handle included. */
export const { leaseSparse, leaseRow, deviceRecord } = Checkers('bad_record', ({ obj, epochMillis, applabel, user_id, vaultlabel, vault_tok, device_id }) => {
  const leaseSparse = obj({ applabel, user_id, vaultlabel, vault_tok, proved_at: epochMillis })
  return { leaseSparse, leaseRow: leaseSparse.loose(), deviceRecord: obj({ applabel, user_id, device_id }).strict() }
}, [FX])

export const cutoff = Checker(({ epochMillis }) => epochMillis, 'bad_option')

export type LeaseQuery   = Z.infer<typeof leaseQuery>
export type LeaseSparse  = Z.infer<typeof leaseSparse>
export type LeaseRow     = Z.infer<typeof leaseRow>
export type DeviceRecord = Z.infer<typeof deviceRecord>
