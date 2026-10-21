/** safebyok-convex's client side: {@link convexVaultDB}, the VaultDB that keeps a vault in your Convex backend.
 * It talks through the Convex client your app already has. The backend side, the component and the
 * functions your app serves, is `safebyok-convex/convex.config` and `safebyok-convex/server`;
 * nothing here loads them.
 */
export { convexVaultDB } from './convex-vault-db'
export type { ConvexCalls, ConvexReactWatchingClient, ConvexVaultClient, ConvexVaultDBOpts, ConvexWatchingClient } from './convex-vault-db'
export type { SafebyokApi } from './server'
