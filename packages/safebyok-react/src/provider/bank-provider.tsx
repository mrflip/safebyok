import { createContext, useCallback, useContext, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DefaultOnBadNews, DefaultOnLifecycle, Device, tellBadNewsTo, type Vault } from 'safebyok'
import { bankProviderProps } from '../shapes'
import type { BankProviderProps, ContextValue, GatingModalProps, Handlers, ProviderDeviceOpts, TellBadNews } from '../shapes'
import { GatingModal } from './gating-modal'
import { useWarnOfIgnoredOpts } from './provider-hooks'

// == [Context]: ContextValue, BankContext, Deviceless, useProvided

const BankContext = createContext<ContextValue | null>(null)

const tellNobody: TellBadNews = () => { /* no device, no news */ }

/** The context value while the provider has no device. */
const Deviceless: ContextValue = Object.freeze({ device: null, helloedVaults: new WeakSet<Vault>(), tellBadNews: tellNobody })

/** Return the nearest BankProvider's context value. Throws an error naming `hookname` when there is no provider above. */
export const useProvided = (hookname: string): ContextValue => {
  const provided = useContext(BankContext)
  if (provided === null) { throw new Error(`${hookname} needs a <BankProvider> above it.`) }
  return provided
}
// --

// == [The provider's device]: useProviderDevice

/** Make the provider's device from the first render's `opts`, and keep it until unmount.
 * Returns the context value for it. Later changes to `opts` are ignored.
 */
const useProviderDevice = (opts: ProviderDeviceOpts, handlers: Handlers, isHostAsking: boolean, onMade: (device: Device) => void): ContextValue => {
  const [madeFrom] = useState(opts)
  const [contextValue, setContextValue] = useState<ContextValue>(Deviceless)

  // The device is made once but always calls the latest handlers, so a host may pass inline arrow functions.
  /** Return the handlers from the latest render. */
  const latest = useEffectEvent(() => handlers)

  // This effect owns the device: it makes the device, and its cleanup sweeps it. When the effect runs again
  // (under StrictMode, or when a hidden Activity is shown again) it makes a fresh device. It is a layout
  // effect so that the device exists before the first paint.
  useLayoutEffect(() => {
    const { user_id } = madeFrom
    if (user_id === null) { return }
    const device = Device.make({
      ...madeFrom, user_id, gates: ['main'],
      onLifecycle:      (event) => latest().onLifecycle(event),
      onBadNews:        (badnews) => latest().onBadNews(badnews),
      requestCleartext: isHostAsking ? (gating) => latest().requestCleartext?.(gating) : undefined,
    })
    // Does nothing after the device is swept or vacated. The device itself calls none of the host's handlers by then.
    const tellBadNews: TellBadNews = (badnews) => {
      if (device.isEnabled) { tellBadNewsTo((told) => latest().onBadNews(told), device, badnews) }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device exists only between this effect and its cleanup, and render must pass it to the context
    setContextValue({ device, helloedVaults: new WeakSet<Vault>(), tellBadNews })
    onMade(device)
    // Not awaited: the device reports its bring-up to onLifecycle.
    void device.tryEnsureBank()
    return () => {
      device.sweep()
      setContextValue(Deviceless)
    }
  }, [madeFrom, isHostAsking, onMade])

  useWarnOfIgnoredOpts(contextValue.device, madeFrom, opts)
  return contextValue
}
// --

// == [BankProvider]: BankProvider, OpenGatingDialog, UserBankProvider

/** Provide the hooks below it with the signed-in user's bank, or with no bank while `user_id` is null or the bank is coming up.
 * It also shows the built-in passphrase and passkey dialogs, unless `requestCleartext` is given.
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
const OpenGatingDialog = ({ device, ...dialogProps }: Pick<GatingModalProps, 'passphraseUsername' | 'passkeyRpId'> & { device: Device }) => {
  const { openGating } = useSyncExternalStore(device.subscribe, device.getSnapshot)
  if (openGating === null) { return null }
  // No key is needed here: each dialog keys its form by its gating's `gatingTok`.
  return <GatingModal gating={openGating} leaseMillis={device.leaseMillis} {...dialogProps} />
}

/** Provide one user's device and its bank, and render the dialog for its open gating. */
const UserBankProvider = (props: BankProviderProps & { onMade: (device: Device) => void }) => {
  const { passphraseUsername, passkeyRpId, children, onMade, onLifecycle = DefaultOnLifecycle, onBadNews = DefaultOnBadNews, requestCleartext, ...deviceish } = props
  // The device is made once, so this is fixed at the first render, like the device's other options.
  /** True when the host's `requestCleartext` handles this device's gatings, in place of the built-in dialogs. */
  const [isHostAsking] = useState(requestCleartext !== undefined)
  const contextValue = useProviderDevice(deviceish, { onLifecycle, onBadNews, requestCleartext }, isHostAsking, onMade)
  const { device } = contextValue

  return (
    <BankContext.Provider value={contextValue}>
      {children}
      {(device !== null) && (! isHostAsking) && (
        <OpenGatingDialog device={device} passphraseUsername={passphraseUsername} passkeyRpId={passkeyRpId} />
      )}
    </BankContext.Provider>
  )
}
// --
