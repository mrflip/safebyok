import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Vault, checkStrengthTest, checkValidators, retireDamagedVault as retireStoredDamagedVault, isVaultCondition, isVaultError, parseLogger, type MakeVaultOpts, type PassphraseStrengthTest, type VaultDB, type VaultError, type VaultLogger, type VaultScope, type VaultSnapshot, type VaultValidators } from 'safebyok'
import { PassphraseModal, type PassphraseAdvice } from './passphrase-modal'

/**
 * What the provider hands down: the vault handle (null while signed out, or when its options were
 * refused), why its hello failed and a way to try again, and `withUnlockedVault`, which owns the
 * ask-for-the-passphrase-when-needed flow.
 */
export type VaultContextShape = {
  /**
   * The vault handle, made as soon as there is a signed-in user: its snapshot says `opening` until
   * its `hello()` has read storage, and every call on it waits for that first. Null while
   * signed out, and when `Vault.make` refused the options, which the provider throws to the
   * nearest error boundary.
   */
  vault: Vault | null
  /**
   * Why the vault could not be opened, when it is a condition the app can show in place: the
   * snapshot's `trouble` while the vault is still `opening`, its hello refused by storage that
   * cannot be reached (`storage_unavailable`), a user storage no longer serves
   * (`identity_revoked`, as when signed out of the backend, or not yet signed in to it), a vault
   * whose stored props fail their checks (`damaged_vault`), a browser that will not let the app
   * keep anything on this device (`storage_blocked`). Null while the hello runs, once the vault
   * has settled, and while signed out. Misuse -- a bad label or option -- never lands here: the
   * provider throws it to the nearest error boundary. Offer `retryOpen` only for one a retry may
   * mend: never for `storage_blocked`, which holds until something outside the app changes (say
   * why instead), nor for `damaged_vault`, which `retireDamagedVault` answers.
   *
   * @example
   *   if (openError?.kind === 'storage_blocked') { return <p>{"This browser won't let the app keep your vault on this device."}</p> }
   *   if (openError?.kind === 'damaged_vault') { return <p>{"Your vault's stored record is damaged."}</p> }
   *   if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
   */
  openError: VaultError | null
  /**
   * Have the vault say hello to storage again after `openError` (`vault.hello()`): openError
   * clears once the vault settles, or names what the new attempt met. Does nothing while there is
   * no openError to retry.
   */
  retryOpen: () => void
  /**
   * Retire the stored vault that `openError` reports as `damaged_vault`, with this device's lease
   * of it, and have the vault say hello again: a fresh, absent vault, for the user to make anew.
   * The user's lockboxes in it are gone for good, so ask first. Resolves when the new hello is
   * under way, and does nothing while `openError` is any other, or none. Rejects with storage's
   * refusal if retiring it fails, such as `storage_unavailable`, leaving `openError` as it was; the
   * `safebyok` package's `retireDamagedVault` says which refusals to expect. One of them,
   * `stale_write`, means the vault was made anew meanwhile, so that one says hello again as well,
   * and still rejects. Any other refusal says nothing anew: `bad_option` among them, which is
   * misuse, or a vault that reads sound now, which `retryOpen()` then opens.
   *
   * @example
   *   if (openError?.kind === 'damaged_vault') {
   *     return <button onClick={() => { if (confirm('Erase your vault and start over?')) { void retireDamagedVault() } }}>Start over</button>
   *   }
   */
  retireDamagedVault: () => Promise<void>
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
   * @example const whisper = await withUnlockedVault(() => vault.readBox('anthropic_api_key'))
   *          // whisper === null: the user dismissed the dialog
   */
  withUnlockedVault: <ResultT>(action: () => Promise<ResultT>) => Promise<ResultT | null>
}

const VaultContext = createContext<VaultContextShape | null>(null)

/** One showing of the passphrase dialog: which one, the vault it asks for, and the actions waiting on its outcome. */
type Asking = { round: number, vault: Vault, waiters: ((unlocked: boolean) => void)[] }

/** The vault handle and withUnlockedVault, from the nearest VaultProvider. */
export const useVault = (): VaultContextShape => {
  const shape = useContext(VaultContext)
  if (shape === null) { throw new Error('useVault needs a <VaultProvider> above it.') }
  return shape
}

const emptySnapshot: VaultSnapshot = {
  state:           'opening',
  scope:           { applabel: 'none', user_id: 'none', vaultlabel: 'none' },
  boxes:           [],
  askPassphraseAt: null,
  wayins:          [],
  syncing:         true,
  trouble:         null,
}
const getEmptySnapshot = () => emptySnapshot
const getNoTrouble = () => null

/** What the provider hands down as `openError`: the snapshot's trouble while the vault is still opening, when it is a condition. */
const openErrorOf = (snapshot: VaultSnapshot): VaultError | null => (
  snapshot.state === 'opening' && isVaultCondition(snapshot.trouble) ? snapshot.trouble : null
)
const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing

/** The vault's live snapshot: lockbox summaries, lock state, when it next asks for the passphrase. */
export const useVaultSnapshot = (): VaultSnapshot => {
  const { vault } = useVault()
  return useSyncExternalStore(
    vault === null ? subscribeToNothing : vault.subscribe,
    vault === null ? getEmptySnapshot : vault.getSnapshot,
  )
}

/**
 * Every Vault.make option, passed through as given (an option left out gets Vault.make's default,
 * and one it does not take is refused, to the error boundary), except that `userId` may be null;
 * and three for the passphrase dialog: whether it offers a forgetful user to start over, what a
 * password manager files the passphrase under, and the advice it shows as the user chooses one
 * (`PassphraseModal` has each). In a browser, spread `browserOpts()` from `safebyok/browser` for
 * the `keyDeriver`, `deviceDB` and `passphraseStrengthTest` Vault.make asks for. The vault reopens whenever an option changes
 * identity, so build each once -- at module level, or memoized -- never inline in the props; each
 * schema in `validators` likewise, though the bag around them may be built in render, as the
 * provider watches each schema rather than the bag. A `logger`, `clock` or
 * `passphraseStrengthTest` that changes identity is warned of once, through the logger. The
 * provider and the vault it opens say things through one logger: the `logger` given here, else
 * the one the `vaultDB` was made with (the default logger when it was given none).
 */
export type VaultProviderProps = Omit<MakeVaultOpts, 'userId'> & {
  /** The signed-in user from the host's auth, or null when nobody is: then there is no vault. */
  userId:              string | null
  /**
   * Whether the passphrase dialog offers a user who has forgotten the passphrase to retire the
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
 * Makes the vault for the signed-in user and keeps it matched to that identity: a null userId
 * closes the handle, a different userId makes a different vault. Renders the passphrase dialog
 * when an action run through withUnlockedVault finds the vault locked. The dialog is unstyled markup under the
 * `modal-scrim` / `modal` class names; the host's stylesheet dresses it.
 *
 * If the vault's `hello()` is refused with a condition (`isVaultCondition` from safebyok) --
 * storage that cannot be reached, a signed-out user, a damaged record, a browser withholding
 * storage -- the snapshot keeps it as its `trouble`, and the provider hands it down as
 * `openError`, for the app to show in place, beside a `retryOpen` button where a retry may mend
 * it (not `storage_blocked`). Misuse -- a bad label or option, which `Vault.make` throws, or a
 * hello refused as misuse or with a value that is no VaultError at all -- the provider throws
 * while rendering, for the nearest error boundary to catch.
 *
 * @example
 *   <VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={session?.userId ?? null}
 *     vaultDB={vaultDB}>
 *     <App />
 *   </VaultProvider>
 */
export const VaultProvider = ({ userId, allowStartOver, passphraseUsername, passphraseAdvice, children, ...opts }: VaultProviderProps) => {
  const { applabel, vaultlabel, vaultDB, deviceDB, leaseHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger, validators, passphraseStrengthTest, ...unlisted } = opts
  // Each prop Vault.make does not take, by name -- a misspelling, a retired name -- handed on to it,
  // so it is refused, to the error boundary, rather than dropped here unseen.
  const unlistedJson = JSON.stringify(Object.keys(unlisted))
  // The bag is taken apart below, so a misspelt field would be dropped unseen: refused here, as Vault.make refuses it.
  checkValidators(validators)
  // Checked at the first render that has it, as Vault.make checks it; the vault keeps it for its life.
  checkStrengthTest(passphraseStrengthTest)
  // The vault reopens when a check changes, never for a bag rebuilt in render around the same ones.
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
  const [openFailure, setOpenFailure] = useState<{ err: unknown } | null>(null)
  // The vault's own word on why its hello failed, read so the provider renders only when that changes.
  const readOpenError = useCallback(() => (vault === null ? null : openErrorOf(vault.getSnapshot())), [vault])
  const openError = useSyncExternalStore(vault === null ? subscribeToNothing : vault.subscribe, vault === null ? getNoTrouble : readOpenError)
  // Settled once for each logger and vaultDB, so the provider and every vault it opens share it.
  const heardBy = useMemo(() => settleLogger(logger, vaultDB), [logger, vaultDB])
  // The logger, clock and strength test the last render had, and whether a change of any was warned of yet.
  const sinks = useRef({ logger, clock, passphraseStrengthTest })
  const toldOfSinks = useRef(false)

  // A logger, clock or strength test written inline in the props is new at every render, and
  // reopens the vault each time: said once, the first time any changes.
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
   * Has `made` say hello, again when retried: a refusal that is misuse, or no VaultError at all, goes
   * to the error boundary; a condition is the snapshot's trouble already, which openError reads.
   * Nothing is heard from a vault the provider has let go.
   */
  const sayHello = useCallback(async (made: Vault) => {
    try {
      await made.hello()
    } catch (err) {
      if (vaultRef.current !== made || isVaultCondition(err)) { return }
      setOpenFailure({ err })
    }
  }, [])

  useEffect(() => {
    if (userId === null) { return }
    // Listed one by one so the effect re-runs on each; `satisfies` fails the build if a Vault.make
    // option is ever added and not passed through.
    const checks = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck, wayinlabel: wayinlabelCheck } satisfies Record<keyof VaultValidators, unknown>
    const refusable = Object.fromEntries((JSON.parse(unlistedJson) as string[]).map((ckey) => [ckey, undefined]))
    const makeOpts = { ...refusable, applabel, vaultlabel, userId, vaultDB, deviceDB, leaseHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger: heardBy ?? logger, validators: checks, passphraseStrengthTest } satisfies Record<keyof MakeVaultOpts, unknown>
    // The handle is this effect's to make and to close, and the render hands it down: so the state
    // is set here, once per handle, as Vault.make answers at once.
    let made: Vault | null = null
    try {
      made = Vault.make(makeOpts)
    } catch (err) {
      setOpenFailure({ err }) // eslint-disable-line react-hooks/set-state-in-effect -- the effect makes the handle, and Vault.make refuses at once: there is no callback to set state from
    }
    if (made !== null) {
      vaultRef.current = made
      setVault(made)
      void sayHello(made)
    }
    return () => {
      vaultRef.current = null
      // A dialog belongs to the vault it was opened over: when that handle goes -- a sign-out,
      // another user, a reopen, the provider unmounting -- its actions resolve null, and it closes.
      // Here and not in an effect on `vault`, whose cleanup from the render before the vault came
      // would end a dialog opened in the very commit that brought it.
      endAsking(askingRef.current, false)
      made?.close()
      setVault(null)
      setOpenFailure(null)
    }
  }, [userId, applabel, vaultlabel, vaultDB, deviceDB, leaseHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger, heardBy, passphraseStrengthTest, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, wayinlabelCheck, unlistedJson, endAsking, sayHello])

  const retryOpen = useCallback(() => {
    if (vault !== null && openError !== null) { void sayHello(vault) }
  }, [vault, openError, sayHello])

  const retireDamagedVault = useCallback(async () => {
    if (userId === null || vault === null || ! isVaultError(openError, 'damaged_vault')) { return }
    const validators = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck, wayinlabel: wayinlabelCheck } satisfies Record<keyof VaultValidators, unknown>
    try {
      await retireStoredDamagedVault({ applabel, vaultlabel, userId, vaultDB, deviceDB, validators })
    } catch (err) {
      // The vault was made anew, so what openError says is out of date: say hello again, and still
      // tell the caller why nothing was retired. Misuse (bad_option) says nothing anew.
      if (isVaultError(err, 'stale_write')) { void sayHello(vault) }
      throw err
    }
    void sayHello(vault)
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
    const opening = { round: askingRounds.current, vault: ranOn, waiters: [settle] }
    askingRef.current = opening
    setAsking(opening)
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

  // Thrown here, in render, so the nearest error boundary (or the dev overlay) shows it: misuse,
  // the developer's to fix, which no retry would mend. Every hook has run by now, so the throw
  // leaves the rules of hooks alone.
  if (openFailure !== null) { throw openFailure.err }

  return (
    <VaultContext.Provider value={{ vault, openError, retryOpen, retireDamagedVault, withUnlockedVault }}>
      {children}
      {asking !== null && asking.vault === vault && (
        <PassphraseModal
          key={asking.round}
          vault={asking.vault}
          allowStartOver={allowStartOver}
          passphraseUsername={passphraseUsername}
          passphraseAdvice={passphraseAdvice ?? adviceFrom(passphraseStrengthTest, asking.vault.getSnapshot().scope)}
          onDone={(unlocked) => { endAsking(asking, unlocked) }}
        />
      )}
    </VaultContext.Provider>
  )
}
