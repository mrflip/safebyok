import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Vault, checkStrengthTest, checkValidators, delDamagedVault as delStoredDamagedVault, isVaultCondition, isVaultError, parseLogger, type BadNewsHandler, type MakeVaultOpts, type PassphraseStrengthTest, type VaultDB, type VaultError, type VaultLogger, type VaultScope, type VaultSnapshot, type VaultValidators } from 'safebyok'
import { PassphraseModal, type PassphraseAdvice } from './passphrase-modal'

// == [Hooks]: useVault, useVaultSnapshot, useOpenError, useWithUnlockedVault, OpenErrorShape, WithUnlockedVault

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
   * keep anything on this device (`storage_blocked`). Null while the hello runs, once the vault
   * has settled, and while signed out. Misuse -- a bad label or option -- never lands here: the
   * provider throws it to the nearest error boundary. Offer `retryOpen` only for one a retry may
   * mend: never for `storage_blocked`, which holds until something outside the app changes (say
   * why instead), nor for `damaged_vault`, which `delDamagedVault` answers.
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

/**
 * Run an action that may need the vault unlocked. If it refuses with kind 'vault_locked', the
 * passphrase dialog opens; after a successful unlock the action runs again. Resolves null when
 * the user dismisses the dialog instead -- unambiguously for whisper reads, since a whisper is
 * never null. Only an action whose own result could be null needs to wrap it in an object.
 * Every call settles: actions that find the vault locked while the dialog is already open wait
 * on that same dialog, and each resolves null when the dialog goes without an unlock -- the
 * user signs out or switches, the vault reopens, or the provider unmounts. So does an action
 * still under way when one of those closes the vault it ran on, whether its first run or its run
 * again after an unlock: the close is the provider's, never the caller's to catch.
 * A dialog the vault unlocks under, however that came about (an earlier, cancelled dialog's
 * unlock finishing late, say), closes as unlocked, and the actions waiting on it run again; an
 * action refused just as the vault unlocked runs again without a dialog at all. A dialog
 * belongs to the vault the action ran against: an action whose refusal lands once that vault has
 * gone (another user, a reopen) resolves null and opens no dialog over the next. A `lock()`
 * landing between the unlock and the runs again is the user's word, and wins: those runs meet
 * `vault_locked`, which reaches their callers.
 *
 * @example const whisper = await withUnlockedVault(() => vault.getBox('anthropic_api_key'))
 *          // whisper === null: the user dismissed the dialog
 */
export type WithUnlockedVault = <ResultT>(action: () => Promise<ResultT>) => Promise<ResultT | null>

/** Everything the provider hands down, each hook reading its part. */
type Provided = { vault: Vault | null, opened: OpenErrorShape, withUnlockedVault: WithUnlockedVault }

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

/**
 * The provider's {@link WithUnlockedVault}: an action run through it that finds the vault locked
 * asks for the passphrase, and runs again once unlocked.
 *
 * @example
 *   const withUnlockedVault = useWithUnlockedVault()
 *   const whisper = await withUnlockedVault(() => vault.getBox('anthropic_api_key'))
 */
export const useWithUnlockedVault = (): WithUnlockedVault => useProvided('useWithUnlockedVault').withUnlockedVault
// --

// == [VaultProvider]: VaultProviderProps, VaultProvider, settleLogger, adviceFrom, Asking

/** One showing of the passphrase dialog: which one, the vault it asks for, and the actions waiting on its outcome. */
type Asking = { round: number, vault: Vault, waiters: ((unlocked: boolean) => void)[] }

/** The scope of `vault`, as the strength test is handed it. */
const scopeOf = (vault: Vault): VaultScope => ({ applabel: vault.applabel, user_id: vault.user_id, vaultlabel: vault.vaultlabel })
const getNotOpening = () => false

/**
 * Every Vault.make option, passed through as given (an option left out gets Vault.make's default,
 * and one it does not take is refused, to the error boundary), except that `userId` may be null;
 * and three for the passphrase dialog: whether it offers a forgetful user to start over, what a
 * password manager files the passphrase under, and the advice it shows as the user chooses one
 * (`PassphraseModal` has each). In a browser, spread `browserOpts()` from `safebyok/browser` for
 * the `keyDeriver`, `deviceDB` and `passphraseStrengthTest` Vault.make asks for. `VaultProvider`
 * says which props make a new vault as they change, and which do not.
 */
export type VaultProviderProps = Omit<MakeVaultOpts, 'userId'> & {
  /** The signed-in user from the host's auth, or null when nobody is: then there is no vault. */
  userId:              string | null
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
 * down to {@link useVault}, {@link useVaultSnapshot}, {@link useOpenError} and
 * {@link useWithUnlockedVault}. The provider owns the vault: it closes it when the user signs out
 * (a null `userId`), and makes a new one, closing the last, when a prop that shapes the vault
 * changes -- the user, the scope (`applabel`, `vaultlabel`), the stores (`vaultDB`, `deviceDB`),
 * the `keyDeriver`, `leaseHours`, `staleMinutes`, `maxWhisperBytes`, `maxBoxes`, the `clock`, the
 * `logger`, the `passphraseStrengthTest`, or a schema in `validators`. So build each of those
 * once -- at module level, or memoized -- never inline in the props; each schema in `validators`
 * likewise, though the bag around them may be built in render. A `logger`, `clock` or
 * `passphraseStrengthTest` that changes identity is warned of once, through the logger. A handler
 * makes no new vault: `onBadNews` may be written inline, and the vault tells whichever the last
 * render passed. Under React's StrictMode, whose rehearsal makes and closes a vault in
 * development, that rehearsed vault reads nothing: only the vault kept says hello.
 *
 * The provider and its vault say things through one logger: the `logger` given here, else the one
 * the `vaultDB` was made with (the default logger when it was given none). It renders the
 * passphrase dialog when an action run through withUnlockedVault finds the vault locked: unstyled
 * markup under the `modal-scrim` / `modal` class names, for the host's stylesheet to dress.
 *
 * If the first `hello()` is refused with a condition (`isVaultCondition` from safebyok) or bad
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
 */
export const VaultProvider = ({ userId, allowStartOver, passphraseUsername, passphraseAdvice, children, ...opts }: VaultProviderProps) => {
  const { applabel, vaultlabel, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, validators, passphraseStrengthTest, ...unlisted } = opts
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
  const wayinlabelCheck = validators?.wayinlabel
  const [vault, setVault] = useState<Vault | null>(null)
  // The dialog showing now, if any, and the actions waiting on it. The ref is what the callbacks
  // read, so that a dialog's outcome reaches its own waiters and no newer dialog's; the state
  // renders it.
  const [asking, setAsking] = useState<Asking | null>(null)
  const askingRef = useRef<Asking | null>(null)
  // The handle the open effect holds now, set and cleared with it: null from the moment a vault
  // goes until the next arrives, when there is nothing for a dialog to unlock.
  const vaultRef = useRef<Vault | null>(null)
  // Counts the dialog's showings, so that each is a fresh dialog with nothing kept from the last.
  const askingRounds = useRef(0)
  // Wrapped, so that a rejection carrying any value at all (null, say) still reads as "failed".
  const [helloFailure, setHelloFailure] = useState<{ err: unknown } | null>(null)
  // What the provider's last hello of each vault was refused with; null once one succeeds.
  const [helloRefusal, setHelloRefusal] = useState<{ vault: Vault, err: VaultError } | null>(null)
  // Whether the vault is still opening, read so the provider renders only when that changes.
  const readOpening = useCallback(() => vault?.getSnapshot().state === 'opening', [vault])
  const opening = useSyncExternalStore(vault === null ? subscribeToNothing : vault.subscribe, vault === null ? getNotOpening : readOpening, getNotOpening)
  // A refusal says why the vault is not open only while it is not: a ring from storage that settles it clears it.
  const openError = opening && helloRefusal !== null && helloRefusal.vault === vault ? helloRefusal.err : null
  // Settled once for each logger and vaultDB, so the provider and every vault it opens share it.
  const heardBy = useMemo(() => settleLogger(logger, vaultDB), [logger, vaultDB])
  // The logger, clock and strength test the last render had, and whether a change of any was warned of yet.
  const sinks = useRef({ logger, clock, passphraseStrengthTest })
  const toldOfSinks = useRef(false)
  // The host's onBadNews as of the last commit. The vault is handed a teller that keeps its
  // identity and calls whichever handler that is, so a handler written inline makes no new vault.
  const badNewsRef = useRef(onBadNews)
  useLayoutEffect(() => { badNewsRef.current = onBadNews })
  const tellBadNews = useCallback<BadNewsHandler>((news) => badNewsRef.current?.(news), [])
  // Anything but a function, or none, is misuse: handed to Vault.make as it came, to be refused.
  const badNewsOpt = onBadNews === undefined || onBadNews === null || typeof onBadNews === 'function' ? tellBadNews : onBadNews

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

  /** Closes `ending` if it is still the dialog showing, and settles every action waiting on it. */
  const endAsking = useCallback((ending: Asking | null, unlocked: boolean) => {
    if (ending === null) { return }
    if (askingRef.current === ending) {
      askingRef.current = null
      setAsking(null)
    }
    for (const settle of ending.waiters) { settle(unlocked) }
  }, [])

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
    } else if (isVaultCondition(err)) {
      setHelloRefusal({ vault: made, err })
    } else {
      setHelloFailure({ err })
    }
  }, [])

  useEffect(() => {
    if (userId === null) { return }
    // Listed one by one so the effect re-runs on each; `satisfies` fails the build if a Vault.make
    // option is ever added and not passed through.
    const checks = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck, wayinlabel: wayinlabelCheck } satisfies Record<keyof VaultValidators, unknown>
    const refusable = Object.fromEntries((JSON.parse(unlistedJson) as string[]).map((ckey) => [ckey, undefined]))
    const makeOpts = { ...refusable, applabel, vaultlabel, userId, vaultDB, deviceDB, leaseHours, staleMinutes, onBadNews: badNewsOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger: heardBy ?? logger, validators: checks, passphraseStrengthTest } satisfies Record<keyof MakeVaultOpts, unknown>
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
      vaultRef.current = null
      // A dialog belongs to the vault it was opened over: when that handle goes -- a sign-out,
      // another user, a reopen, the provider unmounting -- its actions resolve null, and it closes.
      // Here and not in an effect on `vault`, whose cleanup from the render before the vault came
      // would end a dialog opened in the very commit that brought it.
      endAsking(askingRef.current, false)
      made.close()
      setVault(null)
      setHelloFailure(null)
      setHelloRefusal(null)
    }
  }, [userId, applabel, vaultlabel, vaultDB, deviceDB, leaseHours, staleMinutes, badNewsOpt, clock, keyDeriver, maxWhisperBytes, maxBoxes, logger, heardBy, passphraseStrengthTest, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, wayinlabelCheck, unlistedJson, endAsking, sayHello])

  const retryOpen = useCallback(() => {
    if (vault !== null && openError !== null) { void sayHello(vault, { staleMinutes: 0 }) }
  }, [vault, openError, sayHello])

  const delDamagedVault = useCallback(async () => {
    if (userId === null || vault === null || ! isVaultError(openError, 'damaged_vault')) { return }
    const validators = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck, wayinlabel: wayinlabelCheck } satisfies Record<keyof VaultValidators, unknown>
    try {
      await delStoredDamagedVault({ applabel, vaultlabel, userId, vaultDB, deviceDB, validators })
    } catch (err) {
      // The vault was made anew, so what openError says is out of date: say hello again, and still
      // tell the caller why nothing was deleted. Misuse (bad_option) says nothing anew.
      if (isVaultError(err, 'stale_write')) { void sayHello(vault, { staleMinutes: 0 }) }
      throw err
    }
    void sayHello(vault, { staleMinutes: 0 })
  }, [openError, vault, userId, applabel, vaultlabel, vaultDB, deviceDB, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, wayinlabelCheck, sayHello])

  /**
   * Waits on the dialog showing over `ranOn` now, opening one if none is; settles false once
   * `ranOn` is no longer the vault, and true at once if it is unlocked already.
   */
  const awaitUnlock = useCallback((ranOn: Vault | null) => new Promise<boolean>((settle) => {
    // An action whose refusal lands after its vault went resolves null, as the dialog it would
    // have waited on did, rather than leaving a dialog to show over whichever vault comes next.
    if (ranOn === null || vaultRef.current !== ranOn) { settle(false); return }
    // An unlock that landed between the refusal and here has answered it: no dialog to ask.
    if (ranOn.getSnapshot().state === 'unlocked') { settle(true); return }
    // A dialog showing is over this same vault: the open effect ends each with its vault.
    const { current } = askingRef
    if (current !== null) {
      current.waiters.push(settle)
      return
    }
    askingRounds.current += 1
    const showing = { round: askingRounds.current, vault: ranOn, waiters: [settle] }
    askingRef.current = showing
    setAsking(showing)
  }), [])

  // An unlock that lands while a dialog is asking -- the first dialog's, finishing after its Cancel,
  // or one the app made itself through the handle -- answers it: the dialog closes, and the actions
  // waiting on it run again. An unlock before the dialog opened is read by awaitUnlock.
  useEffect(() => {
    if (vault === null) { return }
    return vault.subscribe(() => {
      if (vault.getSnapshot().state === 'unlocked') { endAsking(askingRef.current, true) }
    })
  }, [vault, endAsking])

  const withUnlockedVault = useCallback(async <ResultT,>(action: () => Promise<ResultT>): Promise<ResultT | null> => {
    // The vault the action runs against: its refusal is answered by a dialog over that vault, or none.
    const ranOn = vaultRef.current
    /** The action's result, or null when the provider closed the vault it ran on under it. */
    const run = async (): Promise<ResultT | null> => {
      try {
        return await action()
      } catch (err) {
        // The provider closes a handle as it lets it go -- a sign-out, another user, a reopen, the
        // provider unmounting -- and an action that close cut short resolves null, as a dialog it ends does.
        if (ranOn !== null && vaultRef.current !== ranOn && isVaultError(err, 'vault_closed')) { return null }
        throw err
      }
    }
    try {
      return await run()
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { throw err }
      const unlocked = await awaitUnlock(ranOn)
      if (! unlocked) { return null }
      return await run()
    }
  }, [awaitUnlock])

  const opened = useMemo(() => ({ openError, retryOpen, delDamagedVault }), [openError, retryOpen, delDamagedVault])
  const provided = useMemo(() => ({ vault, opened, withUnlockedVault }), [vault, opened, withUnlockedVault])

  // Thrown here, in render, so the nearest error boundary (or the dev overlay) shows it: misuse,
  // the developer's to fix, which no retry would mend. Every hook has run by now, so the throw
  // leaves the rules of hooks alone.
  if (helloFailure !== null) { throw helloFailure.err }

  return (
    <VaultContext.Provider value={provided}>
      {children}
      {asking !== null && asking.vault === vault && (
        <PassphraseModal
          key={asking.round}
          vault={asking.vault}
          allowStartOver={allowStartOver}
          passphraseUsername={passphraseUsername}
          passphraseAdvice={passphraseAdvice ?? adviceFrom(passphraseStrengthTest, scopeOf(asking.vault))}
          onDone={(unlocked) => { endAsking(asking, unlocked) }}
        />
      )}
    </VaultContext.Provider>
  )
}
// --
