import { useEffect, useRef } from 'react'
import type { Device } from 'safebyok'
import type { ProviderDeviceOpts } from '../shapes'

// == [Ignored options]: changedFieldnames, useWarnOfIgnoredOpts

/** The fields whose values differ between `was` and `now`. */
const changedFieldnames = (was: Record<string, unknown>, now: Record<string, unknown>): string[] => (
  Object.keys({ ...was, ...now }).filter((ckey) => (! Object.is(was[ckey], now[ckey])))
)

/** Warn once, through `device`'s logger, when options have changed since the device was made. The device ignores such changes. */
export const useWarnOfIgnoredOpts = (device: Device | null, wasOpts: ProviderDeviceOpts, nowOpts: ProviderDeviceOpts): void => {
  const toldOfIgnored = useRef(false)
  useEffect(() => {
    if (device === null || toldOfIgnored.current) { return }
    const changed = changedFieldnames(wasOpts, nowOpts)
    if (changed.length === 0) { return }
    toldOfIgnored.current = true
    device.logger.warn(`BankProvider ignored a change to its ${changed.join(' and ')}: it makes its device once per user_id and banklabel, from the props it has then. Define each prop once, outside the component, or memoize it.`, { oplabel: 'BankProvider', props: changed })
  })
}
// --
