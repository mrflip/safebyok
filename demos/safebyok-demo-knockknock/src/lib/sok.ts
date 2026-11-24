/** The app's giver and its one bank, made once, before anyone signs in, and the QueryClient the app's records go through. */

import { QueryClient } from '@tanstack/react-query'
import { argon2idWebV1Deriver, zxcvbnStrengthChecker } from 'safebyok/browser'
import { reactGiver } from 'safebyok-react-lean'
import { LocalStorageVaultDB } from './local-vault-db'

/** The giver: the provider, the strength hook, and the bank's hooks. Its vaultDB keeps the vault in this browser's localStorage. */
export const SOK = reactGiver({
  banks:           { knock: { vaultDB: new LocalStorageVaultDB() } },
  keyDeriver:      argon2idWebV1Deriver,
  strengthChecker: zxcvbnStrengthChecker,
})

// PascalCase, so the rules-of-hooks lint checks Knock.useWorld() as a hook.
/** The hooks and calls of the app's one bank. */
export const Knock = SOK.bank('knock')

/** The labelpath of the box holding the user's Anthropic API key. */
export const KeyLabelpath = 'anthropic'

/** The app's QueryClient, which the giver's records go through. */
export const queryClient = new QueryClient()
