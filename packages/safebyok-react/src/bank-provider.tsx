import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Bank, type Gating, type RequestCleartext, checkValidators, parseLogger, type BadNewsHandler, type MakeBankOpts, type Vault, type VaultDB, type VaultEntry, type VaultLogger, type VaultSnapshot, type VaultValidators } from 'safebyok'
import { PassphraseModal, type PassphraseAdvice, type PassphraseGating } from './passphrase-modal'

// == [Hooks]: useBank, useVault, useEntry, useVaultSnapshot

/** What the provider hands down: its bank, and the signed-in user whose vaults the hooks ask it for. */
type Provided = { bank: Bank | null, userId: string | null }

const BankContext = createContext<Provided | null>(null)

/** What a provider hands down while it holds no bank: on the server, in the first render, and while it makes one anew. */
const NoneHeld: Provided = Object.freeze({ bank: null, userId: null })

/** What the nearest BankProvider hands down, or a calm throw where there is none. */
const useProvided = (hookname: string): Provided => {
  const provided = useContext(BankContext)
  if (provided === null) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return provided
}

/** The bank the nearest BankProvider holds, or null before it is made -- on the server, and in the first render -- and while it is made anew.
 * Reach it for what the hooks do not do: ask for a vault again after a refusal or a deletion
 * (`bank.ensureVault`), birth one anew (`bank.reopenVault`), or, on the user's or the host's say,
 * have this device accept a vault storage serves behind what it has seen (`bank.clearCachedVault`,
 * the way past 'vault_behind'). Call it in an event handler, not in render. It is the same object
 * while the user and the props that shape it stay the same.
 *
 * @example
 *   const bank = useBank()
 *   const acceptRestore = async () => {
 *     if (bank === null) { return }
 *     await bank.clearCachedVault({ userId, vaultlabel: 'main' })
 *     await bank.ensureVault({ userId, vaultlabel: 'main' })
 *   }
 */
export const useBank = (): Bank | null => useProvided('useBank').bank

const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing
const getNothing = () => null

/** The bank's entry for the signed-in user's vault under `vaultlabel`, asking the bank for that vault when it holds none; null while nobody is signed in, and until the ask lands.
 * The entry is `starting` while the vault's birth reads storage, `timely` holding the Vault object
 * (`novel`, `locked` or `unlocked`), or `refused` with why: storage that cannot be reached
 * (`storage_unavailable`), a user storage no longer serves (`identity_revoked`), a vault whose
 * stored props fail their checks (`damaged_vault`, which `bank.delDamagedVault` answers),
 * a browser that will not let the app keep anything on this device (`storage_blocked`), storage
 * serving an older copy than this device has seen (`vault_behind`, which `bank.clearCachedVault`
 * answers), or a vault deleted (`vault_gone`) or made anew elsewhere (`vault_remade`).
 *
 * It asks only while the bank holds no entry for the vault: as it mounts, and after the entry is
 * let go (a sign-out, `bank.closeVault`, `bank.clearCachedVault`). A refused entry stays refused
 * until the app asks again (`useBank().ensureVault`), so a vault deleted stays gone, rather than
 * coming back as a new, novel one nobody asked for. A refusal that is misuse -- the developer's to
 * fix, which no retry mends -- is thrown in render, to the nearest error boundary, as is a
 * `vaultlabel` that fails its check.
 *
 * Its Vault object's fields read live in an event handler; render from {@link useVaultSnapshot},
 * which re-renders as they change. A vault opened once that meets an older copy on a later read
 * stays `timely` and locked, its snapshot's `trouble` 'vault_behind'.
 *
 * @example
 *   const entry = useVault('main')
 *   if (entry === null || entry.status === 'starting') { return <p>Opening your vault…</p> }
 *   if (entry.vault === null) { return <p>{"Can't open your vault: "}{entry.err?.message}</p> }
 *   const { vault } = entry
 *   return <button onClick={() => { void vault.lock() }}>Lock</button>
 */
export const useVault = (vaultlabel: string): VaultEntry | null => useEntry('useVault', vaultlabel)

/** {@link useVault}'s work, for `hookname`: the entry, asked for when the bank holds none, and misuse thrown. */
const useEntry = (hookname: string, vaultlabel: string): VaultEntry | null => {
  const { bank, userId } = useProvided(hookname)
  const readEntry = useCallback(() => (bank === null || userId === null ? null : bank.entryOf({ userId, vaultlabel })), [bank, userId, vaultlabel])
  // The server renders with no bank, as the client's first render does: no entry on either.
  const entry = useSyncExternalStore(bank?.subscribe ?? subscribeToNothing, readEntry, getNothing)
  const unasked = bank !== null && userId !== null && entry === null
  useEffect(() => {
    if (! unasked) { return }
    // A refusal lands in the entry, and is rendered from there.
    void bank.tryEnsureVault({ userId, vaultlabel })
  }, [unasked, bank, userId, vaultlabel])
  // Thrown here, in render, so the nearest error boundary (or the dev overlay) shows it: every hook
  // has run by now, so the throw leaves the rules of hooks alone.
  if (entry?.status === 'refused' && entry.err?.family === 'misuse') { throw entry.err }
  return entry
}

/** The live snapshot of the signed-in user's vault under `vaultlabel` -- its state, the box listing, the ways in, when it next asks for the passphrase -- or null while there is no Vault object.
 * It asks for the vault as {@link useVault} does, and reads its Vault object through
 * `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`, so the component renders again
 * whenever it changes, and only then.
 *
 * @example
 *   const snapshot = useVaultSnapshot('main')
 *   if (snapshot === null) { return <p>Opening your vault…</p> }
 *   return <p>{snapshot.boxes.length} keys stored</p>
 */
export const useVaultSnapshot = (vaultlabel: string): VaultSnapshot | null => {
  const vault: Vault | null = useEntry('useVaultSnapshot', vaultlabel)?.vault ?? null
  // The server renders with no vault, as the client's first render does: no snapshot on either.
  return useSyncExternalStore(vault?.subscribe ?? subscribeToNothing, vault?.getSnapshot ?? getNothing, getNothing)
}
// --

// == [BankProvider]: BankProviderProps, BankProvider, settleLogger, Showing, hasUserGesture, isPassphraseGating

/** One showing of the passphrase dialog: which one, the gating it answers, and how it closes. */
type Showing = { round: number, gating: PassphraseGating, close: () => void }

/** Whether the user's gesture is still in hand, so a dialog may be shown: true where the browser does not say (`navigator.userActivation` is newer than some), as there is no telling. */
const hasUserGesture = (): boolean => (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation?.isActive !== false

/** True for a gating the passphrase dialog answers: a first passphrase, or an unlock. The other kinds are a host's own dialog's, for now. */
const isPassphraseGating = (gating: Gating): gating is PassphraseGating => gating.gatingkind === 'initialize_gate' || gating.gatingkind === 'unlock_vault'

/** Every Bank.make option, passed through as given, beside the signed-in `userId`, and three for the passphrase dialog.
 * An option left out gets Bank.make's default, and one it does not take is refused, to the error
 * boundary. `userId` may be null, and `requestCleartext` left out means the provider's own passphrase
 * dialog. The dialog's three: whether it offers a forgetful user to start over, what a password
 * manager files the passphrase under, and the advice it shows as the user chooses one
 * (`PassphraseModal` has each). In a browser, spread `browserOpts()` from `safebyok/browser` for
 * the `keyDeriver`, `deviceDB` and `strengthChecker` Bank.make asks for. `BankProvider` says
 * which props make the bank anew as they change, and which do not.
 */
export type BankProviderProps = MakeBankOpts & {
  /** The signed-in user from the host's auth, or null when nobody is: then the hooks hand down no vault, and ask for none. */
  userId:              string | null
  /** What asks the user for a passphrase or passkey when a call needs one (Bank.make's `requestCleartext`).
   * Left out, the provider's own: its passphrase dialog, `PassphraseModal`, for an `unlock_vault`
   * or `initialize_gate` gating, one at a time, shown only while the user's gesture is in hand
   * (`navigator.userActivation`) -- a call a timer makes is declined unasked -- and closing as a
   * lock lands. A change to the ways in or a deletion is declined unasked, for now: hand a
   * `requestCleartext` of your own to answer those. Null: none, every gating declined, so a call
   * needing the vault locked refuses 'vault_locked'. Written inline, it makes no new bank.
   */
  requestCleartext?:   RequestCleartext | null | undefined
  /** Whether the passphrase dialog offers a user who has forgotten the passphrase to delete the vault, on every device, and start a new one: `PassphraseModal`'s `allowStartOver`. Off by default. */
  allowStartOver?:     boolean | undefined
  /** What a password manager files a vault's passphrase under: `PassphraseModal`'s `passphraseUsername`.
   * Default: the user and the vault, as 'u1 (main vault)'. Never the user's sign-in name alone, or
   * a manager may take the passphrase for their sign-in password.
   */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase: `PassphraseModal`'s `passphraseAdvice`.
   * Default: the dialog's, `vault.checkPassphrase`'s reason for a passphrase it finds weak, so the
   * user hears why before pressing Create. Like the strength checker, it hears the passphrase in
   * plain text: keep it on the device.
   */
  passphraseAdvice?:   PassphraseAdvice | undefined
  children:            ReactNode
}

/** The one logger the provider and the bank it makes say things through: the host's `logger`, else the one its `vaultDB` was made with, guarded.
 * Undefined for a logger, or a vaultDB, that Bank.make will refuse, to the error boundary.
 */
const settleLogger = (logger: VaultLogger | null | undefined, vaultDB: VaultDB): VaultLogger | undefined => {
  try {
    return parseLogger(logger ?? vaultDB.logger)
  } catch {
    // Bank.make refuses the same logger or vaultDB, and the provider throws that to the error boundary.
    return undefined
  }
}

/** Makes the app's bank from its props, and hands it down to {@link useBank}, and the signed-in user's vaults to {@link useVault} and {@link useVaultSnapshot}.
 * It makes the bank (`Bank.make`) in an effect, once a user is signed in: that checks the
 * options, and reads nothing. A vault is asked for only by a hook that names it,
 * `useVault('main')`; until its birth settles, there is no Vault object. A vault refused or
 * deleted stays so until the app asks again.
 *
 * The provider owns the bank. It lets every vault go (`bank.closeVaults()`) when the user signs
 * out or changes, and when it unmounts. It makes the bank anew, letting the last one's vaults go,
 * when a prop that shapes it changes -- the scope (`applabel`), the stores (`vaultDB`,
 * `deviceDB`), the `keyDeriver`, `leaseHours`, `staleMinutes`, `maxWhisperBytes`, `maxBoxes`, the
 * `clock`, the `logger`, the `strengthChecker`, or a schema in `validators`. So build each of those
 * once -- at module level, or memoized -- never inline in the props; each schema in `validators`
 * likewise, though the bag around them may be built in render. A `logger`, `clock` or
 * `strengthChecker` that changes identity is warned of once, through the logger. A handler makes
 * no new bank: `onBadNews` and `requestCleartext` may be written inline, and the bank's vaults call
 * whichever the last render passed. Under React's StrictMode, whose rehearsal asks for a vault and
 * lets it go in development, the rehearsal reads nothing: only the vault kept is born.
 *
 * The provider and its bank say things through one logger: the `logger` given here, else the one
 * the `vaultDB` was made with (the default logger when it was given none). Unless given a
 * `requestCleartext` of the host's own, it renders the passphrase dialog, `PassphraseModal`, whenever a
 * call on one of the bank's vaults needs it unlocked and finds it not -- `vault.getWhisper(...)`
 * and the rest, or `vault.ensureUnlocked()` on an Unlock button -- one at a time: unstyled markup
 * under the `modal-scrim` / `modal` class names, for the host's stylesheet to dress. The call
 * waits on the dialog, and goes on once it unlocks; dismissed, it refuses with kind
 * 'vault_locked'. Another vault's gating replaces the dialog showing, whose calls are refused
 * likewise. A lock closes the dialog, its calls refused likewise; a sign-out, another user,
 * or the provider unmounting lets the vault go, closing the dialog, its calls refused
 * 'vault_gone'. A user who starts over from the dialog (`allowStartOver`) has asked for a new
 * vault: once the old one is deleted, the provider asks the bank for the vault again, and the
 * hooks hand down the new one, `novel`.
 *
 * Misuse -- a bad label or option, which `Bank.make` throws as the provider makes its bank, or a
 * birth refused as misuse or with a value that is no VaultError at all, which `useVault` throws
 * -- reaches the nearest error boundary.
 *
 * @example
 *   <BankProvider {...browserOpts()} applabel="acme" userId={session?.userId ?? null} vaultDB={vaultDB}>
 *     <App />
 *   </BankProvider>
 * @example
 *   <BankProvider {...browserOpts()} applabel="acme" userId={userId} vaultDB={vaultDB}
 *     onBadNews={(news) => { telemetry.report(news.refusalkind) }}>
 *     <App />
 *   </BankProvider>
 * @example
 *   const { ok, val: whisper } = await vault.tryGetWhisper('anthropic_api_key')   // asks through the dialog when locked
 *   if (! ok) { return null }   // dismissed: refused 'vault_locked'
 */
export const BankProvider = ({ userId, allowStartOver, passphraseUsername, passphraseAdvice, children, ...opts }: BankProviderProps) => {
  const { applabel, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews, requestCleartext, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, validators, strengthChecker, ...unlisted } = opts
  // Each prop Bank.make does not take, by name -- a misspelling, a deleted name, a `vaultlabel`,
  // which each hook names -- handed on to it, so it is refused, to the error boundary, rather than
  // dropped here unseen.
  const unlistedJson = JSON.stringify(Object.keys(unlisted))
  // The bag is taken apart below, so a misspelt field would be dropped unseen: refused here, as Bank.make refuses it.
  checkValidators(validators)
  // The bank is made anew when a check changes, never for a bag rebuilt in render around the same ones.
  const applabelCheck = validators?.applabel
  const vaultlabelCheck = validators?.vaultlabel
  const boxlabelCheck = validators?.boxlabel
  const userIdCheck = validators?.userId
  // The dialog showing now, if any. The ref is what the callbacks read, so that a dialog's answer
  // reaches its own ask and no newer one's; the state renders it.
  const [showing, setShowing] = useState<Showing | null>(null)
  const showingRef = useRef<Showing | null>(null)
  // Counts the dialog's showings, so that each is a fresh dialog with nothing kept from the last.
  const showingRounds = useRef(0)
  // Settled once for each logger and vaultDB, so the provider and its bank share it.
  const heldLogger = useMemo(() => settleLogger(logger, vaultDB), [logger, vaultDB])
  // The logger, clock and strength checker the last render had, and whether a change of any was warned of yet.
  const sinks = useRef({ logger, clock, strengthChecker })
  const toldOfSinks = useRef(false)
  // The host's onBadNews as of the last commit. The bank is handed a teller that keeps its
  // identity and calls whichever handler that is, so a handler written inline makes no new bank.
  // Moved in a passive effect: React runs every passive cleanup before any passive effect, so the
  // last bank is let go before the next user's handler is here.
  const badNewsRef = useRef(onBadNews)
  useEffect(() => { badNewsRef.current = onBadNews })
  const tellBadNews = useCallback<BadNewsHandler>((news) => badNewsRef.current?.(news), [])
  // Anything but a function, or none, is misuse: handed to Bank.make as it came, to be refused.
  const badNewsOpt = onBadNews === undefined || onBadNews === null || typeof onBadNews === 'function' ? tellBadNews : onBadNews

  /** Closes `ending` if it is still the dialog showing, and resolves its request: a gating still open then is declined. */
  const endShowing = useCallback((ending: Showing) => {
    if (showingRef.current === ending) {
      showingRef.current = null
      setShowing(null)
    }
    ending.close()
  }, [])

  // The provider's own requestCleartext: its passphrase dialog, shown only while the user's gesture
  // is in hand, one at a time. A vault raises one gating at a time, but the bank's other vaults may
  // raise over it: the newest is shown, and the one it replaces declined, never left waiting.
  const askByDialog = useCallback<RequestCleartext>((gating) => new Promise<void>((close) => {
    if (! isPassphraseGating(gating) || ! hasUserGesture()) { close(); return }
    if (showingRef.current !== null) { endShowing(showingRef.current) }
    showingRounds.current += 1
    const next = { round: showingRounds.current, gating, close: () => { close() } }
    showingRef.current = next
    setShowing(next)
  }), [endShowing])

  // The host's requestCleartext as of the last commit, held as onBadNews is: the bank is handed
  // one asker that keeps its identity, so one written inline makes no new bank.
  const hostAskerRef = useRef(requestCleartext)
  useEffect(() => { hostAskerRef.current = requestCleartext })
  const askUser = useCallback<RequestCleartext>(async (gating) => {
    const hosts = hostAskerRef.current
    if (hosts === undefined) { await askByDialog(gating); return }
    if (hosts !== null) { await hosts(gating) }
  }, [askByDialog])
  const requestOpt = requestCleartext === undefined || requestCleartext === null || typeof requestCleartext === 'function' ? askUser : requestCleartext

  // The bank the provider holds now and the user it is for, made and let go together by the effect
  // below: the hooks never see one user beside another's bank.
  const [held, setHeld] = useState<Provided>(NoneHeld)

  useEffect(() => {
    // Nobody signed in: no bank, so nothing is asked for and nothing refused.
    if (userId === null) { return }
    // Listed one by one so the effect re-runs on each; `satisfies` fails the build if a Bank.make
    // option is ever added and not passed through.
    const checks = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck } satisfies Record<keyof VaultValidators, unknown>
    const refusable = Object.fromEntries((JSON.parse(unlistedJson) as string[]).map((ckey) => [ckey, undefined]))
    // Bad news a vault meets once the provider has let its bank go -- a read under way as the user
    // changed -- is told to no one: the handler now may be the next user's.
    const kept = { held: true }
    const tellWhileHeld: BadNewsHandler = (news) => (kept.held ? tellBadNews(news) : undefined)
    // Likewise, a vault let go asks no one: the requestCleartext now may be the next user's.
    const askWhileHeld: RequestCleartext = async (gating) => { if (kept.held) { await askUser(gating) } }
    const bankOpts = { ...refusable, applabel, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews: badNewsOpt === tellBadNews ? tellWhileHeld : badNewsOpt, requestCleartext: requestOpt === askUser ? askWhileHeld : requestOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger: heldLogger ?? logger, validators: checks, strengthChecker } satisfies Record<keyof MakeBankOpts, unknown>
    // The bank is this effect's to make and to let go. A refused option throws from here to the
    // nearest error boundary, as the very VaultError.
    const made = Bank.make(bankOpts)
    const holding = { bank: made, userId }
    setHeld(holding) // eslint-disable-line react-hooks/set-state-in-effect -- the effect owns the bank, making it and letting it go, so a re-run effect (StrictMode's, a hidden Activity shown again) makes a fresh one; the render reads the bank the effect holds now, set once per bank
    return () => {
      kept.held = false
      // Letting a vault go ends its prompt: its waiters are refused 'vault_gone', and the dialog
      // over it answers declined and closes.
      made.closeVaults()
      if (showingRef.current !== null) { endShowing(showingRef.current) }
      setHeld(NoneHeld)
    }
  }, [userId, applabel, vaultDB, deviceDB, leaseHours, staleMinutes, badNewsOpt, requestOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, heldLogger, strengthChecker, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, unlistedJson, tellBadNews, askUser, endShowing])

  // A logger, clock or strength checker written inline in the props is new at every render, and
  // makes the bank anew each time: said once, the first time any changes.
  useEffect(() => {
    const last = sinks.current
    sinks.current = { logger, clock, strengthChecker }
    const changed = [
      ...(last.logger === logger ? [] : ['logger']),
      ...(last.clock === clock ? [] : ['clock']),
      ...(last.strengthChecker === strengthChecker ? [] : ['strengthChecker']),
    ]
    if (toldOfSinks.current || changed.length === 0) { return }
    toldOfSinks.current = true
    heldLogger?.warn(`BankProvider made its bank anew, letting its vaults go, because its ${changed.join(' and ')} changed identity between renders. Written inline in the props, it is new at every render, and does so each time: define it once, outside the component, or memoize it.`, { call: 'BankProvider', props: changed })
  }, [logger, clock, strengthChecker, heldLogger])


  return (
    <BankContext.Provider value={held}>
      {children}
      {showing !== null && (
        <PassphraseModal
          key={showing.round}
          gating={showing.gating}
          allowStartOver={allowStartOver}
          passphraseUsername={passphraseUsername}
          passphraseAdvice={passphraseAdvice}
          onDone={() => { endShowing(showing) }}
        />
      )}
    </BankContext.Provider>
  )
}
// --
