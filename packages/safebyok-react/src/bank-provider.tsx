import { createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { Bank, DefaultOnBadNews, DefaultOnPanic, tellBadNewsTo, type Vault, type VaultError } from 'safebyok'
import { GatingModal } from './gating-modal'
import { useDeviceId, useGatingDialog, useWarnOfIgnoredOpts } from './provider-hooks'
import { providerProps, type BankProviderProps, type Handlers, type HeldBankOpts } from './shapes/shapes-provider'

// == [Context]: ContextValue, BankContext, Bankless, useProvided

/** What the provider hands down: the signed-in user's bank, the Vault objects a hook has called `tryHello` on, and how to tell the host's `onBadNews`. */
export type ContextValue = { bank: Bank | null, helloedVaults: WeakSet<Vault>, tellBadNews: TellBadNews }

/** Tell the host's `onBadNews` each refusal no caller waits on, while the bank is enabled. Never throws. */
export type TellBadNews = (badnews: readonly VaultError[]) => void

const BankContext = createContext<ContextValue | null>(null)

const tellNobody: TellBadNews = () => { /* no bank, no news */ }

/** What a provider hands down while it holds no bank. */
const Bankless: ContextValue = Object.freeze({ bank: null, helloedVaults: new WeakSet<Vault>(), tellBadNews: tellNobody })

/** What the nearest BankProvider hands down, or a throw naming `hookname` where there is none. */
export const useProvided = (hookname: string): ContextValue => {
  const provided = useContext(BankContext)
  if (provided === null) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return provided
}
// --

// == [Holding]: useHeldBank

/** The bank made from the first render's `opts` once `device_id` is known, and held until unmount. */
const useHeldBank = (opts: HeldBankOpts, device_id: string | null, handlers: Handlers, onSwept: () => void, onMade: (bank: Bank) => void): ContextValue => {
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
      onPanic:          (panic) => latest().onPanic(panic),
      onBadNews:        (badnews) => latest().onBadNews(badnews),
      requestCleartext: (gating) => latest().requestCleartext(gating),
    })
    // Hears nothing past the bank's sweep or vacate, as the bank calls none of the host's handlers then.
    const tellBadNews: TellBadNews = (badnews) => {
      if (bank.isEnabled) { tellBadNewsTo((told) => latest().onBadNews(told), bank, badnews) }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the bank lives only between this effect and its cleanup, and render must hand it down
    setContextValue({ bank, helloedVaults: new WeakSet<Vault>(), tellBadNews })
    onMade(bank)
    // A refused hello lands in the bank's snapshot too. One that a sweep crossed is no news: the bank has ended.
    void bank.tryHello().then((said) => { if (! said.ok) { tellBadNews([said.err]) } })
    return () => {
      // `sweep()` settles the open gating, and `onSwept` closes the dialog over it.
      bank.sweep()
      onSwept()
      setContextValue(Bankless)
    }
  }, [madeFrom, device_id, onSwept, onMade])

  useWarnOfIgnoredOpts(contextValue.bank, madeFrom, opts)
  return contextValue
}
// --

// == [BankProvider]: BankProvider, UserBankProvider

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

/** Hold one user's bank once the device is named, and show the dialog for its gatings. */
const UserBankProvider = (props: BankProviderProps & { device_id: string | null, onMade: (bank: Bank) => void }) => {
  const dialog = useGatingDialog()
  const { passphraseUsername, passphraseAdvice, passkeyRpId, children, device_id, onMade, onPanic = DefaultOnPanic, onBadNews = DefaultOnBadNews, requestCleartext = dialog.ask, ...bankish } = props
  const contextValue = useHeldBank(bankish, device_id, { onPanic, onBadNews, requestCleartext }, dialog.endAny, onMade)
  const { showing } = dialog

  return (
    <BankContext.Provider value={contextValue}>
      {children}
      {showing !== null && (
        <GatingModal
          key={dialog.round}
          gating={showing.gating}
          leaseMillis={contextValue.bank?.leaseMillis}
          passphraseUsername={passphraseUsername}
          passphraseAdvice={passphraseAdvice}
          passkeyRpId={passkeyRpId}
          onDone={() => { dialog.endShowing(showing) }}
        />
      )}
    </BankContext.Provider>
  )
}
// --
