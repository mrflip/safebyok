/** The test helpers that build JSX: the provider's tree over a {@link ProviderWorld}. */

import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement, type ReactNode, StrictMode } from 'react'
import type { ProviderWorld } from './test-helpers/provider-world'

/** How {@link providerTreeOf} mounts the provider. */
export interface ProviderTreeOpts {
  userid:    string | null | undefined
  /** Mount it under `StrictMode`, which runs each effect twice on mount. */
  isStrict?: boolean
  /** Hand the provider no vaultDB or key deriver, for a world built `isInConfig`. */
  isBare?:   boolean
}

/** `children` under the world's QueryClient and its giver's provider, handed the world's vaultDB and key deriver unless `isBare`. */
export function providerTreeOf(world: ProviderWorld, children: ReactNode, { userid, isStrict = false, isBare = false }: ProviderTreeOpts): ReactElement {
  const { SOK } = world
  const overrides = isBare ? {} : { vaultDB: world.vaultDB, keyDeriver: world.deriver }
  const tree = <QueryClientProvider client={world.client}><SOK.Provider userid={userid} {...overrides}>{children}</SOK.Provider></QueryClientProvider>
  return isStrict ? <StrictMode>{tree}</StrictMode> : tree
}
