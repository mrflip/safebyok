import type { SX } from 'safebyok-big/internals'
import { CX, Consts, Deriver, Errors, Logger, Phrases, Strength, Throwers, VX, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import { type AskUser, Gating, type RequestCleartext, birthBank } from './gating'
import { type GuardedKeyDeriver, guardKeyDeriver } from './proving'

// == [Given to a device]: DefaultLeaseMillis, DeviceRecord, DeviceOpts

/** How long a lease lasts where the host names no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000

/** What a device is: the bank scope it serves, and its token there. */
export type DeviceRecord = Pick<SX.DeviceRow, 'user_id' | 'banklabel' | 'device_tok'>

/** What a host hands {@link Device.make} besides the device's record. */
export interface DeviceOpts {
  /** What makes a key from a passphrase: `argon2idWebV1Deriver` from `safebyok-big/browser`, or your own. */
  keyDeriver:       Deriver.KeyDeriver
  /** Judges each new passphrase before the bank accepts it. Without one, every new passphrase is too weak. */
  strengthChecker?: Strength.StrengthChecker | undefined
  /** Where the device reports what it has no caller to throw to: the default logger, the console, when left out. */
  logger?:          Logger.VaultLogger | undefined
  /** How long an unlock lasts on this device, in minutes, `Infinity` for until locked; 14 days when left out. */
  autolockMinutes?: number | undefined
  /** Shows the host's dialog for each gating. Without one, the host renders the device's `openGating` itself. */
  requestCleartext?: RequestCleartext | undefined
}

/** The checks of {@link Device.make}'s arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, fn, custom, user_id, banklabel, device_tok }) => ({
  requestCleartext: fn<RequestCleartext>(),
  deviceMakeArgs: obj({
    record: obj({ user_id, banklabel, device_tok }),
    opts:   Validator.objCheck(() => ({
      keyDeriver:      custom<Deriver.KeyDeriver>(),
      strengthChecker: custom<Strength.StrengthChecker>().optional(),
      logger:          custom<Logger.VaultLogger>().optional(),
      autolockMinutes: VX.positiveMinutes.optional(),
      requestCleartext: custom<RequestCleartext>().optional(),
    }), { refusalkind: 'bad_option' }),
  }),
}), [CX])
// --

/** The signed-in user's presence on this browser for one bank scope: the host's functions, guarded, and the one gating open.
 * Make it with `Device.make(record, opts)`. A `sweep()` ends it for good.
 */
export class Device {
  // == [Props]: user_id, banklabel, device_tok, keyDeriver, strengthChecker, logger, leaseMillis, #askUser, #openGating, #endCause, toJSON

  declare readonly user_id:    string
  declare readonly banklabel:  string
  /** This device's token in its bank scope, which each wayin it builds records. */
  declare readonly device_tok: string
  readonly keyDeriver:         GuardedKeyDeriver
  readonly strengthChecker:    Strength.GuardedStrengthChecker
  readonly logger:             Logger.VaultLogger
  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  readonly leaseMillis:        number

  /** The host's dialog, guarded, or null to leave the host to render `openGating` itself. */
  readonly #askUser: AskUser | null
  #openGating: Gating | null = null
  /** Why a sweep disabled the device; null while it is enabled. */
  #endCause:   Errors.VaultError | null = null

  /** This device's scope and token, for `JSON.stringify`. */
  toJSON(): DeviceRecord {
    const { user_id, banklabel, device_tok } = this
    return { user_id, banklabel, device_tok }
  }
  // --

  // == [Getters]: scope, openGating, autolockMinutes

  /** The bank scope this device serves. */
  get scope(): CX.BankScope { return CX.bankScope.parse(this) }

  /** The gating open on this device, or null. */
  get openGating(): Gating | null { return this.#openGating }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }
  // --

  // == [Construction]: make, constructor

  /** A device for the bank scope and token in `record`, with the host's functions in `opts`, wrapped. Nothing is fetched or stored. */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    checkSecureContext()
    const { record: { user_id, banklabel, device_tok }, opts: { keyDeriver, strengthChecker = Strength.DefaultStrengthChecker, logger, autolockMinutes, requestCleartext } } = Checks.deviceMakeArgs.parse({ record, opts })
    Object.assign(this, { user_id, banklabel, device_tok })
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.strengthChecker = Strength.guardStrengthChecker(strengthChecker)
    this.logger = Logger.parseLogger(logger)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.#askUser = (requestCleartext === undefined) ? null : guardRequestCleartext(requestCleartext)
    if (Deriver.isTestDeriver(keyDeriver)) { this.logger.warn(Phrases.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }
  // --

  // == [Prompts]: birthBankPrompt

  /** Ask the user for a new passphrase, and a passkey if they like, and birth this device's bank with them.
   * Resolves the bank, stored and unlocked, once an attempt lands. The layer above asks only where no bank is stored.
   */
  async birthBankPrompt(): Promise<Bank> {
    const gating = Gating.make({ gatingkind: 'birth_bank' }, { device: this, bank: null, askUser: this.#askUser, attempt: (cleartexts) => birthBank(this, cleartexts) })
    return gating.launch()
  }
  // --

  // == [Ending]: sweep

  /** Disable this device for good, dismissing its open gating. Never throws. */
  sweep(): this {
    if (! this.isEnabled) { return this }
    this.#endCause = Throwers.deviceDisabled()
    this.#openGating?.dismiss()
    return this
  }
  // --

  // == [The one gating open]: attachGating, detachGating

  /** Attach `gating` as this device's open gating. Refuses `already_asking` while another is open. */
  attachGating(gating: Gating): void {
    this.demandEnabled()
    if (this.#openGating !== null) { throw Throwers.alreadyAsking() }
    this.#openGating = gating
  }

  /** Detach the open gating, once it has concluded. */
  detachGating(): void { this.#openGating = null }
  // --

  // == [Guards]: isEnabled, demandEnabled

  /** True from `Device.make` until a sweep, and never again. */
  get isEnabled(): boolean { return this.#endCause === null }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    if (this.#endCause !== null) { throw this.#endCause }
    return this
  }
  // --

  /** Always `'device'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'device' { return 'device' satisfies Consts.Modelkind }
}

// == [Helpers]: guardRequestCleartext, millisOf, checkSecureContext

// What the dialog throws is dropped: it may quote what the user typed.
/** Guard the host's `requestCleartext`: the guard resolves true once the host's resolves, and false on a throw, which it drops. */
export function guardRequestCleartext(requestCleartext: RequestCleartext): AskUser {
  const host = Checks.requestCleartext.parse(requestCleartext, { where: 'requestCleartext' })
  return Consts.brandGuarded(async (gating: Gating): Promise<boolean> => {
    try {
      await host(gating)
      return true
    } catch {
      return false
    }
  })
}

// A host's Infinity minutes, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
/** `minutes` in milliseconds, or `fallback` where none is given */
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * Consts.MinuteMillis), Consts.ForeverMillis)) }

/** Refuse to run outside a secure context, where WebCrypto is missing */
function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw Throwers.insecureContext() }
}
// --
