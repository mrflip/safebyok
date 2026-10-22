import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Bank, type Ask, type GetProof, type ProofAnswer, checkValidators, delDamagedVault as delStoredDamagedVault, isCondition, isVaultError, parseLogger, type BadNewsHandler, type MakeBankOpts, type Vault, type VaultChoice, type VaultDB, type VaultEntry, type VaultError, type VaultLogger, type VaultSnapshot, type VaultValidators } from 'safebyok'
import { PassphraseModal, type PassphraseAdvice } from './passphrase-modal'

// == [Hooks]: useVault, useVaultSnapshot, useOpenError, OpenErrorShape

/** Why the provider has no vault to hand down, and what the app can do about it: what {@link useOpenError} hands down. */
export type OpenErrorShape = {
  /** Why the vault could not be opened, when it is a condition or bad news the app can show in place; null otherwise.
   * It is what the vault's birth was refused with: storage that cannot be reached
   * (`storage_unavailable`), a user storage no longer serves (`identity_revoked`, as when signed out
   * of the backend), a vault whose stored props fail their checks (`damaged_vault`), a browser that
   * will not let the app keep anything on this device (`storage_blocked`), or storage serving an
   * older copy of the vault than this device has seen (`vault_behind`). A vault opened once lands
   * here too when a later read meets an older copy (`vault_behind`, the vault's `trouble`). One
   * deleted -- by its own `del()`, as the dialog's "Start over" does, or found deleted or made anew
   * by a later read -- never does: the provider asks for the vault again at once, and hands down
   * the one that stands, `novel` after a deletion.
   *
   * Null while the vault is being born, once it is born, and while signed out. Misuse -- a bad
   * label or option -- never lands here: the provider throws it to the nearest error boundary.
   * Offer `retryOpen` only where a retry may mend it: never for `storage_blocked`, which holds
   * until something outside the app changes (say why instead), nor for `damaged_vault`, which
   * `delDamagedVault` answers, nor for `vault_behind`, which holds until storage serves the newer
   * copy again, or this device is made to accept the older one (`bank.clearCachedVault`, in the
   * `safebyok` README).
   *
   * It is not the vault's `trouble`: `trouble` is the latest bad news a vault met on any read, and
   * never a condition; `openError` is why there is no vault to use.
   *
   * @example
   *   if (openError?.refusalkind === 'storage_blocked') { return <p>{"This browser won't let the app keep your vault on this device."}</p> }
   *   if (openError?.refusalkind === 'damaged_vault') { return <p>{"Your vault's stored record is damaged."}</p> }
   *   if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
   */
  openError: VaultError | null
  /** Ask for the vault again after `openError`, reading storage afresh: a new birth, which hands down the vault, or names what it met.
   * While it reads, there is no vault and no openError. Does nothing while there is no openError
   * to retry.
   */
  retryOpen: () => void
  /** Delete the stored vault that `openError` reports as `damaged_vault`, with this device's lease of it, and ask for the vault again: a fresh, novel vault, for the user to make anew.
   * The user's boxes in it are gone for good, so ask first. Resolves once the new birth is under
   * way, and does nothing while `openError` is any other, or none. Rejects with storage's refusal
   * if deleting it fails, such as `storage_unavailable`, leaving `openError` as it was; the
   * `safebyok` package's `delDamagedVault` says which refusals to expect. One of them,
   * `stale_write`, means the vault was made anew meanwhile, so that one asks for the vault again
   * as well, and still rejects. Any other refusal asks nothing anew: `bad_option` among them, which
   * is misuse, or a vault that reads sound now, which `retryOpen()` then opens.
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

/** The vault the nearest VaultProvider opened for the signed-in user, or null while there is none.
 * There is none while nobody is signed in, while the vault is being born (a read of storage), and
 * while `openError` says why it could not be. Once handed down it is `novel`, `locked` or
 * `unlocked`. Its fields read live in an event handler; render from {@link useVaultSnapshot},
 * which re-renders as they change.
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

/** The vault's live snapshot -- its state, the box listing, the ways in, when it next asks for the passphrase -- or null while there is no vault.
 * Read through `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`, so the component
 * renders again whenever it changes, and only then.
 *
 * @example
 *   const snapshot = useVaultSnapshot()
 *   if (snapshot === null) { return <p>Opening your vault…</p> }
 *   return <p>{snapshot.boxes.length} keys stored</p>
 */
export const useVaultSnapshot = (): VaultSnapshot | null => {
  const { vault } = useProvided('useVaultSnapshot')
  const getSnapshot = vault?.getSnapshot ?? getNothing
  // The server renders with no vault, as the client's first render does: no snapshot on either.
  return useSyncExternalStore(vault?.subscribe ?? subscribeToNothing, getSnapshot, getNothing)
}

/** Why the provider has no vault, `openError`, beside `retryOpen` and `delDamagedVault`: {@link OpenErrorShape} says each.
 *
 * @example
 *   const { openError, retryOpen } = useOpenError()
 *   if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
 */
export const useOpenError = (): OpenErrorShape => useProvided('useOpenError').opened
// --

// == [VaultProvider]: VaultProviderProps, VaultProvider, settleLogger, Showing, hasUserGesture, entryOf, isGoneRefusal, behindOf

/** One showing of the passphrase dialog: which one, the ask it answers, and how it answers. */
type Showing = { round: number, ask: Ask, answer: (answer: ProofAnswer) => void }

/** Whether the user's gesture is still in hand, so a dialog may be shown: true where the browser does not say (`navigator.userActivation` is newer than some), as there is no telling. */
const hasUserGesture = (): boolean => (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation?.isActive !== false

/** The bank's entry for the vault `choice` names, or null for none; null too for names that fail their check, which the birth refuses to the error boundary. */
const entryOf = (bank: Bank, choice: VaultChoice): VaultEntry | null => {
  try {
    return bank.entryOf(choice)
  } catch {
    return null
  }
}

/** True for the refusal of a vault gone: 'vault_gone' (deleted, here or elsewhere) or 'vault_remade' (deleted and made anew). */
const isGoneRefusal = (err: VaultError | null): boolean => isVaultError(err, 'vault_gone') || isVaultError(err, 'vault_remade')

/** The vault's trouble when it is a 'vault_behind' refusal, met by a read after its birth; null otherwise. */
const behindOf = (vault: Vault | null): VaultError | null => {
  const trouble = vault?.getSnapshot().trouble ?? null
  return isVaultError(trouble, 'vault_behind') ? trouble : null
}

/** Every Bank.make option, passed through as given, beside the vault's `userId` and `vaultlabel`, and three for the passphrase dialog.
 * An option left out gets Bank.make's default, and one it does not take is refused, to the error
 * boundary. `userId` may be null, and `getProof` left out means the provider's own passphrase
 * dialog. The dialog's three: whether it offers a forgetful user to start over, what a password
 * manager files the passphrase under, and the advice it shows as the user chooses one
 * (`PassphraseModal` has each). In a browser, spread `browserOpts()` from `safebyok/browser` for
 * the `keyDeriver`, `deviceDB` and `strengthChecker` Bank.make asks for. `VaultProvider` says
 * which props open the vault anew as they change, and which do not.
 */
export type VaultProviderProps = MakeBankOpts & {
  /** The signed-in user from the host's auth, or null when nobody is: then there is no vault. */
  userId:              string | null
  /** The vault's own label; an app that keeps one vault per user calls it `main`. */
  vaultlabel:          string
  /** What asks the user for a proof when a call needs the vault unlocked (Bank.make's `getProof`).
   * Left out, the provider's own: its passphrase dialog, `PassphraseModal`, one at a time, shown
   * only while the user's gesture is in hand (`navigator.userActivation`) -- a call a timer makes
   * is declined unasked, or carries on under a lease ending -- and closing as a lock lands. Null:
   * none, every ask declined, so a call needing the vault locked refuses 'vault_locked' and the app
   * prompts on its own. Written inline, it opens no new vault.
   */
  getProof?:           GetProof | null | undefined
  /** Whether the passphrase dialog offers a user who has forgotten the passphrase to delete the vault, on every device, and start a new one: `PassphraseModal`'s `allowStartOver`. Off by default. */
  allowStartOver?:     boolean | undefined
  /** What a password manager files the vault's passphrase under: `PassphraseModal`'s `passphraseUsername`.
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

/** The one logger the provider and the vault it opens say things through: the host's `logger`, else the one its `vaultDB` was made with, guarded.
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

/** Opens the signed-in user's vault from its props, and hands it down to {@link useVault}, {@link useVaultSnapshot} and {@link useOpenError}.
 * It makes a bank of its own (`Bank.make`) and asks it for the vault (`bank.ensureVault`), one
 * read of storage that births the Vault object. Until that read settles there is no vault.
 *
 * The provider owns the vault. It lets it go when the user signs out (a null `userId`). It opens
 * the vault anew, letting the last go, when a prop that shapes it changes -- the user, the scope
 * (`applabel`, `vaultlabel`), the stores (`vaultDB`, `deviceDB`), the `keyDeriver`, `leaseHours`,
 * `staleMinutes`, `maxWhisperBytes`, `maxBoxes`, the `clock`, the `logger`, the `strengthChecker`,
 * or a schema in `validators`. So build each of those once -- at module level, or memoized --
 * never inline in the props; each schema in `validators` likewise, though the bag around them may
 * be built in render. A `logger`, `clock` or `strengthChecker` that changes identity is warned of
 * once, through the logger. A handler opens no new vault: `onBadNews` and `getProof` may be
 * written inline, and the vault calls whichever the last render passed, for as long as the
 * provider holds it. Under React's StrictMode, whose rehearsal opens the vault and lets it go in
 * development, the rehearsal reads nothing: only the vault kept is born.
 *
 * The provider and its vault say things through one logger: the `logger` given here, else the one
 * the `vaultDB` was made with (the default logger when it was given none). Unless given a
 * `getProof` of the host's own, it renders the passphrase dialog, `PassphraseModal`, whenever a
 * call on the vault needs it unlocked and finds it not -- `vault.getWhisper(...)` and the rest, or
 * `vault.ensureLease()` on an Unlock button -- one at a time: unstyled markup under the
 * `modal-scrim` / `modal` class names, for the host's stylesheet to dress. The call waits on the
 * dialog, and goes on once it unlocks; dismissed, it refuses with kind 'vault_locked'. A lock
 * closes the dialog, its calls refused likewise; a sign-out, another user, or the provider
 * unmounting lets the vault go, closing the dialog, its calls refused 'vault_gone'.
 *
 * If the birth is refused with a condition (`isCondition` from safebyok) or bad news -- storage
 * that cannot be reached, a signed-out user, a damaged record, a browser withholding storage,
 * storage behind what this device has seen -- the provider hands it down as `openError`, for the
 * app to show in place, beside a `retryOpen` button where a retry may mend it. A vault deleted --
 * by its own `del()`, or found deleted or made anew by a later read -- is asked for again at once:
 * the provider hands down the one that stands, `novel` after a deletion. Misuse -- a bad label or
 * option, which `Bank.make` throws, or a birth refused as misuse or with a value that is no
 * VaultError at all -- reaches the nearest error boundary.
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
 *   const { ok, val: whisper } = await vault.tryGetWhisper('anthropic_api_key')   // asks through the dialog when locked
 *   if (! ok) { return null }   // dismissed: refused 'vault_locked'
 */
export const VaultProvider = ({ userId, vaultlabel, allowStartOver, passphraseUsername, passphraseAdvice, children, ...opts }: VaultProviderProps) => {
  const { applabel, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews, getProof, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, validators, strengthChecker, ...unlisted } = opts
  // Each prop Bank.make does not take, by name -- a misspelling, a deleted name -- handed on to it,
  // so it is refused, to the error boundary, rather than dropped here unseen.
  const unlistedJson = JSON.stringify(Object.keys(unlisted))
  // The bag is taken apart below, so a misspelt field would be dropped unseen: refused here, as Bank.make refuses it.
  checkValidators(validators)
  // The vault is opened anew when a check changes, never for a bag rebuilt in render around the same ones.
  const applabelCheck = validators?.applabel
  const vaultlabelCheck = validators?.vaultlabel
  const boxlabelCheck = validators?.boxlabel
  const userIdCheck = validators?.userId
  // The bank the open effect holds now, set and cleared with it; the ref is what an answer from
  // storage is checked against, so that nothing is heard from a bank let go.
  const [bank, setBank] = useState<Bank | null>(null)
  const bankRef = useRef<Bank | null>(null)
  // The dialog showing now, if any. The ref is what the callbacks read, so that a dialog's answer
  // reaches its own ask and no newer one's; the state renders it.
  const [showing, setShowing] = useState<Showing | null>(null)
  const showingRef = useRef<Showing | null>(null)
  // Counts the dialog's showings, so that each is a fresh dialog with nothing kept from the last.
  const showingRounds = useRef(0)
  // Misuse a birth was refused with, for the error boundary. Wrapped, so that a refusal carrying
  // any value at all still reads as "failed".
  const [birthFailure, setBirthFailure] = useState<{ err: unknown } | null>(null)
  // The bank's entry for the vault, read so the provider renders only when it changes: the vault
  // once born, or why it is not.
  const readEntry = useCallback(() => (bank === null || userId === null ? null : entryOf(bank, { userId, vaultlabel })), [bank, userId, vaultlabel])
  const entry = useSyncExternalStore(bank === null ? subscribeToNothing : bank.subscribe, readEntry, getNothing)
  const vault = entry?.status === 'timely' ? entry.vault : null
  // A read after the birth refused as 'vault_behind' locks the vault, and only its trouble says
  // why: read so the provider renders only when that changes.
  const readBehind = useCallback(() => behindOf(vault), [vault])
  const behind = useSyncExternalStore(vault === null ? subscribeToNothing : vault.subscribe, readBehind, getNothing)
  // A vault gone -- deleted by its own del(), or found deleted or made anew -- is asked for again
  // below, and is no openError meanwhile: the vault that stands is on its way.
  const gone = entry?.status === 'refused' && isGoneRefusal(entry.err) ? entry : null
  // Misuse is the boundary's, thrown below; a refusal says why there is no vault only while there is none.
  const refused = gone === null && entry?.status === 'refused' && isCondition(entry.err) ? entry.err : null
  const openError = refused ?? behind
  // Settled once for each logger and vaultDB, so the provider and every vault it opens share it.
  const heardBy = useMemo(() => settleLogger(logger, vaultDB), [logger, vaultDB])
  // The logger, clock and strength checker the last render had, and whether a change of any was warned of yet.
  const sinks = useRef({ logger, clock, strengthChecker })
  const toldOfSinks = useRef(false)
  // The host's onBadNews as of the last commit. The bank is handed a teller that keeps its
  // identity and calls whichever handler that is, so a handler written inline opens no new vault.
  // Moved in a passive effect: React runs every passive cleanup before any passive effect, so the
  // open effect below has closed the last bank's gate before the next user's handler is here.
  const badNewsRef = useRef(onBadNews)
  useEffect(() => { badNewsRef.current = onBadNews })
  const tellBadNews = useCallback<BadNewsHandler>((news) => badNewsRef.current?.(news), [])
  // Anything but a function, or none, is misuse: handed to Bank.make as it came, to be refused.
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

  // The host's getProof as of the last commit, held as onBadNews is: the bank is handed one asker
  // that keeps its identity, so a getProof written inline opens no new vault. Moved as badNewsRef is.
  const hostAskerRef = useRef(getProof)
  useEffect(() => { hostAskerRef.current = getProof })
  const askProof = useCallback<GetProof>((ask) => {
    const hosts = hostAskerRef.current
    if (hosts === undefined) { return askByDialog(ask) }
    return hosts === null ? 'declined' : hosts(ask)
  }, [askByDialog])
  const getProofOpt = getProof === undefined || getProof === null || typeof getProof === 'function' ? askProof : getProof

  // A logger, clock or strength checker written inline in the props is new at every render, and
  // opens the vault anew each time: said once, the first time any changes.
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
    heardBy?.warn(`VaultProvider reopened the vault because its ${changed.join(' and ')} changed identity between renders. Written inline in the props, it is new at every render, and reopens the vault each time: define it once, outside the component, or memoize it.`, { call: 'VaultProvider', props: changed })
  }, [logger, clock, strengthChecker, heardBy])

  /** Asks `from` for the vault `choice` names, again when retried: the entry the bank keeps hands it down, or the refusal. Misuse goes to the error boundary. Nothing is heard from a bank the provider has let go. */
  const ensure = useCallback(async (from: Bank, choice: VaultChoice) => {
    const { ok, err } = await from.tryEnsureVault(choice)
    if (ok || bankRef.current !== from || isCondition(err)) { return }
    setBirthFailure({ err })
  }, [])

  useEffect(() => {
    if (userId === null) { return }
    // Listed one by one so the effect re-runs on each; `satisfies` fails the build if a Bank.make
    // option is ever added and not passed through.
    const checks = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck } satisfies Record<keyof VaultValidators, unknown>
    const refusable = Object.fromEntries((JSON.parse(unlistedJson) as string[]).map((ckey) => [ckey, undefined]))
    // Bad news a vault meets once the provider has let its bank go -- a read under way as the user
    // changed -- is told to no one: the handler now may be the next user's.
    const kept = { held: true }
    const tellWhileHeld: BadNewsHandler = (news) => (kept.held ? tellBadNews(news) : undefined)
    // Likewise, a vault let go asks no one: the getProof now may be the next user's.
    const askWhileHeld: GetProof = (ask) => (kept.held ? askProof(ask) : 'declined')
    const bankOpts = { ...refusable, applabel, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews: badNewsOpt === tellBadNews ? tellWhileHeld : badNewsOpt, getProof: getProofOpt === askProof ? askWhileHeld : getProofOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger: heardBy ?? logger, validators: checks, strengthChecker } satisfies Record<keyof MakeBankOpts, unknown>
    // The bank is this effect's to make and to let go, and the render hands down its vault. A
    // refused option throws from here to the nearest error boundary, as the very VaultError.
    const made = Bank.make(bankOpts)
    bankRef.current = made
    setBank(made) // eslint-disable-line react-hooks/set-state-in-effect -- the effect owns the bank, making it and letting it go, so a re-run effect (StrictMode's, a hidden Activity shown again) makes a fresh one; the render reads the bank the effect holds now, set once per bank
    // Asked a microtask on: StrictMode's rehearsal lets the bank go in this same task, and a bank
    // let go before it is asked has read nothing.
    queueMicrotask(() => {
      if (bankRef.current === made) { void ensure(made, { userId, vaultlabel }) }
    })
    return () => {
      kept.held = false
      bankRef.current = null
      // Letting the vault go ends its prompt: its waiters are refused 'vault_gone', and the dialog over
      // it answers declined and closes.
      made.closeVaults()
      if (showingRef.current !== null) { endShowing(showingRef.current, 'declined') }
      setBank(null)
      setBirthFailure(null)
    }
  }, [userId, applabel, vaultlabel, vaultDB, deviceDB, leaseHours, staleMinutes, badNewsOpt, getProofOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, heardBy, strengthChecker, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, unlistedJson, tellBadNews, askProof, endShowing, ensure])

  // Each gone entry, once: the bank births the vault that stands now, the next life after a deletion.
  useEffect(() => {
    if (gone === null || bank === null || userId === null) { return }
    void ensure(bank, { userId, vaultlabel })
  }, [gone, bank, userId, vaultlabel, ensure])

  const retryOpen = useCallback(() => {
    if (bank !== null && userId !== null && openError !== null) { void ensure(bank, { userId, vaultlabel }) }
  }, [bank, userId, vaultlabel, openError, ensure])

  const delDamagedVault = useCallback(async () => {
    if (bank === null || userId === null || ! isVaultError(openError, 'damaged_vault')) { return }
    const choice = { userId, vaultlabel }
    const checks = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck } satisfies Record<keyof VaultValidators, unknown>
    try {
      await delStoredDamagedVault({ applabel, ...choice, vaultDB, deviceDB, validators: checks })
    } catch (err) {
      // The vault was made anew, so what openError says is out of date: ask for it again, and still
      // tell the caller why nothing was deleted. Misuse (bad_option) asks nothing anew.
      if (isVaultError(err, 'stale_write')) { void ensure(bank, choice) }
      throw err
    }
    void ensure(bank, choice)
  }, [openError, bank, userId, applabel, vaultlabel, vaultDB, deviceDB, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, ensure])

  const opened = useMemo(() => ({ openError, retryOpen, delDamagedVault }), [openError, retryOpen, delDamagedVault])
  const provided = useMemo(() => ({ vault, opened }), [vault, opened])

  // Thrown here, in render, so the nearest error boundary (or the dev overlay) shows it: misuse,
  // the developer's to fix, which no retry would mend. Every hook has run by now, so the throw
  // leaves the rules of hooks alone.
  if (birthFailure !== null) { throw birthFailure.err }

  return (
    <VaultContext.Provider value={provided}>
      {children}
      {showing !== null && showing.ask.vault === vault && (
        <PassphraseModal
          key={showing.round}
          ask={showing.ask}
          allowStartOver={allowStartOver}
          passphraseUsername={passphraseUsername}
          passphraseAdvice={passphraseAdvice}
          onDone={(answer) => { endShowing(showing, answer) }}
        />
      )}
    </VaultContext.Provider>
  )
}
// --
