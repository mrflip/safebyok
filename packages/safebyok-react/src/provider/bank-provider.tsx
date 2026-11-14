import { createContext, useCallback, useContext, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DefaultOnBadNews, DefaultOnLifecycle, Device } from 'safebyok-big'
import { bankProviderProps } from '../shapes'
import type { BankProviderProps, GatingModalProps, Handlers, ProviderDeviceOpts } from '../shapes'
import { GatingModal } from './gating-modal'
import { useWarnOfIgnoredOpts } from './provider-hooks'

// == [Context]: BankContext, useProvided

/** The nearest provider's device, or null while it has none. It is undefined, the default, outside any provider. */
const BankContext = createContext<Device | null | undefined>(undefined)

/** Return the nearest BankProvider's device, or null while it has none.
 * Throws an error naming `hookname` when no BankProvider is above.
 */
export function useProvided(hookname: string): Device | null {
  const device = useContext(BankContext)
  if (device === undefined) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return device
}
// --

// == [The provider's device]: useProviderDevice

/** Make the provider's device from the first render's `opts`, start bringing up its bank, and sweep it at unmount.
 * Returns null while `user_id` is null. Later changes to `opts` are ignored, with a warning, but the device always calls the latest `handlers`.
 */
function useProviderDevice(opts: ProviderDeviceOpts, handlers: Handlers, isHostAsking: boolean, onMade: (device: Device) => void): Device | null {
  const [madeFrom] = useState(opts)
  const [device, setDevice] = useState<Device | null>(null)

  // The device is made once but always calls the latest handlers, so a host may pass inline arrow functions.
  /** The handlers from the latest render. */
  const latest = useEffectEvent(() => handlers)

  // This effect owns the device: it makes the device, and its cleanup sweeps it. When the effect runs again
  // (under StrictMode, or when a hidden Activity is shown again) it makes a fresh device. It is a layout
  // effect so that the device exists before the first paint.
  useLayoutEffect(() => {
    const { user_id } = madeFrom
    if (user_id === null) { return }
    const made = Device.make({
      ...madeFrom, user_id, gates: ['main'],
      onLifecycle:      (event) => latest().onLifecycle(event),
      onBadNews:        (badnews) => latest().onBadNews(badnews),
      requestCleartext: isHostAsking ? (gating) => latest().requestCleartext?.(gating) : undefined,
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device exists only between this effect and its cleanup, and render must pass it to the context
    setDevice(made)
    onMade(made)
    // Not awaited: the device reports its bring-up to onLifecycle.
    void made.tryEnsureBank()
    return () => {
      made.sweep()
      setDevice(null)
    }
  }, [madeFrom, isHostAsking, onMade])

  useWarnOfIgnoredOpts(device, madeFrom, opts)
  return device
}
// --

// == [BankProvider]: BankProvider, OpenGatingDialog, UserBankProvider

/** Provide the hooks below it with the signed-in user's device, or with none while `user_id` is null.
 * Unless `requestCleartext` is given, it shows a built-in dialog for each gating the device opens.
 * Its children remount whenever `user_id` or `banklabel` changes. The previous user's device is vacated when the next user's device is made.
 */
export const BankProvider = (props: BankProviderProps) => {
  const { user_id, banklabel } = bankProviderProps.parse(props, { where: 'BankProvider' })
  const userkey = JSON.stringify([user_id, banklabel])

  // When a different user's device is made, the previous user's device is vacated here. It is not done in the
  // device's cleanup, because an unmount, a hot reload or a hidden Activity runs that cleanup too. A null user_id
  // makes no device, so it vacates nothing: auth may briefly report null while it refreshes, so the host vacates
  // at sign-out. The userkey tag keeps the same user's next device (under StrictMode, say) from vacating the last.
  /** The last device made, tagged with its user. */
  const lastDevice = useRef<{ userkey: string, device: Device } | null>(null)
  const onMade = useCallback((device: Device) => {
    const last = lastDevice.current
    const madekey = JSON.stringify([device.user_id, device.banklabel])
    lastDevice.current = { userkey: madekey, device }
    if (last !== null && last.userkey !== madekey) { void last.device.vacate() }
  }, [])

  // Keyed by user. The host's app remounts when the user changes, so nothing typed carries over to the next user.
  return <UserBankProvider key={userkey} {...props} onMade={onMade} />
}

/** Render the dialog for `device`'s open gating, or nothing when no gating is open. */
function OpenGatingDialog({ device, ...dialogProps }: Pick<GatingModalProps, 'passphraseUsername' | 'passkeyRpId'> & { device: Device }) {
  const { openGating } = useSyncExternalStore(device.subscribe, device.getSnapshot)
  if (openGating === null) { return null }
  // No key is needed here: each dialog keys its form by its gating's `gatingTok`.
  return <GatingModal gating={openGating} leaseMillis={device.leaseMillis} {...dialogProps} />
}

/** Provide one user's device to the hooks below it, with the built-in dialogs unless `requestCleartext` is given. */
function UserBankProvider(props: BankProviderProps & { onMade: (device: Device) => void }) {
  const { passphraseUsername, passkeyRpId, children, onMade, onLifecycle = DefaultOnLifecycle, onBadNews = DefaultOnBadNews, requestCleartext, ...deviceish } = props
  // The device is made once, so this is fixed at the first render, like the device's other options.
  /** True when the host's `requestCleartext` handles this device's gatings instead of the built-in dialogs. */
  const [isHostAsking] = useState(requestCleartext !== undefined)
  const device = useProviderDevice(deviceish, { onLifecycle, onBadNews, requestCleartext }, isHostAsking, onMade)

  return (
    <BankContext.Provider value={device}>
      {children}
      {(device !== null) && (! isHostAsking) && (
        <OpenGatingDialog device={device} passphraseUsername={passphraseUsername} passkeyRpId={passkeyRpId} />
      )}
    </BankContext.Provider>
  )
}
// --
