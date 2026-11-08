import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { Bank, DefaultOnBadNews, DefaultOnPanic, MinuteMillis, type AnyGating, type BadNews, type BadNewsHandler, type BankOpts, type Panic, type PanicHandler, type RequestCleartext, type Vault } from 'safebyok'
import { Checker, bankOpts } from 'safebyok/storage'
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

// == [Props]: BankProviderProps, providerProps, HeldBankOpts, Handlers

/** What BankProvider is handed: the Bank.make options but the device's, the signed-in `user_id`, and the dialogs' props. */
export type BankProviderProps = Omit<BankOpts, 'user_id' | 'device_id' | 'requestCleartext'> & {
  /** The signed-in user from the host's auth, or null when nobody is: then the provider holds no bank. */
  user_id:             string | null
  /** What asks the user for a passphrase or passkey: the provider's own dialogs when left out. */
  requestCleartext?:   RequestCleartext | undefined
  /** What a password manager files a vault's passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  /** The relying party the vault's passkey is made and asked under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
  children:            ReactNode
}

/** BankProvider's props: Bank.make's options but the device's, beside the signed-in user and the dialogs' props. */
const providerProps = Checker(({ fn, custom, str }) => bankOpts.omit({ device_id: true }).extend({
  user_id:            bankOpts.shape.user_id.nullable(),
  requestCleartext:   fn<RequestCleartext>().optional(),
  passphraseUsername: str.optional(),
  passphraseAdvice:   custom<PassphraseAdvice>().optional(),
  passkeyRpId:        str.optional(),
  children:           custom<ReactNode>(),
}), 'bad_option')

/** The options a held bank is made from: Bank.make's, but the device's and the handlers. */
type HeldBankOpts = Omit<BankOpts, 'device_id' | 'onPanic' | 'onBadNews' | 'requestCleartext'>

/** The functions a held bank calls back, each as it was last rendered. */
type Handlers = { onPanic: PanicHandler, onBadNews: BadNewsHandler, requestCleartext: RequestCleartext }
// --

// == [Hooks]: AutolockEveryMillis, hasUserGesture, changedKeys, useGatingDialog, useHeldBank

/** How often the provider asks its bank to lock each vault whose autolock has passed. */
const AutolockEveryMillis = MinuteMillis

/** Whether the user's gesture is still in hand, true where the browser does not say. */
const hasUserGesture = (): boolean => (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation?.isActive !== false

/** The fields of `now` and `was` whose values differ. */
const changedKeys = (was: Record<string, unknown>, now: Record<string, unknown>): string[] => Object.keys({ ...was, ...now }).filter((ckey) => ! Object.is(was[ckey], now[ckey]))

/** The provider's own dialog: the one gating it shows, how to ask the user by it, and how to end it. */
const useGatingDialog = () => {
  /** One showing of the dialog: which one, the gating it answers, and how it closes. */
  type Showing = { round: number, gating: AnyGating, close: () => void }

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

  /** Close the dialog showing now, if any. */
  const endAny = useCallback(() => { if (showingRef.current !== null) { endShowing(showingRef.current) } }, [endShowing])

  // A bank opens one gating at a time, but the last one's dialog may not have answered yet: it is
  // ended here, so its ask resolves rather than waiting on a dialog that will never mount again.
  /** Show the dialog for `gating`'s kind while the user's gesture is in hand; resolves as it closes. */
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

/** The bank made from the first render's `opts`, held from mount to unmount, calling each handler as last rendered. */
const useHeldBank = (opts: HeldBankOpts, handlers: Handlers, onSwept: () => void): Provided => {
  const madeFrom = useRef(opts).current
  const [held, setHeld] = useState<Provided>(NoneHeld)
  const [refused, setRefused] = useState<{ err: unknown } | null>(null)
  const toldOfIgnored = useRef(false)

  const panicked = useEffectEvent((panic: Panic) => handlers.onPanic(panic))
  const heardBadNews = useEffectEvent((badnews: BadNews) => handlers.onBadNews(badnews))
  const asked = useEffectEvent((gating: AnyGating) => handlers.requestCleartext(gating))

  // The effect owns the bank, making it and sweeping it, so a re-run effect (StrictMode's, a hidden
  // Activity shown again) makes a fresh one.
  useEffect(() => {
    // Once swept, the bank calls none of the host's handlers: the page may be the next user's by then.
    const kept = { held: true }
    let bank: Bank | null = null
    let autolocking: ReturnType<typeof setInterval> | undefined
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
        // A refused hello lands in the bank's snapshot, which useBankSnapshot renders.
        void made.tryHello()
        // The core sets no timers: the provider asks for each autolock on its own.
        autolocking = setInterval(() => { void made.autolock() }, AutolockEveryMillis)
      } catch (err) {
        if (kept.held) { setRefused({ err }) }
      }
    }
    void makeBank()
    return () => {
      kept.held = false
      clearInterval(autolocking)
      // A sweep settles the open gating, and the dialog over it closes.
      bank?.sweep()
      onSwept()
      setHeld(NoneHeld)
    }
  }, [madeFrom, onSwept])

  // An option the bank was made with that has changed since is ignored, and said so once.
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

/** Hand the hooks the signed-in user's bank, made once per `applabel` and `user_id`, and no bank while nobody is signed in. */
export const BankProvider = (props: BankProviderProps) => {
  const { applabel, user_id, children } = providerProps.parse(props, { where: 'BankProvider' })
  if (user_id === null) { return <BankContext.Provider value={NoneHeld}>{children}</BankContext.Provider> }
  return <UserBankProvider key={JSON.stringify([applabel, user_id])} {...props} user_id={user_id} />
}

/** Hold one signed-in user's bank from mount to unmount, with the dialog its gatings ask by. */
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
