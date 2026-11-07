import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Bank, MinuteMillis, type AnyGating, type BadNewsHandler, type BankOpts, type RequestCleartext, type Vault } from 'safebyok'
import { GatingModal } from './gating-modal'
import type { PassphraseAdvice } from './modal'

// == [Provided]: Provided, BankContext, NoneHeld, useProvided

/** What the provider hands down: the signed-in user's bank, and the vaults a hook has said hello to. */
export type Provided = { bank: Bank | null, helloedVaults: WeakSet<Vault> }

const BankContext = createContext<Provided | null>(null)

/** What a provider hands down while it holds no bank. */
const NoneHeld: Provided = Object.freeze({ bank: null, helloedVaults: new WeakSet<Vault>() })

/** What the nearest BankProvider hands down, or a throw naming `hookname` where there is none. */
export const useProvided = (hookname: string): Provided => {
  const provided = useContext(BankContext)
  if (provided === null) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return provided
}
// --

// == [BankProvider]: BankProviderProps, BankProvider, hasUserGesture, AutolockEveryMillis

/** How often the provider asks its bank to lock each vault whose autolock has passed. */
const AutolockEveryMillis = MinuteMillis

/** Whether the user's gesture is still in hand, so a dialog may be shown: true where the browser does not say. */
const hasUserGesture = (): boolean => (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation?.isActive !== false

/** Every Bank.make option but `user_id` and `requestCleartext`, which the provider takes its own way, and two for its dialogs. */
export type BankProviderProps = Omit<BankOpts, 'user_id' | 'requestCleartext'> & {
  /** The signed-in user from the host's auth, or null when nobody is: then the provider holds no bank. */
  user_id:             string | null
  /** What asks the user for a passphrase or passkey: left out, the provider's own dialogs; null, none, each ask declined. */
  requestCleartext?:   RequestCleartext | null | undefined
  /** What a password manager files a vault's passphrase under. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. Default: the bank's strength checker's reason. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  children:            ReactNode
}

/** Make the signed-in user's bank, say hello, and hand it down to the hooks; its dialogs ask the user only on their gesture. */
export const BankProvider = ({ user_id, requestCleartext, passphraseUsername, passphraseAdvice, children, ...opts }: BankProviderProps) => {
  const { applabel, device_id, vaultDB, deviceDB, keyDeriver, strengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews, onPanic, ...unlisted } = opts
  // Each prop Bank.make does not take, by name, handed on to it so it is refused to the error
  // boundary rather than dropped here unseen.
  const unlistedJson = JSON.stringify(Object.keys(unlisted))
  /** One showing of the dialog: which one, the gating it answers, and how it closes. */
  type Showing = { round: number, gating: AnyGating, close: () => void }

  // The dialog showing now, if any. The ref is what the callbacks read, so that a dialog's answer
  // reaches its own ask and no newer one's; the state renders it.
  const [showing, setShowing] = useState<Showing | null>(null)
  const showingRef = useRef<Showing | null>(null)
  // Counts the dialog's showings, so that each is a fresh dialog with nothing kept from the last.
  const showingRounds = useRef(0)

  // The host's onBadNews as of the last commit, called through a teller that keeps its identity,
  // so a handler written inline makes no new bank. Left out, the bank's own logger hears it.
  const badNewsRef = useRef(onBadNews)
  useEffect(() => { badNewsRef.current = onBadNews })
  const hasBadNewsHandler = onBadNews !== undefined

  /** Close `ending` if it is still the dialog showing, and resolve its ask: a gating still open then is declined. */
  const endShowing = useCallback((ending: Showing) => {
    if (showingRef.current === ending) {
      showingRef.current = null
      setShowing(null)
    }
    ending.close()
  }, [])

  // The provider's own requestCleartext: the dialog for the gating's kind, shown only while the
  // user's gesture is in hand. A bank opens one gating at a time, but the last one's dialog may
  // not have answered yet: it is ended here, so its ask resolves rather than waiting on a dialog
  // that will never mount again.
  const askByDialog = useCallback((gating: AnyGating) => new Promise<void>((close) => {
    if (! hasUserGesture()) { close(); return }
    if (showingRef.current !== null) { endShowing(showingRef.current) }
    showingRounds.current += 1
    const next = { round: showingRounds.current, gating, close: () => { close() } }
    showingRef.current = next
    setShowing(next)
  }), [endShowing])

  // The host's requestCleartext as of the last commit, held as onBadNews is.
  const hostAskerRef = useRef(requestCleartext)
  useEffect(() => { hostAskerRef.current = requestCleartext })
  const askUser = useCallback(async (gating: AnyGating) => {
    const hosts = hostAskerRef.current
    if (hosts === undefined) { await askByDialog(gating); return }
    if (hosts !== null) { await hosts(gating) }
  }, [askByDialog])

  // The bank the provider holds now, the signed-in user's, made and swept by the effect below.
  const [held, setHeld] = useState<Provided>(NoneHeld)
  // Handed down only while it is the signed-in user's: in the render where the user_id changes,
  // before the effect sweeps the last bank, the hooks see no bank rather than the last user's.
  const provided = held.bank !== null && held.bank.user_id === user_id ? held : NoneHeld

  useEffect(() => {
    if (user_id === null) { return }
    const refusable = Object.fromEntries((JSON.parse(unlistedJson) as string[]).map((ckey) => [ckey, undefined]))
    // Once swept, the bank tells and asks no one: the handler now may be the next user's.
    const kept = { held: true }
    const tellWhileHeld: BadNewsHandler = (news) => (kept.held ? badNewsRef.current?.(news) : undefined)
    const askWhileHeld: RequestCleartext = async (gating) => { if (kept.held) { await askUser(gating) } }
    // `satisfies` fails the build if a Bank.make option is ever added and not passed through.
    const bankOpts = {
      ...refusable, applabel, user_id, device_id, vaultDB, deviceDB, keyDeriver, strengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onPanic,
      onBadNews: hasBadNewsHandler ? tellWhileHeld : undefined,
      requestCleartext: askWhileHeld,
    } satisfies Record<keyof BankOpts, unknown>
    // A refused option throws from here to the nearest error boundary.
    const bank = Bank.make(bankOpts)
    // The effect owns the bank, making it and sweeping it, so a re-run effect (StrictMode's, a hidden
    // Activity shown again) makes a fresh one; the render reads the bank the effect holds now.
    setHeld({ bank, helloedVaults: new WeakSet<Vault>() })
    // A refused hello lands in the bank's snapshot, which useBankSnapshot renders.
    void bank.tryHello()
    // The core sets no timers: the provider asks for each autolock on its own.
    const autolocking = setInterval(() => { void bank.autolock() }, AutolockEveryMillis)
    return () => {
      kept.held = false
      clearInterval(autolocking)
      // A sweep settles the open gating, and the dialog over it closes.
      bank.sweep()
      if (showingRef.current !== null) { endShowing(showingRef.current) }
      setHeld(NoneHeld)
    }
  }, [user_id, applabel, device_id, vaultDB, deviceDB, keyDeriver, strengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onPanic, hasBadNewsHandler, unlistedJson, askUser, endShowing])

  return (
    <BankContext.Provider value={provided}>
      {children}
      {showing !== null && (
        <GatingModal
          key={showing.round}
          gating={showing.gating}
          leaseMillis={provided.bank?.leaseMillis}
          passphraseUsername={passphraseUsername}
          passphraseAdvice={passphraseAdvice}
          onDone={() => { endShowing(showing) }}
        />
      )}
    </BankContext.Provider>
  )
}
// --
