/** The demo's fake sign-in: a username and no password, and the session kept in localStorage. A real host uses its own auth. */

/** Who is signed in: the userid the vault is stored under, and the username the user typed. */
export type Session = Readonly<{ userid: string, username: string }>

/** The localStorage key of the session. */
const SessionCkey = 'envman:session'

/** The localStorage key of the account signed in as `username`, holding its userid. */
function accountCkeyOf(username: string): string { return `envman:account:${username}` }

/** The listeners to tell when the session changes. */
const listeners = new Set<() => void>()

/** The session now, the same object until it changes. */
const signedIn: { current: Session | null } = { current: sessionSaved() }

/** The session, or null while nobody is signed in, as `useSyncExternalStore` wants it. */
export function getSession(): Session | null { return signedIn.current }

/** Subscribe `listener` to the session, returning its unsubscribe. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Sign in as `username`, making its account the first time. Throws for a username that is not 2 to 40 lowercase letters, digits and underscores, starting with a letter. */
export function signin(username: string): void {
  if (! /^[a-z][\d_a-z]{1,39}$/u.test(username)) { throw new Error('A username is 2 to 40 lowercase letters, digits and underscores, starting with a letter.') }
  const accountCkey = accountCkeyOf(username)
  const userid = localStorage.getItem(accountCkey) ?? `user_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
  localStorage.setItem(accountCkey, userid)
  signedIn.current = Object.freeze({ userid, username })
  localStorage.setItem(SessionCkey, JSON.stringify(signedIn.current))
  for (const listener of listeners) { listener() }
}

// The giver serves one user for the page's life: another user starts on a fresh page.
/** Sign out, and reload the page. The vault stays saved for the next sign-in. */
export function signOut(): void {
  localStorage.removeItem(SessionCkey)
  globalThis.location.reload()
}

/** The session saved in localStorage, or null for none or one that does not parse. */
function sessionSaved(): Session | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SessionCkey) ?? 'null') as Partial<Session> | null
    if ((typeof saved?.userid === 'string') && (typeof saved.username === 'string')) { return Object.freeze({ userid: saved.userid, username: saved.username }) }
  } catch {
    // A mangled session reads as signed out.
  }
  return null
}
