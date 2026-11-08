import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Bank, MinuteMillis, type AnyGating, type BadNewsHandler, type BankOpts, type PanicHandler, type RequestCleartext, type Vault } from 'safebyok'
import { brandedDeviceDB } from 'safebyok/storage'
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

// == [BankProvider]: BankProviderProps, BankProvider, hasUserGesture, AutolockEveryMillis, misusedHandler, fixedPropsOf

/** How often the provider asks its bank to lock each vault whose autolock has passed. */
const AutolockEveryMillis = MinuteMillis

/** Whether the user's gesture is still in hand, so a dialog may be shown: true where the browser does not say. */
const hasUserGesture = (): boolean => (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation?.isActive !== false

// The types say a handler is a function or none, so a misused one is typed as the handler it is not:
// Bank.make refuses it.
/** A handler prop that is not a function, for Bank.make to refuse; undefined for a function. */
const misusedHandler = <HandlerT,>(given: HandlerT | null | undefined): HandlerT | undefined => (typeof given === 'function' ? undefined : given as HandlerT | undefined)

/** What BankProvider is handed: the Bank.make options but the device's, the signed-in `user_id`, and the dialogs' props. */
export type BankProviderProps = Omit<BankOpts, 'user_id' | 'device_id' | 'requestCleartext'> & {
  /** The signed-in user from the host's auth, or null when nobody is: then the provider holds no bank. */
  user_id:             string | null
  /** What asks the user for a passphrase or passkey: the provider's own dialogs when left out, none when null. */
  requestCleartext?:   RequestCleartext | null | undefined
  /** What a password manager files a vault's passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  /** The relying party the vault's passkey is made and asked under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
  children:            ReactNode
}

/** The props the provider reads only as it makes its bank, as `props` has them; a handler counts only as there or not. */
const fixedPropsOf = (props: BankProviderProps) => {
  const { vaultDB, deviceDB, keyDeriver, strengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews, onPanic } = props
  // `satisfies` fails the build if a Bank.make option is ever added and not compared here.
  return { vaultDB, deviceDB, keyDeriver, strengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews: typeof onBadNews === 'function', onPanic: typeof onPanic === 'function' } satisfies Record<keyof Omit<BankOpts, 'applabel' | 'user_id' | 'device_id' | 'requestCleartext'>, unknown>
}

/** Make the signed-in user's bank, once per `applabel` and `user_id`, say hello, and hand it down to the hooks. */
export const BankProvider = (props: BankProviderProps) => {
  const { applabel, user_id, passphraseUsername, passphraseAdvice, passkeyRpId, children } = props
  /** One showing of the dialog: which one, the gating it answers, and how it closes. */
  type Showing = { round: number, gating: AnyGating, close: () => void }
  /** The props the provider reads only as it makes its bank. */
  type FixedProps = ReturnType<typeof fixedPropsOf>

  // The props as of the last commit. The bank is made from them, and calls the host's handlers
  // through them, so a handler written inline is called as it was last rendered.
  const latestProps = useRef(props)
  useEffect(() => { latestProps.current = props })

  // The dialog showing now, if any. The ref is what the callbacks read, so that a dialog's answer
  // reaches its own ask and no newer one's; the state renders it.
  const [showing, setShowing] = useState<Showing | null>(null)
  const showingRef = useRef<Showing | null>(null)
  // Counts the dialog's showings, so that each is a fresh dialog with nothing kept from the last.
  const showingRounds = useRef(0)

  /** Close `ending` if it is still the dialog showing, and resolve its ask. */
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

  const askUser = useCallback(async (gating: AnyGating) => {
    const hosts = latestProps.current.requestCleartext
    if (hosts === undefined) { await askByDialog(gating); return }
    if (hosts !== null) { await hosts(gating) }
  }, [askByDialog])

  // The props the held bank was made with, and whether a later change to any was warned of yet.
  const madeWith = useRef<FixedProps | null>(null)
  const toldOfIgnored = useRef(false)

  // A refusal met as the bank was made, which the render throws to the nearest error boundary.
  const [refused, setRefused] = useState<{ err: unknown } | null>(null)

  // The bank the provider holds now, the signed-in user's, made and swept by the effect below.
  const [held, setHeld] = useState<Provided>(NoneHeld)
  // Handed down only while it is of this scope: in the render where the user_id or applabel changes,
  // before the effect sweeps the last bank, the hooks see no bank rather than the last scope's.
  const provided = held.bank !== null && held.bank.user_id === user_id && held.bank.applabel === applabel ? held : NoneHeld

  useEffect(() => {
    if (user_id === null) { return }
    const making = latestProps.current
    const { requestCleartext, onBadNews, onPanic, passphraseUsername: _username, passphraseAdvice: _advice, passkeyRpId: _rpId, children: _children, user_id: _user_id, applabel: _applabel, ...passedOpts } = making
    // Once swept, the bank tells and asks no one: the handler now may be the next user's.
    const kept = { held: true }
    // A handler dropped since the making falls back to the one the bank was made with, so a bank made
    // with a handler has one for its whole life: the core vacates a vault only for a bank with none.
    const tellWhileHeld: BadNewsHandler = (badnews) => {
      if (! kept.held) { return }
      const latest = latestProps.current.onBadNews
      const hearing = typeof latest === 'function' ? latest : onBadNews
      hearing?.(badnews)
    }
    const askWhileHeld: RequestCleartext = async (gating) => { if (kept.held) { await askUser(gating) } }
    // The core reports a panic handler's throw to the platform: a let-go bank's panic goes there, and
    // never to the next user's handler.
    const panicWhileHeld: PanicHandler = async (panic) => {
      if (! kept.held) { throw panic.refusal }
      const latest = latestProps.current.onPanic
      const hearing = typeof latest === 'function' ? latest : onPanic
      await hearing?.(panic)
    }
    const misusedBadNews = misusedHandler(onBadNews)
    const misusedPanic = misusedHandler(onPanic)
    const misusedAsker = requestCleartext === null ? undefined : misusedHandler(requestCleartext)
    let bank: Bank | null = null
    let autolocking: ReturnType<typeof setInterval> | undefined
    // A refusal from the deviceDB or Bank.make is thrown from the next render to the error boundary.
    const makeBank = async () => {
      try {
        const deviceDB = brandedDeviceDB.parse(making.deviceDB, { where: 'deviceDB' })
        const { device_id } = await deviceDB.ensureBank({ applabel, user_id })
        // Swept while the deviceDB answered: a sign-out, a new user, or StrictMode's second effect.
        if (! kept.held) { return }
        // Each prop Bank.make does not take is handed on as it came, for Bank.make to refuse.
        const made = Bank.make({
          ...passedOpts, applabel, user_id, device_id,
          onBadNews:        typeof onBadNews === 'function' ? tellWhileHeld : misusedBadNews,
          onPanic:          typeof onPanic === 'function' ? panicWhileHeld : misusedPanic,
          requestCleartext: misusedAsker ?? askWhileHeld,
        })
        bank = made
        madeWith.current = fixedPropsOf(making)
        setHeld({ bank: made, helloedVaults: new WeakSet<Vault>() })
        // A refused hello lands in the bank's snapshot, which useBankSnapshot renders.
        void made.tryHello()
        // The core sets no timers: the provider asks for each autolock on its own.
        autolocking = setInterval(() => { void made.autolock() }, AutolockEveryMillis)
      } catch (err) {
        if (kept.held) { setRefused({ err }) }
      }
    }
    void makeBank()
    // The effect owns the bank, making it and sweeping it, so a re-run effect (StrictMode's, a hidden
    // Activity shown again) makes a fresh one; the render reads the bank the effect holds now.
    return () => {
      kept.held = false
      clearInterval(autolocking)
      // A sweep settles the open gating, and the dialog over it closes.
      bank?.sweep()
      if (showingRef.current !== null) { endShowing(showingRef.current) }
      setHeld(NoneHeld)
    }
  }, [applabel, user_id, askUser, endShowing])

  // A prop the bank was made with that has changed since is ignored, and said so once.
  useEffect(() => {
    const { bank } = provided
    const made = madeWith.current
    if (bank === null || made === null || toldOfIgnored.current) { return }
    const now = fixedPropsOf(latestProps.current)
    const changed = (Object.keys(made) as (keyof FixedProps)[]).filter((ckey) => ! Object.is(made[ckey], now[ckey]))
    if (changed.length === 0) { return }
    toldOfIgnored.current = true
    bank.logger.warn(`BankProvider ignored a change to its ${changed.join(' and ')}: it makes its bank once per applabel and user_id, from the props it has then. Define each prop once, outside the component, or memoize it; to make a fresh bank, give the <BankProvider> a new key.`, { call: 'BankProvider', props: changed })
  })

  if (refused !== null) { throw refused.err }

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
          passkeyRpId={passkeyRpId}
          onDone={() => { endShowing(showing) }}
        />
      )}
    </BankContext.Provider>
  )
}
// --
