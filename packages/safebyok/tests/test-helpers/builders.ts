import { type Ciphered, toB64 } from '../../src/crypto'
import { memoryDeviceDB } from '../../src/device-db'
import type { KeyDeriver } from '../../src/key-deriver'
import { type StrengthChecker, StrongVerdict } from '../../src/passphrase-strength'
import { memoryStore } from '../../src/string-store'
import type { BoxRecord } from '../../src/box'
import { type VaultScope, type PassphraseWayinRecord, type PasskeyWayinRecord, type PasskeyAnswer, type GatedVaultProps, type GatelessVaultProps, type VaultProps, type ListedSummary, type DamagedBox, type DeviceRecord, type LeaseRecord, type Stamp } from '../../src/types/types'
import { type BoxKeyWrapped, prf_salt_b64, salt_b64, type VaultKeyLeaseWrapped, type VaultKeyWayinWrapped, type WhisperCiphered } from '../../src/types/type-aliases'
import type { Vault } from '../../src/vault'
import { Bank } from '../../src/bank'
import type { MakeBankOpts, VaultDraft } from '../../src/vault-opts'
import { localVaultDB } from '../../src/local-vault-db'
import type { VaultDB } from '../../src/vault-db'
import { good, valOf } from '../../src/outcome'
import { VaultError } from '../../src/errors'
import { Lease, sealLeaseRecord } from '../../src/lease'
import { registerLeaseReader } from '../../src/held-lease'
import { scriptedRequestCleartext } from './gating'


/**
 * A cheap KeyDeriver for tests: one SHA-256 instead of 64 MiB of Argon2id, so a suite full of
 * unlocking runs in milliseconds. Deterministic in passphrase and salt, like the real one; unlike
 * the real one, worthless against a brute-forcer -- which is why its label says `test`. Never
 * hand it to a vault that holds a real secret.
 *
 * @example Bank.make({ ...opts, keyDeriver: testDeriver })
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
 * The slice of a vault a box, a way in or a lease reads, for a test that makes one with
 * no vault behind it: `user_id`'s `main` vault, as {@link scopeOf} has it, holding the vault props
 * `vault-tok-<user_id>`, deriving with `keyDeriver`, granting leases of seven days, and reading
 * {@link SliceNow} on its clock -- each as `overrides` does not say otherwise.
 *
 * @example Wayin.make(TH.vaultSliceOf('u1', argon2idWebV1Deriver), 'vault-tok-u1', TH.passkeyWayinOf('laptop'))
 * @example Box.make(TH.vaultSliceOf('u1', TH.testDeriver, { now: () => later }), record)
 */
export const vaultSliceOf = (user_id: string, keyDeriver: KeyDeriver = testDeriver, overrides: Partial<VaultSlice> = {}): VaultSlice => {
  return {
    ...scopeOf(user_id),
    vault_tok:       `vault-tok-${user_id}`,
    keyDeriver,
    leaseMillis:     7 * 24 * 60 * 60_000,
    now:             () => SliceNow,
    ...overrides,
  }
}

/** The time a {@link vaultSliceOf} slice's clock reads, unless told otherwise: noon, 19 October 2026. */
export const SliceNow = Date.UTC(2026, 9, 19, 12)

/** What {@link vaultSliceOf} makes: the slice of a vault a box, a way in and a lease read. */
export type VaultSlice = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_tok' | 'keyDeriver' | 'leaseMillis' | 'now'>

/** What {@link leasedSliceOf} makes: a {@link VaultSlice} that stands for a vault holding a lease, as a box and a lease read one. Its stamp, lease and goneness are the test's to change. */
export type LeasedSlice = VaultSlice & {
  stamp:                Stamp
  lease:                Lease | null
  /** True once the test has the vault gone: its demand then refuses 'vault_gone'. */
  gone:                 boolean
  demandConsistentWith: Vault['demandConsistentWith']
  tryLock:              Vault['tryLock']
  /** How many times something called `tryLock`: what a damaged lease does. */
  locks:                number
}

/** A stand-in for `user_id`'s `main` vault holding a lease around `vaultKey`, for a test of a box or a lease with no vault behind it, whose vaultKey the test knows.
 * It is a {@link vaultSliceOf} slice (each of its fields as `overrides` does not say otherwise),
 * stamped with its scope and `vault_tok`, vault epoch 1 and gate epoch 1, holding a lease granted
 * at its clock's time. Its demand is the vault's in small: `gone` is `vault_gone`; another scope
 * or `vault_tok`, `vault_remade`; another `gate_epoch`, `gate_moved`; lease-bound, no lease or one
 * ended by its clock, `vault_locked`. Its `tryLock` drops the lease and counts the call.
 *
 * @example const vault = await TH.leasedSliceOf('u1', await makeVaultKey())
 * @example const box = await Box.seal(vault, { boxlabel: 'anthropic' }, 'sk-fake')
 */
export const leasedSliceOf = async (user_id: string, vaultKey: CryptoKey, overrides: Partial<VaultSlice> = {}): Promise<LeasedSlice> => {
  const base = vaultSliceOf(user_id, testDeriver, overrides)
  const vaultTok = base.vault_tok
  const slice: LeasedSlice = {
    ...base,
    stamp: Object.freeze({ applabel: base.applabel, user_id: base.user_id, vaultlabel: base.vaultlabel, vault_tok: vaultTok, vault_epoch: 1, gate_epoch: 1 }),
    lease: null,
    gone:  false,
    locks: 0,
    demandConsistentWith: (thing, opts) => {
      const { stamp, lease } = slice
      if (slice.gone) { throw new VaultError('vault_gone', 'The vault this test holds is gone.') }
      const sameScope = (thing.applabel ?? stamp.applabel) === stamp.applabel && (thing.user_id ?? stamp.user_id) === stamp.user_id && (thing.vaultlabel ?? stamp.vaultlabel) === stamp.vaultlabel
      if (! sameScope || thing.vault_tok !== stamp.vault_tok) { throw new VaultError('vault_remade', 'The vault this test holds was made anew.') }
      if ((thing.gate_epoch ?? stamp.gate_epoch) !== stamp.gate_epoch) { throw new VaultError('gate_moved', "The vault's ways in moved.") }
      if (opts?.leaseBound === true && (lease === null || lease.endsBy(slice.now()))) { throw new VaultError('vault_locked', 'The vault this test holds is locked.') }
    },
    tryLock: () => {
      slice.locks += 1
      slice.lease = null
      return Promise.resolve(good(undefined))
    },
  }
  slice.lease = Lease.make(slice, await sealLeaseRecord(slice, { vault_tok: vaultTok, gate_epoch: 1 }, vaultKey))
  // A box and a lease read the lease the slice holds as they read a Vault object's.
  registerLeaseReader(slice, () => slice.lease)
  return slice
}

/**
 * A strengthChecker for tests, admitting every passphrase, so a suite may unlock with a
 * short one such as 'pw'. Never hand it to a vault that holds a real secret.
 *
 * @example Bank.make({ ...opts, strengthChecker: anyStrengthChecker })
 */
export const anyStrengthChecker: StrengthChecker = () => StrongVerdict

/** Everything a bank and one of its vaults need, in one bag: {@link Bank.make}'s options beside the vault's `user_id` and `vaultlabel`. */
export type BornVaultOpts = MakeBankOpts & Pick<VaultDraft, 'user_id' | 'vaultlabel'>

/** Everything a bank and its vault need, over stores in memory made fresh for each call.
 * That is `u1`'s `main` vault in the `acme` app (as {@link scopeOf} has it), deriving through
 * {@link testDeriver}, admitting any passphrase ({@link anyStrengthChecker}), and answering each
 * gating as a test scripts it ({@link scriptedRequestCleartext}, which `TH.unlock` and its kin
 * script). `overrides`
 * replace any of it -- a store of the test's own, a clock, a logger, another user.
 *
 * @param overrides - Options to use in place of the defaults.
 * @returns A complete bag for {@link settledVault}, or (`user_id` and `vaultlabel` aside) for Bank.make.
 *
 * @example const vault = await TH.settledVault(TH.memoryVaultOpts())
 * @example const vault = await TH.settledVault(TH.memoryVaultOpts({ user_id: 'u2', vaultDB: myVaultDB }))
 */
export const memoryVaultOpts = (overrides: Partial<BornVaultOpts> = {}): BornVaultOpts => ({
  applabel:   'acme',
  user_id:     'u1',
  vaultlabel: 'main',
  vaultDB:    localVaultDB({ store: memoryStore() }),
  deviceDB:   memoryDeviceDB(),
  keyDeriver: testDeriver,
  strengthChecker: anyStrengthChecker,
  requestCleartext: scriptedRequestCleartext,
  ...overrides,
})

// The bank each vault settledVault handed out was born of, so a test can let it go.
const banksOf = new WeakMap<Vault, Bank>()

/** A vault born of `opts` in a bank of its own: `Bank.make` of the bank's options, then `bank.ensureVault` of `user_id` and `vaultlabel`.
 * Its snapshot says `novel`, `locked` or `unlocked`. A bag naming no `requestCleartext` is given
 * {@link scriptedRequestCleartext}, so `TH.unlock` and its kin answer its gatings. A bank of its own each time, so two calls
 * over one deviceDB are two tabs of one device. Rejects as `Bank.make` throws for misuse, and as
 * `ensureVault` rejects.
 *
 * @param opts - Everything Bank.make takes, and the vault's names; {@link memoryVaultOpts} makes a bag of them.
 * @returns The vault, settled.
 *
 * @example const vault = await TH.settledVault(TH.memoryVaultOpts())
 * @example
 *   // two devices over one vaultDB, each with a device store of its own
 *   const here = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
 *   const there = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
 */
export const settledVault = async (opts: BornVaultOpts): Promise<Vault> => {
  const { user_id, vaultlabel, ...given } = opts
  // A bag that names no requestCleartext answers gatings as TH.unlock and its kin script them.
  const bankOpts = 'requestCleartext' in given ? given : { ...given, requestCleartext: scriptedRequestCleartext }
  const bank = Bank.make(bankOpts)
  const vault = await bank.ensureVault({ user_id, vaultlabel })
  banksOf.set(vault, bank)
  return vault
}

/** The bank `vault` was born in, by {@link settledVault}: for a test that lets it go, reopens it, or clears what the device keeps of it.
 * Throws for a vault settledVault did not hand out.
 *
 * @example TH.bankOf(vault).closeVault({ user_id: 'u1', vaultlabel: 'main' })
 */
export const bankOf = (vault: Vault): Bank => {
  const bank = banksOf.get(vault)
  if (bank === undefined) { throw new Error('bankOf knows only the vaults settledVault handed out.') }
  return bank
}

/** Let `vault` go, as its bank's `closeVault` does: every call on it then refuses 'vault_gone'.
 * Nothing stored is erased: the lease and the device record stay, for the next birth.
 *
 * @example TH.closeVault(vault)   // the lease stays, for the next vault settled over this deviceDB
 */
export const closeVault = (vault: Vault): void => {
  bankOf(vault).closeVault({ user_id: vault.user_id, vaultlabel: vault.vaultlabel })
}

/**
 * A database name no other call has handed out, so each test of an IndexedDB adapter starts
 * from an empty database of its own.
 *
 * @example idbVaultDB({ dbName: TH.freshDbName() })
 */
export const freshDbName = (): string => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

/** A Ciphered that opens under no key, so it stands in any ciphered role: what {@link fakeCiphered} makes. */
export type FakeCiphered = WhisperCiphered & BoxKeyWrapped & VaultKeyWayinWrapped & VaultKeyLeaseWrapped

/** A shape-valid Ciphered that opens nothing, in any ciphered role: for storage-layer tests, which never decrypt.
 * Opening under no key, it is no more one role's than another's, so it fills any ciphered field (a
 * box's `whisper_ciphered`, a wayin's wrap) without a parse.
 *
 * @example fakeCiphered('a1')  // => { cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' }
 * @example boxOf('anthropic', 'a1', { whisper_ciphered: fakeCiphered('SUPERSECRET') })
 */
export const fakeCiphered = (tag: string): FakeCiphered => {
  const fake: Ciphered = { cipher_iv_b64: `iv-${tag}`, ciphertext_b64: `ct-${tag}` }
  return fake as FakeCiphered
}

/**
 * The scope of `user_id`'s vault in the `acme` app.
 *
 * @example scopeOf('u1')           // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
 * @example scopeOf('u1', 'spare')  // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' }
 */
export const scopeOf = (user_id: string, vaultlabel = 'main'): VaultScope => ({ applabel: 'acme', user_id, vaultlabel })

/**
 * A shape-valid passphrase wayin, its wrap fake (`wayin-<tag>`): for storage-layer tests, which
 * never decrypt. It wraps the vault's first vaultKey, and was sealed by `device-one`.
 *
 * @example wayinOf('passphrase')                                            // as vaultPropsOf's, but for its wrap
 * @example wayinOf('home_phrase', { registered_at: Date.UTC(2026, 9, 15) })
 */
export const wayinOf = (tag: string, overrides: Partial<PassphraseWayinRecord> = {}): PassphraseWayinRecord => ({
  wayinkind:               'passphrase',
  key_deriver_label:       'test_digest_v0',
  // base64 of the literal text 'saltsaltsaltsalt': a fake salt, public material anyway
  salt_b64:                salt_b64.parse('c2FsdHNhbHRzYWx0c2FsdA'),
  device_id:               'device-one',
  registered_at:           Date.UTC(2026, 9, 14),
  vault_key_wayin_wrapped: fakeCiphered(`wayin-${tag}`),
  ...overrides,
})

/**
 * A shape-valid passkey wayin, its wrap fake (`wayin-<tag>`) and its credential_id `cred-<tag>`:
 * for storage-layer tests, which never decrypt. It wraps the vault's first vaultKey, and was added
 * by `device-one`.
 *
 * @example passkeyWayinOf('laptop')
 * @example vaultPropsOf('u1', { passkey: passkeyWayinOf('laptop') })
 */
export const passkeyWayinOf = (tag: string, overrides: Partial<PasskeyWayinRecord> = {}): PasskeyWayinRecord => ({
  wayinkind:               'passkey',
  credential_id:           `cred-${tag}`,
  // base64 of the literal text 'prfsaltprfsaltprfsaltprfsaltprfs': a fake 32-byte salt, public material anyway
  prf_salt_b64:            prf_salt_b64.parse('cHJmc2FsdHByZnNhbHRwcmZzYWx0cHJmc2FsdHByZnM'),
  device_id:               'device-one',
  registered_at:           Date.UTC(2026, 9, 14),
  vault_key_wayin_wrapped: fakeCiphered(`wayin-${tag}`),
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
 * @example await TH.putWayin(vault, 'pw', await passkeyOf('laptop'))
 * @example await TH.unlock(vault, await passkeyOf('laptop'))
 * @example await passkeyOf('laptop', otherSaltB64)  // the same credential, answering another salt
 */
export const passkeyOf = async (tag: string, prfSaltGiven?: string): Promise<PasskeyAnswer> => {
  const credential_id = toB64(new TextEncoder().encode(`cred-${tag}`))
  const saltB64 = prfSaltGiven ?? toB64(await digestOf(`salt-${tag}`))
  return { credential_id, prf_salt_b64: saltB64, prfBytes: await digestOf(`${credential_id}:${saltB64}`) }
}

/** Shape-valid gated vault props for `user_id`'s `main` vault, its passphrase's wrap fake and no passkey.
 * For storage-layer tests, which never decrypt. Its vault_tok is `vault-tok-<user_id>`, its
 * gate_epoch 1, and its passphrase a {@link wayinOf} whose wrap is `vault-<user_id>`.
 *
 * @example vaultPropsOf('u1', { gate_epoch: 2 })
 * @example vaultPropsOf('u1', { passkey: passkeyWayinOf('laptop') })
 */
export const vaultPropsOf = (user_id: string, overrides: Partial<GatedVaultProps> = {}): GatedVaultProps => ({
  format:              'safebyok-vault-v6',
  ...scopeOf(user_id),
  vault_tok:           `vault-tok-${user_id}`,
  vault_epoch:         1,
  gate_epoch:          1,
  passphrase:          wayinOf(`vault-${user_id}`, { vault_key_wayin_wrapped: fakeCiphered(`vault-${user_id}`) }),
  passkey:             null,
  registered_at:       Date.UTC(2026, 9, 14),
  ...overrides,
})

/** Store `vaultProps` in `vaultDB` as a first unlock does: the vault ensured gateless, then its gate written over it expecting `gate_epoch` 0.
 * Resolves the vault props as stored, so with `vault_epoch` the store's: 1 after the first gate.
 * Vault props already standing gated are resolved as they stand, as `ensureVault` leaves them.
 * Throws the refusal of whichever step is refused. For setting a storage-layer test's scene.
 *
 * @example const stored = await ensureGated(vaultDB, vaultPropsOf('u1'))   // stored.vault_epoch is 1
 * @example await ensureGated(vaultDB, vaultPropsOf('u1', { gate_epoch: 2 }))
 */
export const ensureGated = async (vaultDB: Pick<VaultDB, 'ensureVault' | 'putVaultProps'>, vaultProps: GatedVaultProps): Promise<GatedVaultProps> => {
  const { vault_epoch: _vaultEpoch, gate_epoch: _gateEpoch, passphrase: _passphrase, passkey: _passkey, ...head } = vaultProps
  const ensured = valOf(await vaultDB.ensureVault({ ...head, vault_epoch: 0, gate_epoch: 0, passphrase: null, passkey: null })).vaultProps
  if (ensured.gate_epoch > 0) { return ensured as GatedVaultProps }
  return valOf(await vaultDB.putVaultProps({ ...vaultProps, vault_tok: ensured.vault_tok }, { vault_tok: ensured.vault_tok, gate_epoch: 0 })) as GatedVaultProps
}

/** The vault props `scope` holds in `vaultDB`, as `getVault` reads them, or null for none. Throws the refusal of a read that is refused.
 *
 * @example expect(await propsOf(vaultDB, scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
 */
export const propsOf = async (vaultDB: Pick<VaultDB, 'getVault'>, scope: VaultScope): Promise<VaultProps | null> => (
  valOf(await vaultDB.getVault(scope))?.vaultProps ?? null
)

/** The listing `scope`'s vault shows in `vaultDB`, as `getVault` reads it: empty where no vault stands. Throws the refusal of a read that is refused.
 *
 * @example expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(2)
 */
export const boxesOf = async (vaultDB: Pick<VaultDB, 'getVault'>, scope: VaultScope): Promise<(ListedSummary | DamagedBox)[]> => (
  valOf(await vaultDB.getVault(scope))?.boxes ?? []
)

/** The gateless vault props a vault is first stored as, for `user_id`'s `main` vault: `gate_epoch` 0 and no way in.
 * Otherwise as {@link vaultPropsOf} makes them, its vault_tok `vault-tok-<user_id>`.
 *
 * @example vaultDB.ensureVault(gatelessOf('u1'))
 * @example gatelessOf('u1', { vault_tok: 'vault-tok-two' })
 */
export const gatelessOf = (user_id: string, overrides: Partial<GatelessVaultProps> = {}): GatelessVaultProps => ({
  format:              'safebyok-vault-v6',
  ...scopeOf(user_id),
  vault_tok:           `vault-tok-${user_id}`,
  vault_epoch:         0,
  gate_epoch:          0,
  passphrase:          null,
  passkey:             null,
  registered_at:       Date.UTC(2026, 9, 14),
  ...overrides,
})

/**
 * A shape-valid BoxRecord for storage-layer tests, its ciphered fields fake: revision `rev-<tag>`,
 * with the sidecar `{ note: 'a test box' }` unless
 * `overrides` says otherwise.
 *
 * @example boxOf('anthropic_api_key', 'a1', { sidecar: { note: 'work account' } })
 */
export const boxOf = (boxlabel: string, tag: string, overrides: Partial<BoxRecord> = {}): BoxRecord => ({
  format:                 'safebyok-box-v8',
  boxlabel,
  revision_tok:           `rev-${tag}`,
  box_key_wrapped:        fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:       fakeCiphered(`whisper-${tag}`),
  whisper_codec:          'json_v1',
  whisper_schema_version: 1,
  sidecar:                { note: 'a test box' },
  registered_at:          Date.UTC(2026, 9, 14),
  written_at:             Date.UTC(2026, 9, 14),
  ...overrides,
})

/** Labels that differ only by an underscore, a digit or where an underscore falls: the nearest neighbours a store's keys might run together. */
export const OddLabels = Object.freeze([
  'main', 'main_x', 'mainx', 'main_1', 'main1', 'ma_in', 'mai_n', 'm_ain',
] as const)

/**
 * A listed box as the summary it should be: undefined stays undefined, and one listed as
 * damaged fails the test, naming its boxlabel. For a test reading a summary's fields out of a
 * listing or a snapshot, where TypeScript would otherwise have it ask after damage first.
 *
 * @example expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'work account' })
 */
export const summaryOf = <SummaryT extends ListedSummary>(box: SummaryT | DamagedBox | undefined): SummaryT | undefined => {
  if (box?.damaged === true) { throw new Error(`The box '${box.boxlabel}' is listed as damaged, where a summary was expected.`) }
  return box
}

/**
 * What a write into {@link vaultPropsOf}('u1')'s vault expects when its box is not there yet:
 * that vault, under its first vaultKey, and no revision. Frozen, since every test shares it.
 *
 * @example vaultDB.putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
 */
export const noBoxYet = Object.freeze({ vault_tok: 'vault-tok-u1', revision_tok: null } as const)

/** What a box read in {@link vaultPropsOf}('u1')'s vault expects: that vault.
 * Frozen, since every test shares it.
 *
 * @example vaultDB.getBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)
 */
export const inThisVault = Object.freeze({ vault_tok: 'vault-tok-u1' } as const)

/**
 * What a deletion of {@link vaultPropsOf}('u1')'s vault expects: that vault, at its first gate.
 * Frozen, since every test shares it.
 *
 * @example vaultDB.delVault(TH.scopeOf('u1'), TH.thisVault)
 */
export const thisVault = Object.freeze({ vault_tok: 'vault-tok-u1', gate_epoch: 1 } as const)

/**
 * What a deletion of a box in {@link vaultPropsOf}('u1')'s vault expects: that vault, and
 * the revision the deleting device read -- `rev-` and its tag, for a box {@link boxOf} made --
 * or null, for one listed with none.
 *
 * @example vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one'))
 */
export const deleting = (revisionTok: string | null) => ({ vault_tok: 'vault-tok-u1', revision_tok: revisionTok })

/** A shape-valid DeviceRecord for device-storage tests: `user_id`'s `main` vault, its device `device-one`, having seen `vault_epoch` 1.
 * Any field as `overrides` says otherwise.
 *
 * @example await deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1'))
 * @example TH.deviceRecordOf('u1', { highest_vault_epoch: 3 })    // a device that has seen the vault at epoch 3
 */
export const deviceRecordOf = (user_id: string, overrides: Partial<DeviceRecord> = {}): DeviceRecord => ({
  format:              'safebyok-device-v1',
  ...scopeOf(user_id),
  device_id:           'device-one',
  highest_vault_epoch: 1,
  ...overrides,
})

/** A real lease record for device-storage tests: a live non-extractable leaseKey around fake wrapped material. */
export const leaseOf = async (user_id: string, overrides: Partial<LeaseRecord> = {}): Promise<LeaseRecord> => ({
  format:                  'safebyok-lease-v1',
  ...scopeOf(user_id),
  vault_tok:               `vault-tok-${user_id}`,
  gate_epoch:              1,
  lease_key:               await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_lease_wrapped: fakeCiphered(`lease-${user_id}`),
  ask_passphrase_at:       1_900_000_000_000,
  ...overrides,
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
