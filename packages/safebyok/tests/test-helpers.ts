/**
 * safebyok's test helpers, everything in one module: star-import it as `TH` in this package's
 * tests (`import * as TH from './test-helpers'`), and from `safebyok/testing` in another package's.
 * A cheap key deriver, a vault's options over stores in memory, shape-valid records whose
 * ciphertext is fake, a live device unlock, small timing, interception and tampering aids, a
 * logger that keeps what it hears, checks that a call refuses and that what it threw quotes
 * nothing it shouldn't, and the suites every VaultDB and DeviceDB adapter owes (the VaultDB suite
 * runnable over an adapter made per signed-in user). For tests only, and under vitest: the
 * deriver is worthless against a brute-forcer.
 */
import { describe, expect, it, vi } from 'vitest'
import { toB64, type Ciphered } from '../src/crypto'
import { memoryDeviceDB, type DeviceDB, type UnlockExpectation } from '../src/device-db'
import { VaultError, type VaultErrorKind } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import type { VaultLogger } from '../src/logger'
import { StrongVerdict, type PassphraseStrengthTest } from '../src/passphrase-strength'
import { memoryStore } from '../src/string-store'
import type { Lockbox } from '../src/lockbox'
import type { DamagedLockbox, DeviceMark, DeviceUnlock, LockboxSummary, PasskeyEnvelope, PasskeyProof, PassphraseEnvelope, PublicBag, SeenVault, VaultBundle, VaultScope } from '../src/types'
import { stableJsonify } from '../src/stable-jsonify'
import { NameFloorBytes } from '../src/validators'
import { TestDeriverNotice } from '../src/key-deriver-spec'
import type { OpenVaultOpts } from '../src/vault'
import { localVaultDB, type VaultDB, type VaultDBOpts } from '../src/vault-db'

/**
 * A cheap KeyDeriver for tests: one SHA-256 instead of 64 MiB of Argon2id, so a suite full of
 * unlocks runs in milliseconds. Deterministic in passphrase and salt, like the real one; unlike
 * the real one, worthless against a brute-forcer -- which is why its label says `test`. Never
 * hand it to a vault that holds a real secret.
 *
 * @example openVault({ ...opts, keyDeriver: testDeriver })
 */
export const testDeriver: KeyDeriver = {
  key_deriver_label: 'test_digest_v0',
  salt_bytes:        16,
  deriveKeyBytes: async (passphrase, saltBytes) => {
    const passphraseBytes = new TextEncoder().encode(passphrase)
    const joined = new Uint8Array(passphraseBytes.length + saltBytes.length)
    joined.set(passphraseBytes)
    joined.set(saltBytes, passphraseBytes.length)
    return new Uint8Array(await crypto.subtle.digest('SHA-256', joined))
  },
}

/**
 * A passphraseStrengthTest for tests, admitting every passphrase, so a suite may unlock with a
 * short one such as 'pw'. Never hand it to a vault that holds a real secret.
 *
 * @example openVault({ ...opts, passphraseStrengthTest: anyPassphraseTest })
 */
export const anyPassphraseTest: PassphraseStrengthTest = () => StrongVerdict

/**
 * Everything openVault needs, over stores in memory made fresh for each call: `u1`'s `main` vault
 * in the `acme` app (as {@link scopeOf} has it), deriving through {@link testDeriver}, and
 * admitting any passphrase ({@link anyPassphraseTest}). `overrides`
 * replace any of it -- a store of the test's own, a clock, a logger, another user.
 *
 * @param overrides - Options to use in place of the defaults.
 * @returns A complete bag of options for openVault, or (`userId` aside) for a VaultProvider.
 *
 * @example const vault = await openVault(TH.memoryVaultOpts())
 * @example const vault = await openVault(TH.memoryVaultOpts({ userId: 'u2', vaultDB: myVaultDB }))
 */
export const memoryVaultOpts = (overrides: Partial<OpenVaultOpts> = {}): OpenVaultOpts => ({
  applabel:   'acme',
  userId:     'u1',
  vaultlabel: 'main',
  vaultDB:    localVaultDB({ store: memoryStore() }),
  deviceDB:   memoryDeviceDB(),
  keyDeriver: testDeriver,
  passphraseStrengthTest: anyPassphraseTest,
  ...overrides,
})

/**
 * A database name no other call has handed out, so each test of an IndexedDB adapter starts
 * from an empty database of its own.
 *
 * @example idbVaultDB({ dbName: TH.freshDbName() })
 */
export const freshDbName = (): string => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

/**
 * A shape-valid Ciphered that opens nothing: for storage-layer tests, which never decrypt.
 *
 * @example fakeCiphered('a1')  // => { cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' }
 */
export const fakeCiphered = (tag: string): Ciphered => ({
  cipher_iv_b64:  `iv-${tag}`,
  ciphertext_b64: `ct-${tag}`,
})

/**
 * The scope of `userId`'s vault in the `acme` app.
 *
 * @example scopeOf('u1')           // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
 * @example scopeOf('u1', 'spare')  // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' }
 */
export const scopeOf = (userId: string, vaultlabel = 'main'): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel })

/**
 * A shape-valid passphrase envelope labelled `unlocklabel`, its wrap fake: for storage-layer
 * tests, which never decrypt. Its unlock_id is `unlock-<unlocklabel>`; it wraps the vault's first
 * vaultKey, and was added by `device-one`.
 *
 * @example envelopeOf('passphrase')                                         // the one bundleOf holds
 * @example envelopeOf('home_phrase', { vault_key_wrapped: fakeCiphered('home') })
 */
export const envelopeOf = (unlocklabel: string, overrides: Partial<PassphraseEnvelope> = {}): PassphraseEnvelope => ({
  method:            'passphrase',
  unlock_id:         `unlock-${unlocklabel}`,
  unlocklabel,
  key_deriver_label: 'test_digest_v0',
  // base64 of the literal text 'saltsaltsaltsalt': a fake salt, public material anyway
  salt_b64:          'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_epoch:   1,
  device_id:         'device-one',
  registered_at:     Date.UTC(2026, 9, 14),
  vault_key_wrapped: fakeCiphered(`envelope-${unlocklabel}`),
  ...overrides,
})

/**
 * A shape-valid passkey envelope labelled `unlocklabel`, its wrap fake: for storage-layer tests,
 * which never decrypt. Its unlock_id is `unlock-<unlocklabel>`, its credential_id
 * `cred-<unlocklabel>`; it wraps the vault's first vaultKey, and was added by `device-one`.
 *
 * @example passkeyEnvelopeOf('laptop')
 * @example bundleOf('u1', { unlocks: [envelopeOf('passphrase'), passkeyEnvelopeOf('laptop')] })
 */
export const passkeyEnvelopeOf = (unlocklabel: string, overrides: Partial<PasskeyEnvelope> = {}): PasskeyEnvelope => ({
  method:            'passkey',
  unlock_id:         `unlock-${unlocklabel}`,
  unlocklabel,
  credential_id:     `cred-${unlocklabel}`,
  // base64 of the literal text 'prfsaltprfsaltprfsaltprfsaltprfs': a fake 32-byte salt, public material anyway
  prf_salt_b64:      'cHJmc2FsdHByZnNhbHRwcmZzYWx0cHJmc2FsdHByZnM',
  vault_key_epoch:   1,
  device_id:         'device-one',
  registered_at:     Date.UTC(2026, 9, 14),
  vault_key_wrapped: fakeCiphered(`envelope-${unlocklabel}`),
  ...overrides,
})

/** SHA-256 of `text`'s UTF-8 bytes. */
const digestOf = async (text: string): Promise<Uint8Array> => (
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
)

/**
 * A passkey's answer, as a fake authenticator would give it: for tests, in place of a WebAuthn
 * call. The credential is `tag`'s own (its id base64url of `cred-<tag>`), the salt a 32-byte one
 * made from `tag` unless given, and the answer SHA-256 of the credential and salt -- so the same
 * passkey asked with the same salt answers the same, and with another salt answers otherwise, as
 * a real PRF does. Worthless as a secret: never hand it to a vault that holds a real one.
 *
 * @example await vault.addPasskey('pw', () => passkeyOf('laptop'), { unlocklabel: 'laptop' })
 * @example await vault.unlock(await passkeyOf('laptop'))
 * @example await passkeyOf('laptop', otherSaltB64)  // the same credential, answering another salt
 */
export const passkeyOf = async (tag: string, prfSaltB64?: string): Promise<PasskeyProof> => {
  const credentialId = toB64(new TextEncoder().encode(`cred-${tag}`))
  const saltB64 = prfSaltB64 ?? toB64(await digestOf(`salt-${tag}`))
  return { credentialId, prfSaltB64: saltB64, prfBytes: await digestOf(`${credentialId}:${saltB64}`) }
}

/**
 * A shape-valid VaultBundle for `userId`'s `main` vault, its one envelope fake: for storage-layer
 * tests, which never decrypt. Its vault_id is `vault-id-<userId>`, its unlock epoch and its
 * vaultKey's epoch both 1, and its one way in an {@link envelopeOf} labelled `passphrase` whose
 * wrap is `bundle-<userId>`.
 *
 * @example bundleOf('u1', { unlock_epoch: 2 })
 * @example bundleOf('u1', { unlocks: [envelopeOf('passphrase'), envelopeOf('home_phrase')] })
 */
export const bundleOf = (userId: string, overrides: Partial<VaultBundle> = {}): VaultBundle => ({
  format:              'safebyok-vault-v2',
  ...scopeOf(userId),
  vault_id:            `vault-id-${userId}`,
  unlock_epoch:        1,
  vault_key_epoch:     1,
  unlocks:             [envelopeOf('passphrase', { vault_key_wrapped: fakeCiphered(`bundle-${userId}`) })],
  registered_at:       Date.UTC(2026, 9, 14),
  ...overrides,
})

/**
 * {@link bundleOf}'s vault once its vaultKey has been replaced: at unlock epoch 2 and vaultKey
 * epoch 2, its one way in sealed around the new vaultKey, and the first vaultKey kept, fake, as
 * its `prior_vault_key`. What a lockbox write sealed under the first vaultKey meets once the
 * vaultKey has moved on.
 *
 * @example await vaultDB.updateBundle(TH.rotatedBundleOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 1 })
 */
export const rotatedBundleOf = (userId: string): VaultBundle => bundleOf(userId, {
  unlock_epoch:    2,
  vault_key_epoch: 2,
  prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: fakeCiphered(`prior-${userId}`) },
  unlocks:         [envelopeOf('passphrase', { vault_key_epoch: 2, vault_key_wrapped: fakeCiphered(`rotated-${userId}`) })],
})

/**
 * A shape-valid Lockbox for storage-layer tests, its ciphered fields fake: revision `rev-<tag>`,
 * sealed under the vault's first vaultKey, with the public bag `{ note: 'a test box' }` unless
 * `overrides` says otherwise.
 *
 * @example boxOf('anthropic_api_key', 'a1', { public_json: publicJsonOf({ note: 'work account' }) })
 */
export const boxOf = (boxlabel: string, tag: string, overrides: Partial<Lockbox> = {}): Lockbox => ({
  format:                 'safebyok-lockbox-v4',
  boxlabel,
  revision_id:            `rev-${tag}`,
  vault_key_epoch:        1,
  lockbox_key_wrapped:    fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:       fakeCiphered(`whisper-${tag}`),
  whisper_codec:          'json_v1',
  whisper_schema_version: 1,
  public_json:            publicJsonOf({ note: 'a test box' }),
  registered_at:          Date.UTC(2026, 9, 14),
  written_at:             Date.UTC(2026, 9, 14),
  ...overrides,
})

/**
 * A public bag as a lockbox's `public_json` holds it: its JSON, every object's keys sorted, as the
 * vault writes it.
 *
 * @example publicJsonOf({ note: 'work account' })  // '{"note":"work account"}'
 */
export const publicJsonOf = (bag: PublicBag): string => stableJsonify(bag) ?? ''


/**
 * Labels the default grammar refuses and a host's validators may admit: ones differing only by a
 * colon, a quote, a backslash, a comma or a bracket, ones that would close a JSON string early,
 * and Hebrew, Arabic, Thai and mixed text.
 */
export const OddLabels = Object.freeze([
  'main', 'main:', 'main"', String.raw`main\\`, 'main,', 'main[', 'main]', 'main","x',
  'מפתח העבודה', 'مفتاح العمل', 'กุญแจงาน', 'Mixed: English, עברית, العربية, ไทย',
] as const)

/**
 * A listed lockbox as the summary it should be: undefined stays undefined, and one listed as
 * damaged fails the test, naming its boxlabel. For a test reading a summary's fields out of a
 * listing or a snapshot, where TypeScript would otherwise have it ask after damage first.
 *
 * @example expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.public).to.deep.equal({ note: 'work account' })
 */
export const summaryOf = (box: LockboxSummary | DamagedLockbox | undefined): LockboxSummary | undefined => {
  if (box?.damaged === true) { throw new Error(`The lockbox '${box.boxlabel}' is listed as damaged, where a summary was expected.`) }
  return box
}

/**
 * What a write into {@link bundleOf}('u1')'s vault expects when its lockbox is not there yet:
 * that vault, under its first vaultKey, and no revision. Frozen, since every test shares it.
 *
 * @example vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
 */
export const noBoxYet = Object.freeze({ vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 } as const)

/**
 * What an erase of {@link bundleOf}('u1')'s vault, or of a lockbox in it, expects: that vault.
 * Frozen, since every test shares it.
 *
 * @example vaultDB.eraseVault(TH.scopeOf('u1'), TH.thisVault)
 */
export const thisVault = Object.freeze({ vault_id: 'vault-id-u1' } as const)

/** What {@link markOf} may change of its mark: any field of its own, and any of what it has seen, or null for nothing seen. */
export type MarkOverrides = Partial<Omit<DeviceMark, 'seen'>> & { seen?: Partial<SeenVault> | null }

/**
 * A shape-valid DeviceMark for device-storage tests: `userId`'s `main` vault as {@link bundleOf}
 * has it, seen at unlock epoch 1 and vaultKey epoch 1, by the device `device-one`, never locked.
 *
 * @example await deviceDB.writeMark(TH.markOf('u1'))
 * @example TH.markOf('u1', { seen: { unlock_epoch: 3 } })  // a device that has seen the vault at epoch 3
 * @example TH.markOf('u1', { lock_generation: 2 })         // a device that has locked the vault twice
 * @example TH.markOf('u1', { seen: null })                 // a device that has seen no vault there
 */
export const markOf = (userId: string, overrides: MarkOverrides = {}): DeviceMark => {
  const { seen, ...head } = overrides
  return {
    format:          'safebyok-mark-v3',
    ...scopeOf(userId),
    lock_generation: 0,
    ...head,
    seen:            seen === null ? null : {
      device_id:       'device-one',
      vault_id:        `vault-id-${userId}`,
      unlock_epoch:    1,
      vault_key_epoch: 1,
      ...seen,
    },
  }
}

/**
 * The expectation a remembered unlock is written under on a device that has never locked its
 * vault: the lock generation of a scope with no mark, or a mark from {@link markOf}.
 *
 * @example await deviceDB.writeUnlock(await TH.unlockOf('u1'), TH.NoLocks)
 */
export const NoLocks: UnlockExpectation = Object.freeze({ lock_generation: 0 })

/** A real DeviceUnlock for device-storage tests: a live non-extractable localUnlockKey around fake wrapped material. */
export const unlockOf = async (userId: string): Promise<DeviceUnlock> => ({
  format:                  'safebyok-unlock-v1',
  ...scopeOf(userId),
  vault_id:                `vault-id-${userId}`,
  unlock_epoch:        1,
  local_unlock_key:        await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_local_wrapped: fakeCiphered(`local-${userId}`),
  ask_passphrase_at:       1_900_000_000_000,
})

/**
 * Base64url text, bent a little: its first character swapped for another valid one, so it is
 * always different, keeps its length, decodes whenever `b64` does, and a tamper test reaches the
 * check it means to exercise. Blank text has no character to bend, and nothing put in its place
 * decodes, so it throws: a tamper test aimed at an empty field is aimed at the wrong field.
 *
 * @param b64 - Base64url text, not blank.
 * @returns Text that differs from `b64` in its first character only.
 *
 * @example tweakB64('Zm9v') // 'am9v'
 * @example tweakB64('am9v') // 'bm9v'
 * @example tweakB64('')     // throws a TypeError
 */
export const tweakB64 = (b64: string): string => {
  if (b64 === '') { throw new TypeError('tweakB64 needs base64url text to bend, and was handed blank text.') }
  const replacer = b64.startsWith('a') ? 'b' : 'a'
  return replacer + b64.slice(1)
}

/**
 * Resolve after the macrotask queue has turned once: every promise already settled has run its
 * continuation, and so has any timer due now. For tests that let background work (a refresh rung
 * by a write) settle before they look.
 *
 * @returns A promise for the next tick.
 *
 * @example await wakeupAtNextTick() // a refresh already settled has run its continuation
 */
export const wakeupAtNextTick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/**
 * A while for something that should not happen to have had its chance: fifty milliseconds.
 *
 * @returns A promise for the end of the while.
 *
 * @example
 *   await TH.aWhile()
 *   expect(heard.count).to.eq(0)   // nothing came, though it had its chance
 */
export const aWhile = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 50) })

/**
 * Resolves once `check` holds, looking every few milliseconds; rejects after two seconds, so a
 * thing that never comes to pass fails its test rather than hanging it.
 *
 * @param check - Whether the thing has come to pass yet.
 *
 * @example await TH.eventually(() => heard.count === 1)
 */
export const eventually = async (check: () => boolean): Promise<void> => {
  for (let ii = 0; ii < 400; ii += 1) {
    if (check()) { return }
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
  throw new Error('it never came to pass')
}

/**
 * A listener for a VaultDB's `subscribe`, and a count of how often it was called, kept for a test
 * to look at.
 *
 * @returns `onChange`, to subscribe with; `heard`, whose `count` it raises.
 *
 * @example
 *   const { heard, onChange } = TH.changeCounter()
 *   const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), onChange)
 */
export const changeCounter = () => {
  const heard = { count: 0 }
  return { heard, onChange: () => { heard.count += 1 } }
}

/**
 * A watch on `scope` through `vaultDB`, once it is live, its calls counted from then: an adapter
 * whose server sends a change as the subscription starts (postgresVaultDB with a `listen`, a
 * GraphQL subscription) calls once at the start, and this resolves after that call, the count
 * back at zero. Waits up to two seconds for it.
 *
 * @param vaultDB - The adapter to watch through.
 * @param scope - The vault to watch.
 * @returns `heard`, whose `count` rises with each change from here on; `unsubscribe`.
 *
 * @example const { heard, unsubscribe } = await TH.liveWatch(TH.browserFor(schema, 'u1'), TH.scopeOf('u1'))
 */
export const liveWatch = async (vaultDB: Pick<VaultDB, 'subscribe'>, scope: VaultScope) => {
  const heard = { count: 0 }
  const unsubscribe = vaultDB.subscribe(scope, () => { heard.count += 1 })
  await eventually(() => heard.count > 0)
  heard.count = 0
  return { heard, unsubscribe }
}

/**
 * A gate for holding an async seam mid-flight, so a test can land one call in the middle of
 * another: `pass()` waits until `release()` is called, and `reached` resolves once something is
 * waiting at it. Released, it stays open: later passes go straight through.
 *
 * @returns The gate: `pass`, to await inside the seam; `reached`, to await in the test; `release`.
 *
 * @example
 *   const gate = TH.makeGate()
 *   const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase, saltBytes) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
 *   const unlocking = vault.unlock('pw')   // now waiting at the gate
 *   await gate.reached
 *   await vault.lock()                     // lands mid-unlock
 *   gate.release()
 */
export const makeGate = () => {
  const opened = deferred()
  const arrived = deferred()
  const pass = async () => {
    arrived.resolve()
    await opened.promise
  }
  return { pass, reached: arrived.promise, release: opened.resolve }
}

/** The names of `Target`'s methods that return a promise. */
export type AsyncVerbOf<Target> = {
  [Verb in keyof Target]-?: Target[Verb] extends (...args: never[]) => Promise<unknown> ? Verb : never
}[keyof Target]

/**
 * Has `meanwhile` run inside the next call to `target[verb]`, before the call itself goes on: for
 * slipping another device's doings, or a pause, between a vault's look at storage and its write.
 * Only the next call is touched; later ones go straight through, unless armed again: each arming
 * is for one call, in the order armed. A method the test already spies on keeps counting its
 * calls, each once.
 *
 * @param target - The object whose method to intercept: an adapter, a deriver.
 * @param verb - The method, one returning a promise.
 * @param meanwhile - What to run first, and wait for.
 *
 * @example
 *   TH.beforeNextCall(vaultDB, 'updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
 */
export const beforeNextCall = <Target extends object>(target: Target, verb: AsyncVerbOf<Target> & string, meanwhile: () => Promise<unknown>): void => {
  const method = (target as unknown as Record<string, AsyncFn | undefined>)[verb]
  if (method === undefined) { throw new TypeError(`beforeNextCall found no method ${verb} to intercept.`) }
  // Armed already, once per call: this errand waits its turn behind the others.
  const waiting = errandsAt.get(method)
  if (waiting !== undefined) {
    waiting.push(meanwhile)
    return
  }
  const original = originalOf.get(method) ?? method
  if (original === method && vi.isMockFunction(method)) {
    // A mock of the test's own stands here: stand in front of it for one call, and call it
    // through, so it records that call once. A second spy on top of it would record it twice.
    const errands = [meanwhile]
    // The mock may live on a prototype: then the stand-in is an own property to remove after, not
    // one to write the mock over, which would hide the prototype's from then on.
    const replaced = Object.getOwnPropertyDescriptor(target, verb)
    const standIn = async (...args: unknown[]) => {
      const errand = errands.shift()
      if (errands.length === 0) {
        if (replaced === undefined) { Reflect.deleteProperty(target, verb) } else { Object.defineProperty(target, verb, replaced) }
      }
      await errand?.()
      return await method.apply(target, args)
    }
    errandsAt.set(standIn, errands)
    Reflect.set(target, verb, standIn)
    return
  }
  // Otherwise our own spy, whose once-implementations vitest runs one per call, in order.
  const spy = vi.spyOn(target as unknown as Record<string, AsyncFn>, verb)
  originalOf.set(spy, original)
  spy.mockImplementationOnce(async (...args: unknown[]) => {
    await meanwhile()
    return await original.apply(target, args)
  })
}

/** Typed loosely: the caller's types were checked at the signature. */
type AsyncFn = (...args: unknown[]) => Promise<unknown>

/** The errands still waiting to run, by the stand-in {@link beforeNextCall} put in front of a test's own mock. */
const errandsAt = new WeakMap<object, (() => Promise<unknown>)[]>()

/** The method a spy of {@link beforeNextCall}'s own stands in front of. */
const originalOf = new WeakMap<object, AsyncFn>()

/**
 * Holds the next call to `target[verb]` at a gate (see {@link makeGate}) until the test releases
 * it, so the test can land another call while that one is in flight. Later calls go straight
 * through.
 *
 * @param target - The object whose method to hold: an adapter, a deriver.
 * @param verb - The method, one returning a promise.
 * @returns The gate: await `reached`, then `release()`.
 *
 * @example
 *   const gate = TH.holdNextCall(vaultDB, 'readBundle')
 *   const unlocking = vault.unlock('pw')   // now waiting at the gate
 *   await gate.reached
 *   await vault.lock()                     // lands mid-unlock
 *   gate.release()
 */
export const holdNextCall = <Target extends object>(target: Target, verb: AsyncVerbOf<Target> & string) => {
  const gate = makeGate()
  beforeNextCall(target, verb, gate.pass)
  return gate
}

/**
 * A count of the storage watches `vaultDB` opens and closes from here on, kept by spying on its
 * `subscribe`: for a test that a failed open, a close or a lock leaves no watch running that
 * nobody could end. Each watch still reaches the adapter's own `subscribe`.
 *
 * A watch counts as closed the first time it is closed: closing it again changes nothing, so a
 * double close cannot stand in for a watch that was never closed.
 *
 * @param vaultDB - The adapter whose watches to count.
 * @returns The tally, live: `opened` and `closed`, each a count so far.
 *
 * @example
 *   const tally = TH.tallyWatches(vaultDB)
 *   await TH.expectRefusal(openVault(opts), 'not_permitted')
 *   expect(tally.opened - tally.closed).to.eq(0)
 */
export const tallyWatches = (vaultDB: Pick<VaultDB, 'subscribe'>) => {
  const tally = { opened: 0, closed: 0 }
  const subscribe = vaultDB.subscribe.bind(vaultDB)
  vi.spyOn(vaultDB, 'subscribe').mockImplementation((scope, onChange) => {
    tally.opened += 1
    const unsubscribe = subscribe(scope, onChange)
    let closedYet = false
    return () => {
      if (! closedYet) {
        closedYet = true
        tally.closed += 1
      }
      unsubscribe()
    }
  })
  return tally
}

// ------------------------------------------------------------------------- racing devices

/**
 * Where every round trip one backend's devices make passes, so that a race can stop a device just
 * before one of them and run another device's write while it waits. A device's adapter awaits
 * `pass()` before each call it makes to its backend -- each statement, each request, each
 * transaction, each watch it starts -- and goes straight on unless the race is holding that one. Wire it around a
 * client's methods with {@link throughTurnstile}, or await `pass()` wherever a round trip begins.
 */
export type Turnstile = {
  /** Resolves once this round trip may go: at once, unless the race is holding it. */
  pass: () => Promise<void>
}

/** A turnstile, and the race's hold on it: stop the nth pass from now, or stop none. */
const makeTurnstile = () => {
  let armed: { untilHeld: number, gate: ReturnType<typeof makeGate> } | null = null
  const pass = async () => {
    if (armed === null) { return }
    armed.untilHeld -= 1
    if (armed.untilHeld > 0) { return }
    const { gate } = armed
    armed = null
    await gate.pass()
  }
  const holdAt = (nth: number) => {
    const gate = makeGate()
    armed = { untilHeld: nth, gate }
    return gate
  }
  const holdNone = () => { armed = null }
  const turnstile: Turnstile = { pass }
  return { turnstile, holdAt, holdNone }
}

/** A turnstile no race holds, for a test that makes devices without racing them. */
const openTurnstile: Turnstile = { pass: () => Promise.resolve() }

/**
 * `target`, each of its `verbs` first awaiting `turnstile.pass()`, and the rest of it as it was: a
 * device's backend client, for {@link DescribeVaultDBOpts.makeDevices}, each of whose round trips
 * then passes the race's turnstile. Every method keeps `target` as its `this`.
 *
 * @param turnstile - The race's turnstile, as `makeDevices` is handed it.
 * @param target - The client a device's adapter makes its round trips through.
 * @param verbs - Its methods that are round trips, each returning a promise.
 * @returns A stand-in for `target`, to hand the device's adapter in its place.
 *
 * @example postgresVaultDB({ client: TH.throughTurnstile(turnstile, pool, ['query']), userId })
 * @example convexVaultDB({ client: TH.throughTurnstile(turnstile, client, ['query', 'mutation']), api })
 */
export const throughTurnstile = <Target extends object>(turnstile: Turnstile, target: Target, verbs: readonly (AsyncVerbOf<Target> & string)[]): Target => (
  new Proxy(target, {
    get: (held, prop) => {
      const val: unknown = Reflect.get(held, prop, held)
      if (typeof val !== 'function') { return val }
      const method = val as (...args: unknown[]) => unknown
      if (! (verbs as readonly PropertyKey[]).includes(prop)) { return method.bind(held) }
      return async (...args: unknown[]) => {
        await turnstile.pass()
        return method.apply(held, args)
      }
    },
  })
)

/** How one move in a race settled: `landed`, with what it resolved to, or the kind it was refused with, with what it threw. */
export type RaceOutcome = { kind: string, val: unknown }

/**
 * A fresh, empty backend, as a way to make devices over it: handed the race's `turnstile`, it gives
 * a factory of devices, each sharing nothing but the backend, each round trip of each passing the
 * turnstile. The factory takes `DeviceOptsT` -- the limit to hold a device to, for a VaultDB's --
 * or nothing, as `() => device` does.
 */
export type MakeDevices<DeviceT, DeviceOptsT = void> = (turnstile: Turnstile) => ((deviceOpts: DeviceOptsT) => DeviceT) | Promise<(deviceOpts: DeviceOptsT) => DeviceT>

/** A race between devices over one backend, for {@link raceEveryWay}. */
export type Race<DeviceT> = {
  /** Fresh devices over one fresh, empty backend: see {@link MakeDevices}. */
  makeDevices: MakeDevices<DeviceT>
  /** What stands before the race, made through the first device. */
  setup?: ((first: DeviceT) => Promise<unknown>) | undefined
  /** Each device's move, a device to each: the first move on the first device, and so on. Two or more. */
  moves: readonly ((device: DeviceT) => Promise<unknown>)[]
  /** What must hold after every schedule, given the moves' outcomes in order and the devices; throws when it does not. */
  verdict: (outcomes: RaceOutcome[], devices: DeviceT[]) => unknown
}

/**
 * Runs `race` under every schedule a test can make of it, each over fresh devices on a fresh
 * backend, and checks its verdict after each. Two moves are made together; then one is started a
 * few turns of the event loop after the other, each way round; then, for each round trip a move
 * makes through the turnstile, that move is held just before it while the other runs to its end,
 * each way round. More than two are made together, then each is held before its nth round trip
 * in turn and all are let go at once, for every n. A device that cannot finish its move while
 * another waits at the turnstile fails the race: the two share a lock, a queue or a connection
 * that real devices would not, or the adapter holds a lock from one round trip to the next.
 *
 * The schedules interleave the moves at every await between round trips that the event loop
 * reaches, and at every round trip through the turnstile; they cannot split a round trip itself,
 * which is the backend's to make atomic.
 *
 * @param race - The devices, what stands before, each device's move, and the verdict.
 * @returns The title of each schedule run, in order; it rejects, naming the schedule, on the
 *   first verdict that fails, device that waits too long, or move that does not finish.
 *
 * @example
 *   await TH.raceEveryWay({
 *     makeDevices: (turnstile) => () => postgresVaultDB({ client: TH.throughTurnstile(turnstile, db, ['query']), userId: 'u1' }),
 *     setup:       (first) => first.createBundle(TH.bundleOf('u1')),
 *     moves:       [(one) => one.eraseVault(TH.scopeOf('u1'), TH.thisVault), (two) => two.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)],
 *     verdict:     async (outcomes, [one]) => { expect(await one.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0) },
 *   })
 */
export const raceEveryWay = async <DeviceT>(race: Race<DeviceT>): Promise<string[]> => {
  if (race.moves.length < 2) { throw new TypeError('raceEveryWay needs two moves or more to race.') }
  const titles: string[] = []
  const runUnder = async (title: string, schedule: Schedule) => {
    titles.push(title)
    return await runRaceOnce(race, title, schedule)
  }
  await runUnder('made together', together)
  if (race.moves.length === 2) {
    for (const [firstIdx, [first, second]] of [[0, ['one', 'two']], [1, ['two', 'one']]] as const) {
      for (const count of MicrotaskOffsets) { await runUnder(`${second} started ${String(count)} microtasks after ${first}`, staggered(firstIdx, () => microtasks(count))) }
      for (const count of TickOffsets) { await runUnder(`${second} started ${String(count)} ticks after ${first}`, staggered(firstIdx, () => ticks(count))) }
      await sweepHolds((nth) => runUnder(`${first} held before its round trip ${String(nth)} while ${second} moved`, holding(firstIdx, nth)))
    }
  } else {
    await sweepHolds((nth) => runUnder(`each held before its round trip ${String(nth)} in turn, then all let go`, crowding(nth)))
  }
  return titles
}

/**
 * Runs a hold before round trip 1, 2, and on, until a run holds nothing -- its moves made no more
 * round trips -- and refuses a move that makes more than {@link MostRoundTrips}, rather than leave
 * the gaps past them unheld.
 */
const sweepHolds = async (runHeldAt: (nth: number) => Promise<boolean>) => {
  for (let nth = 1; nth <= MostRoundTrips + 1; nth += 1) {
    if (! await runHeldAt(nth)) { return }
  }
  throw new Error(`A move made more than ${String(MostRoundTrips)} round trips through the turnstile, so the race could not hold it before each. The VaultDB contract's baseline asks a small, fixed number of round trips of each verb: see whether the adapter, or something polling through its client, makes more.`)
}

/** Microtasks to start the second move after the first: for an adapter in this process, whose awaits are microtasks. */
const MicrotaskOffsets = [1, 2, 3] as const
/** Turns of the macrotask queue to start the second move after the first: for a backend that answers on a later turn. */
const TickOffsets = [1, 2] as const
/** The most round trips a race holds a move before; a move making more fails the race. */
const MostRoundTrips = 12
/** How long a device's move may take while another device waits at the turnstile before the race calls it a shared lock. */
const WaitedTooLongMillis = 2000
/** How long a whole schedule's moves, or one waited on for its own sake, may take before the race calls the adapter hung: room for a slow real backend, which a single held move is not given. */
const ScheduleHungMillis = 10_000

/** The moves of a race, each started on its device. */
type Start = () => Promise<RaceOutcome>
/** One schedule: makes the moves in its own order, and says whether it held a move at the turnstile. */
type Schedule = (starts: readonly Start[], keeper: ReturnType<typeof makeTurnstile>) => Promise<{ outcomes: RaceOutcome[], held: boolean }>

/** Runs `race` once, under `schedule`, over fresh devices; says whether a move was held. Rejects, naming the schedule, if it fails. */
const runRaceOnce = async <DeviceT>(race: Race<DeviceT>, title: string, schedule: Schedule): Promise<boolean> => {
  const keeper = makeTurnstile()
  try {
    const deviceFor = await race.makeDevices(keeper.turnstile)
    const entrants = race.moves.map((move) => {
      const device = deviceFor()
      return { device, start: () => outcomeOf(move(device)) }
    })
    const devices = entrants.map((entrant) => entrant.device)
    if (race.setup && devices[0] !== undefined) { await race.setup(devices[0]) }
    const { outcomes, held } = await schedule(entrants.map((entrant) => entrant.start), keeper)
    await race.verdict(outcomes, devices)
    return held
  } catch (err) {
    throw new Error(`Under the schedule "${title}": ${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }
}

/** How a move settled, never rejecting: `landed` and its value, or its refusal's kind (`unknown` for none) and the refusal. */
const outcomeOf = async (move: Promise<unknown>): Promise<RaceOutcome> => {
  try {
    return { kind: 'landed', val: await move }
  } catch (err) {
    const { kind } = (err ?? {}) as { kind?: unknown }
    return { kind: typeof kind === 'string' ? kind : 'unknown', val: err }
  }
}

/** The two moves of a pair race, `firstIdx`'s first: the first device's and the second's, swapped for 1. */
const pairOf = (starts: readonly Start[], firstIdx: 0 | 1): [Start, Start] => {
  const [one, two] = starts
  if (one === undefined || two === undefined) { throw new TypeError('A pair race has two moves.') }
  return firstIdx === 0 ? [one, two] : [two, one]
}

/** Outcomes back in the moves' own order, from the order a schedule made them in. */
const inMoveOrder = (firstIdx: 0 | 1, first: RaceOutcome, second: RaceOutcome): RaceOutcome[] => (firstIdx === 0 ? [first, second] : [second, first])

const together: Schedule = async (starts) => ({ outcomes: await finishing(Promise.all(starts.map((start) => start())), 'the moves'), held: false })

/** The move of `firstIdx` started, then the other once `wait` resolves. */
const staggered = (firstIdx: 0 | 1, wait: () => Promise<void>): Schedule => async (starts) => {
  const [first, second] = pairOf(starts, firstIdx)
  const firstMove = first()
  await wait()
  const secondMove = second()
  const [firstOutcome, secondOutcome] = await finishing(Promise.all([firstMove, secondMove]), 'the moves')
  return { outcomes: inMoveOrder(firstIdx, firstOutcome, secondOutcome), held: false }
}

/**
 * The move of `firstIdx` held before its nth round trip while the other moves to its end, then let
 * go. A move that ends before its nth round trip is let finish, and the other then moves: the
 * moves one after another, the last schedule of the sweep.
 */
const holding = (firstIdx: 0 | 1, nth: number): Schedule => async (starts, keeper) => {
  const [first, second] = pairOf(starts, firstIdx)
  const gate = keeper.holdAt(nth)
  const firstMove = first()
  const arrived = await finishing(reachedBeforeEnd(gate, firstMove), `the first move, before its round trip ${String(nth)}`)
  if (! arrived) {
    keeper.holdNone()
    const firstOutcome = await finishing(firstMove, 'the first move')
    return { outcomes: inMoveOrder(firstIdx, firstOutcome, await finishing(second(), 'the second move')), held: false }
  }
  const secondMove = await inTime(second())
  gate.release()
  if (! secondMove.inTime) { throw waitedTooLong() }
  return { outcomes: inMoveOrder(firstIdx, await finishing(firstMove, 'the first move, let go'), secondMove.val), held: true }
}

/** Each move held before its nth round trip in turn, so all are midway at once, then all let go together. */
const crowding = (nth: number): Schedule => async (starts, keeper) => {
  const gates: ReturnType<typeof makeGate>[] = []
  const moves: Promise<RaceOutcome>[] = []
  for (const start of starts) {
    const gate = keeper.holdAt(nth)
    const move = start()
    moves.push(move)
    const arrival = await inTime(reachedBeforeEnd(gate, move))
    if (! arrival.inTime) {
      for (const each of [...gates, gate]) { each.release() }
      throw waitedTooLong()
    }
    if (arrival.val) { gates.push(gate) } else { keeper.holdNone() }
  }
  for (const gate of gates) { gate.release() }
  return { outcomes: await finishing(Promise.all(moves), 'the moves, let go'), held: gates.length > 0 }
}

/** True once a move waits at `gate`, or false once `move` ends without coming to it. */
const reachedBeforeEnd = (gate: ReturnType<typeof makeGate>, move: Promise<unknown>): Promise<boolean> => Promise.race([trueOnce(gate.reached), falseOnce(move)])
const trueOnce = async (promise: Promise<unknown>) => {
  await promise
  return true
}
const falseOnce = async (promise: Promise<unknown>) => {
  await promise
  return false
}

/** What `promise` resolves to, if it does within `limitMillis`: {@link WaitedTooLongMillis} unless given. */
const inTime = async <ValT>(promise: Promise<ValT>, limitMillis = WaitedTooLongMillis): Promise<{ inTime: true, val: ValT } | { inTime: false }> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<{ inTime: false }>((resolve) => { timer = setTimeout(() => { resolve({ inTime: false }) }, limitMillis) })
  const timely = async () => ({ inTime: true as const, val: await promise })
  const settled = await Promise.race([timely(), late])
  clearTimeout(timer)
  return settled
}

/** What `promise` resolves to; rejects, saying `what` did not finish, when it takes longer than {@link ScheduleHungMillis}: so a hung adapter fails the schedule, which names it, not the test's own timeout. */
const finishing = async <ValT>(promise: Promise<ValT>, what: string): Promise<ValT> => {
  const settled = await inTime(promise, ScheduleHungMillis)
  if (! settled.inTime) { throw new Error(`${what} did not finish within ${String(ScheduleHungMillis)} ms: the adapter hung, or waits on something that never comes.`) }
  return settled.val
}

const waitedTooLong = () => new Error(
  `a device's move did not finish within ${String(WaitedTooLongMillis)} ms while another device waited at the turnstile, before a round trip to the backend. The devices share something that makes one wait for the other -- a lock, a queue, a connection -- that two real devices would not, or the adapter holds a lock from one round trip to the next, which the VaultDB contract's baseline rules out.`,
)

/** Resolves after `count` turns of the microtask queue. */
const microtasks = async (count: number) => {
  for (let ii = 0; ii < count; ii += 1) { await Promise.resolve() }
}

/** Resolves after `count` turns of the macrotask queue. */
const ticks = async (count: number) => {
  for (let ii = 0; ii < count; ii += 1) { await wakeupAtNextTick() }
}

/** Stands in for a resolver until the promise hands over its own. */
const unresolved = () => { /* replaced before use */ }

/** A promise, and apart from it the function that resolves it. */
const deferred = () => {
  let resolve: () => void = unresolved
  const promise = new Promise<void>((resolver) => { resolve = resolver })
  return { promise, resolve }
}

/** One call a {@link spyLogger} heard: which of the three, and what it was handed. */
export type LoggedCall = {
  level:   keyof VaultLogger
  message: string | undefined
  story:   Record<string, unknown> | undefined
  err:     Error | null | undefined
}

/**
 * A VaultLogger that logs nowhere and keeps every call it hears, in order, for a test to look at
 * -- bar the one notice `openVault` gives of a `test_` key deriver's label ({@link TestDeriverNotice}),
 * which every vault opened through {@link testDeriver} would otherwise add to every count.
 *
 * @returns The `logger` to hand openVault, and the `calls` it has heard so far.
 *
 * @example
 *   const spy = TH.spyLogger()
 *   const vault = await openVault({ ...opts, logger: spy.logger })
 *   spy.calls.map((call) => call.level)  // => ['warn'], say
 */
export const spyLogger = () => {
  const calls: LoggedCall[] = []
  const hear = (level: keyof VaultLogger): VaultLogger[typeof level] => (message, story, err) => {
    if (message === TestDeriverNotice) { return }
    calls.push({ level, message, story, err })
  }
  const logger: VaultLogger = { log: hear('log'), warn: hear('warn'), error: hear('error') }
  return { logger, calls }
}

/**
 * Everything a logger was handed, as one text to search for what must never be there: each
 * call's message, its story as JSON, and its error -- message, stack, own properties -- down
 * through every cause. It never throws: a cause seen before is written `[cause seen above]`, and
 * a story or own properties JSON cannot write (a circular reference, a bigint) are written
 * `[not JSON]`, so what they hold goes unsearched.
 *
 * @param calls - What a {@link spyLogger} heard.
 * @returns The text, one call to a line.
 *
 * @example expect(TH.loggedText(spy.calls)).to.not.include(passphrase)
 */
export const loggedText = (calls: readonly LoggedCall[]): string => (
  calls.map((call) => [call.level, call.message ?? '', jsonOrPlaceholder(call.story ?? {}), thrownText(call.err)].join(' ')).join('\n')
)

/**
 * Everything a thrown value carries, as one text to search for what must never be there: an
 * error's message, stack and own properties, and the same of each cause beneath it; anything else
 * thrown, as JSON. Like {@link loggedText}, it never throws: a cause seen before is written
 * `[cause seen above]`, and own properties JSON cannot write are written `[not JSON]`.
 *
 * @param thrown - What an operation threw or rejected with.
 * @returns The text, blank for `undefined` or `null`.
 *
 * @example expect(TH.thrownText(err)).to.not.include(passphrase)
 */
export const thrownText = (thrown: unknown): string => errorText(thrown, new Set())

/**
 * Every string and number in `val`, at any depth, as text: the values of a record, to search an
 * error or a log for. Field names are not among them. Give the record values distinctive
 * enough that finding one means it was quoted: an epoch of `2` turns up in any stack's line numbers.
 *
 * @param val - A record, or any JSON value.
 * @returns Its leaves, in JSON's order.
 *
 * @example TH.leafTexts({ vault_id: 'vault-id-u1', wrapped: { ciphertext_b64: 'ct-a1' }, epoch: 7 })  // => ['vault-id-u1', 'ct-a1', '7']
 */
export const leafTexts = (val: unknown): string[] => {
  const leaves: string[] = []
  JSON.stringify(val, (_ckey, nested: unknown) => {
    if (typeof nested === 'string' || typeof nested === 'number') { leaves.push(String(nested)) }
    return nested
  })
  return leaves
}

/**
 * An error and every cause under it as text: message, stack and own properties each. Anything
 * else thrown, as JSON. `seen` holds the errors already written, so a cause cycle ends.
 */
const errorText = (thrown: unknown, seen: Set<unknown>): string => {
  if (thrown === undefined || thrown === null) { return '' }
  if (seen.has(thrown)) { return '[cause seen above]' }
  seen.add(thrown)
  if (! (thrown instanceof Error)) { return jsonOrPlaceholder(thrown) }
  return [thrown.message, thrown.stack ?? '', jsonOrPlaceholder(thrown), errorText(thrown.cause, seen)].join(' ')
}

/** `val` as JSON, or `[not JSON]` where JSON.stringify throws on it. */
const jsonOrPlaceholder = (val: unknown): string => {
  try {
    return JSON.stringify(val)
  } catch {
    return '[not JSON]'
  }
}

/**
 * The numbered lines of the VaultDB contract (the core's `VAULTDB.md`), each by its number and
 * short title, as the document has them: {@link describeVaultDB} titles each of its groups by one,
 * and an adapter's own tests of a line the battery cannot reach (5.4, who may reach a vault) cite
 * it the same way. A line whose title is not here is not in the contract.
 *
 * @example describe(`postgresVaultDB, 5.5: ${TH.VaultDBContract['5.5']}`, () => { ... })
 */
export const VaultDBContract = Object.freeze({
  '1.1': 'What is stored reads back whole',
  '1.2': 'Each vault keeps to itself',
  '1.3': 'Nothing is repaired, and nothing is dropped',
  '2.1': 'A write that resolved is seen by every read after it',
  '2.2': 'Every lockbox stored can be read by its boxlabel',
  '2.3': 'A listing is whole',
  '3.1': 'A bundle is created once',
  '3.2': 'A bundle update lands only over the bundle it read',
  '3.3': 'A lockbox write lands only over the lockbox it read, in the vault it was sealed for',
  '3.4': 'An erase wins, within its vault',
  '3.5': 'A vault is erased whole, and alone',
  '3.6': 'A refused write wrote nothing',
  '3.7': 'Writes that do not collide all land',
  '3.8': 'A lockbox write lands only under the vaultKey that stands',
  '4.1': 'An adapter declares the most lockboxes it holds in one vault',
  '4.2': 'A new lockbox past the limit is refused, on a best effort',
  '4.3': 'A replacement is never refused for the count',
  '4.4': 'Under the limit, a new lockbox lands',
  '4.5': 'Past the limit, nothing is lost',
  '4.6': "A hard limit is the backend's, or opt-in",
  '5.1': 'Every refusal is a VaultError whose kind says what to do',
  '5.2': 'A stale write means an expectation failed, and nothing else',
  '5.3': 'A refusal quotes nothing it was handed',
  '5.4': 'Only the signed-in user reaches their vaults',
  '5.5': 'identity_revoked means the user is gone',
  '5.6': 'not_permitted refuses one call, and locks nothing',
  '5.7': 'An adapter with no notion of identity says neither',
  '6.1': 'subscribe hands back an unsubscribe, and calls when the vault may have changed',
  '6.2': 'A watch that fails calls onChange',
  '7.1': 'The most it holds in one record',
  '7.2': 'The most it holds of one vault',
  '7.3': 'The most it holds in one name',
} as const)

/** A numbered line of the VaultDB contract, such as `'3.3'`. */
export type VaultDBContractLine = keyof typeof VaultDBContract

/**
 * A VaultDB as the suite sees it: its public verbs only. Structural, so an adapter extending
 * VaultDB from the built package (`safebyok`) qualifies as readily as one extending `src/`.
 */
export type VaultDBVerbs = Pick<VaultDB,
  'maxRecordBytes' | 'maxVaultBytes' | 'maxLockboxes' | 'maxNameBytes' | 'readBundle' | 'createBundle' | 'updateBundle' | 'readBox' | 'listBoxes' | 'listBoxRecords' | 'updateBox' | 'eraseBox' | 'eraseVault' | 'eraseDamagedVault' | 'subscribe'
>

/**
 * A fresh, empty adapter, made with the {@link VaultDBOpts} it is handed -- its `logger`, for the
 * battery to hear what it says -- as every adapter's factory takes them: no record in it, and none
 * shared with another call.
 */
export type MakeVaultDB = (vaultDBOpts: VaultDBOpts) => VaultDBVerbs | Promise<VaultDBVerbs>

/** What {@link describeVaultDB} takes beside its adapter. */
export type DescribeVaultDBOpts = {
  /**
   * A fresh, empty adapter that declares and holds `maxLockboxes` lockboxes in one vault, for the
   * lockbox limit's lines (4.2 to 4.5); without it, those are skipped. An adapter whose limit is
   * `Infinity`, or fixed and too large to fill in a test, has none to give.
   */
  makeCappedVaultDB?: ((maxLockboxes: number) => VaultDBVerbs | Promise<VaultDBVerbs>) | undefined
  /**
   * A fresh, empty backend, as a way to make an adapter over it signed in as a given user, or
   * signed out for null: for line 5.4, who may reach a vault; without it, that is skipped. An
   * adapter with no notion of identity has none to give.
   */
  makeVaultDBFor?: (() => ((userId: string | null) => VaultDBVerbs) | Promise<(userId: string | null) => VaultDBVerbs>) | undefined
  /**
   * Whether the adapter `makeVaultDB` makes pushes: calls a subscriber after each write through
   * it, for line 6.1's push tests; without it, those are skipped. An adapter with no push (a
   * backend that cannot say when it changed, or one whose push the factory left unwired) leaves
   * it out.
   */
  pushes?: boolean | undefined
  /**
   * A fresh, empty backend, as a way to make devices over it: for the races (lines 3.1 to 3.7 and
   * 4.5) made from different devices, line 2.1 across devices, and 6.1's push from another device.
   * Each device is an adapter of its own over that backend, sharing nothing else with the others --
   * no adapter, client, connection, lock or queue -- held to `maxLockboxes` where the adapter takes a
   * limit (as for `makeCappedVaultDB`), and passing `turnstile` before every round trip it makes to
   * the backend, a watch's start among them ({@link throughTurnstile}), so a race can hold it there:
   * {@link expectRoundTripsThroughTurnstile} shows that each write passes it, though not that every
   * round trip does, since only the adapter knows how many it makes. An adapter over a backend in this
   * process that answers synchronously makes no round trips, and leaves `turnstile` be.
   * Without it, the races run through one adapter, as `makeVaultDB` makes it, and the rest is skipped.
   */
  makeDevices?: MakeVaultDBDevices | undefined
}

/** What a device of {@link DescribeVaultDBOpts.makeDevices} is made with: the limit to hold it to, where the adapter takes one. */
export type VaultDBDeviceOpts = { maxLockboxes?: number | undefined }

/** A fresh, empty backend, as a way to make devices over it: {@link MakeDevices} of a VaultDB, its factory taking {@link VaultDBDeviceOpts}. */
export type MakeVaultDBDevices = MakeDevices<VaultDBVerbs, VaultDBDeviceOpts>

/** The lockbox limit {@link describeVaultDB} asks a capped adapter for. */
const CappedLockboxes = 3

/**
 * The behaviour every VaultDB owes, written once: the VaultDB contract (the core's `VAULTDB.md`),
 * one group of tests for each of its numbered lines that a test can reach through an adapter's
 * public verbs, each group titled by its line ({@link VaultDBContract}). Run it against an adapter
 * with a factory making a fresh, empty one per test, and -- for an adapter with a lockbox limit a
 * test can fill -- a second making one held to a given limit, and for an adapter that serves the
 * user signed in, a third making one signed in as anyone; and for an adapter that pushes, a word
 * that it does.
 *
 * For an adapter's own tests, from `safebyok/testing`; it runs under vitest. It checks refusals
 * by `kind` rather than by class, so an adapter passes whichever copy of the package it extends.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeAdapter - A fresh, empty adapter, made with the VaultDBOpts it is handed: no record
 *   in it, and none shared with another call.
 * @param opts - Optionally, `makeCappedVaultDB`, for the lockbox limit's lines; `makeVaultDBFor`,
 *   for who may reach a vault; and `pushes`, for subscribe's calls.
 *
 * @example
 *   describeVaultDB('localVaultDB', (vaultDBOpts) => localVaultDB({ ...vaultDBOpts, store: memoryStore() }), { pushes: true })
 * @example
 *   describeVaultDB('postgresVaultDB', makeRequest, {
 *     makeCappedVaultDB: (maxLockboxes) => postgresVaultDB({ client, userId: 'u1', maxLockboxes }),
 *     makeVaultDBFor:    () => (userId) => postgresVaultDB({ client, userId }),
 *   })
 */
export const describeVaultDB = (adapterTitle: string, makeAdapter: MakeVaultDB, opts: DescribeVaultDBOpts = {}) => {
  const { makeCappedVaultDB, makeVaultDBFor } = opts
  /** A fresh adapter, made with no VaultDBOpts: the battery's own lines hear nothing it logs. */
  const makeVaultDB = () => makeAdapter({})

  /** The title of a group of tests for one line of the contract. */
  const lineTitle = (line: VaultDBContractLine) => `${adapterTitle}, as a VaultDB, ${line}: ${VaultDBContract[line]}`

  // The lockbox limit's lines run only over a capped adapter.
  const capped = makeCappedVaultDB !== undefined
  // And who may reach a vault, only over an adapter that knows who is signed in.
  const signsIn = makeVaultDBFor !== undefined

  // The races, the lines across devices and the push tests, each runnable on its own.
  const timing = vaultDBTimingChecks(makeAdapter, opts)
  /** Each timing check of `line`, as a test, run where its adapter can give what it needs. */
  const timingTestsOf = (line: VaultDBContractLine) => {
    for (const check of Object.values(timing)) {
      if (check.line === line) { it.runIf(check.runs)(check.title, () => expectToHold(check), TimingTestMillis) }
    }
  }

  /** A fresh adapter whose `u1` scope holds a bundle, as every lockbox write needs. */
  const withBundle = async () => {
    const vaultDB = await makeVaultDB()
    await vaultDB.createBundle(bundleOf('u1'))
    return vaultDB
  }

  /** A fresh backend whose u1 vault holds two lockboxes, and the way to sign in to it. */
  const servedHolding = async () => {
    if (! makeVaultDBFor) { throw new Error('describeVaultDB ran a sign-in test with no makeVaultDBFor.') }
    const vaultDBFor = await makeVaultDBFor()
    const owner = vaultDBFor('u1')
    await owner.createBundle(bundleOf('u1'))
    await storeEach(owner, ['anthropic', 'openai'])
    return { owner, vaultDBFor }
  }

  /** A fresh capped adapter, its `u1` vault made and holding a new lockbox under each boxlabel. */
  const cappedHolding = async (boxlabels: readonly string[]) => {
    if (! makeCappedVaultDB) { throw new Error('describeVaultDB ran a lockbox limit test with no makeCappedVaultDB.') }
    const vaultDB = await makeCappedVaultDB(CappedLockboxes)
    await vaultDB.createBundle(bundleOf('u1'))
    await storeEach(vaultDB, boxlabels)
    return vaultDB
  }

  describe(lineTitle('1.1'), () => {
    it("has no bundle until one is created, then reads it back whole", async () => {
      const vaultDB = await makeVaultDB()
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
      expect(await vaultDB.createBundle(bundleOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("has no lockbox until one is written, then reads it back whole", async () => {
      const vaultDB = await withBundle()
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("reads back a lockbox with an empty public bag as stored, and lists it with that bag", async () => {
      const vaultDB = await withBundle()
      const bagless = boxOf('anthropic', 'one', { public_json: '{}' })
      await vaultDB.updateBox(scopeOf('u1'), bagless, noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(bagless)
      const [summary] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(summary)?.public).to.deep.equal({})
    })

    it("reads a public bag's JSON back exactly as written, as it is bound: accented letters, an emoji, a tab, a newline, quotes and backslashes", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one', { public_json: publicJsonOf(LiteralBag) }), noBoxYet)
      const lockbox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(lockbox?.public_json).to.eq(publicJsonOf(LiteralBag))
      const [summary] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(summary)?.public).to.deep.equal(LiteralBag)
    })

    it("adds nothing it was handed beyond the record: a field safebyok never writes is left behind", async () => {
      const vaultDB = await makeVaultDB()
      await vaultDB.createBundle({ ...bundleOf('u1'), stray_field: 'never stored' } as VaultBundle)
      await vaultDB.updateBox(scopeOf('u1'), { ...boxOf('anthropic', 'one'), stray_field: 'never stored' } as Lockbox, noBoxYet)
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })
  })

  describe(lineTitle('1.2'), () => {
    it("keeps each scope to itself: same boxlabel, two users, no collision", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(bundleOf('u2'))
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u2'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 })
      const oneBox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      const twoBox = await vaultDB.readBox(scopeOf('u2'), 'anthropic')
      expect(oneBox?.revision_id).to.eq('rev-one')
      expect(twoBox?.revision_id).to.eq('rev-two')
      expect(await vaultDB.listBoxes(scopeOf('u2'))).to.have.lengthOf(1)
    })

    it("keeps apart users whose ids differ only by a colon, a quote, a backslash, a comma or a bracket", async () => {
      const vaultDB = await makeVaultDB()
      const userIds = ['u1', 'u1:', 'u1"', String.raw`u1\\`, 'u1,', 'u1[', 'u1]', 'u1","main']
      for (const [ii, userId] of userIds.entries()) {
        await vaultDB.createBundle(bundleOf(userId))
        await vaultDB.updateBox(scopeOf(userId), boxOf('anthropic', `of-${String(ii)}`), { vault_id: `vault-id-${userId}`, revision_id: null, vault_key_epoch: 1 })
      }
      const listEach = () => Promise.all(userIds.map((userId) => vaultDB.listBoxes(scopeOf(userId))))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => summaryOf(box)?.revision_id))).to.deep.equal(userIds.map((_userId, ii) => [`rev-of-${String(ii)}`]))
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal([0, 1, 1, 1, 1, 1, 1, 1])
    })

    it("holds one spelling of a letter: a user id with it composed is stored, and one with it decomposed refused, never normalized", async () => {
      const vaultDB = await makeVaultDB()
      const [composed, decomposed] = ['caf\u{E9}', 'cafe\u{301}']
      await vaultDB.createBundle(bundleOf(composed))
      expect(await vaultDB.readBundle(scopeOf(composed))).to.deep.equal(bundleOf(composed))
      await expectRefusal(vaultDB.createBundle(bundleOf(decomposed)), 'bad_label')
      await expectRefusal(vaultDB.readBundle(scopeOf(decomposed)), 'bad_label')
    })

    it("keeps apart vaults and boxes whose labels differ only by a colon, a quote, a backslash, a comma or a bracket, or are in any script", async () => {
      const vaultDB = await makeVaultDB()
      const scopes = OddLabels.map((vaultlabel) => scopeOf('u1', vaultlabel))
      for (const [ii, scope] of scopes.entries()) {
        await vaultDB.createBundle(bundleOf('u1', { ...scope, vault_id: `vault-id-${String(ii)}` }))
        await vaultDB.updateBox(scope, boxOf(OddLabels[ii] ?? '', `of-${String(ii)}`), { vault_id: `vault-id-${String(ii)}`, revision_id: null, vault_key_epoch: 1 })
      }
      const listEach = () => Promise.all(scopes.map((scope) => vaultDB.listBoxes(scope)))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => [box.boxlabel, summaryOf(box)?.revision_id]))).to.deep.equal(OddLabels.map((label, ii) => [[label, `rev-of-${String(ii)}`]]))
      await vaultDB.eraseVault(scopes[0] ?? scopeOf('u1'), { vault_id: 'vault-id-0' })
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal(OddLabels.map((_label, ii) => (ii === 0 ? 0 : 1)))
    })

    it("keeps boxes of one vault apart, by any labels, reading back each under its own", async () => {
      const vaultDB = await withBundle()
      for (const [ii, boxlabel] of OddLabels.entries()) {
        await vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, `of-${String(ii)}`), noBoxYet)
      }
      const summaries = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.have.members([...OddLabels])
      for (const [ii, boxlabel] of OddLabels.entries()) {
        const lockbox = await vaultDB.readBox(scopeOf('u1'), boxlabel)
        expect(lockbox?.revision_id).to.eq(`rev-of-${String(ii)}`)
      }
      await vaultDB.eraseBox(scopeOf('u1'), 'main"', thisVault)
      const remaining = await vaultDB.listBoxes(scopeOf('u1'))
      expect(remaining).to.have.lengthOf(OddLabels.length - 1)
    })
  })

  describe(lineTitle('2.1'), () => {
    it("shows each write to the very next read and listing, and each erase likewise", async () => {
      const vaultDB = await withBundle()
      const revisionsNow = async () => ({
        read:   await revisionIn(vaultDB, 'anthropic'),
        listed: await listedRevisions(vaultDB),
      })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-one', listed: ['rev-one'] })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one', vault_key_epoch: 1 })
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-two', listed: ['rev-two'] })
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      expect(await revisionsNow()).to.deep.equal({ read: null, listed: [] })
    })

    timingTestsOf('2.1')
  })

  describe(lineTitle('2.2'), () => {
    it("reads each of many lockboxes back by its boxlabel", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ManyBoxlabels)
      const revisions = await Promise.all(ManyBoxlabels.map((boxlabel) => revisionIn(vaultDB, boxlabel)))
      expect(revisions).to.deep.equal(ManyBoxlabels.map((boxlabel) => `rev-${boxlabel}`))
    })
  })

  describe(lineTitle('2.3'), () => {
    it("lists summaries sorted by boxlabel, with format and both ciphered fields stripped", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'two'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      const summaries = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
      expect(summaries[0]).to.deep.equal({
        boxlabel:        'anthropic',
        revision_id:     'rev-one',
        vault_key_epoch: 1,
        public:          { note: 'a test box' },
        registered_at:   Date.UTC(2026, 9, 14),
        written_at:      Date.UTC(2026, 9, 14),
        damaged:         false,
      })
    })

    it("lists every lockbox, however many: never a page or a sample", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ManyBoxlabels)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(ManyBoxlabels.toSorted((one, two) => one.localeCompare(two)))
    })

    it("lists the same twice with nothing written between", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['openai', 'anthropic', 'mistral'])
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.deep.equal(await vaultDB.listBoxes(scopeOf('u1')))
    })

    it("lists every lockbox as stored through listBoxRecords, for a server to serve: each record whole but for its two ciphered fields", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['openai', 'anthropic'])
      await vaultDB.createBundle(bundleOf('u2'))
      await vaultDB.updateBox(scopeOf('u2'), boxOf('mistral', 'other'), { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 })
      const records = await vaultDB.listBoxRecords(scopeOf('u1'))
      const listedOf = (boxlabel: string) => {
        const { lockbox_key_wrapped: _lockboxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = boxOf(boxlabel, boxlabel)
        return listed
      }
      expect(records).to.have.deep.members([listedOf('openai'), listedOf('anthropic')])
      expect(await vaultDB.listBoxRecords(scopeOf('u3'))).to.deep.equal([])
    })
  })

  describe(lineTitle('3.1'), () => {
    it("yields to a bundle already standing: the second device gets the first's back", async () => {
      const vaultDB = await withBundle()
      const latecomer = { ...bundleOf('u1'), vault_id: 'the-second-arrival' }
      expect(await vaultDB.createBundle(latecomer)).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    timingTestsOf('3.1')
  })

  describe(lineTitle('3.2'), () => {
    it("lands while the standing bundle is the one proven against", async () => {
      const vaultDB = await withBundle()
      const next = { ...bundleOf('u1'), unlock_epoch: 2 }
      await vaultDB.updateBundle(next, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(next)
    })

    it("refuses over an unlock_epoch since moved on, writing nothing", async () => {
      const vaultDB = await withBundle()
      const theirs = { ...bundleOf('u1'), unlock_epoch: 2, unlocks: [envelopeOf('passphrase', { vault_key_wrapped: fakeCiphered('theirs') })] }
      await vaultDB.updateBundle(theirs, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
      const mine = { ...bundleOf('u1'), unlock_epoch: 2, unlocks: [envelopeOf('passphrase', { vault_key_wrapped: fakeCiphered('mine') })] }
      await expectRefusal(vaultDB.updateBundle(mine, { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(theirs)
    })

    it("refuses over a vault made anew under another vault_id", async () => {
      const vaultDB = await withBundle()
      const next = { ...bundleOf('u1'), vault_id: 'vault-id-gone', unlock_epoch: 2 }
      await expectRefusal(vaultDB.updateBundle(next, { vault_id: 'vault-id-gone', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("refuses where no bundle stands: an update never creates", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })

    timingTestsOf('3.2')
  })

  describe(lineTitle('3.3'), () => {
    it("replaces a lockbox over the revision it read", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one', vault_key_epoch: 1 })
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'two'))
    })

    it("refuses a write over a revision it never read, writing nothing", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      // A second device that saw no box, and one that saw some other revision, both lose.
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), noBoxYet), 'stale_write')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-other', vault_key_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("refuses a write into a scope that holds no bundle", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses a box sealed for a vault since destroyed and made anew, though no box stands in either", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      await vaultDB.createBundle({ ...bundleOf('u1'), vault_id: 'vault-id-reborn' })
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'stale'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'fresh'), { vault_id: 'vault-id-reborn', revision_id: null, vault_key_epoch: 1 })
      const reborn = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(reborn?.revision_id).to.eq('rev-fresh')
    })

    it("refuses a write expecting another user's vault_id", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(bundleOf('u2'))
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 }), 'stale_write')
    })

    timingTestsOf('3.3')
  })

  describe(lineTitle('3.4'), () => {
    it("removes one box without touching its neighbours, and is quiet when there is none", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'two'), noBoxYet)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.not.be.null
    })

    it("wins over a write: a write over a revision erased meanwhile refuses, and the box stays gone", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one', vault_key_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses from a stale handle: a vault destroyed and made anew keeps its box", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      await vaultDB.createBundle({ ...bundleOf('u1'), vault_id: 'vault-id-reborn' })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null, vault_key_epoch: 1 })
      await expectRefusal(vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
      const kept = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(kept?.revision_id).to.eq('rev-reborn')
    })

    it("refuses in a scope that holds no bundle, even with no box to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
    })

    timingTestsOf('3.4')
  })

  describe(lineTitle('3.5'), () => {
    it("removes the bundle and every box of that scope, and nothing else", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(bundleOf('u2'))
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u2'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 })
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
      expect(await vaultDB.readBundle(scopeOf('u2'))).to.not.be.null
      expect(await vaultDB.readBox(scopeOf('u2'), 'anthropic')).to.not.be.null
    })

    it("refuses from a stale handle: a vault made anew survives, bundle and boxes", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      const reborn = { ...bundleOf('u1'), vault_id: 'vault-id-reborn' }
      await vaultDB.createBundle(reborn)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null, vault_key_epoch: 1 })
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(reborn)
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
    })

    it("refuses where no bundle stands: there is no vault of that vault_id to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })

    it("eraseDamagedVault leaves a vault that stands sound as it is, and is quiet where none stands", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await expectRefusal(vaultDB.eraseDamagedVault(scopeOf('u1')), 'bad_option')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      await vaultDB.eraseDamagedVault(scopeOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })
    timingTestsOf('3.5')
  })

  describe(lineTitle('3.6'), () => {
    it("leaves the whole vault as it stood after each refusal: bundle, boxes and listing", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['anthropic', 'openai'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])
      const refusals = [
        [() => vaultDB.updateBundle(bundleOf('u1', { unlock_epoch: 3 }), { vault_id: 'vault-id-u1', unlock_epoch: 2 }),                 'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'late'), { vault_id: 'vault-id-u1', revision_id: 'rev-other', vault_key_epoch: 1 }),      'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('mistral', 'late'), { vault_id: 'vault-id-gone', revision_id: null, vault_key_epoch: 1 }),             'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('mistral', 'late', { public_json: '{"note":' }), noBoxYet),                       'bad_option'],
        [() => vaultDB.eraseBox(scopeOf('u1'), 'anthropic', { vault_id: 'vault-id-gone' }),                                               'stale_write'],
        [() => vaultDB.eraseVault(scopeOf('u1'), { vault_id: 'vault-id-gone' }),                                                          'stale_write'],
      ] as const
      for (const [refuse, kind] of refusals) {
        await expectRefusal(refuse(), kind)
        expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
      }
    })
  })

  describe(lineTitle('3.7'), () => {
    timingTestsOf('3.7')
  })

  /** A fresh adapter whose u1 vault held `anthropic` under its first vaultKey, and then replaced the vaultKey. */
  const rotatedHolding = async () => {
    const vaultDB = await withBundle()
    await storeEach(vaultDB, ['anthropic'])
    await vaultDB.updateBundle(rotatedBundleOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    return vaultDB
  }

  describe(lineTitle('3.8'), () => {
    const underFirstKey = { vault_id: 'vault-id-u1', revision_id: 'rev-anthropic', vault_key_epoch: 1 } as const
    const underSecondKey = { ...underFirstKey, vault_key_epoch: 2 } as const

    it("refuses a write sealed under a vaultKey since replaced, over the revision it read, writing nothing", async () => {
      const vaultDB = await rotatedHolding()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'stale'), underFirstKey), 'stale_write')
      expect(await revisionIn(vaultDB, 'anthropic')).to.eq('rev-anthropic')
    })

    it("refuses a new lockbox sealed under a vaultKey since replaced, though none stands under its boxlabel", async () => {
      const vaultDB = await rotatedHolding()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'stale'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.be.null
    })

    it("refuses a write sealed under a vaultKey the vault does not stand for yet", async () => {
      const vaultDB = await withBundle()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'ahead', { vault_key_epoch: 2 }), { ...noBoxYet, vault_key_epoch: 2 }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("lands a write sealed under the vaultKey that stands, over a lockbox sealed under the one before", async () => {
      const vaultDB = await rotatedHolding()
      const resealed = boxOf('anthropic', 'resealed', { vault_key_epoch: 2 })
      await vaultDB.updateBox(scopeOf('u1'), resealed, underSecondKey)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(resealed)
      const [listed] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(listed)?.vault_key_epoch).to.eq(2)
    })
  })

  describe(lineTitle('4.1'), () => {
    it("declares a whole number of lockboxes above zero, or Infinity", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxLockboxes === Infinity || (Number.isSafeInteger(vaultDB.maxLockboxes) && vaultDB.maxLockboxes > 0)).to.be.true
    })
  })

  describe.runIf(capped)(lineTitle('4.2'), () => {
    it("refuses a new lockbox in a full vault as vault_full, writing nothing", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet), 'vault_full')
      expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])).to.deep.equal(before)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'mistral', 'openai'])
    })

    it("never lets writes made one after another past the limit", async () => {
      const vaultDB = await cappedHolding([])
      const write = (boxlabel: string) => settledKind(vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet))
      const outcomes = [await write('anthropic'), await write('openai'), await write('mistral'), await write('gemini'), await write('cohere')]
      expect(outcomes).to.deep.equal(['landed', 'landed', 'landed', 'vault_full', 'vault_full'])
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(CappedLockboxes)
    })
  })

  describe.runIf(capped)(lineTitle('4.3'), () => {
    it("replaces a lockbox in a full vault", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'next'), { vault_id: 'vault-id-u1', revision_id: 'rev-openai', vault_key_epoch: 1 })
      const replaced = await vaultDB.readBox(scopeOf('u1'), 'openai')
      expect(replaced?.revision_id).to.eq('rev-next')
    })

    it("refuses a first write under a boxlabel already taken in a full vault as stale_write, not vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'mine'), noBoxYet), 'stale_write')
      const standing = await vaultDB.readBox(scopeOf('u1'), 'openai')
      expect(standing?.revision_id).to.eq('rev-openai')
    })
  })

  describe.runIf(capped)(lineTitle('4.4'), () => {
    it("lands a new lockbox once an erase has made room", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet), 'vault_full')
      await vaultDB.eraseBox(scopeOf('u1'), 'openai', thisVault)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'gemini', 'mistral'])
    })
  })

  describe(lineTitle('4.5'), () => {
    timingTestsOf('4.5')
  })

  describe(lineTitle('5.1'), () => {
    it("refuses a scope or boxlabel below the floor every name is held to as bad_label, before storage sees it", async () => {
      const vaultDB = await withBundle()
      await expectRefusal(vaultDB.readBundle({ ...scopeOf('u1'), vaultlabel: '' }), 'bad_label')
      await expectRefusal(vaultDB.readBox(scopeOf('u1'), 'tab\there'), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('cafe\u{301}', 'one'), noBoxYet), 'bad_label')
      await expectRefusal(vaultDB.eraseBox({ ...scopeOf('u1'), user_id: 'u1\u{D800}' }, 'anthropic', thisVault), 'bad_label')
      const overlong = 'u'.repeat(NameFloorBytes + 1)
      await expectRefusal(vaultDB.listBoxes(scopeOf(overlong)), 'bad_label')
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("refuses a name holding ^, which key-value stores join names on, as bad_label in every place a name goes, whatever the store, writing nothing", async () => {
      const vaultDB = await withBundle()
      const holding = 'a^b'
      await expectRefusal(vaultDB.createBundle(bundleOf(holding)), 'bad_label')
      await expectRefusal(vaultDB.readBundle({ ...scopeOf('u1'), applabel: holding }), 'bad_label')
      await expectRefusal(vaultDB.listBoxes({ ...scopeOf('u1'), vaultlabel: holding }), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf(holding, 'one'), noBoxYet), 'bad_label')
      await expectRefusal(vaultDB.readBox(scopeOf('u1'), holding), 'bad_label')
      await expectRefusal(vaultDB.eraseBox(scopeOf('u1'), holding, thisVault), 'bad_label')
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("takes any name above the floor, whatever a vault's validators would say: they are the vault's, at its entry", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('Not a Label!', 'one'), noBoxYet)
      const lockbox = await vaultDB.readBox(scopeOf('u1'), 'Not a Label!')
      expect(lockbox?.revision_id).to.eq('rev-one')
    })

    it("refuses a malformed record or expectation, or a bundle under another vault_id, as bad_option, before storage sees it", async () => {
      const vaultDB = await withBundle()
      const unparsable = boxOf('anthropic', 'one', { public_json: 'not json' })
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), unparsable, noBoxYet), 'bad_option')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: '', vault_key_epoch: 1 }), 'bad_option')
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1', { unlock_epoch: 0 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'bad_option')
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1', { vault_id: 'vault-id-new', unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'bad_option')
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), { vault_id: '' }), 'bad_option')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })
  })

  describe(lineTitle('5.3'), () => {
    it("quotes no ciphertext, boxlabel or public bag of a write it refuses as stale", async () => {
      const vaultDB = await withBundle()
      const lockbox = boxOf('secret_project_x', 'sk-fake-quoted', { public_json: publicJsonOf({ note: 'a bag never to be quoted' }) })
      const refusal = await expectRefusal(vaultDB.updateBox(scopeOf('u1'), lockbox, { vault_id: 'vault-id-gone', revision_id: null, vault_key_epoch: 1 }), 'stale_write')
      expect(quotedOf(refusal, lockbox)).to.deep.equal([])
    })

    it.runIf(capped)("quotes no ciphertext, boxlabel or public bag of a lockbox it refuses as vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const lockbox = boxOf('secret_project_x', 'sk-fake-quoted', { public_json: publicJsonOf({ note: 'a bag never to be quoted' }) })
      const refusal = await expectRefusal(vaultDB.updateBox(scopeOf('u1'), lockbox, noBoxYet), 'vault_full')
      expect(quotedOf(refusal, lockbox)).to.deep.equal([])
    })
  })

  describe.runIf(signsIn)(lineTitle('5.4'), () => {
    it("refuses another user every verb on a vault as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor('u2'))
      for (const attempt of attempts) { await expectRefusal(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })

    it("refuses every verb while no one is signed in as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor(null))
      for (const attempt of attempts) { await expectRefusal(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })
  })

  describe(lineTitle('6.1'), () => {
    it("hands back an unsubscribe that can be called", async () => {
      const vaultDB = await makeVaultDB()
      const unsubscribe = vaultDB.subscribe(scopeOf('u1'), unheard)
      expect(unsubscribe).to.be.a('function')
      unsubscribe()
    })

    timingTestsOf('6.1')
  })

  describe(lineTitle('7.1'), () => {
    it("declares the most it holds in one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxRecordBytes).to.be.greaterThan(0)
    })
  })

  describe(lineTitle('7.2'), () => {
    it("declares the most it holds of one vault, no less than one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxVaultBytes).to.be.a('number')
      expect(vaultDB.maxVaultBytes).to.be.at.least(vaultDB.maxRecordBytes)
    })
  })

  describe(lineTitle('7.3'), () => {
    it("declares the most bytes it holds in one name: a whole number above zero, or Infinity", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxNameBytes === Infinity || (Number.isSafeInteger(vaultDB.maxNameBytes) && vaultDB.maxNameBytes > 0)).to.be.true
    })

    it("holds a name of every length it declares, up to the floor's, in every place a name goes", async () => {
      const vaultDB = await makeVaultDB()
      const longest = 'n'.repeat(Math.min(vaultDB.maxNameBytes, NameFloorBytes))
      const scope = { applabel: longest, user_id: longest, vaultlabel: longest }
      await vaultDB.createBundle({ ...bundleOf(longest), ...scope })
      await vaultDB.updateBox(scope, boxOf(longest, 'one'), { vault_id: `vault-id-${longest}`, revision_id: null, vault_key_epoch: 1 })
      const lockbox = await vaultDB.readBox(scope, longest)
      expect(lockbox?.revision_id).to.eq('rev-one')
    })

    it("refuses a name one byte longer than it holds as bad_label, in every place a name goes, writing nothing", async () => {
      const vaultDB = await withBundle()
      if (vaultDB.maxNameBytes >= NameFloorBytes) { return }
      const overlong = 'n'.repeat(vaultDB.maxNameBytes + 1)
      await expectRefusal(vaultDB.createBundle(bundleOf(overlong)), 'bad_label')
      await expectRefusal(vaultDB.readBundle({ ...scopeOf('u1'), applabel: overlong }), 'bad_label')
      await expectRefusal(vaultDB.readBundle({ ...scopeOf('u1'), vaultlabel: overlong }), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf(overlong, 'one'), noBoxYet), 'bad_label')
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })
  })
}

/** The longest a race or push test may take: a race runs a score of schedules, each over a fresh backend. */
const TimingTestMillis = 60_000

/** One of {@link vaultDBTimingChecks}: the contract line it proves, its title, whether its adapter can run it, and the check, which rejects when it fails. */
export type VaultDBTimingCheck = { line: VaultDBContractLine, title: string, runs: boolean, check: () => Promise<void> }

/**
 * The tests of {@link describeVaultDB} that are about when -- the races between devices, what one
 * device sees of another's writes, and what subscribe hears -- each runnable on its own, so a test
 * can show that one fails against an adapter that breaks it. `describeVaultDB` runs each in its
 * line's group, where `runs`. Each race runs under every schedule of {@link raceEveryWay}, its
 * devices from `makeDevices`, or else every move through one adapter from `makeVaultDB` (or
 * `makeCappedVaultDB`, for the limit's).
 *
 * Two limits of what they prove. `pushFromTheStart` holds a watch's start at the turnstile only
 * where that start is a round trip through it; a watch that starts as `subscribe` returns, or
 * whose start `makeDevices` leaves unwired (a Convex client's `watchQuery` is not a promise, so
 * cannot pass it), is live at once, and the check then shows what the other push checks do. And a
 * push check credits a call to a write by when it ran, not by what caused it: a late call from an
 * earlier write that reads the vault after a later one landed is credited to the later.
 *
 * @param makeAdapter - A fresh, empty adapter, as `describeVaultDB` takes it.
 * @param opts - `describeVaultDB`'s options.
 * @returns Each check, by a handle naming what it races or watches.
 *
 * @example await TH.vaultDBTimingChecks(() => new MyVaultDB(), { makeDevices }).rivalFirstWrites.check()
 */
export const vaultDBTimingChecks = (makeAdapter: MakeVaultDB, opts: DescribeVaultDBOpts = {}) => {
  const { makeCappedVaultDB, makeDevices, pushes = false } = opts
  /** A fresh adapter, made with `vaultDBOpts`, or with none. */
  const makeVaultDB = (vaultDBOpts: VaultDBOpts = {}) => makeAdapter(vaultDBOpts)
  const capped = makeCappedVaultDB !== undefined
  const devices = makeDevices !== undefined
  // Titles say what the moves come from, so a race through one adapter claims no more than it proves.
  const fromTwo = devices ? 'from two devices' : 'through one adapter'
  const fromEach = devices ? 'each from its own device' : 'all through one adapter'

  /** Devices over one fresh backend for a race, held to `maxLockboxes` if given: from `makeDevices`, or else one adapter for every move. */
  const devicesFor = (maxLockboxes?: number) => async (turnstile: Turnstile): Promise<() => VaultDBVerbs> => {
    if (makeDevices) {
      const deviceFor = await makeDevices(turnstile)
      return () => deviceFor({ maxLockboxes })
    }
    const shared = await (maxLockboxes === undefined ? makeVaultDB() : cappedAdapter(maxLockboxes))
    return () => shared
  }
  const cappedAdapter = async (maxLockboxes: number) => {
    if (! makeCappedVaultDB) { throw new Error('vaultDBTimingChecks ran a lockbox limit check with no makeCappedVaultDB.') }
    return await makeCappedVaultDB(maxLockboxes)
  }
  /** Two devices over one fresh backend, through `turnstile` (by default one never held): for a check that is no race. */
  const twoDevices = async (turnstile: Turnstile = openTurnstile): Promise<[VaultDBVerbs, VaultDBVerbs]> => {
    if (! makeDevices) { throw new Error('vaultDBTimingChecks ran a check across devices with no makeDevices.') }
    const deviceFor = await makeDevices(turnstile)
    return [deviceFor({}), deviceFor({})]
  }
  /** A watcher and a writer over one fresh backend: one adapter as both. */
  const sameAdapterTwice = async (): Promise<[VaultDBVerbs, VaultDBVerbs]> => {
    const vaultDB = await makeVaultDB()
    return [vaultDB, vaultDB]
  }
  return {
    seenAcrossDevices: {
      line:  '2.1',
      title: "shows a write made on one device to the very next read and listing on another, and an erase likewise",
      runs:  devices,
      check: async () => {
        const [one, two] = await twoDevices()
        expect(one, 'makeDevices made one adapter for both devices').to.not.eq(two)
        await one.createBundle(bundleOf('u1'))
        expect(await two.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
        await one.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
        expect({ read: await revisionIn(two, 'anthropic'), listed: await listedRevisions(two) }).to.deep.equal({ read: 'rev-one', listed: ['rev-one'] })
        await two.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
        expect({ read: await revisionIn(one, 'anthropic'), listed: await listedRevisions(one) }).to.deep.equal({ read: null, listed: [] })
        await two.eraseVault(scopeOf('u1'), thisVault)
        expect(await one.readBundle(scopeOf('u1'))).to.be.null
      },
    },
    rivalCreates: {
      line:  '3.1',
      title: `settles two creates of one vault made at once ${fromTwo} on one bundle, which both get back, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          moves:       [(one) => one.createBundle(bundleOf('u1', { vault_id: 'vault-id-one' })), (two) => two.createBundle(bundleOf('u1', { vault_id: 'vault-id-two' }))],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            const [first, second] = outcomes
            expect(first?.val).to.deep.equal(second?.val)
            for (const racer of racers) { expect(await racer.readBundle(scopeOf('u1'))).to.deep.equal(first?.val) }
          },
        })
      },
    },
    rivalBundleUpdates: {
      line:  '3.2',
      title: `lands one of two updates of one bundle made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [bundleOf('u1', { unlock_epoch: 2, unlocks: [envelopeOf('one')] }), bundleOf('u1', { unlock_epoch: 2, unlocks: [envelopeOf('two')] })]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withBundleFirst,
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.updateBundle(rival, { vault_id: 'vault-id-u1', unlock_epoch: 1 })),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            for (const racer of racers) { expect(await racer.readBundle(scopeOf('u1'))).to.deep.equal(winner) }
          },
        })
      },
    },
    rivalFirstWrites: {
      line:  '3.3',
      title: `lands one of two first writes of a lockbox made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withBundleFirst,
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.updateBox(scopeOf('u1'), rival, noBoxYet)),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            for (const racer of racers) { expect(await racer.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(winner) }
          },
        })
      },
    },
    rivalReplacements: {
      line:  '3.3',
      title: `lands one of two replacements of one revision made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic']),
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.updateBox(scopeOf('u1'), rival, over('rev-anthropic'))),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            for (const racer of racers) { expect(await racer.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(winner) }
          },
        })
      },
    },
    eraseBeatsReplacement: {
      line:  '3.4',
      title: `lands an erase made at once ${fromTwo} with a replacement of its lockbox, which is gone afterwards, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic']),
          moves:       [(one) => one.eraseBox(scopeOf('u1'), 'anthropic', thisVault), (two) => two.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), over('rev-anthropic'))],
          verdict:     async ([erased, written], racers) => {
            expect(erased?.kind).to.eq('landed')
            expect(['landed', 'stale_write']).to.include(written?.kind)
            for (const racer of racers) { expect(await racer.readBox(scopeOf('u1'), 'anthropic')).to.be.null }
          },
        })
      },
    },
    vaultEraseBeatsWrite: {
      line:  '3.5',
      title: `leaves no lockbox behind a vault erased while a lockbox was written into it ${fromTwo}, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withBundleFirst,
          moves:       [(one) => one.eraseVault(scopeOf('u1'), thisVault), (two) => two.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)],
          verdict:     async ([erased, written], racers) => {
            expect(erased?.kind).to.eq('landed')
            expect(['landed', 'stale_write']).to.include(written?.kind)
            for (const racer of racers) { expect(await standingVault(racer, ['anthropic'])).to.deep.equal({ bundle: null, listed: [], lockboxes: [null] }) }
          },
        })
      },
    },
    apartNewLockboxes: {
      line:  '3.7',
      title: `lands two new lockboxes written into one vault at once ${fromTwo}, however they interleave, neither waiting on the other`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withBundleFirst,
          moves:       [(one) => one.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet), (two) => two.updateBox(scopeOf('u1'), boxOf('openai', 'openai'), noBoxYet)],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            for (const racer of racers) { expect(await listedRevisions(racer)).to.deep.equal(['rev-anthropic', 'rev-openai']) }
          },
        })
      },
    },
    apartReplaceAndErase: {
      line:  '3.7',
      title: `lands a replacement of one lockbox and an erase of another made at once ${fromTwo}, however they interleave, neither waiting on the other`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic', 'openai']),
          moves:       [(one) => one.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), over('rev-anthropic')), (two) => two.eraseBox(scopeOf('u1'), 'openai', thisVault)],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            for (const racer of racers) {
              const listed = await racer.listBoxes(scopeOf('u1'))
              expect(listed.map((box) => [box.boxlabel, summaryOf(box)?.revision_id])).to.deep.equal([['anthropic', 'rev-next']])
            }
          },
        })
      },
    },
    crowdForLastPlace: {
      line:  '4.5',
      title: `keeps every lockbox that landed when four writers race for the last place, ${fromEach}, and leaves nothing of those refused, however they interleave`,
      runs:  capped,
      check: async () => {
        const racers = ['mistral', 'gemini', 'cohere', 'groq']
        await raceEveryWay({
          makeDevices: devicesFor(CappedLockboxes),
          setup:       holdingFirst(['anthropic', 'openai']),
          moves:       racers.map((boxlabel) => (racer: VaultDBVerbs) => racer.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet)),
          verdict:     async (outcomes, [first]) => {
            if (! first) { throw new Error('A crowd race had no devices.') }
            // However many found room -- one, where the adapter checks strictly; more, where its
            // count and its insert are apart -- each landed or was refused as full, and one landed.
            expect(outcomes.every((outcome) => outcome.kind === 'landed' || outcome.kind === 'vault_full')).to.be.true
            const landed = racers.filter((_boxlabel, ii) => outcomes[ii]?.kind === 'landed')
            expect(landed).to.not.have.lengthOf(0)
            const found = await Promise.all(racers.map((boxlabel) => revisionIn(first, boxlabel)))
            expect(found).to.deep.equal(racers.map((boxlabel, ii) => (outcomes[ii]?.kind === 'landed' ? `rev-${boxlabel}` : null)))
            // Back under the limit, keeping one racer that landed: the listing is whole again.
            const [kept, ...others] = landed
            for (const boxlabel of ['anthropic', 'openai', ...others]) { await first.eraseBox(scopeOf('u1'), boxlabel, thisVault) }
            const listed = await first.listBoxes(scopeOf('u1'))
            expect(listed.map((box) => box.boxlabel)).to.deep.equal([kept])
          },
        })
      },
    },
    pastLimitFromRoomierDevice: {
      line:  '4.5',
      title: "keeps every lockbox of a vault past its limit -- filled by a device allowed more -- readable, refuses a new one as full, replaces one, and lists it whole once erases bring it back under",
      runs:  capped && devices,
      check: async () => {
        if (! makeDevices) { throw new Error('vaultDBTimingChecks ran a check across devices with no makeDevices.') }
        const deviceFor = await makeDevices(openTurnstile)
        const tight = deviceFor({ maxLockboxes: CappedLockboxes })
        const roomy = deviceFor({ maxLockboxes: CappedLockboxes + 2 })
        expect(tight.maxLockboxes, 'makeDevices made a device not held to the maxLockboxes it was asked for').to.eq(CappedLockboxes)
        const held = ['anthropic', 'openai', 'mistral', 'gemini', 'cohere']
        await roomy.createBundle(bundleOf('u1'))
        await storeEach(roomy, held)
        expect(await Promise.all(held.map((boxlabel) => revisionIn(tight, boxlabel)))).to.deep.equal(held.map((boxlabel) => `rev-${boxlabel}`))
        await expectWholeOrRefused(tight, held)
        const before = await standingVault(tight, [...held, 'groq'])
        await expectRefusal(tight.updateBox(scopeOf('u1'), boxOf('groq', 'groq'), noBoxYet), 'vault_full')
        expect(await standingVault(tight, [...held, 'groq'])).to.deep.equal(before)
        await tight.updateBox(scopeOf('u1'), boxOf('openai', 'next'), over('rev-openai'))
        for (const boxlabel of ['anthropic', 'mistral', 'gemini']) { await tight.eraseBox(scopeOf('u1'), boxlabel, thisVault) }
        await tight.updateBox(scopeOf('u1'), boxOf('groq', 'groq'), noBoxYet)
        expect(await listedRevisions(tight)).to.deep.equal(['rev-cohere', 'rev-groq', 'rev-next'])
      },
    },
    pushEachWrite: {
      line:  '6.1',
      title: "calls onChange after each kind of write to the vault, a read on each call seeing the write, once its watch is live",
      runs:  pushes,
      check: () => expectEachWriteHeard(sameAdapterTwice),
    },
    pushFromAnotherDevice: {
      line:  '6.1',
      title: "calls onChange after each kind of write made on another device, a read on each call seeing the write, once its watch is live",
      runs:  pushes && devices,
      check: () => expectEachWriteHeard(twoDevices),
    },
    pushFromTheStart: {
      line:  '6.1',
      title: `hears a write made ${devices ? 'on another device ' : ''}while its watch is still starting, a watch that starts late calling once it is live`,
      runs:  pushes,
      check: async () => {
        const keeper = makeTurnstile()
        const [watcher, writer] = await (devices ? twoDevices(keeper.turnstile) : sameAdapterTwice())
        await writer.createBundle(bundleOf('u1'))
        // A watch whose start is a round trip is held there while the write lands; one that starts
        // as subscribe returns, or not through the turnstile, never comes to the gate.
        const gate = keeper.holdAt(1)
        const watch = readingWatch(watcher)
        await Promise.race([gate.reached, ticks(WatchStartTicks)])
        keeper.holdNone()
        await expectHeard(watch, writer, () => writer.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet), gate.release)
        watch.unsubscribe()
      },
    },
    pushPastAFailingListener: {
      line:  '6.1',
      title: "lands each write and calls every other listener when one listener throws and another rejects, logging each failure as an error",
      runs:  pushes,
      check: async () => {
        const spy = spyLogger()
        const vaultDB = await makeVaultDB({ logger: spy.logger })
        await vaultDB.createBundle(bundleOf('u1'))
        const thrown = new Error('a listener that throws')
        const rejected = new Error('a listener whose promise rejects')
        const unsubscribes = [
          vaultDB.subscribe(scopeOf('u1'), () => { throw thrown }),
          // A host's listener may be async, though subscribe types it as returning nothing.
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          vaultDB.subscribe(scopeOf('u1'), () => Promise.reject(rejected)),
        ]
        const watch = readingWatch(vaultDB)
        await untilLive([watch], vaultDB)
        await expectHeard(watch, vaultDB, () => vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet))
        const failures = () => spy.calls.filter((call) => call.err === thrown || call.err === rejected)
        await vi.waitFor(() => {
          expect(failures().map((call) => call.err), 'a listener failure the logger never heard').to.include.members([thrown, rejected])
        }, { timeout: HeardWithinMillis, interval: 5 })
        for (const call of failures()) {
          expect(call.level).to.eq('error')
          expect(call.story).to.deep.equal({ call: 'subscribe' })
        }
        for (const unsubscribe of [...unsubscribes, watch.unsubscribe]) { unsubscribe() }
      },
    },
    pushEndsOnUnsubscribe: {
      line:  '6.1',
      title: "calls an unsubscribed onChange no more, through several writes, however often it unsubscribes, while another watch hears each",
      runs:  pushes,
      check: async () => {
        const [watcher, writer] = await (devices ? twoDevices() : sameAdapterTwice())
        await writer.createBundle(bundleOf('u1'))
        const gone = readingWatch(watcher)
        const stays = readingWatch(watcher)
        await untilLive([gone, stays], writer)
        gone.unsubscribe()
        gone.unsubscribe()
        const goneCalls = gone.tally.calls
        for (const boxlabel of ['anthropic', 'openai', 'mistral']) {
          await expectHeard(stays, writer, () => writer.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet))
        }
        await wakeupAtNextTick()
        expect(gone.tally.calls, 'an unsubscribed onChange was called').to.eq(goneCalls)
        stays.unsubscribe()
      },
    },
  } satisfies Record<string, VaultDBTimingCheck>
}

/**
 * That a device from `makeDevices` passes the turnstile it was made with before each of its writes
 * goes to the backend -- a create, an update of the bundle, a write of a lockbox, an erase of one
 * and of the vault -- so the races of {@link describeVaultDB} can hold it there. A race cannot tell
 * a turnstile left unwired from an adapter that makes no round trips; an adapter over a backend
 * reached by round trips calls this in its own tests to show its factory wires one. It counts at
 * least one pass for each write, so a write that makes a second round trip around the turnstile
 * goes unseen here, and unheld in the races.
 *
 * @param makeDevices - The adapter's makeDevices, as `describeVaultDB` takes it.
 *
 * @example it("sends each device's statements through the turnstile", () => TH.expectRoundTripsThroughTurnstile(makeDevices))
 */
export const expectRoundTripsThroughTurnstile = async (makeDevices: MakeVaultDBDevices): Promise<void> => {
  const tally = { passes: 0 }
  const counting: Turnstile = { pass: () => { tally.passes += 1; return Promise.resolve() } }
  const device = (await makeDevices(counting))({})
  const writes = [
    ['createBundle', () => device.createBundle(bundleOf('u1'))],
    ['updateBundle', () => device.updateBundle(bundleOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 })],
    ['updateBox',    () => device.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)],
    ['eraseBox',     () => device.eraseBox(scopeOf('u1'), 'anthropic', thisVault)],
    ['eraseVault',   () => device.eraseVault(scopeOf('u1'), thisVault)],
  ] as const
  for (const [verb, write] of writes) {
    const before = tally.passes
    await write()
    expect(tally.passes - before, `${verb} reached the backend without passing the turnstile: makeDevices gives its devices a client that does not go through it`).to.be.greaterThan(0)
  }
}

/** A timing check run as a test: it rejects, failing the test, when what it checks does not hold. */
const expectToHold = (check: VaultDBTimingCheck): Promise<void> => check.check()

/** A race's setup: u1's vault made, through the first device. */
const withBundleFirst = (first: VaultDBVerbs) => first.createBundle(bundleOf('u1'))

/** A race's setup: u1's vault made, holding a new lockbox under each of `boxlabels`, through the first device. */
const holdingFirst = (boxlabels: readonly string[]) => async (first: VaultDBVerbs) => {
  await first.createBundle(bundleOf('u1'))
  await storeEach(first, boxlabels)
}

/** What a replacement in u1's vault expects: that vault, and the revision it read. */
const over = (revisionId: string) => ({ vault_id: 'vault-id-u1', revision_id: revisionId, vault_key_epoch: 1 })

/** The kinds of `outcomes`, sorted, so a test of who won need not say which device it was. */
const kindsOf = (outcomes: readonly RaceOutcome[]): string[] => outcomes.map((outcome) => outcome.kind).toSorted((one, two) => one.localeCompare(two))

/** That `vaultDB` lists every one of `boxlabels` in u1's vault, or refuses the listing outright: never part of it (2.3). */
const expectWholeOrRefused = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  const listing = await outcomeOf(vaultDB.listBoxes(scopeOf('u1')))
  if (listing.kind === 'landed') {
    const listed = listing.val as (LockboxSummary | DamagedLockbox)[]
    expect(listed.map((box) => box.boxlabel)).to.have.members([...boxlabels])
    return
  }
  expect(listing.val, 'a listing refused with something other than a VaultError').to.have.property('name', 'VaultError')
}

/** What u1's vault holds as one device reads it: its bundle, and each listed lockbox's boxlabel and revision. */
const glimpseOf = async (vaultDB: VaultDBVerbs) => {
  const bundle = await vaultDB.readBundle(scopeOf('u1'))
  const listed = await vaultDB.listBoxes(scopeOf('u1'))
  return { bundle, listed: listed.map((box) => [box.boxlabel, summaryOf(box)?.revision_id]) }
}

/**
 * A watch on u1's vault through `watcher` that, each time it is called, reads the vault, as a vault
 * does, keeping what each read found and how many writes the test had begun when the call came.
 */
const readingWatch = (watcher: VaultDBVerbs) => {
  const tally = { calls: 0, writesBegun: 0 }
  const reads: { after: number, found: Awaited<ReturnType<typeof glimpseOf>> }[] = []
  const readAndKeep = async (after: number) => {
    try {
      reads.push({ after, found: await glimpseOf(watcher) })
    } catch {
      // A read that fails finds nothing, and the test waiting on it times out saying so.
    }
  }
  const onChange = () => {
    tally.calls += 1
    void readAndKeep(tally.writesBegun)
  }
  const unsubscribe = watcher.subscribe(scopeOf('u1'), onChange)
  return { tally, reads, unsubscribe }
}

/** How many ticks a watch has to come to the turnstile as it starts, for a check to hold it there. */
const WatchStartTicks = 20

/** How long a watch has to hear a write before a push test calls it unheard. */
const HeardWithinMillis = 2000

/**
 * That a write made by `write`, through `writer`, is heard by `watch`: some call made after the
 * write began reads the vault as it stands after it. `onWritten` runs once the write has landed. A call before the write, or one whose read
 * ran before the write landed, never finds that, since each write in a push test leaves the vault
 * unlike it ever stood before.
 */
const expectHeard = async (watch: ReturnType<typeof readingWatch>, writer: VaultDBVerbs, write: () => Promise<unknown>, onWritten = unheard) => {
  watch.tally.writesBegun += 1
  const begun = watch.tally.writesBegun
  await write()
  onWritten()
  const after = await glimpseOf(writer)
  await vi.waitFor(() => {
    expect(watch.reads.filter((read) => read.after >= begun).map((read) => read.found), 'no call to onChange read the vault as the write left it').to.deep.include(after)
  }, { timeout: HeardWithinMillis, interval: 5 })
}

/** How many probe writes {@link untilLive} makes, and how long it waits on each, before it calls a watch dead. */
const LiveProbes = 20
const ProbeWaitMillis = 100

/**
 * Resolves once every one of `watches` has been called, so is known to be live: at once, for a
 * watch that calls when it starts; otherwise after a probe write through `writer` -- the bundle's
 * unlock_epoch moved on -- made again until each is heard, as a watch that starts on its own time
 * may miss the first. u1's vault must hold a bundle.
 */
const untilLive = async (watches: readonly ReturnType<typeof readingWatch>[], writer: VaultDBVerbs) => {
  const allHeard = () => watches.every((watch) => watch.tally.calls > 0)
  for (let ii = 0; ii < LiveProbes && ! allHeard(); ii += 1) {
    const standing = await writer.readBundle(scopeOf('u1'))
    if (! standing) { throw new Error('untilLive probes a vault that holds a bundle, and found none.') }
    await writer.updateBundle({ ...standing, unlock_epoch: standing.unlock_epoch + 1 }, { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch })
    try {
      await vi.waitFor(() => { expect(allHeard()).to.be.true }, { timeout: ProbeWaitMillis, interval: 5 })
    } catch {
      // Not heard yet: probe again.
    }
  }
  expect(allHeard(), `a watch heard none of ${String(LiveProbes)} writes to its vault`).to.be.true
}

/**
 * That a watch through the first of `pair` hears each kind of write made through the second: an
 * update of the bundle, two new lockboxes, a replacement, an erase of one, of the vault, and a
 * create of the vault anew. The two may be one adapter, or two devices.
 */
const expectEachWriteHeard = async (pair: () => Promise<[VaultDBVerbs, VaultDBVerbs]>) => {
  const [watcher, writer] = await pair()
  await writer.createBundle(bundleOf('u1'))
  const watch = readingWatch(watcher)
  await untilLive([watch], writer)
  const standing = await writer.readBundle(scopeOf('u1'))
  const epoch = standing?.unlock_epoch ?? 1
  const writes = [
    () => writer.updateBundle(bundleOf('u1', { unlock_epoch: epoch + 1 }), { vault_id: 'vault-id-u1', unlock_epoch: epoch }),
    () => writer.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet),
    () => writer.updateBox(scopeOf('u1'), boxOf('openai', 'openai'), noBoxYet),
    () => writer.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), { vault_id: 'vault-id-u1', revision_id: 'rev-anthropic', vault_key_epoch: 1 }),
    () => writer.eraseBox(scopeOf('u1'), 'anthropic', thisVault),
    () => writer.eraseVault(scopeOf('u1'), thisVault),
    () => writer.createBundle(bundleOf('u1', { vault_id: 'vault-id-anew' })),
  ]
  for (const write of writes) { await expectHeard(watch, writer, write) }
  watch.unsubscribe()
}

/** Every verb a stranger might try on `u1`'s vault, each as a thunk. */
const everyVerbOn = (stranger: VaultDBVerbs) => [
  () => stranger.readBundle(scopeOf('u1')),
  () => stranger.createBundle(bundleOf('u1', { vault_id: 'vault-id-theirs' })),
  () => stranger.updateBundle(bundleOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }),
  () => stranger.readBox(scopeOf('u1'), 'anthropic'),
  () => stranger.listBoxes(scopeOf('u1')),
  () => stranger.updateBox(scopeOf('u1'), boxOf('anthropic', 'theirs'), { vault_id: 'vault-id-u1', revision_id: 'rev-anthropic', vault_key_epoch: 1 }),
  () => stranger.updateBox(scopeOf('u1'), boxOf('mistral', 'theirs'), noBoxYet),
  () => stranger.eraseBox(scopeOf('u1'), 'openai', thisVault),
  () => stranger.eraseVault(scopeOf('u1'), thisVault),
]

/** Text no normalization leaves alone: "café" with its accent composed, then decomposed, and a key. */
/**
 * A public bag of accented letters, an emoji, a tab, a newline, quotes, backslashes, Hebrew, a
 * null and a fraction: JSON a store must hand back byte for byte as it was written, as it is bound.
 */
const LiteralBag = Object.freeze({
  note: 'caf\u{E9} na\u{EF}ve \u{1F511}\trotated\nin March',
  path: String.raw`C:\keys\"work"`,
  tags: ['\u{5D0}\u{5D1}', null, 1.5],
})

/** Enough lockboxes that a listing cut to a page, or a sample, would show it: 25, `box0` to `box24`. */
const ManyBoxlabels = Object.freeze(Array.from({ length: 25 }, (_unused, ii) => `box${String(ii)}`))

/** A new lockbox under each boxlabel, in `u1`'s vault, one after another: its revision `rev-<boxlabel>`. */
const storeEach = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  for (const boxlabel of boxlabels) { await vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet) }
}

/** Everything `u1`'s vault holds, as its verbs read it: the bundle, the listing, and each of `boxlabels` read. */
const standingVault = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => ({
  bundle:  await vaultDB.readBundle(scopeOf('u1')),
  listed:  await vaultDB.listBoxes(scopeOf('u1')),
  lockboxes: await Promise.all(boxlabels.map((boxlabel) => vaultDB.readBox(scopeOf('u1'), boxlabel))),
})

/** The revision of `u1`'s lockbox under `boxlabel`, or null when there is none. */
const revisionIn = async (vaultDB: VaultDBVerbs, boxlabel: string): Promise<string | null> => {
  const lockbox = await vaultDB.readBox(scopeOf('u1'), boxlabel)
  return lockbox?.revision_id ?? null
}

/** The revision of each lockbox `u1`'s listing shows, in its order. */
const listedRevisions = async (vaultDB: VaultDBVerbs): Promise<(string | undefined)[]> => {
  const listed = await vaultDB.listBoxes(scopeOf('u1'))
  return listed.map((box) => summaryOf(box)?.revision_id)
}

/** How a write settled: `landed`, or the kind it was refused with (`unknown` for no kind). */
const settledKind = async (write: Promise<unknown>): Promise<string> => {
  try {
    await write
    return 'landed'
  } catch (err) {
    const { kind } = err as { kind?: unknown }
    return typeof kind === 'string' ? kind : 'unknown'
  }
}

/** Which of a lockbox's boxlabel, public bag and ciphertexts a refusal quotes anywhere. */
const quotedOf = (refusal: unknown, lockbox: Lockbox): string[] => {
  const told = thrownText(refusal)
  const quotable = [lockbox.boxlabel, lockbox.public_json, ...leafTexts(lockbox.lockbox_key_wrapped), ...leafTexts(lockbox.whisper_ciphered)]
  return quotable.filter((text) => text !== '' && told.includes(text))
}

/**
 * One adapter reaching every user's vaults, made of a VaultDB per user: for
 * {@link describeVaultDB} over an adapter that serves only the user signed in, as a server's
 * does when it makes one per request. The suite reaches two users' vaults through one adapter;
 * this sends each verb to the VaultDB `vaultDBFor` made for the user its scope or bundle names,
 * making each user's once and keeping it. Its limits are those of the one made for `anyone`.
 *
 * @param vaultDBFor - The VaultDB a request signed in as `userId` gets.
 * @returns The verbs of one adapter, each sent on to its user's VaultDB.
 *
 * @example
 *   describeVaultDB('postgresVaultDB', () => perUser((userId) => postgresVaultDB({ client, userId })))
 */
export const perUser = (vaultDBFor: (userId: string) => VaultDBVerbs): VaultDBVerbs => {
  const vaultDBs = new Map<string, VaultDBVerbs>()
  const as = ({ user_id }: { user_id: string }): VaultDBVerbs => {
    const known = vaultDBs.get(user_id)
    if (known) { return known }
    const vaultDB = vaultDBFor(user_id)
    vaultDBs.set(user_id, vaultDB)
    return vaultDB
  }
  const anyone = as({ user_id: 'anyone' })
  return {
    maxRecordBytes: anyone.maxRecordBytes,
    maxVaultBytes:  anyone.maxVaultBytes,
    maxLockboxes:   anyone.maxLockboxes,
    maxNameBytes:   anyone.maxNameBytes,
    readBundle:     (scope) => as(scope).readBundle(scope),
    createBundle:   (bundle) => as(bundle).createBundle(bundle),
    updateBundle:   (bundle, expected) => as(bundle).updateBundle(bundle, expected),
    readBox:        (scope, boxlabel) => as(scope).readBox(scope, boxlabel),
    listBoxes:      (scope) => as(scope).listBoxes(scope),
    listBoxRecords: (scope) => as(scope).listBoxRecords(scope),
    updateBox:      (scope, lockbox, expected) => as(scope).updateBox(scope, lockbox, expected),
    eraseBox:       (scope, boxlabel, expected) => as(scope).eraseBox(scope, boxlabel, expected),
    eraseVault:     (scope, expected) => as(scope).eraseVault(scope, expected),
    eraseDamagedVault: (scope) => as(scope).eraseDamagedVault(scope),
    subscribe:      (scope, onChange) => as(scope).subscribe(scope, onChange),
  }
}

/**
 * The behaviour every DeviceDB owes, written once: no remembered unlock until one is written,
 * then that one back, its localUnlockKey still a non-extractable CryptoKey; likewise a device
 * mark, the newest written in place of the one before but never at a lower lock generation; a
 * remembered unlock written only while its scope's mark stands at the lock generation expected;
 * each scope kept to itself, and marks apart from unlocks; and an erase of one, or of all. Run it against an adapter with a factory making a fresh,
 * empty one per test. For a DeviceDB's own tests, from `safebyok/testing`; it runs under vitest.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeDeviceDB - A fresh, empty adapter: no record in it, and none shared with another call.
 *
 * @example
 *   describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())
 */
export const describeDeviceDB = (adapterTitle: string, makeDeviceDB: () => DeviceDB | Promise<DeviceDB>) => {
  describe(`${adapterTitle}, as a DeviceDB`, () => {
    it("has no remembered unlock until one is written, then keeps it whole, localUnlockKey handle and all", async () => {
      const deviceDB = await makeDeviceDB()
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
      const unlock = await unlockOf('u1')
      await deviceDB.writeUnlock(unlock, NoLocks)
      const kept = await deviceDB.readUnlock(scopeOf('u1'))
      expect(kept).to.deep.equal(unlock)
      expect(kept?.local_unlock_key).to.be.instanceOf(CryptoKey)
      expect(kept?.local_unlock_key.extractable).to.be.false
    })

    it("keeps unlocks per user: erasing one leaves the other", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeUnlock(await unlockOf('u1'), NoLocks)
      await deviceDB.writeUnlock(await unlockOf('u2'), NoLocks)
      await deviceDB.eraseUnlock(scopeOf('u1'))
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readUnlock(scopeOf('u2'))).to.not.be.null
    })

    it("eraseAll forgets every remembered unlock, and every device mark", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeUnlock(await unlockOf('u1'), NoLocks)
      await deviceDB.writeUnlock(await unlockOf('u2'), NoLocks)
      await deviceDB.writeMark(markOf('u1'))
      await deviceDB.eraseAll()
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readUnlock(scopeOf('u2'))).to.be.null
      expect(await deviceDB.readMark(scopeOf('u1'))).to.be.null
    })

    it("has no device mark until one is written, then keeps it whole, and the newest in place of the one before", async () => {
      const deviceDB = await makeDeviceDB()
      expect(await deviceDB.readMark(scopeOf('u1'))).to.be.null
      await deviceDB.writeMark(markOf('u1'))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1'))
      await deviceDB.writeMark(markOf('u1', { seen: { unlock_epoch: 4 } }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: { unlock_epoch: 4 } }))
    })

    it("keeps marks per vault, and apart from remembered unlocks: erasing one leaves the rest", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeUnlock(await unlockOf('u1'), NoLocks)
      await deviceDB.writeMark(markOf('u1'))
      await deviceDB.writeMark(markOf('u2'))
      await deviceDB.eraseMark(scopeOf('u1'))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readMark(scopeOf('u2'))).to.deep.equal(markOf('u2'))
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.not.be.null
      await deviceDB.eraseUnlock(scopeOf('u2'))
      expect(await deviceDB.readMark(scopeOf('u2'))).to.deep.equal(markOf('u2'))
    })

    it("writes a remembered unlock only while the mark stands at the lock generation expected, refusing as 'stale_write' otherwise", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeMark(markOf('u1', { lock_generation: 2 }))
      await expectRefusal(deviceDB.writeUnlock(await unlockOf('u1'), { lock_generation: 1 }), 'stale_write')
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
      await deviceDB.writeUnlock(await unlockOf('u1'), { lock_generation: 2 })
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.not.be.null
    })

    it("reads the lock generation of a scope with no mark as 0, and of each scope apart", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeUnlock(await unlockOf('u1'), NoLocks)
      await deviceDB.writeMark(markOf('u1', { lock_generation: 1 }))
      await deviceDB.writeUnlock(await unlockOf('u2'), NoLocks)
      expect(await deviceDB.readUnlock(scopeOf('u2'))).to.not.be.null
      await expectRefusal(deviceDB.writeUnlock(await unlockOf('u1'), NoLocks), 'stale_write')
    })

    it("never lowers a mark's lock generation: a mark written from an older read keeps the higher", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeMark(markOf('u1', { lock_generation: 3 }))
      await deviceDB.writeMark(markOf('u1', { seen: { unlock_epoch: 4 }, lock_generation: 1 }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: { unlock_epoch: 4 }, lock_generation: 3 }))
      await deviceDB.writeMark(markOf('u1', { lock_generation: 5 }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { lock_generation: 5 }))
    })

    it("keeps a mark that has seen no vault, its lock generation counting as any mark's", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeMark(markOf('u1', { seen: null, lock_generation: 2 }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: null, lock_generation: 2 }))
      await expectRefusal(deviceDB.writeUnlock(await unlockOf('u1'), NoLocks), 'stale_write')
      await deviceDB.writeMark(markOf('u1'))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { lock_generation: 2 }))
    })
  })
}

const unheard = (): void => undefined

/** What {@link expectRefusal} sees in place of an error when the operation resolved. */
const NotRefused = Symbol('not refused')

/**
 * The VaultError `operation` rejected with, once the test has checked it is one, of `kind`; the
 * test fails if `operation` resolves, or rejects with anything else: a plain Error, a lookalike
 * from another copy of the package, a VaultError of another kind.
 *
 * @param operation - The call that should refuse.
 * @param kind - The refusal's expected `kind`.
 * @returns The refusal, for a closer look at its message or cause.
 *
 * @example await TH.expectRefusal(vault.read('anthropic_api_key'), 'vault_locked')
 * @example
 *   const err = await TH.expectRefusal(openVault(TH.omitting(opts, 'keyDeriver')), 'bad_option')
 *   expect(err.message).to.include('safebyok/browser')
 */
export const expectRefusal = async (operation: Promise<unknown>, kind: VaultErrorKind): Promise<VaultError> => {
  let refusal: unknown = NotRefused
  try {
    await operation
  } catch (err) {
    refusal = err
  }
  expect(refusal, `expected a refusal of kind '${kind}', but the operation resolved`).to.not.eq(NotRefused)
  expect(refusal).to.be.instanceOf(VaultError)
  expect(refusal).to.have.property('kind', kind)
  return refusal as VaultError
}

/**
 * Asserts that `attempt` throws, there and then, a VaultError of kind `kind`, and returns it: the
 * synchronous twin of {@link expectRefusal}, for a check that throws rather than rejects.
 *
 * @param attempt - The call expected to throw.
 * @param kind - The refusal's expected `kind`.
 * @returns The refusal, for a closer look at its message.
 *
 * @example TH.expectSyncRefusal(() => Ckeys.box({ ...scope, user_id: 'a^b' }, 'x'), 'bad_label')
 */
export const expectSyncRefusal = (attempt: () => unknown, kind: VaultErrorKind): VaultError => {
  let refusal: unknown = NotRefused
  try {
    attempt()
  } catch (err) {
    refusal = err
  }
  expect(refusal, `expected a refusal of kind '${kind}', but the call returned`).to.not.eq(NotRefused)
  expect(refusal).to.be.instanceOf(VaultError)
  expect(refusal).to.have.property('kind', kind)
  return refusal as VaultError
}

/**
 * `bag` with its `ckey` field left out, still typed as the whole bag: for a test that an
 * entrypoint refuses a caller who forgot a required option, which `exactOptionalPropertyTypes`
 * otherwise lets a test write only with a cast.
 *
 * @param bag - A complete bag of options.
 * @param ckey - The field to leave out.
 * @returns A copy of `bag` without that field.
 *
 * @example openVault(TH.omitting(opts, 'keyDeriver'))  // refuses: no keyDeriver
 */
export const omitting = <Bag extends object>(bag: Bag, ckey: keyof Bag): Bag => {
  const { [ckey]: _omitted, ...rest } = bag
  return rest as Bag
}
