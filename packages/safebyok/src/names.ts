import type { VaultScope } from './types/types'

/** True when `record` names `scope`: the same app, user and vault. */
export const sameScope = (record: VaultScope, scope: VaultScope): boolean => (
  record.applabel === scope.applabel && record.user_id === scope.user_id && record.vaultlabel === scope.vaultlabel
)
