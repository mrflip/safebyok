import { createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Bank, DefaultOnBadNews, DefaultOnLifecycle, tellBadNewsTo, type Vault } from 'safebyok'
import { bankProviderProps } from '../shapes'
import type { BankProviderProps, ContextValue, GatingModalProps, Handlers, ProviderBankOpts, TellBadNews } from '../shapes'
import { GatingModal } from './gating-modal'
import { useDeviceId, useWarnOfIgnoredOpts } from './provider-hooks'

// == [Context]: ContextValue, BankContext, Bankless, useProvided

const BankContext = createContext<ContextValue | null>(null)

const tellNobody: TellBadNews = () => { /* no bank, no news */ }

/** The context value while the provider has no bank. */
const Bankless: ContextValue = Object.freeze({ bank: null, helloedVaults: new WeakSet<Vault>(), tellBadNews: tellNobody })

/** Return the nearest BankProvider's context value. Throws an error naming `hookname` when there is no provider above. */
export const useProvided = (hookname: string): ContextValue => {
  const provided = useContext(BankContext)
  if (provided === null) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return provided
}
// --

// == [The provider's bank]: useProviderBank

/** Make the provider's bank from the first render's `opts` once `device_id` is known, and keep it until unmount.
 * Returns the context value for it. Later changes to `opts` are ignored.
 */
const useProviderBank = (opts: ProviderBankOpts, device_id: string | null, handlers: Handlers, isHostAsking: boolean, onMade: (bank: Bank) => void): ContextValue => {
  const [madeFrom] = useState(opts)
  const [contextValue, setContextValue] = useState<ContextValue>(Bankless)

  // The bank is made once but always calls the latest handlers, so a host may pass inline arrow functions.
  /** Return the handlers from the latest render. */
  const latest = useEffectEvent(() => handlers)

  // This effect owns the bank: it makes the bank, and its cleanup sweeps it. When the effect runs again
  // (under StrictMode, or when a hidden Activity is shown again) it makes a fresh bank. It is a layout
  // effect so that the bank exists before the first paint.
  useLayoutEffect(() => {
    const { user_id } = madeFrom
    if (user_id === null || device_id === null) { return }
    const bank = Bank.make({
      ...madeFrom, user_id, device_id,
      onLifecycle:      (event) => latest().onLifecycle(event),
      onBadNews:        (badnews) => latest().onBadNews(badnews),
      requestCleartext: isHostAsking ? (gating) => latest().requestCleartext?.(gating) : undefined,
    })
    // Does nothing after the bank is swept or vacated. The bank itself calls none of the host's handlers by then.
    const tellBadNews: TellBadNews = (badnews) => {
      if (bank.isEnabled) { tellBadNewsTo((told) => latest().onBadNews(told), bank, badnews) }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the bank exists only between this effect and its cleanup, and render must pass it to the context
    setContextValue({ bank, helloedVaults: new WeakSet<Vault>(), tellBadNews })
    onMade(bank)
    // Not awaited: the bank reports the hello to onLifecycle.
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

/** Provide the hooks below it with the signed-in user's bank, or with no bank while `user_id` is null.
 * It also shows the built-in passphrase and passkey dialogs, unless `requestCleartext` is given.
 */
export const BankProvider = (props: BankProviderProps) => {
  const { applabel, user_id, deviceDB } = bankProviderProps.parse(props, { where: 'BankProvider' })
  const device_id = useDeviceId(deviceDB, applabel, user_id)
  const userkey = JSON.stringify([applabel, user_id])

  // When a different user signs in, the previous user's bank is vacated here. It is not done in the bank's
  // cleanup, because an unmount, a hot reload or a hidden Activity runs that cleanup too. A null user_id
  // vacates nothing: auth may briefly report null while it refreshes, so the host vacates at sign-out.
  // The userkey tag makes sure the next user's own bank is not vacated by mistake.
  /** The last bank made, tagged with its user. */
  const lastBank = useRef<{ userkey: string, bank: Bank } | null>(null)
  const onMade = useCallback((bank: Bank) => { lastBank.current = { userkey: JSON.stringify([bank.applabel, bank.user_id]), bank } }, [])
  useEffect(() => {
    const last = lastBank.current
    if (user_id === null || last === null || last.userkey === userkey) { return }
    lastBank.current = null
    void last.bank.vacate()
  }, [user_id, userkey])

  // Keyed by user, not by device. The host's app remounts when the user changes, so nothing typed carries
  // over to the next user. It does not remount when the device_id arrives.
  return <UserBankProvider key={userkey} {...props} device_id={device_id} onMade={onMade} />
}

/** Render the dialog for `bank`'s open gating, or nothing when no gating is open. */
const OpenGatingDialog = ({ bank, ...dialogProps }: Pick<GatingModalProps, 'passphraseUsername' | 'passkeyRpId'> & { bank: Bank }) => {
  const { openGating } = useSyncExternalStore(bank.subscribe, bank.getSnapshot)
  if (openGating === null) { return null }
  // No key is needed here: each dialog keys its form by its gating's `gatingTok`.
  return <GatingModal gating={openGating} leaseMillis={bank.leaseMillis} {...dialogProps} />
}

/** Provide one user's bank once its `device_id` is known, and render the dialog for its open gating. */
const UserBankProvider = (props: BankProviderProps & { device_id: string | null, onMade: (bank: Bank) => void }) => {
  const { passphraseUsername, passkeyRpId, children, device_id, onMade, onLifecycle = DefaultOnLifecycle, onBadNews = DefaultOnBadNews, requestCleartext, ...bankish } = props
  // The bank is made once, so this is fixed at the first render, like the bank's other options.
  /** True when the host's `requestCleartext` handles this bank's gatings, in place of the built-in dialogs. */
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
