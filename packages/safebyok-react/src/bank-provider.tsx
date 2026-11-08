import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Bank, DefaultOnBadNews, DefaultOnPanic, type AnyGating, type BadNews, type Panic, type Vault } from 'safebyok'
import { GatingModal } from './gating-modal'
import { providerProps, type BankProviderProps, type Handlers, type HeldBankOpts } from './shapes/shapes-provider'

// == [Provided]: Provided, BankContext, NoneHeld, useProvided

/** What the provider hands down: the signed-in user's bank, and the Vault objects a hook has called `tryHello` on. */
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

// == [Hooks]: hasUserGesture, changedKeys, useGatingDialog, useHeldBank

/** True while the user's gesture is still active, or in a browser that does not say. */
const hasUserGesture = (): boolean => (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation?.isActive !== false

/** The fields whose values differ between `was` and `now`. */
const changedKeys = (was: Record<string, unknown>, now: Record<string, unknown>): string[] => Object.keys({ ...was, ...now }).filter((ckey) => ! Object.is(was[ckey], now[ckey]))

/** The provider's own gating dialog: what it shows now, and how to open and close it. */
const useGatingDialog = () => {
  /** One showing of the dialog: its round, the gating it answers, and how it closes. */
  type Showing = { round: number, gating: AnyGating, close: () => void }

  /** The dialog showing now, if any, as rendered. */
  const [showing, setShowing] = useState<Showing | null>(null)
  // The callbacks read the ref, current between renders: an old dialog's late answer then ends only
  // its own showing, never a newer one.
  /** The dialog showing now, if any, as the callbacks read it. */
  const showingRef = useRef<Showing | null>(null)
  // Each showing's round keys a fresh dialog, with nothing kept from the last.
  /** The count of the dialog's showings. */
  const showingRounds = useRef(0)

  /** Close `ending` if it is still the dialog showing, and resolve the `ask` call that showed it. */
  const endShowing = useCallback((ending: Showing) => {
    if (showingRef.current === ending) {
      showingRef.current = null
      setShowing(null)
    }
    ending.close()
  }, [])

  /** Close the dialog showing now, if any. */
  const endAny = useCallback(() => { if (showingRef.current !== null) { endShowing(showingRef.current) } }, [endShowing])

  // A bank opens one gating at a time, but the last gating's dialog may not have answered yet.
  // Ending it resolves its `ask` call, which would otherwise wait on a dialog that never mounts again.
  /** Show the dialog for `gating`, if the user's gesture is still active, and resolve once it closes. */
  const ask = useCallback((gating: AnyGating) => new Promise<void>((close) => {
    if (! hasUserGesture()) { close(); return }
    endAny()
    showingRounds.current += 1
    const next = { round: showingRounds.current, gating, close: () => { close() } }
    showingRef.current = next
    setShowing(next)
  }), [endAny])

  return { showing, ask, endShowing, endAny }
}

/** The bank made from the first render's `opts` and held until unmount. */
const useHeldBank = (opts: HeldBankOpts, handlers: Handlers, onSwept: () => void): Provided => {
  const [madeFrom] = useState(opts)
  const [held, setHeld] = useState<Provided>(NoneHeld)
  const [refused, setRefused] = useState<{ err: unknown } | null>(null)
  const toldOfIgnored = useRef(false)

  const panicked = useEffectEvent((panic: Panic) => handlers.onPanic(panic))
  const heardBadNews = useEffectEvent((badnews: BadNews) => handlers.onBadNews(badnews))
  const asked = useEffectEvent((gating: AnyGating) => handlers.requestCleartext(gating))

  // The effect owns the bank: it makes it and sweeps it. A re-run effect (StrictMode's, or a hidden
  // Activity's shown again) makes a fresh one.
  useEffect(() => {
    // Once swept, the bank calls none of the host's handlers: the page may be the next user's by then.
    /** Whether this effect still holds its bank. */
    const kept = { held: true }
    let bank: Bank | null = null
    const makeBank = async () => {
      try {
        const { device_id } = await madeFrom.deviceDB.ensureBank({ applabel: madeFrom.applabel, user_id: madeFrom.user_id })
        if (! kept.held) { return }
        const made = Bank.make({
          ...madeFrom, device_id,
          // A swept bank's panic goes to the platform, as a handler's throw does.
          onPanic:          (panic) => { if (! kept.held) { throw panic.refusal } return panicked(panic) },
          onBadNews:        (badnews) => (kept.held ? heardBadNews(badnews) : undefined),
          requestCleartext: async (gating) => { if (kept.held) { await asked(gating) } },
        })
        bank = made
        setHeld({ bank: made, helloedVaults: new WeakSet<Vault>() })
        // A refused `tryHello` lands in the bank's snapshot, which useBankSnapshot renders.
        void made.tryHello()
      } catch (err) {
        if (kept.held) { setRefused({ err }) }
      }
    }
    void makeBank()
    return () => {
      kept.held = false
      // `sweep()` settles the open gating, and `onSwept` closes the dialog over it.
      bank?.sweep()
      onSwept()
      setHeld(NoneHeld)
    }
  }, [madeFrom, onSwept])

  // An option changed since the bank was made is ignored. The bank's logger warns of it once.
  useEffect(() => {
    if (held.bank === null || toldOfIgnored.current) { return }
    const changed = changedKeys(madeFrom, opts)
    if (changed.length === 0) { return }
    toldOfIgnored.current = true
    held.bank.logger.warn(`BankProvider ignored a change to its ${changed.join(' and ')}: it makes its bank once per applabel and user_id, from the props it has then. Define each prop once, outside the component, or memoize it.`, { call: 'BankProvider', props: changed })
  })

  if (refused !== null) { throw refused.err }
  return held
}
// --

// == [BankProvider]: BankProvider, UserBankProvider

/** Hand the hooks a bank for each `applabel` and signed-in `user_id`, or none while nobody is signed in. */
export const BankProvider = (props: BankProviderProps) => {
  const { applabel, user_id, children } = providerProps.parse(props, { where: 'BankProvider' })
  if (user_id === null) { return <BankContext.Provider value={NoneHeld}>{children}</BankContext.Provider> }
  return <UserBankProvider key={JSON.stringify([applabel, user_id])} {...props} user_id={user_id} />
}

/** Hold one signed-in user's bank from mount to unmount, and show the dialog for its gatings. */
const UserBankProvider = (props: BankProviderProps & { user_id: string }) => {
  const dialog = useGatingDialog()
  const { passphraseUsername, passphraseAdvice, passkeyRpId, children, onPanic = DefaultOnPanic, onBadNews = DefaultOnBadNews, requestCleartext = dialog.ask, ...bankish } = props
  const held = useHeldBank(bankish, { onPanic, onBadNews, requestCleartext }, dialog.endAny)
  const { showing } = dialog

  return (
    <BankContext.Provider value={held}>
      {children}
      {showing !== null && (
        <GatingModal
          key={showing.round}
          gating={showing.gating}
          leaseMillis={held.bank?.leaseMillis}
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
