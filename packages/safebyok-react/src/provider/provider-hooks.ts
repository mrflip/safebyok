import { useEffect, useRef, useState } from 'react'
import type { Bank, BankOpts } from 'safebyok'
import type { ProviderBankOpts } from '../shapes'

// == [Device]: useDeviceTok

/** device_tok for `user_id` and `banklabel`, cached createOrFind in DeviceDB */
export const useDeviceTok = (deviceDB: BankOpts['deviceDB'], user_id: string | null, banklabel: string): string | null => {
  const [found,   setFound]   = useState<{ user_id: string, banklabel: string, device_tok: string } | null>(null)
  const [refused, setRefused] = useState<{ err: unknown } | null>(null)

  useEffect(() => {
    if (user_id === null) { return }
    // Drop answers to a cleaned-up run -- the standard React pattern for a fetch.
    let isCurrent = true
    void deviceDB.ensureCachedDevice({ user_id, banklabel })
      .then(({ device_tok }) => { if (isCurrent) { setFound({ user_id, banklabel, device_tok }) } })
      .catch((err: unknown) => { if (isCurrent) { setRefused({ err }) } })
    return () => { isCurrent = false }
  }, [deviceDB, user_id, banklabel])

  // Throw errors during render, so the nearest error boundary hears it.
  if (refused !== null) { throw refused.err }
  // Right after a new user signs in, state still has the previous user's device_tok. Return null until the deviceDB responds for the new user.
  return (found !== null && found.user_id === user_id && found.banklabel === banklabel) ? found.device_tok : null
}
// --

// == [Ignored options]: changedFieldnames, useWarnOfIgnoredOpts

/** The fields whose values differ between `was` and `now`. */
const changedFieldnames = (was: Record<string, unknown>, now: Record<string, unknown>): string[] => (
  Object.keys({ ...was, ...now }).filter((ckey) => (! Object.is(was[ckey], now[ckey])))
)

/** Warn once, through `bank`'s logger, when options have changed since the bank was made. The bank ignores such changes. */
export const useWarnOfIgnoredOpts = (bank: Bank | null, wasOpts: ProviderBankOpts, nowOpts: ProviderBankOpts): void => {
  const toldOfIgnored = useRef(false)
  useEffect(() => {
    if (bank === null || toldOfIgnored.current) { return }
    const changed = changedFieldnames(wasOpts, nowOpts)
    if (changed.length === 0) { return }
    toldOfIgnored.current = true
    bank.logger.warn(`BankProvider ignored a change to its ${changed.join(' and ')}: it makes its bank once per user_id and banklabel, from the props it has then. Define each prop once, outside the component, or memoize it.`, { oplabel: 'BankProvider', props: changed })
  })
}
// --
