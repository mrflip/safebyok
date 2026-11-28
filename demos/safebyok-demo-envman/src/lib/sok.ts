/** The app's giver and its one bank, made once, before anyone signs in, and the QueryClient the app's records go through. */

import { QueryClient } from '@tanstack/react-query'
import { argon2idWebV1Deriver, zxcvbnStrengthChecker } from 'safebyok/browser'
import { reactGiver } from 'safebyok-react'
import { LocalStorageVaultDB } from './local-vault-db'

/** The giver: the provider, the strength hook, and the bank's hooks. Its vaultDB keeps the vault in this browser's localStorage. */
export const SOK = reactGiver({
  banks:           { envman: { vaultDB: new LocalStorageVaultDB() } },
  keyDeriver:      argon2idWebV1Deriver,
  strengthChecker: zxcvbnStrengthChecker,
})

// PascalCase, so the rules-of-hooks lint checks Envman.useBank() as a hook.
/** The hooks and calls of the app's one bank. */
export const Envman = SOK.bank('envman')

/** The app's QueryClient, which the giver's records go through. */
export const queryClient = new QueryClient()
