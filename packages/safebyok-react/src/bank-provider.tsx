import { createContext, useContext, useEffect, useEffectEvent, useState } from 'react'
import { Bank, DefaultOnBadNews, DefaultOnPanic, type BankOpts, type Vault } from 'safebyok'
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

// == [Making]: makeBank

/** A bank for the user in `opts` on this device, calling none of the host's handlers once it is disabled. */
const makeBank = (opts: BankOpts): Bank => {
  const { onPanic = DefaultOnPanic, onBadNews = DefaultOnBadNews, requestCleartext } = opts
  const bank: Bank = Bank.make({
    ...opts,
    // Once disabled, the bank calls none of the host's handlers: the page may be the next user's by then.
    // A disabled bank's panic goes to the platform, as a handler's throw does.
    onPanic:          (panic) => { if (! bank.isEnabled) { throw panic.refusal } return onPanic(panic) },
    onBadNews:        (badnews) => (bank.isEnabled ? onBadNews(badnews) : undefined),
    requestCleartext: async (gating) => { if (bank.isEnabled) { await requestCleartext(gating) } },
  })
  return bank
}
// --

// == [Holding]: useHeldBank

/** The bank made from the first render's `opts` and held until unmount. */
const useHeldBank = (opts: HeldBankOpts, handlers: Handlers, onSwept: () => void): ContextValue => {
  const [madeFrom] = useState(opts)
  const [contextValue, setContextValue] = useState<ContextValue>(Bankless)

  // The bank is made once, but calls each handler as last rendered, so a host may pass an inline arrow.
  /** The handlers as last rendered. */
  const latest = useEffectEvent(() => handlers)

  // The effect owns the bank: it makes it and sweeps it. A re-run effect (StrictMode's, or a hidden
  // Activity's shown again) makes a fresh one.
  useEffect(() => {
    const bank = makeBank({
      ...madeFrom,
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
  }, [madeFrom, onSwept])

  useWarnOfIgnoredOpts(contextValue.bank, madeFrom, opts)
  return contextValue
}
// --

// == [BankProvider]: BankProvider, UserBankProvider

/** Hand the hooks a bank for each `applabel` and signed-in `user_id`, or none while nobody is signed in. */
export const BankProvider = (props: BankProviderProps) => {
  const { applabel, user_id, deviceDB, children } = providerProps.parse(props, { where: 'BankProvider' })
  const device_id = useDeviceId(deviceDB, applabel, user_id)
  if (user_id === null || device_id === null) { return <BankContext.Provider value={Bankless}>{children}</BankContext.Provider> }
  return <UserBankProvider key={JSON.stringify([applabel, user_id])} {...props} user_id={user_id} device_id={device_id} />
}

/** Hold one signed-in user's bank from mount to unmount, and show the dialog for its gatings. */
const UserBankProvider = (props: BankProviderProps & { user_id: string, device_id: string }) => {
  const dialog = useGatingDialog()
  const { passphraseUsername, passphraseAdvice, passkeyRpId, children, onPanic = DefaultOnPanic, onBadNews = DefaultOnBadNews, requestCleartext = dialog.ask, ...bankish } = props
  const contextValue = useHeldBank(bankish, { onPanic, onBadNews, requestCleartext }, dialog.endAny)
  const { showing } = dialog

  return (
    <BankContext.Provider value={contextValue}>
      {children}
      {showing !== null && (
        <GatingModal
          key={showing.round}
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
