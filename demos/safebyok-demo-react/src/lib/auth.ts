import { EpochMillis, label, wallClock, type Clock, type StringStore } from 'safebyok'

/**
 * SCAFFOLDING a real host application replaces with its own auth (Google sign-in, Clerk, Convex
 * auth...). What the vault layer needs from auth is only what Session carries: a stable opaque
 * user_id and a display userlabel. The demo fakes the rest: typing a userlabel signs you in,
 * creating the account on first sight.
 */
export type Session = {
  user_id:   string
  userlabel: string
}

/** The demo's account row, in the pretend-remote database beside the vault rows. */
type Account = {
  user_id:       string
  userlabel:     string
  registered_at: number
}

export type Auth = {
  /** Current session or null; same object until it changes (useSyncExternalStore-ready). */
  getSnapshot: () => Session | null
  subscribe: (listener: () => void) => () => void
  /** Sign in as `userlabel`, creating the account on first sight. */
  signIn(userlabel: string): Promise<Session>
  /** End the session on this device. Touches no server-side data. */
  signOut(): void
  /** Delete the signed-in account's row and end the session. Vault rows are the caller's to clean up first. */
  deleteAccount(): Promise<void>
}

/**
 * Fake auth over the demo's two stores: accounts live in the pretend-remote `dbStore` (a backend
 * would own them), the session lives in the on-device `deviceStore` (a cookie would). Not a
 * pattern for production -- there is no password and no verification, by design: the vault
 * passphrase is deliberately a separate thing from signing in.
 *
 * @param opts - `applabel`, namespacing the rows; `dbStore` and `deviceStore`, where they live;
 *   and `clock`, which stamps a new account's `registered_at` (default: the wall clock). Its
 *   reading is checked as the vault checks a host's clock: epoch milliseconds from 1981 to 2255,
 *   rounded down; any other refuses the sign-in that would stamp it.
 *
 * @example
 *   const auth = createAuth({ applabel: 'acme', dbStore, deviceStore })
 *   const session = await auth.signIn('margo')  // { user_id: 'user_3f...', userlabel: 'margo' }
 */
export const createAuth = (opts: { applabel: string, dbStore: StringStore, deviceStore: StringStore, clock?: Clock | undefined }): Auth => {
  const { applabel, dbStore, deviceStore, clock = wallClock } = opts
  const accountCkey = (userlabel: string) => `account:${applabel}:${userlabel}`
  const sessionCkey = `session:${applabel}`

  /** A new account for `userlabel`, stamped with the clock's reading; null when that is no time the vault would accept. */
  const newAccount = (userlabel: string): Account | null => {
    const reading = EpochMillis.safeParse(Math.floor(clock.now()))
    return reading.success ? { user_id: randomId(), userlabel, registered_at: reading.data } : null
  }

  let session: Session | null = readSession()
  const listeners = new Set<() => void>()
  const bump = () => { listeners.forEach((listener) => { listener() }) }

  function readSession(): Session | null {
    const text = deviceStore.read(sessionCkey)
    if (text === null) { return null }
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && 'user_id' in parsed && 'userlabel' in parsed) {
        return parsed as Session
      }
    } catch { /* fall through: a mangled session reads as signed out */ }
    deviceStore.erase(sessionCkey)
    return null
  }

  return {
    getSnapshot: () => session,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    signIn: (userlabel) => {
      const checked = label.safeParse(userlabel)
      if (! checked.success) {
        return Promise.reject(new Error('A username is 2 to 40 lowercase letters and digits, joined by single underscores, starting with a letter.'))
      }
      const ckey = accountCkey(checked.data)
      const existing = dbStore.read(ckey)
      const account = existing === null ? newAccount(checked.data) : JSON.parse(existing) as Account
      if (account === null) {
        return Promise.reject(new Error("The demo's clock read no time between 1981 and 2255, in epoch milliseconds: check what it was handed."))
      }
      if (existing === null) { dbStore.write(ckey, JSON.stringify(account)) }
      session = { user_id: account.user_id, userlabel: account.userlabel }
      deviceStore.write(sessionCkey, JSON.stringify(session))
      bump()
      return Promise.resolve(session)
    },

    signOut: () => {
      session = null
      deviceStore.erase(sessionCkey)
      bump()
    },

    deleteAccount: () => {
      if (session === null) { return Promise.resolve() }
      dbStore.erase(accountCkey(session.userlabel))
      session = null
      deviceStore.erase(sessionCkey)
      bump()
      return Promise.resolve()
    },
  }
}

/** Opaque id from the platform CSPRNG: sixteen hex characters under a `user_` prefix. */
const randomId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return 'user_' + [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
