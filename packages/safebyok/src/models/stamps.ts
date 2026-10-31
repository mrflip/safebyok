import type * as Z from 'zod'
import { objCheck } from '../checks/validator'
import * as FX from '../shapes/fields'

// == [Stamps]: vaultStamp, VaultStamp

/** The fields of a vault fixed for its life, which every ctx under it binds: the scope, `vault_tok` and `registered_at`. Its `parse` takes them from whatever carries them, a Vault included, strips the rest, and refuses 'bad_option'. */
export const vaultStamp = objCheck(({ applabel, user_id, vaultlabel, vault_tok, epochMillis }) => ({
  applabel,
  user_id,
  vaultlabel,
  vault_tok,
  registered_at: epochMillis,
}), { refuseAs: 'bad_option', extras: 'strip' }, [FX])

export type VaultStamp = Z.infer<typeof vaultStamp>
// --
