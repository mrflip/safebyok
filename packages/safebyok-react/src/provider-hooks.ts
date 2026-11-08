import { useEffect, useRef, useState } from 'react'
import type { Bank, BankOpts } from 'safebyok'
import type { HeldBankOpts } from './shapes/shapes-provider'

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
