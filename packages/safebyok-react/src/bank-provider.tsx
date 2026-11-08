import { createContext, useContext, useEffectEvent, useLayoutEffect, useState } from 'react'
import { Bank, DefaultOnBadNews, DefaultOnPanic, type Vault } from 'safebyok'
import { GatingModal } from './gating-modal'
import { useDeviceId, useGatingDialog, useWarnOfIgnoredOpts } from './provider-hooks'
import { providerProps, type BankProviderProps, type Handlers, type HeldBankOpts } from './shapes/shapes-provider'

// == [Context]: ContextValue, BankContext, Bankless, useProvided

/** What the provider hands down: the signed-in user's bank, and the Vault objects a hook has called `tryHello` on. */
export type ContextValue = { bank: Bank | null, helloedVaults: WeakSet<Vault> }

const BankContext = createContext<ContextValue | null>(null)

/** What a provider hands down while it holds no bank. */
const Bankless: ContextValue = Object.freeze({ bank: null, helloedVaults: new WeakSet<Vault>() })

/** What the nearest BankProvider hands down, or a throw naming `hookname` where there is none. */
export const useProvided = (hookname: string): ContextValue => {
  const provided = useContext(BankContext)
  if (provided === null) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return provided
}
// --

// == [Holding]: useHeldBank

/** The bank made from the first render's `opts` once `device_id` is known, and held until unmount. */
const useHeldBank = (opts: HeldBankOpts, device_id: string | null, handlers: Handlers, onSwept: () => void): ContextValue => {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the bank lives only between this effect and its cleanup, and render must hand it down
    setContextValue({ bank, helloedVaults: new WeakSet<Vault>() })
    // A refused `tryHello` lands in the bank's snapshot, which useBankSnapshot renders.
    void bank.tryHello()
    return () => {
      // `sweep()` settles the open gating, and `onSwept` closes the dialog over it.
      bank.sweep()
      onSwept()
      setContextValue(Bankless)
    }
  }, [madeFrom, device_id, onSwept])

  useWarnOfIgnoredOpts(contextValue.bank, madeFrom, opts)
  return contextValue
}
// --

// == [BankProvider]: BankProvider, UserBankProvider

/** Hand the hooks a bank for each `applabel` and signed-in `user_id`, or none while nobody is signed in. */
export const BankProvider = (props: BankProviderProps) => {
  const { applabel, user_id, deviceDB } = providerProps.parse(props, { where: 'BankProvider' })
  const device_id = useDeviceId(deviceDB, applabel, user_id)
  // Keyed by the user, not the device: the host's app remounts when the user changes, so nothing typed
  // carries over to the next one, and stays put while the device_id arrives.
  return <UserBankProvider key={JSON.stringify([applabel, user_id])} {...props} device_id={device_id} />
}

/** Hold one user's bank once the device is named, and show the dialog for its gatings. */
const UserBankProvider = (props: BankProviderProps & { device_id: string | null }) => {
  const dialog = useGatingDialog()
  const { passphraseUsername, passphraseAdvice, passkeyRpId, children, device_id, onPanic = DefaultOnPanic, onBadNews = DefaultOnBadNews, requestCleartext = dialog.ask, ...bankish } = props
  const contextValue = useHeldBank(bankish, device_id, { onPanic, onBadNews, requestCleartext }, dialog.endAny)
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
