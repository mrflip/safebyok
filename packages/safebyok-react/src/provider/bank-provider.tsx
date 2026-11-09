import { createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Bank, DefaultOnBadNews, DefaultOnLifecycle, tellBadNewsTo, type Vault } from 'safebyok'
import { providerProps } from '../shapes'
import type { BankProviderProps, ContextValue, GatingModalProps, Handlers, ProviderBankOpts, TellBadNews } from '../shapes'
import { GatingModal } from './gating-modal'
import { useDeviceId, useWarnOfIgnoredOpts } from './provider-hooks'

// == [Context]: ContextValue, BankContext, Bankless, useProvided

const BankContext = createContext<ContextValue | null>(null)

const tellNobody: TellBadNews = () => { /* no bank, no news */ }

/** What a provider hands down while it has no bank. */
const Bankless: ContextValue = Object.freeze({ bank: null, helloedVaults: new WeakSet<Vault>(), tellBadNews: tellNobody })

/** What the nearest BankProvider hands down, or a throw naming `hookname` where there is none. */
export const useProvided = (hookname: string): ContextValue => {
  const provided = useContext(BankContext)
  if (provided === null) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return provided
}
// --

// == [The provider's bank]: useProviderBank

/** The bank made from the first render's `opts` once `device_id` is known, and kept until unmount. */
const useProviderBank = (opts: ProviderBankOpts, device_id: string | null, handlers: Handlers, isHostAsking: boolean, onMade: (bank: Bank) => void): ContextValue => {
  const [madeFrom] = useState(opts)
  const [contextValue, setContextValue] = useState<ContextValue>(Bankless)

  // The bank is made once, but calls each handler as last rendered, so a host may pass an inline arrow.
  /** The handlers as last rendered. */
  const latest = useEffectEvent(() => handlers)

  // The effect owns the bank: it makes it and sweeps it. A re-run effect (StrictMode's, or a hidden
  // Activity's shown again) makes a fresh one. A layout effect runs before paint, so no frame shows the
  // provider without its bank.
  useLayoutEffect(() => {
    const { user_id } = madeFrom
    if (user_id === null || device_id === null) { return }
    const bank = Bank.make({
      ...madeFrom, user_id, device_id,
      onLifecycle:      (event) => latest().onLifecycle(event),
      onBadNews:        (badnews) => latest().onBadNews(badnews),
      requestCleartext: isHostAsking ? (gating) => latest().requestCleartext?.(gating) : undefined,
    })
    // Hears nothing past the bank's sweep or vacate, as the bank calls none of the host's handlers then.
    const tellBadNews: TellBadNews = (badnews) => {
      if (bank.isEnabled) { tellBadNewsTo((told) => latest().onBadNews(told), bank, badnews) }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the bank lives only between this effect and its cleanup, and render must hand it down
    setContextValue({ bank, helloedVaults: new WeakSet<Vault>(), tellBadNews })
    onMade(bank)
    // The bank tells onLifecycle of the hello and its snapshot of a refusal.
    void bank.tryHello()
    return () => {
      bank.sweep()
      setContextValue(Bankless)
    }
  }, [madeFrom, device_id, isHostAsking, onMade])

  useWarnOfIgnoredOpts(contextValue.bank, madeFrom, opts)
  return contextValue
}
// --

// == [BankProvider]: BankProvider, OpenGatingDialog, UserBankProvider

/** Hand the hooks a bank for each `applabel` and signed-in `user_id`, or none while nobody is signed in. */
export const BankProvider = (props: BankProviderProps) => {
  const { applabel, user_id, deviceDB } = providerProps.parse(props, { where: 'BankProvider' })
  const device_id = useDeviceId(deviceDB, applabel, user_id)
  const userkey = JSON.stringify([applabel, user_id])

  // Another user signing in vacates the last one's bank here, not in the bank's cleanup, which an unmount,
  // a hot reload or a hidden Activity runs too. A null user_id leaves it: auth may blink to null while it
  // refreshes, so the host vacates at sign-out. The tag keeps the next user's bank safe.
  /** The last bank made, tagged with its user. */
  const lastBank = useRef<{ userkey: string, bank: Bank } | null>(null)
  const onMade = useCallback((bank: Bank) => { lastBank.current = { userkey: JSON.stringify([bank.applabel, bank.user_id]), bank } }, [])
  useEffect(() => {
    const last = lastBank.current
    if (user_id === null || last === null || last.userkey === userkey) { return }
    lastBank.current = null
    void last.bank.vacate()
  }, [user_id, userkey])

  // Keyed by the user, not the device: the host's app remounts when the user changes, so nothing typed
  // carries over to the next one, and stays put while the device_id arrives.
  return <UserBankProvider key={userkey} {...props} device_id={device_id} onMade={onMade} />
}

/** The dialog for `bank`'s open gating, while it has one. */
const OpenGatingDialog = ({ bank, ...dialogProps }: Pick<GatingModalProps, 'passphraseUsername' | 'passkeyRpId'> & { bank: Bank }) => {
  const { openGating } = useSyncExternalStore(bank.subscribe, bank.getSnapshot)
  if (openGating === null) { return null }
  // No key: each dialog keys its form by its gating's `gatingTok`.
  return <GatingModal gating={openGating} leaseMillis={bank.leaseMillis} {...dialogProps} onDone={() => { openGating.dismiss() }} />
}

/** Keep one user's bank once the device is named, and show the dialog for its gatings. */
const UserBankProvider = (props: BankProviderProps & { device_id: string | null, onMade: (bank: Bank) => void }) => {
  const { passphraseUsername, passkeyRpId, children, device_id, onMade, onLifecycle = DefaultOnLifecycle, onBadNews = DefaultOnBadNews, requestCleartext, ...bankish } = props
  // The bank is made once, so whether the host's dialog asks is fixed at the first render, as the bank's other options are.
  /** True when the host's `requestCleartext` answers this bank's gatings. */
  const [isHostAsking] = useState(requestCleartext !== undefined)
  const contextValue = useProviderBank(bankish, device_id, { onLifecycle, onBadNews, requestCleartext }, isHostAsking, onMade)
  const { bank } = contextValue

  return (
    <BankContext.Provider value={contextValue}>
      {children}
      {(bank !== null) && (! isHostAsking) && (
        <OpenGatingDialog bank={bank} passphraseUsername={passphraseUsername} passkeyRpId={passkeyRpId} />
      )}
    </BankContext.Provider>
  )
}
// --
