import { describe, expect, it } from 'vitest'
import { DeviceMark, DeviceUnlock, EpochMillis, FarFuture, FarPast, ForeverMs, Lockbox, LockboxSummary, MaxUnlocks, VaultBundle, VaultScope, Whisper } from '../src/types'
import * as TH from './test-helpers'

const WhisperCases = [
  // every JSON shape a whisper may take:
  ["sk-ant-api03-fake-fake",          true,   'a string, the common case'],
  ["",                                true,   'even an empty string'],
  [42,                                true,   'a number'],
  [true,                              true,   'a boolean'],
  [["a", "b"],                        true,   'an array'],
  [{ apiKey: "fake", tier: 2 },      true,   'a plain object'],
  [{ orgId: null },                   true,   'null inside a structure: real JSON carries it'],
  [{ deep: { list: [1, null] } },     true,   'nesting, arbitrarily'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
  [null,                              false,  'a bare null: emptying a lockbox is erase\'s job'],
  [() => 'nope',                      false,  'a function is not data'],
  [new Date(),                        false,  'a Date would silently flatten to {}'],
  [new Map([["a", 1]]),               false,  'a Map would silently flatten to {}'],
  [{ when: new Date() },              false,  'a class instance hiding inside an object'],
] as const

describe("Whisper", () => {
  for (const [candidate, expected, blurb] of WhisperCases) {
    it(blurb, () => { expect(Whisper.safeParse(candidate).success).to.eq(expected) })
  }

  it("hands back the value unchanged when it passes", () => {
    const bag = { apiKey: 'fake', scopes: ['read', 'write'] }
    expect(Whisper.parse(bag)).to.deep.equal(bag)
  })
})

const ScopeCases = [
  // regular usage:
  [TH.scopeOf('u1'),                                  true,   'an applabel, a user_id and a vaultlabel'],
  [TH.scopeOf('user|2fJ8:google'),                    true,   'a user_id in whatever form the host app issues'],
  [TH.scopeOf('u'.repeat(101)),                       true,   'a user_id longer than the default check admits: past the floor, what a name may be is the validators\' to say'],
  [{ ...TH.scopeOf('u1'), applabel: 'Acme: Ünïcode' },  true,   'an applabel of any script'],
  // refused, below the floor every name is held to:
  [{ ...TH.scopeOf('u1'), user_id: '' },              false,  'an empty user_id'],
  [{ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' },  false,  'a vaultlabel holding a control character'],
  [{ ...TH.scopeOf('u1'), applabel: 'cafe\u{301}' },  false,  'an applabel not in NFC'],
  [TH.scopeOf('u'.repeat(1025)),                      false,  'a user_id over a kibibyte'],
  // refused:
  [{ ...TH.scopeOf('u1'), applabel: 42 },             false,  'an applabel that is not text'],
  [{ applabel: 'acme', user_id: 'u1' },              false,  'a scope missing its vaultlabel'],
] as const

describe("VaultScope", () => {
  for (const [candidate, expected, blurb] of ScopeCases) {
    it(blurb, () => { expect(VaultScope.safeParse(candidate).success).to.eq(expected) })
  }
})

/** An ISO time, as records stored them before every time became epoch milliseconds. */
const OldIso = '2026-10-14T00:00:00.000Z'
const { registered_at: _bundleTime, ...bundleWithoutTime } = TH.bundleOf('u1')
const { unlocks: _unlocks, ...bundleWithoutUnlocks } = TH.bundleOf('u1')
const { unlock_epoch: _epoch, ...bundleWithoutEpoch } = TH.bundleOf('u1')
const { vault_key_epoch: _keyEpoch, ...bundleWithoutKeyEpoch } = TH.bundleOf('u1')
const { prior_vault_key: _prior, ...rotatedWithoutPrior } = TH.rotatedBundleOf('u1')
const priorAt = (vaultKeyEpoch: number) => ({ vault_key_epoch: vaultKeyEpoch, vault_key_wrapped: TH.fakeCiphered('prior') })
/** The three fields a bundle held its one passphrase in, before `unlocks`. */
const EnvelopeFieldsOfOld = {
  key_deriver_label:            'test_digest_v0',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- base64 of the literal text 'saltsaltsaltsalt': a fake salt (which is public material anyway), not a credential
  passphrase_salt_b64:          'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_passphrase_wrapped: TH.fakeCiphered('old'),
}


const BundleCases = [
  // regular usage:
  [TH.bundleOf('u1'),                                       true,   'a whole bundle'],
  // refused, as a damaged or foreign record:
  [{ ...TH.bundleOf('u1'), format: 'safebyok-vault-v3' },    false,  'a format this version does not know'],
  [{ ...TH.bundleOf('u1'), unlock_epoch: 0 },                false,  'an epoch starts at one'],
  [{ ...TH.bundleOf('u1'), unlock_epoch: 1.5 },              false,  'an epoch is a whole number'],
  [{ ...TH.bundleOf('u1'), vault_id: '' },                   false,  'an empty vault_id'],
  [TH.bundleOf('u'.repeat(101)),                            true,   'a user_id of any length: the validators check names, not the record'],
  [{ ...TH.bundleOf('u1'), vaultlabel: null },               false,  'a vaultlabel that is not text'],
  [{ ...TH.bundleOf('u1'), unlocks: [TH.envelopeOf('passphrase', { vault_key_wrapped: { cipher_iv_b64: 'iv' } as never })] }, false, 'an envelope missing its ciphertext'],
  [{ ...TH.bundleOf('u1'), registered_at: 1_792_022_400 },   false,  'a registered_at in epoch seconds'],
  [{ ...TH.bundleOf('u1'), registered_at: Infinity },        false,  'a registered_at that never comes'],
  [{ ...TH.bundleOf('u1'), registered_at: OldIso },          false,  'a registered_at as an ISO string'],
  [bundleWithoutTime,                                       false,  'a bundle missing its registered_at'],
  [{ ...bundleWithoutTime, created_at: OldIso, updated_at: OldIso }, false, 'a bundle from before its time was named registered_at'],
  [{ ...bundleWithoutUnlocks, ...EnvelopeFieldsOfOld },      false,  'a bundle from before its unlocks were a list of envelopes'],
  [{ ...bundleWithoutEpoch, passphrase_epoch: 1 },           false,  'a bundle from before its epoch was named unlock_epoch'],
  [{ ...bundleWithoutKeyEpoch, format: 'safebyok-vault-v1' }, false, 'a bundle from before vaultKey epochs'],
  [bundleWithoutKeyEpoch,                                   false,  'a bundle missing its vault_key_epoch'],
  [{ ...TH.bundleOf('u1'), vault_key_epoch: 0 },             false,  'a vaultKey epoch starts at one'],
  // the prior vaultKey: none at the first, the one just before from the second on
  [TH.rotatedBundleOf('u1'),                                true,   'a bundle at its second vaultKey, holding the first as its prior'],
  [rotatedWithoutPrior,                                     false,  'a bundle past its first vaultKey with no prior'],
  [{ ...TH.bundleOf('u1'), prior_vault_key: priorAt(1) },    false,  'a bundle at its first vaultKey holding a prior'],
  [{ ...TH.rotatedBundleOf('u1'), vault_key_epoch: 3 },      false,  'a prior that is not the vaultKey just before'],
  [{ ...TH.rotatedBundleOf('u1'), prior_vault_key: { vault_key_epoch: 1 } }, false, 'a prior with no wrap'],
] as const

const manyEnvelopes = (count: number) => Array.from({ length: count }, (_unused, ii) => TH.envelopeOf(`phrase${String(ii)}`))
const UnlockListCases = [
  // regular usage:
  [[TH.envelopeOf('passphrase')],                                          true,   'one way in'],
  [[TH.envelopeOf('passphrase'), TH.envelopeOf('home_phrase')],            true,   'two passphrases, each with its own id and label'],
  [manyEnvelopes(MaxUnlocks),                                              true,   'as many ways in as MaxUnlocks allows'],
  // refused, as a damaged or foreign record:
  [[],                                                                     false,  'no way in at all'],
  [manyEnvelopes(MaxUnlocks + 1),                                          false,  'one envelope past MaxUnlocks, which would make an unlock run long'],
  [[TH.envelopeOf('passphrase'), TH.envelopeOf('home_phrase', { unlock_id: 'unlock-passphrase' })], false, 'two envelopes sharing an unlock_id'],
  [[TH.envelopeOf('passphrase'), TH.envelopeOf('passphrase', { unlock_id: 'unlock-other' })],      false, 'two envelopes sharing an unlocklabel'],
  [[TH.envelopeOf('passphrase'), TH.passkeyEnvelopeOf('laptop')],         true,   'a passphrase and a passkey'],
  [[TH.passkeyEnvelopeOf('laptop'), TH.passkeyEnvelopeOf('phone')],        true,   'two passkeys, each its own credential'],
  [[TH.envelopeOf('passphrase', { method: 'fingerprint' as never })],      false,  'a method this version does not know'],
  [[TH.envelopeOf('passphrase', { method: 'passkey' as never })],          false,  "a passphrase's fields under the passkey method"],
  [[TH.passkeyEnvelopeOf('laptop'), TH.passkeyEnvelopeOf('phone', { credential_id: 'cred-laptop' })], false, 'two passkey envelopes for the same credential'],
  [[TH.passkeyEnvelopeOf('laptop', { credential_id: '' })],               false,  'a passkey with an empty credential_id'],
  [[TH.passkeyEnvelopeOf('laptop', { prf_salt_b64: '' })],                false,  'a passkey with an empty salt'],
  [[TH.envelopeOf('Not_a_label')],                                         true,   'an unlocklabel outside the label grammar: the vault checks the grammar when it adds a way in, and a stored record only needs text'],
  [[TH.envelopeOf('passphrase', { salt_b64: '' })],                        false,  'an empty salt'],
  [[TH.envelopeOf('passphrase', { unlock_id: '' })],                       false,  'an empty unlock_id'],
  [[TH.envelopeOf('passphrase', { device_id: '' })],                       false,  'an empty device_id'],
  [[TH.passkeyEnvelopeOf('laptop', { registered_at: 1_792_022_400 })],    false,  'a registered_at in epoch seconds'],
  [[TH.envelopeOf('passphrase', { vault_key_epoch: 0 })],                  false,  'a vaultKey epoch of zero'],
  [[TH.envelopeOf('passphrase', { vault_key_epoch: 2 })],                  true,   "an envelope at another vaultKey epoch than the bundle's: a damaged way in, which an unlock passes over"],
] as const

describe("VaultBundle's unlocks", () => {
  for (const [unlocks, expected, blurb] of UnlockListCases) {
    it(blurb, () => { expect(VaultBundle.safeParse({ ...TH.bundleOf('u1'), unlocks }).success).to.eq(expected) })
  }
})

describe("VaultBundle", () => {
  for (const [candidate, expected, blurb] of BundleCases) {
    it(blurb, () => { expect(VaultBundle.safeParse(candidate).success).to.eq(expected) })
  }
})

const { note: _note, ...notelessBox } = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _boxRegistered, changed_at: _boxChanged, ...boxWithoutTimes } = notelessBox
const LockboxCases = [
  // regular usage:
  [TH.boxOf('anthropic_api_key', 'a1'),                   true,   'a whole lockbox, with its note'],
  [notelessBox,                                            true,   'a lockbox with no note field at all'],
  // a stored vault is a contract: earlier versions wrote a lockbox with no note as `note:
  // undefined`, which IndexedDB's structured clone keeps, so it still reads as no note
  [{ ...notelessBox, note: undefined },                    true,   'a lockbox an earlier version stored with an undefined note'],
  // refused, as a damaged or foreign record:
  [{ ...notelessBox, note: null },                         false,  'a null note'],
  [{ ...notelessBox, note: 'n'.repeat(257) },              true,   'a note of any length: the validators check notes, not the record'],
  [{ ...notelessBox, boxlabel: 'Ключ API: מפתח' },        true,   'a boxlabel of any text'],
  [{ ...notelessBox, note: 42 },                           false,  'a note that is not text'],
  [{ ...notelessBox, format: 'safebyok-lockbox-v3' },      false,  'a format this version does not know'],
  [{ ...notelessBox, format: 'safebyok-lockbox-v1' },      false,  'a lockbox from before vaultKey epochs'],
  [{ ...notelessBox, vault_key_epoch: 1.5 },               false,  'a vaultKey epoch that is not a whole number'],
  [{ ...notelessBox, changed_at: FarFuture + 1 },          false,  'a changed_at past FarFuture'],
  [{ ...notelessBox, registered_at: Infinity },            false,  'a registered_at that never comes'],
  [{ ...notelessBox, changed_at: null },                   false,  'a null changed_at'],
  [{ ...notelessBox, registered_at: Date.UTC(2026, 9, 14) + 0.5 }, false, 'a registered_at with a fraction of a millisecond'],
  [boxWithoutTimes,                                        false,  'a lockbox missing its times'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso }, false, 'a lockbox from before its times were named registered_at and changed_at'],
] as const

describe("Lockbox", () => {
  for (const [candidate, expected, blurb] of LockboxCases) {
    it(blurb, () => { expect(Lockbox.safeParse(candidate).success).to.eq(expected) })
  }
})

const { format: _format, lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...notelessSummary } = notelessBox
const SummaryNoteCases = [
  // however a lockbox's lack of a note was stored, its summary says null:
  [notelessSummary,                                  null,            'a lockbox stored with no note field, as one is today'],
  [{ ...notelessSummary, note: undefined },          null,            'a lockbox an earlier version stored with an undefined note'],
  [{ ...notelessSummary, note: null },               null,            'a summary already null, parsed again'],
  // and a note is kept as it is:
  [{ ...notelessSummary, note: 'work account' },     "work account",  'a lockbox with a note'],
] as const

describe("LockboxSummary", () => {
  for (const [candidate, expected, blurb] of SummaryNoteCases) {
    it(blurb, () => { expect(LockboxSummary.parse(candidate).note).to.eq(expected) })
  }

  it("takes a note of any length, as a stored lockbox does, and refuses one that is not text", () => {
    expect(LockboxSummary.safeParse({ ...notelessSummary, note: 'n'.repeat(257) }).success).to.be.true
    expect(LockboxSummary.safeParse({ ...notelessSummary, note: 42 }).success).to.be.false
  })

  it("strips the two ciphered fields and the format from a whole lockbox, and marks it undamaged", () => {
    const summary = LockboxSummary.parse(TH.boxOf('anthropic_api_key', 'a1'))
    expect(Object.keys(summary)).to.have.members(['boxlabel', 'revision_id', 'vault_key_epoch', 'note', 'registered_at', 'changed_at', 'damaged'])
    expect(summary.damaged).to.be.false
  })
})

describe("FarFuture", () => {
  it("is the microsecond epochalypse: the last millisecond whose epoch microseconds are a safe integer", () => {
    expect(FarFuture).to.eq(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
    expect(Number.isSafeInteger(FarFuture * 1000)).to.be.true
    expect(Number.isSafeInteger((FarFuture + 1) * 1000)).to.be.false
  })

  it("falls in 2255, a valid Date", () => {
    expect(new Date(FarFuture).toISOString()).to.eq('2255-06-05T23:47:34.740Z')
  })

  it("lets a host show 'until locked' for a deadline equal to it, and a date for any other", () => {
    const shown = (askPassphraseAt: number): string => (askPassphraseAt === FarFuture ? 'until locked' : new Date(askPassphraseAt).toISOString())
    expect(shown(FarFuture)).to.eq('until locked')
    expect(shown(Date.UTC(2026, 9, 22))).to.eq('2026-10-22T00:00:00.000Z')
  })
})

describe("ForeverMs", () => {
  it("runs from FarPast to FarFuture, as its examples show", () => {
    expect(ForeverMs).to.eq(FarFuture - FarPast)
    expect(FarPast + ForeverMs).to.eq(FarFuture)
  })
})

describe("DeviceUnlock", () => {
  it("takes a user_id of any length, and refuses one that is not text", async () => {
    const unlock = await TH.unlockOf('u'.repeat(1000))
    expect(DeviceUnlock.safeParse(unlock).success).to.be.true
    expect(DeviceUnlock.safeParse({ ...unlock, user_id: 42 }).success).to.be.false
  })
})

describe("FarPast", () => {
  it("is the first instant of 1981", () => {
    expect(FarPast).to.eq(Date.UTC(1981, 0, 1))
    expect(new Date(FarPast).toISOString()).to.eq('1981-01-01T00:00:00.000Z')
  })
})

const NowMs = Date.UTC(2026, 9, 15)

const EpochMillisCases = [
  // regular usage:
  [NowMs,                     true,   'today, in epoch milliseconds'],
  [FarPast,                   true,   'the floor itself'],
  [FarFuture,                 true,   'the ceiling itself'],
  // unit mistakes:
  [NowMs / 1000,              false,  'epoch seconds, which land in January 1970'],
  [NowMs * 1000,              false,  'epoch microseconds, which land tens of thousands of years out'],
  // edge cases:
  [FarPast - 1,               false,  'one millisecond before 1981'],
  [FarFuture + 1,             false,  'one millisecond past the ceiling'],
  [8.64e15,                   false,  'the last instant a Date holds, far past the ceiling'],
  [0,                         false,  'the epoch itself'],
  [NowMs + 0.5,               false,  'a fraction of a millisecond'],
  [Infinity,                  false,  'a time that never comes'],
  [NaN,                       false,  'not a number'],
  ["1792022400000",           false,  'a time written as text'],
  [null,                      false,  'null'],
] as const

describe("EpochMillis", () => {
  for (const [candidate, expected, blurb] of EpochMillisCases) {
    it(`${expected ? 'accepts' : 'refuses'} ${blurb}`, () => {
      expect(EpochMillis.safeParse(candidate).success).to.eq(expected)
    })
  }

  it("says which unit a refused number likely was", () => {
    const tooSmall = EpochMillis.safeParse(NowMs / 1000)
    const tooLarge = EpochMillis.safeParse(NowMs * 1000)
    expect(tooSmall.error?.issues[0]?.message).to.match(/epoch seconds/)
    expect(tooLarge.error?.issues[0]?.message).to.match(/epoch microseconds/)
    expect(EpochMillis.safeParse(1e300).error?.issues[0]?.message).to.match(/epoch microseconds/)
    expect(EpochMillis.safeParse(NowMs + 0.5).error?.issues[0]?.message).to.match(/whole epoch milliseconds/)
  })

  it("passes a time through unchanged, as its examples show", () => {
    expect(EpochMillis.parse(Date.UTC(2026, 9, 15))).to.eq(1_792_022_400_000)
    expect(EpochMillis.safeParse(1_792_022_400).success).to.be.false
    expect(EpochMillis.safeParse(1_792_022_400_000_000).success).to.be.false
    expect(EpochMillis.safeParse(1_792_022_400_000.5).success).to.be.false
    expect(EpochMillis.safeParse(Infinity).success).to.be.false
  })
})

const MarkCases = [
  // regular usage:
  [TH.markOf('u1'),                                     true,   'a whole mark'],
  [TH.markOf('u1', { unlock_epoch: 40 }),                true,   'a mark of a vault seen at a later epoch'],
  // refused, as a damaged or foreign record:
  [TH.markOf('u1', { format: 'safebyok-mark-v2' as never }), false, 'a format this version does not know'],
  [TH.markOf('u1', { device_id: '' }),                  false,  'an empty device_id'],
  [TH.markOf('u1', { vault_id: '' }),                   false,  'an empty vault_id'],
  [TH.markOf('u1', { unlock_epoch: 0 }),                false,  'an epoch starts at one'],
  [TH.markOf('u1', { vault_key_epoch: 0 }),             false,  'a vaultKey epoch starts at one'],
  [TH.omitting(TH.markOf('u1'), 'vault_key_epoch'),     false,  'a mark missing the vaultKey epoch it has seen'],
] as const

describe("DeviceMark", () => {
  for (const [candidate, expected, blurb] of MarkCases) {
    it(blurb, () => { expect(DeviceMark.safeParse(candidate).success).to.eq(expected) })
  }
})
