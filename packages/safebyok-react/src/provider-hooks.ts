import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnyGating, Bank, BankOpts } from 'safebyok'
import { useRoundFor } from './boundary'
import type { HeldBankOpts } from './shapes/shapes-provider'

// == [Gating dialog]: Showing, hasUserGesture, useGatingDialog

/** One showing of the provider's gating dialog: the gating it answers, and how it closes. */
export type Showing = { gating: AnyGating, close: () => void }

/** What `useRoundFor` follows while no dialog shows. */
const NotShowing = Object.freeze({})

/** True while the user's gesture is still active, or in a browser that does not say. */
const hasUserGesture = (): boolean => (
  ((globalThis.navigator as SafeNavigator | undefined)?.userActivation?.isActive) !== false
)
// Not `Navigator &`: TypeScript's Navigator declares userActivation always present, and some browsers lack it.
type SafeNavigator = { userActivation?: { isActive: boolean } }

/** The provider's own gating dialog: what it shows now, and how to open and close it. */
export const useGatingDialog = () => {
  /** The dialog showing now, if any, as rendered. */
  const [showing, setShowing] = useState<Showing | null>(null)
  // The callbacks read the ref, current between renders: an old dialog's late answer then ends only
  // its own showing, never a newer one.
  /** The dialog showing now, if any, as the callbacks read it. */
  const showingRef = useRef<Showing | null>(null)
  // Each showing's round keys a fresh dialog, with nothing kept from the last.
  /** A number that changes with each showing. */
  const round = useRoundFor(showing ?? NotShowing)

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
    const next = { gating, close: () => { close() } }
    showingRef.current = next
    setShowing(next)
  }), [endAny])

  return { showing, round, ask, endShowing, endAny }
}
// --

// == [Device]: useDeviceId

/** device_id for `applabel` and `user_id`, cached createOrFind in DeviceDB */
export const useDeviceId = (deviceDB: BankOpts['deviceDB'], applabel: string, user_id: string | null): string | null => {
  const [found,   setFound]   = useState<{ applabel: string, user_id: string, device_id: string } | null>(null)
  const [refused, setRefused] = useState<{ err: unknown } | null>(null)

  useEffect(() => {
    if (user_id === null) { return }
    // Drop answers to a cleaned-up run -- the standard React pattern for a fetch.
    let isCurrent = true
    void deviceDB.ensureBank({ applabel, user_id })
      .then(({ device_id }) => { if (isCurrent) { setFound({ applabel, user_id, device_id }) } })
      .catch((err: unknown) => { if (isCurrent) { setRefused({ err }) } })
    return () => { isCurrent = false }
  }, [deviceDB, applabel, user_id])

  // Throw errors during render, so the nearest error boundary hears it.
  if (refused !== null) { throw refused.err }
  // Until the deviceDB answers for a newly signed-in user, the last user's device_id is still in state, and is not theirs.
  return (found?.applabel === applabel && found.user_id === user_id) ? found.device_id : null
}
// --

// == [Ignored options]: changedKeys, useWarnOfIgnoredOpts

/** The fields whose values differ between `was` and `now`. */
const changedKeys = (was: Record<string, unknown>, now: Record<string, unknown>): string[] => (
  Object.keys({ ...was, ...now }).filter((ckey) => (! Object.is(was[ckey], now[ckey])))
)

/** Warn once, through `bank`'s logger, of each option changed since `madeFrom`, which the bank ignores. */
export const useWarnOfIgnoredOpts = (bank: Bank | null, wasOpts: HeldBankOpts, nowOpts: HeldBankOpts): void => {
  const toldOfIgnored = useRef(false)
  useEffect(() => {
    if (bank === null || toldOfIgnored.current) { return }
    const changed = changedKeys(wasOpts, nowOpts)
    if (changed.length === 0) { return }
    toldOfIgnored.current = true
    bank.logger.warn(`BankProvider ignored a change to its ${changed.join(' and ')}: it makes its bank once per applabel and user_id, from the props it has then. Define each prop once, outside the component, or memoize it.`, { call: 'BankProvider', props: changed })
  })
}
// --
