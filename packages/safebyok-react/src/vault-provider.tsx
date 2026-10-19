import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Vault, type Ask, type GetProof, type ProofAnswer, checkStrengthTest, checkValidators, delDamagedVault as delStoredDamagedVault, isCondition, isVaultError, parseLogger, type BadNewsHandler, type MakeVaultOpts, type PassphraseStrengthTest, type VaultDB, type VaultError, type VaultLogger, type VaultScope, type VaultSnapshot, type VaultValidators } from 'safebyok'
import { PassphraseModal, type PassphraseAdvice } from './passphrase-modal'

// == [Hooks]: useVault, useVaultSnapshot, useOpenError, OpenErrorShape

/**
 * Why the provider's own `hello()` could not open the vault, and what the app can do about it:
 * what {@link useOpenError} hands down.
 */
export type OpenErrorShape = {
  /**
   * Why the vault could not be opened, when it is a condition or bad news the app can show in
   * place: what the provider's own `hello()` was refused with, while the vault is still `opening`
   * -- storage that cannot be reached (`storage_unavailable`), a user storage no longer serves
   * (`identity_revoked`, as when signed out of the backend, or not yet signed in to it), a vault
   * whose stored props fail their checks (`damaged_vault`), a browser that will not let the app
   * keep anything on this device (`storage_blocked`). And a vault opened once may be sent back to
   * `opening` by a later read, refused as `rolled_back` (storage handed back an older copy of the
   * vault than this device has seen): that refusal, the snapshot's `trouble`, lands here too.
   * Null while the hello runs, once the vault has settled, and while signed out. Misuse -- a bad
   * label or option -- never lands here: the provider throws it to the nearest error boundary.
   * Offer `retryOpen` only for one a retry may mend: never for `storage_blocked`, which holds
   * until something outside the app changes (say why instead), nor for `damaged_vault`, which
   * `delDamagedVault` answers, nor for `rolled_back`, which holds until the host accepts the older
   * copy (the `safebyok` README's *A vault rolled back* says how).
   *
   * It is not the vault's `trouble`: `trouble` is the latest bad news the vault met on any read,
   * for as long as the vault stands, and never a condition; `openError` is only why the vault is
   * not open yet, a condition among them, and clears once it opens.
   *
   * @example
   *   if (openError?.refusalkind === 'storage_blocked') { return <p>{"This browser won't let the app keep your vault on this device."}</p> }
   *   if (openError?.refusalkind === 'damaged_vault') { return <p>{"Your vault's stored record is damaged."}</p> }
   *   if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
   */
  openError: VaultError | null
  /**
   * Have the vault say hello to storage again after `openError`, reading afresh
   * (`vault.hello({ staleMinutes: 0 })`): openError clears once the vault settles, or names what
   * the new attempt met. Does nothing while there is no openError to retry.
   */
  retryOpen: () => void
  /**
   * Delete the stored vault that `openError` reports as `damaged_vault`, with this device's lease
   * of it, and have the vault say hello again: a fresh, absent vault, for the user to make anew.
   * The user's boxes in it are gone for good, so ask first. Resolves when the new hello is
   * under way, and does nothing while `openError` is any other, or none. Rejects with storage's
   * refusal if deleting it fails, such as `storage_unavailable`, leaving `openError` as it was; the
   * `safebyok` package's `delDamagedVault` says which refusals to expect. One of them,
   * `stale_write`, means the vault was made anew meanwhile, so that one says hello again as well,
   * and still rejects. Any other refusal says nothing anew: `bad_option` among them, which is
   * misuse, or a vault that reads sound now, which `retryOpen()` then opens.
   *
   * @example
   *   if (openError?.refusalkind === 'damaged_vault') {
   *     return <button onClick={() => { if (confirm('Remove your vault and start over?')) { void delDamagedVault() } }}>Start over</button>
   *   }
   */
  delDamagedVault: () => Promise<void>
}

/** Everything the provider hands down, each hook reading its part. */
type Provided = { vault: Vault | null, opened: OpenErrorShape }

const VaultContext = createContext<Provided | null>(null)

/** What the nearest VaultProvider hands down, or a calm throw where there is none. */
const useProvided = (hookname: string): Provided => {
  const provided = useContext(VaultContext)
  if (provided === null) { throw new Error(`${hookname} needs a <VaultProvider> above it.`) }
  return provided
}

/**
 * The vault the nearest VaultProvider made for the signed-in user, or null while nobody is signed
 * in. It is there from the render after the user signs in, its `state` `opening` until its first
 * `hello()` has read storage; every call on it waits for that first. Its fields read live in an
 * event handler; render from {@link useVaultSnapshot}, which re-renders as they change.
 *
 * @example
 *   const vault = useVault()
 *   if (vault === null) { return <SignIn /> }
 *   return <button onClick={() => { void vault.lock() }}>Lock</button>
 */
export const useVault = (): Vault | null => useProvided('useVault').vault

const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing
const getNothing = () => null

/**
 * The vault's live snapshot -- its state, the box listing, the ways in, when it next asks for the
 * passphrase -- read through `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`, so the
 * component renders again whenever it changes, and only then. Null while nobody is signed in.
 *
 * @example
 *   const snapshot = useVaultSnapshot()
 *   if (snapshot === null || snapshot.state === 'opening') { return <p>Opening your vault…</p> }
 *   return <p>{snapshot.boxes.length} keys stored</p>
 */
export const useVaultSnapshot = (): VaultSnapshot | null => {
  const { vault } = useProvided('useVaultSnapshot')
  const getSnapshot = vault?.getSnapshot ?? getNothing
  // The server renders with no vault, as the client's first render does: no snapshot on either.
  return useSyncExternalStore(vault?.subscribe ?? subscribeToNothing, getSnapshot, getNothing)
}

/**
 * Why the provider could not open the vault, `openError`, beside `retryOpen` and
 * `delDamagedVault`: {@link OpenErrorShape} says each.
 *
 * @example
 *   const { openError, retryOpen } = useOpenError()
 *   if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
 */
export const useOpenError = (): OpenErrorShape => useProvided('useOpenError').opened
// --

// == [VaultProvider]: VaultProviderProps, VaultProvider, settleLogger, adviceFrom, Showing, hasUserGesture

/** One showing of the passphrase dialog: which one, the ask it answers, and how it answers. */
type Showing = { round: number, ask: Ask, answer: (answer: ProofAnswer) => void }

/**
 * Whether the user's gesture is still in hand, so a dialog may be shown: true where the browser
 * does not say (`navigator.userActivation` is newer than some), as there is no telling.
 */
const hasUserGesture = (): boolean => (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation?.isActive !== false

/** The scope of `vault`, as the strength test is handed it. */
const scopeOf = (vault: Vault): VaultScope => ({ applabel: vault.applabel, user_id: vault.user_id, vaultlabel: vault.vaultlabel })
const getNotOpening = () => false

/** The snapshot's trouble when it is a 'rolled_back' refusal that holds the vault opening; null otherwise. */
const rolledBackOf = (snapshot: VaultSnapshot | undefined): VaultError | null => (
  snapshot?.state === 'opening' && isVaultError(snapshot.trouble, 'rolled_back') ? snapshot.trouble : null
)

/**
 * Every Vault.make option, passed through as given (an option left out gets Vault.make's default,
 * and one it does not take is refused, to the error boundary), except that `userId` may be null
 * and `getProof` left out means the provider's own passphrase dialog; and three for that dialog: whether it offers a forgetful user to start over, what a
 * password manager files the passphrase under, and the advice it shows as the user chooses one
 * (`PassphraseModal` has each). In a browser, spread `browserOpts()` from `safebyok/browser` for
 * the `keyDeriver`, `deviceDB` and `passphraseStrengthTest` Vault.make asks for. `VaultProvider`
 * says which props make a new vault as they change, and which do not.
 */
export type VaultProviderProps = Omit<MakeVaultOpts, 'userId'> & {
  /** The signed-in user from the host's auth, or null when nobody is: then there is no vault. */
  userId:              string | null
  /**
   * What asks the user for a proof when a call needs the vault unlocked (Vault.make's `getProof`).
   * Left out, the provider's own: its passphrase dialog, `PassphraseModal`, one at a time, shown
   * only while the user's gesture is in hand (`navigator.userActivation`) -- a call a timer makes
   * is declined unasked, or carries on under a lease ending -- and closing as a lock lands. Null:
   * none, every ask declined, so a call needing the vault locked refuses 'vault_locked' and the app
   * prompts on its own. Written inline, it makes no new vault.
   */
  getProof?:           GetProof | null | undefined
  /**
   * Whether the passphrase dialog offers a user who has forgotten the passphrase to delete the
   * vault, on every device, and start a new one: `PassphraseModal`'s `allowStartOver`. Off by
   * default.
   */
  allowStartOver?:     boolean | undefined
  /**
   * What a password manager files the vault's passphrase under: `PassphraseModal`'s
   * `passphraseUsername`. Default: the user and the vault, as 'u1 (main vault)'. Never the user's
   * sign-in name alone, or a manager may take the passphrase for their sign-in password.
   */
  passphraseUsername?: string | undefined
  /**
   * What to say beside the field as the user chooses a passphrase: `PassphraseModal`'s
   * `passphraseAdvice`. Default: the `passphraseStrengthTest`'s reason for a passphrase it finds
   * weak, and nothing for one it admits, so the user hears why before pressing Create. Like the
   * strength test, it hears the passphrase in plain text: keep it on the device.
   */
  passphraseAdvice?:   PassphraseAdvice | undefined
  children:            ReactNode
}

/**
 * The one logger the provider and the vault it opens say things through: the host's `logger`,
 * else the one its `vaultDB` was made with, guarded. Undefined for a logger, or a vaultDB, that
 * Vault.make will refuse, to the error boundary.
 */
const settleLogger = (logger: VaultLogger | null | undefined, vaultDB: VaultDB): VaultLogger | undefined => {
  try {
    return parseLogger(logger ?? vaultDB.logger)
  } catch {
    // Vault.make refuses the same logger or vaultDB, and the provider throws that to the error boundary.
    return undefined
  }
}

/**
 * The strength test as the dialog's advice: its reason for a passphrase it finds weak, and nothing
 * for one it admits, or for one it fails to judge -- its word list failing to load mid-typing,
 * say -- which Create, running the test again, then says as its own refusal. It runs on the
 * device, as the test does.
 */
const adviceFrom = (strengthTest: PassphraseStrengthTest, scope: VaultScope): PassphraseAdvice => async (typed) => {
  try {
    const verdict = await strengthTest(typed, scope)
    return verdict.strong ? null : verdict.reason
  } catch {
    // Advice is a courtesy: a test that cannot answer now ends nothing, and Create asks it again.
    return null
  }
}

/**
 * Makes the vault for the signed-in user from its props, says its first `hello()`, and hands it
 * down to {@link useVault}, {@link useVaultSnapshot} and {@link useOpenError}. The provider owns the vault: it closes it when the user signs out
 * (a null `userId`), and makes a new one, closing the last, when a prop that shapes the vault
 * changes -- the user, the scope (`applabel`, `vaultlabel`), the stores (`vaultDB`, `deviceDB`),
 * the `keyDeriver`, `leaseHours`, `staleMinutes`, `maxWhisperBytes`, `maxBoxes`, the `clock`, the
 * `logger`, the `passphraseStrengthTest`, or a schema in `validators`. So build each of those
 * once -- at module level, or memoized -- never inline in the props; each schema in `validators`
 * likewise, though the bag around them may be built in render. A `logger`, `clock` or
 * `passphraseStrengthTest` that changes identity is warned of once, through the logger. A handler
 * makes no new vault: `onBadNews` and `getProof` may be written inline, and the vault calls
 * whichever the last render passed, for as long as the provider holds it. Under React's StrictMode, whose rehearsal
 * makes and closes a vault in development, that rehearsed vault reads nothing: only the vault kept
 * says hello.
 *
 * The provider and its vault say things through one logger: the `logger` given here, else the one
 * the `vaultDB` was made with (the default logger when it was given none). Unless given a
 * `getProof` of the host's own, it renders the passphrase dialog, `PassphraseModal`, whenever a
 * call on the vault needs it unlocked and finds it not -- `vault.getBox(...)` and the rest, or
 * `vault.ensureLease()` on an Unlock button -- one at a time: unstyled markup under the
 * `modal-scrim` / `modal` class names, for the host's stylesheet to dress. The call waits on the
 * dialog, and goes on once it unlocks; dismissed, it refuses with kind 'vault_locked'. A lock, a
 * sign-out or another user closes the dialog, its calls refused likewise.
 *
 * If the first `hello()` is refused with a condition (`isCondition` from safebyok) or bad
 * news -- storage that cannot be reached, a signed-out user, a damaged record, a browser
 * withholding storage -- the provider keeps the refusal, while the vault is still opening, and
 * hands it down as `openError`, for the app to show in place, beside a `retryOpen` button where a
 * retry may mend it (not `storage_blocked`). Misuse -- a bad label or option, which `Vault.make`
 * throws, or a hello refused as misuse or with a value that is no VaultError at all -- reaches the
 * nearest error boundary.
 *
 * @example
 *   <VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={session?.userId ?? null}
 *     vaultDB={vaultDB}>
 *     <App />
 *   </VaultProvider>
 * @example
 *   <VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB}
 *     onBadNews={(news) => { telemetry.report(news.refusalkind) }}>
 *     <App />
 *   </VaultProvider>
 * @example
 *   const { ok, val: whisper } = await vault.tryGetBox('anthropic_api_key')   // asks through the dialog when locked
 *   if (! ok) { return null }   // dismissed: refused 'vault_locked'
 */
export const VaultProvider = ({ userId, allowStartOver, passphraseUsername, passphraseAdvice, children, ...opts }: VaultProviderProps) => {
  const { applabel, vaultlabel, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews, getProof, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, validators, passphraseStrengthTest, ...unlisted } = opts
  // Each prop Vault.make does not take, by name -- a misspelling, a deleted name -- handed on to it,
  // so it is refused, to the error boundary, rather than dropped here unseen.
  const unlistedJson = JSON.stringify(Object.keys(unlisted))
  // The bag is taken apart below, so a misspelt field would be dropped unseen: refused here, as Vault.make refuses it.
  checkValidators(validators)
  // Checked at the first render that has it, as Vault.make checks it; the vault keeps it for its life.
  checkStrengthTest(passphraseStrengthTest)
  // The vault is made anew when a check changes, never for a bag rebuilt in render around the same ones.
  const applabelCheck = validators?.applabel
  const vaultlabelCheck = validators?.vaultlabel
  const boxlabelCheck = validators?.boxlabel
  const userIdCheck = validators?.userId
  const [vault, setVault] = useState<Vault | null>(null)
  // The dialog showing now, if any. The ref is what the callbacks read, so that a dialog's answer
  // reaches its own ask and no newer one's; the state renders it.
  const [showing, setShowing] = useState<Showing | null>(null)
  const showingRef = useRef<Showing | null>(null)
  // The handle the open effect holds now, set and cleared with it: null from the moment a vault
  // goes until the next arrives.
  const vaultRef = useRef<Vault | null>(null)
  // Counts the dialog's showings, so that each is a fresh dialog with nothing kept from the last.
  const showingRounds = useRef(0)
  // Wrapped, so that a rejection carrying any value at all (null, say) still reads as "failed".
  const [helloFailure, setHelloFailure] = useState<{ err: unknown } | null>(null)
  // What the provider's last hello of each vault was refused with; null once one succeeds.
  const [helloRefusal, setHelloRefusal] = useState<{ vault: Vault, err: VaultError } | null>(null)
  // Whether the vault is still opening, read so the provider renders only when that changes.
  const readOpening = useCallback(() => vault?.getSnapshot().state === 'opening', [vault])
  const opening = useSyncExternalStore(vault === null ? subscribeToNothing : vault.subscribe, vault === null ? getNotOpening : readOpening, getNotOpening)
  // A read after the provider's hello refused as 'rolled_back' sends the vault back to opening,
  // and only its trouble says why: read so the provider renders only when that changes.
  const readRolledBack = useCallback(() => rolledBackOf(vault?.getSnapshot()), [vault])
  const rolledBack = useSyncExternalStore(vault === null ? subscribeToNothing : vault.subscribe, vault === null ? getNothing : readRolledBack, getNothing)
  // A refusal says why the vault is not open only while it is not: a ring from storage that settles it clears it.
  const openError = opening && helloRefusal !== null && helloRefusal.vault === vault ? helloRefusal.err : rolledBack
  // Settled once for each logger and vaultDB, so the provider and every vault it opens share it.
  const heardBy = useMemo(() => settleLogger(logger, vaultDB), [logger, vaultDB])
  // The logger, clock and strength test the last render had, and whether a change of any was warned of yet.
  const sinks = useRef({ logger, clock, passphraseStrengthTest })
  const toldOfSinks = useRef(false)
  // The host's onBadNews as of the last commit. The vault is handed a teller that keeps its
  // identity and calls whichever handler that is, so a handler written inline makes no new vault.
  // Moved in a passive effect: React runs every passive cleanup before any passive effect, so the
  // open effect below has closed the last vault's gate before the next user's handler is here.
  const badNewsRef = useRef(onBadNews)
  useEffect(() => { badNewsRef.current = onBadNews })
  const tellBadNews = useCallback<BadNewsHandler>((news) => badNewsRef.current?.(news), [])
  // Anything but a function, or none, is misuse: handed to Vault.make as it came, to be refused.
  const badNewsOpt = onBadNews === undefined || onBadNews === null || typeof onBadNews === 'function' ? tellBadNews : onBadNews

  /** Closes `ending` if it is still the dialog showing, and answers its ask. */
  const endShowing = useCallback((ending: Showing, answer: ProofAnswer) => {
    if (showingRef.current === ending) {
      showingRef.current = null
      setShowing(null)
    }
    ending.answer(answer)
  }, [])

  // The provider's own getProof: its passphrase dialog, shown only while the user's gesture is in
  // hand. The vault asks one at a time, so a dialog showing is never asked over.
  const askByDialog = useCallback<GetProof>((ask) => new Promise<ProofAnswer>((answer) => {
    if (! hasUserGesture()) { answer(ask.why === 'lease_ending' ? 'carry_on' : 'declined'); return }
    showingRounds.current += 1
    const next = { round: showingRounds.current, ask, answer }
    showingRef.current = next
    setShowing(next)
  }), [])

  // The host's getProof as of the last commit, held as onBadNews is: the vault is handed one asker
  // that keeps its identity, so a getProof written inline makes no new vault. Moved as badNewsRef is.
  const hostAskerRef = useRef(getProof)
  useEffect(() => { hostAskerRef.current = getProof })
  const askProof = useCallback<GetProof>((ask) => {
    const hosts = hostAskerRef.current
    if (hosts === undefined) { return askByDialog(ask) }
    return hosts === null ? 'declined' : hosts(ask)
  }, [askByDialog])
  const getProofOpt = getProof === undefined || getProof === null || typeof getProof === 'function' ? askProof : getProof

  // A logger, clock or strength test written inline in the props is new at every render, and
  // makes a new vault each time: said once, the first time any changes.
  useEffect(() => {
    const last = sinks.current
    sinks.current = { logger, clock, passphraseStrengthTest }
    const changed = [
      ...(last.logger === logger ? [] : ['logger']),
      ...(last.clock === clock ? [] : ['clock']),
      ...(last.passphraseStrengthTest === passphraseStrengthTest ? [] : ['passphraseStrengthTest']),
    ]
    if (toldOfSinks.current || changed.length === 0) { return }
    toldOfSinks.current = true
    heardBy?.warn(`VaultProvider reopened the vault because its ${changed.join(' and ')} changed identity between renders. Written inline in the props, it is new at every render, and reopens the vault each time: define it once, outside the component, or memoize it.`, { call: 'VaultProvider', props: changed })
  }, [logger, clock, passphraseStrengthTest, heardBy])

  /**
   * Has `made` say hello, again when retried: the provider owns the vault's first hello. A refusal
   * that is a condition or bad news is kept for openError, until a hello succeeds; one that is
   * misuse goes to the error boundary. Nothing is heard from a vault the provider has let go.
   */
  const sayHello = useCallback(async (made: Vault, helloOpts?: { staleMinutes: number }) => {
    const { ok, err } = await made.tryHello(helloOpts)
    if (vaultRef.current !== made) { return }
    if (ok) {
      setHelloRefusal(null)
    } else if (isCondition(err)) {
      setHelloRefusal({ vault: made, err })
    } else {
      setHelloFailure({ err })
    }
  }, [])

  useEffect(() => {
    if (userId === null) { return }
    // Listed one by one so the effect re-runs on each; `satisfies` fails the build if a Vault.make
    // option is ever added and not passed through.
    const checks = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck } satisfies Record<keyof VaultValidators, unknown>
    const refusable = Object.fromEntries((JSON.parse(unlistedJson) as string[]).map((ckey) => [ckey, undefined]))
    // Bad news a vault meets once the provider has let it go -- a read under way as the user
    // changed -- is told to no one: the handler now may be the next user's.
    const kept = { held: true }
    const tellWhileHeld: BadNewsHandler = (news) => (kept.held ? tellBadNews(news) : undefined)
    // Likewise, a vault let go asks no one: the getProof now may be the next user's.
    const askWhileHeld: GetProof = (ask) => (kept.held ? askProof(ask) : 'declined')
    const makeOpts = { ...refusable, applabel, vaultlabel, userId, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews: badNewsOpt === tellBadNews ? tellWhileHeld : badNewsOpt, getProof: getProofOpt === askProof ? askWhileHeld : getProofOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger: heardBy ?? logger, validators: checks, passphraseStrengthTest } satisfies Record<keyof MakeVaultOpts, unknown>
    // The handle is this effect's to make and to close, and the render hands it down. A refused
    // option throws from here to the nearest error boundary, as the very VaultError.
    const made = Vault.make(makeOpts)
    vaultRef.current = made
    setVault(made) // eslint-disable-line react-hooks/set-state-in-effect -- the effect owns the handle, making it and closing it, so a re-run effect (StrictMode's, a hidden Activity shown again) makes a fresh one; the render hands down the handle the effect holds now, set once per handle
    // Said a microtask on: StrictMode's rehearsal closes the vault in this same task, and a vault
    // closed before it is greeted has read nothing.
    queueMicrotask(() => {
      if (vaultRef.current === made) { void sayHello(made) }
    })
    return () => {
      kept.held = false
      vaultRef.current = null
      // Closing the vault lands as a lock: its prompt's waiters are refused, and the dialog over it
      // answers declined and closes.
      made.close()
      if (showingRef.current?.ask.vault === made) { endShowing(showingRef.current, 'declined') }
      setVault(null)
      setHelloFailure(null)
      setHelloRefusal(null)
    }
  }, [userId, applabel, vaultlabel, vaultDB, deviceDB, leaseHours, staleMinutes, badNewsOpt, getProofOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, heardBy, passphraseStrengthTest, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, unlistedJson, tellBadNews, askProof, endShowing, sayHello])

  const retryOpen = useCallback(() => {
    if (vault !== null && openError !== null) { void sayHello(vault, { staleMinutes: 0 }) }
  }, [vault, openError, sayHello])

  const delDamagedVault = useCallback(async () => {
    if (userId === null || vault === null || ! isVaultError(openError, 'damaged_vault')) { return }
    const validators = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck } satisfies Record<keyof VaultValidators, unknown>
    try {
      await delStoredDamagedVault({ applabel, vaultlabel, userId, vaultDB, deviceDB, validators })
    } catch (err) {
      // The vault was made anew, so what openError says is out of date: say hello again, and still
      // tell the caller why nothing was deleted. Misuse (bad_option) says nothing anew.
      if (isVaultError(err, 'stale_write')) { void sayHello(vault, { staleMinutes: 0 }) }
      throw err
    }
    void sayHello(vault, { staleMinutes: 0 })
  }, [openError, vault, userId, applabel, vaultlabel, vaultDB, deviceDB, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, sayHello])

  const opened = useMemo(() => ({ openError, retryOpen, delDamagedVault }), [openError, retryOpen, delDamagedVault])
  const provided = useMemo(() => ({ vault, opened }), [vault, opened])

  // Thrown here, in render, so the nearest error boundary (or the dev overlay) shows it: misuse,
  // the developer's to fix, which no retry would mend. Every hook has run by now, so the throw
  // leaves the rules of hooks alone.
  if (helloFailure !== null) { throw helloFailure.err }

  return (
    <VaultContext.Provider value={provided}>
      {children}
      {showing !== null && showing.ask.vault === vault && (
        <PassphraseModal
          key={showing.round}
          ask={showing.ask}
          allowStartOver={allowStartOver}
          passphraseUsername={passphraseUsername}
          passphraseAdvice={passphraseAdvice ?? adviceFrom(passphraseStrengthTest, scopeOf(showing.ask.vault))}
          onDone={(answer) => { endShowing(showing, answer) }}
        />
      )}
    </VaultContext.Provider>
  )
}
// --
