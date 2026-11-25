/** Who is signed in, kept in localStorage, and the header's buttons that change it. Each change reloads the page: a device serves its first user for its life. */

import { isVaultEmpty, loadFixture } from './stores'

/** The localStorage key of the signed-in userid. */
const SessionCkey = 'dojo:session'

/** The localStorage key that asks the next page load to load the fixture before anything else. */
const ResetCkey = 'dojo:reset'

/** The userid signed in for this page's life, or null for nobody. */
export function sessionUserid(): string | null { return localStorage.getItem(SessionCkey) }

/** Sign in as `userid`, on a fresh page. */
export function signinAs(userid: string): void {
  localStorage.setItem(SessionCkey, userid)
  globalThis.location.reload()
}

/** Sign out, on a fresh page. */
export function signOut(): void {
  localStorage.removeItem(SessionCkey)
  globalThis.location.reload()
}

// The fixture is loaded by the next page, before it makes a device: this page's device would go on writing its caches.
/** Sign out, and load the fixture into both stores on a fresh page. */
export function resetStores(): void {
  localStorage.removeItem(SessionCkey)
  localStorage.setItem(ResetCkey, 'yes')
  globalThis.location.reload()
}

/** Ready the stores for this page, before the app renders: load the fixture where Reset asked for it, or where the vault database has no row. */
export async function readyStores(): Promise<void> {
  if ((localStorage.getItem(ResetCkey) === null) && ! await isVaultEmpty()) { return }
  await loadFixture()
  localStorage.removeItem(ResetCkey)
}
