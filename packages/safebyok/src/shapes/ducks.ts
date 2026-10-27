/** The duck validators: each takes whatever a caller has in hand that carries what it asks for, a Vault object, a record, a scope, and hands back just that, frozen. Each refuses a field none of the vault's kin carries, and a malformed one, used or not. */

import type * as Z from 'zod'
import { Validator } from '../checks/validator'
import { BoxFormat, BoxRecord } from './box'
import { DeviceRecord, DeviceRecordFormat, LeaseFormat, LeaseRecord, LeaseStamp } from './device'
import { GateRecord, TombstoneFormat, VaultFormat, VaultSparse, VaultStamp } from './vault'

// == [Kin]: VaultKin

/** Every field the vault's kin carry, each checked as its owner checks it: a vault record and its tombstone, a Vault object, a box and its record, a lease and its record, and a device record. What a scope's duck lets ride along. Its `parse` refuses 'bad_scope'.
 * A field more than one of them carries is checked as each of them passes it: any of their
 * formats, and a `gate_epoch` of 0 or more, though a lease's is never 0.
 *
 * @example VaultKin.partial().strict().safeParse(boxRecord).success   // true: a box record is kin
 */
export const { VaultKin } = Validator('bad_scope', ({ obj, oneof, uint }) => ({
  VaultKin: obj({
    ...VaultSparse.shape,
    gate:       GateRecord.nullable(),
    ...BoxRecord.shape,
    ...LeaseRecord.shape,
    ...DeviceRecord.unwrap().shape,
    format:     oneof([VaultFormat, TombstoneFormat, BoxFormat, LeaseFormat, DeviceRecordFormat]),
    gate_epoch: uint,
  }),
}))
// --

// == [Scopes]: bankScopeDuck, vaultScopeDuck, boxscopeDuck

/** A scope taken from whatever carries it, frozen: a scope, a Vault object, a box, or any record of the vault's {@link VaultKin}. Each refuses 'bad_scope'.
 * Every field the thing holds is checked, and one none of the kin carries refuses: a store, an
 * option, a misspelt name. A wider scope passes as a narrower, a box's as its vault's.
 *
 * @example const { applabel, user_id, vaultlabel } = vaultScopeDuck.parse(vault)
 * @example vaultScopeDuck.parse(boxRecordWithItsScope)                            // { applabel, user_id, vaultlabel }
 * @example vaultScopeDuck.parse({ ...scope, vaultDB })                            // throws 'bad_scope': a field it does not take
 * @example vaultScopeDuck.parse({ ...scope, vault_tok: '' })                      // throws 'bad_scope': vault_tok, though unused
 */
export const { bankScopeDuck, vaultScopeDuck, boxscopeDuck } = Validator('bad_scope', ({ obj, duck, applabel, user_id, vaultlabel, boxlabel }) => ({
  bankScopeDuck:  duck(obj({ applabel, user_id }), VaultKin),
  vaultScopeDuck: duck(obj({ applabel, user_id, vaultlabel }), VaultKin),
  boxscopeDuck:   duck(obj({ applabel, user_id, vaultlabel, boxlabel }), VaultKin),
}))
// --

// == [Stamps]: vaultStampDuck, vaultStampButFormatDuck, leaseStampDuck

/** A stamp taken from whatever carries it, frozen, as a ctx binds it. Each refuses 'bad_record'.
 * A vault's stamp comes from the vault alone, a Vault object, its record or its sparse shape:
 * never a box or a wayin, whose `registered_at` is their own and not the vault's. Without the
 * format, it is the vault's stamp a box or a lease binds, and takes a vault of any format, so a
 * new vault format leaves them open. A lease's stamp comes from a lease, or its record.
 *
 * @example cipherCtx(vaultStampDuck.parse(vault), purpose, header)
 * @example vaultStampButFormatDuck.parse(box)                    // throws 'bad_record': a box is no vault
 */
export const { vaultStampDuck, vaultStampButFormatDuck, leaseStampDuck } = Validator('bad_record', ({ str, duck }) => {
  const vaultKin = VaultSparse.extend({ gate: GateRecord.nullable() })
  return {
    vaultStampDuck:          duck(VaultStamp, vaultKin),
    vaultStampButFormatDuck: duck(VaultStamp.omit({ format: true }), vaultKin.extend({ format: str })),
    leaseStampDuck:          duck(LeaseStamp, LeaseRecord),
  }
})

/** A vault's stamp as what lies in it binds it: every field of its {@link VaultStamp} but the format, so a new vault format leaves each box and lease open.
 *
 * @example { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', registered_at }
 */
export type VaultStampButFormat = Z.infer<typeof vaultStampButFormatDuck>
// --
