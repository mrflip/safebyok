import type * as Z from 'zod'
import { CX, Consts, Deriver, Errors, Logger, Phrases as PhrasesX, ReportError, Throwers, VX, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import { type AskUser, Gating, type RequestCleartext, birthBank } from './gating'
import { type GuardedKeyDeriver, guardKeyDeriver } from './proving'
import { DefaultStrengthChecker, type GuardedStrengthChecker, type StrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { type BankScope, bankScope } from '../shapes/shapes-stamps'
import * as Phrases from '../phrases'
import type { Banklabel, DeviceTok, Userid } from '../shapes/primitives'
import { type VaultDB, isVaultDB } from '../storage/vault-db'

// == [Given to a device]: DefaultLeaseMillis, DeviceRecord, BadNews, BadNewsHandler, DeviceOpts

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000

/** A device's record: the bank scope it serves, and its token there. */
export type DeviceRecord = Z.infer<typeof Checks.deviceRecord>

/** What `onBadNews` hears: a refusal no caller waits on, and the device it reached. */
export interface BadNews {
  readonly news:   Errors.VaultError
  readonly device: Device
}

/** `Device.make`'s `onBadNews`: hears each refusal no caller waits on. */
export type BadNewsHandler = (badnews: BadNews) => unknown

/** The options of {@link Device.make}, beside the device's record. */
export interface DeviceOpts {
  /** Where this device's banks are stored: each bank made on it is given this vaultDB. */
  vaultDB:          VaultDB
  /** Makes a key from a passphrase: `argon2idWebV1Deriver` from `safebyok-big/browser`, or your own. */
  keyDeriver:       Deriver.KeyDeriver
  /** Judges each new passphrase before the bank accepts it. Without one, every new passphrase is too weak. */
  strengthChecker?: StrengthChecker | undefined
  /** Where the device reports what it has no caller to throw to. Default: the console. */
  logger?:          Logger.VaultLogger | undefined
  /** How long a lease lasts on this device, in minutes. `Infinity` lasts until locked. Default: 14 days. */
  autolockMinutes?: number | undefined
  /** Shows the host's dialog for each gating. Without one, the host renders the device's `openGating` itself. */
  requestCleartext?: RequestCleartext | undefined
  /** Hears each refusal no caller waits on. Default: {@link DefaultOnBadNews}, a warning on the device's logger. */
  onBadNews?:       BadNewsHandler | undefined
}

/** The checks of a {@link DeviceRecord} and of {@link Device.make}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, arr, fn, custom, user_id, banklabel, device_tok }) => {
  const deviceRecord = obj({ userid: user_id, banklabel, device_tok }).strict()
  return {
    deviceRecord,
    requestCleartext: fn<RequestCleartext>(),
    deviceMakeArgs: obj({
      record: deviceRecord,
      opts:   Validator.objCheck(() => ({
        vaultDB:         custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected),
        keyDeriver:      custom<Deriver.KeyDeriver>(),
        strengthChecker: custom<StrengthChecker>().optional(),
        logger:          custom<Logger.VaultLogger>().optional(),
        autolockMinutes: VX.positiveMinutes.optional(),
        requestCleartext: custom<RequestCleartext>().optional(),
        onBadNews:       fn<BadNewsHandler>().optional(),
      }), { refusalkind: 'bad_record' }),
    }),
    tellBadNewsToArgs: obj({
      onBadNews: fn<BadNewsHandler>(),
      device:    custom<Device>((val) => val instanceof Device, PhrasesX.DeviceExpected),
      badnews:   arr(custom<Errors.VaultError>(Errors.isVaultError, PhrasesX.VaultErrorExpected)),
    }),
  }
}, [CX])
// --

/** The signed-in user's presence in this browser for one bank scope: the host's functions, guarded, and at most one open gating.
 * Make it with `Device.make(record, opts)`. A `sweep()` ends it for good.
 */
export class Device {
  // == [Props]: userid, banklabel, device_tok, vaultDB, keyDeriver, strengthChecker, logger, leaseMillis, #onBadNews, #askUser, #openGating, #endCause, toJSON

  declare readonly userid:     Userid
  declare readonly banklabel:  Banklabel
  /** This device's token in its bank scope, recorded in each wayin it builds. */
  declare readonly device_tok: DeviceTok
  /** Where this device's banks are stored. */
  readonly vaultDB:            VaultDB
  readonly keyDeriver:         GuardedKeyDeriver
  readonly strengthChecker:    GuardedStrengthChecker
  readonly logger:             Logger.VaultLogger
  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  readonly leaseMillis:        number

  /** The host's `onBadNews`, or the default. */
  readonly #onBadNews: BadNewsHandler
  /** The host's dialog, guarded, or null to leave the host to render `openGating` itself. */
  readonly #askUser: AskUser | null
  #openGating: Gating | null = null
  /** Why a sweep disabled the device, or null while it is enabled. */
  #endCause:   Errors.VaultError | null = null

  /** This device's scope and token, for `JSON.stringify`. */
  toJSON(): DeviceRecord {
    const { userid, banklabel, device_tok } = this
    return { userid, banklabel, device_tok }
  }
  // --

  // == [Getters]: scope, openGating, autolockMinutes

  /** The bank scope this device serves. */
  get scope(): BankScope { return bankScope.parse(this) }

  /** The gating open on this device, or null. */
  get openGating(): Gating | null { return this.#openGating }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }
  // --

  // == [Construction]: make, constructor

  /** Make a device for the bank scope and token in `record`, guarding the host's functions in `opts`. Nothing is fetched or stored. */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    checkSecureContext()
    const { record: { userid, banklabel, device_tok }, opts: { vaultDB, keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, requestCleartext, onBadNews = DefaultOnBadNews } } = Checks.deviceMakeArgs.parse({ record, opts })
    Object.assign(this, { userid, banklabel, device_tok })
    this.vaultDB = vaultDB
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.logger = Logger.parseLogger(logger)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.#onBadNews = onBadNews
    this.#askUser = (requestCleartext === undefined) ? null : guardRequestCleartext(requestCleartext)
    if (Deriver.isTestDeriver(keyDeriver)) { this.logger.warn(PhrasesX.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }
  // --

  // == [Prompts]: birthBankPrompt

  /** Ask the user for a new passphrase and optional passkey, and birth this device's bank with them. Resolves the unlocked bank.
   * Call it only where no bank is stored: over one, the attempt refuses `gate_made_elsewhere`.
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

  /** Detach `gating` if it is this device's open gating. */
  detachGating(gating: Gating): void {
    if (this.#openGating === gating) { this.#openGating = null }
  }
  // --

  // == [Telling the host]: tellBadNews

  /** Tell the host's `onBadNews` of failures no caller is waiting on. Never throws.
   * Anything but a refusal is told as `unexpected_error`, and a `disabled` refusal is dropped. Once the device is disabled, the
   * default handler hears instead of the host's.
   */
  tellBadNews(badnews: readonly unknown[]): void {
    const refusals = badnews.map((news) => (Errors.isVaultError(news) ? news : Throwers.unexpectedError(news)))
    // A thing disabled since is no news: the host swept it, or its bank went away.
    tellBadNewsTo(this.isEnabled ? this.#onBadNews : DefaultOnBadNews, this, refusals.filter((refusal) => refusal.refusalkind !== 'disabled'))
  }
  // --

  // == [Guards]: isEnabled, endCause, demandEnabled

  /** True from `Device.make` until a sweep, and never again. */
  get isEnabled(): boolean { return this.#endCause === null }

  /** The refusal every call on this device meets after a sweep, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#endCause }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    if (this.#endCause !== null) { throw this.#endCause }
    return this
  }
  // --

  /** Always `'device'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'device' { return 'device' satisfies Consts.Modelkind }
}

// == [Host functions]: DefaultOnBadNews, tellBadNewsTo

/** The default `onBadNews`: warn of each failure on the device's logger. */
export const DefaultOnBadNews: BadNewsHandler = ({ news, device }) => {
  device.logger.warn(news.message, { oplabel: 'Device.onBadNews', refusalkind: news.refusalkind })
}

/** Tell `onBadNews` each of `badnews`, awaiting none. Never throws.
 * Anything the handler throws or rejects with is reported to the platform, and reaches no caller.
 */
export function tellBadNewsTo(onBadNews: BadNewsHandler, device: Device, badnews: readonly Errors.VaultError[]): void {
  Checks.tellBadNewsToArgs.parse({ onBadNews, device, badnews })
  for (const news of badnews) {
    // Any answer is heard out, a thenable among them: none is awaited.
    void (async () => {
      try {
        await onBadNews({ news, device })
      } catch (err) {
        ReportError.reportToPlatform(err)
      }
    })()
  }
}
// --

// == [Helpers]: guardRequestCleartext, millisOf, checkSecureContext

// What the dialog throws is dropped: it may quote what the user typed.
/** Guard the host's `requestCleartext`: the guard resolves true when the host's resolves, and false when it throws, dropping the throw. */
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
/** `minutes` in milliseconds, capped at `ForeverMillis`, or `fallback` for none. */
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * Consts.MinuteMillis), Consts.ForeverMillis)) }

/** Refuse to run outside a secure context, where WebCrypto is missing */
function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw Throwers.insecureContext() }
}
// --
