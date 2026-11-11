/** The front door, `safebyok`: what a host imports from it. */

import { describe, expect, expectTypeOf, it } from 'vitest'
import * as Front from '../src/index'

describe("safebyok", () => {
  it("exports each type its exported signatures name", () => {
    expectTypeOf<Front.BankOpts['vaultDB']>().toEqualTypeOf<Front.VaultDB>()
    expectTypeOf<Front.AdapterVaultDB>().toExtend<Front.BankOpts['vaultDB']>()
    expectTypeOf<Front.BankOpts['deviceDB']>().toEqualTypeOf<Front.DeviceDB>()
    expectTypeOf<Front.BankOpts['keyDeriver']>().toEqualTypeOf<Front.KeyDeriver>()
    expectTypeOf<Front.BankOpts['strengthChecker']>().toEqualTypeOf<Front.StrengthChecker | undefined>()
    expectTypeOf<Front.BankOpts['logger']>().toEqualTypeOf<Front.VaultLogger | undefined>()
    expectTypeOf<Parameters<Front.RequestCleartext>[0]>().toEqualTypeOf<Front.AnyGating>()
    expectTypeOf<Front.KeyDeriver['salt_size']>().toEqualTypeOf<typeof Front.PassphraseSaltSize>()
    expectTypeOf<Parameters<Front.GuardedKeyDeriver['deriveKeyBytes']>[0]>().toEqualTypeOf<Front.PassphraseCleartext>()
    expectTypeOf<ReturnType<Front.Gating<'build_vault'>['checkStrength']>>().toEqualTypeOf<Promise<Front.PassphraseVerdict>>()
    expectTypeOf<Front.VaultError['refusalkind']>().toEqualTypeOf<Front.Refusalkind>()
    expectTypeOf<Front.VaultError['family']>().toEqualTypeOf<Front.RefusalFamily>()
    expectTypeOf<Parameters<Front.Vault['getBox']>[1]>().toEqualTypeOf<Front.FetchOpts | undefined>()
    expectTypeOf<Parameters<Front.Vault['putBox']>[0]>().toEqualTypeOf<Front.BoxPut>()
    expectTypeOf<Parameters<Front.Box['put']>[0]>().toEqualTypeOf<Front.BoxPatch>()
    expectTypeOf<Parameters<Front.Box['expose']>[0]>().toEqualTypeOf<Front.TimelyOpts | undefined>()
    expectTypeOf<Front.Box['isLocked']>().toEqualTypeOf<boolean>()
    expectTypeOf<Front.BankSnapshot['stage']>().toEqualTypeOf<Front.BankStage>()
    expectTypeOf<Front.GatingSnapshot['gatingkind']>().toEqualTypeOf<Front.Gatingkind>()
    expectTypeOf<Front.Box['scope']>().toEqualTypeOf<Front.Boxscope>()
    expectTypeOf<Front.Bank['scope']>().toEqualTypeOf<Front.BankScope>()
    expectTypeOf<Front.VaultError['meta']>().toEqualTypeOf<Front.RefusalMeta | undefined>()
    expectTypeOf<ConstructorParameters<typeof Front.Vault>[3]>().toEqualTypeOf<Front.BankFriend>()
    expectTypeOf<Front.BankFriend['panic']>().toEqualTypeOf<Front.BankPanic>()
    expectTypeOf<Front.BankFriend['announce']>().toEqualTypeOf<Front.BankAnnounce>()
    expectTypeOf<Parameters<Front.BankAnnounce>[0]>().toEqualTypeOf<Front.BankAnnouncement>()
    expectTypeOf<Parameters<Front.LifecycleHandler>[0]>().toEqualTypeOf<Front.BankEvent>()
    expectTypeOf<Front.BankOpts['onLifecycle']>().toEqualTypeOf<Front.LifecycleHandler | undefined>()
    expectTypeOf<Extract<Front.BankEvent, { kind: 'lease_revoke_failed' }>['where']>().toEqualTypeOf<Front.RevokeSite>()
    expectTypeOf<Front.BankFriend['askUser']>().toEqualTypeOf<Front.AskUser | null>()
    expectTypeOf<Parameters<typeof Front.tellBadNewsTo>[0]>().toEqualTypeOf<Front.BadNewsHandler>()
  })

  it("exports the patterns and limits an input checks a label or a user_id by", () => {
    expect(Front.Patterns.label.test('my_vault')).to.be.true
    expect(Front.Patterns.label.test('my__vault')).to.be.false
    expect(Front.Patterns.user_id.test('user@example.com')).to.be.true
    expect(Front.Patterns.user_id.test('..')).to.be.false
    expect(Front.MaxLabelChars).to.eq(40)
    expect(Front.MaxUserIdChars).to.eq(100)
  })

  it("exports the salt length a key deriver's salt_size must be", () => {
    expect(Front.PassphraseSaltSize).to.eq(16)
  })

  it("exports the DeviceDB a host hands Bank.make: the DeviceDB base to extend, and MemoryDeviceDB", () => {
    expect(new Front.MemoryDeviceDB()).toBeInstanceOf(Front.DeviceDB)
    expectTypeOf<Front.MemoryDeviceDB>().toExtend<Front.BankOpts['deviceDB']>()
  })

  it("exports what a React host's gating dialogs branch on: the correctable refusal kinds and the types of a gating's state", () => {
    expect(Front.correctablekindVals).to.deep.equal(['wrong_passphrase', 'wrong_passkey', 'passkey_unavailable', 'weak_passphrase', 'same_passphrase'])
    expectTypeOf<(typeof Front.correctablekindVals)[number]>().toExtend<Front.Refusalkind>()
    expectTypeOf<Front.Gating['gatingkind']>().toEqualTypeOf<Front.Gatingkind>()
    expectTypeOf<Front.Gating['passkeyHeader']>().toEqualTypeOf<Front.WayinHeader | null>()
    expectTypeOf<Front.PasskeyWayinHeader>().toExtend<Front.WayinHeader>()
    expectTypeOf<Front.PassphraseWayinHeader>().toExtend<Front.WayinHeader>()
    expectTypeOf<Front.Vault['isLocked']>().toEqualTypeOf<boolean>()
    expectTypeOf<Front.Bank['isLocked']>().toEqualTypeOf<boolean>()
    expectTypeOf<Front.VaultSnapshot['isLocked']>().toEqualTypeOf<boolean>()
    expectTypeOf<Front.BankSnapshot['stage']>().toEqualTypeOf<Front.BankStage>()
    expectTypeOf<Front.DamagedBox>().toEqualTypeOf<Readonly<{ applabel: string, user_id: string, vaultlabel: string, boxlabel: string, vault_tok: string, am: 'd' }>>()
  })

  it("exports Gating as a type only: the published surface has no launcher that hands a gating an unlock", () => {
    expect(Front).to.not.have.property('Gating')
  })

  it("exports the byte counts and the minute a passkey call and an autolock setting need", () => {
    expect(Front.PasskeySaltSize).to.eq(32)
    expect(Front.PrfAnswerSize).to.eq(32)
    expect(Front.MinuteMillis).to.eq(60_000)
    expectTypeOf<Front.PasskeyAnswer['prfBytes']>().toExtend<Uint8Array>()
  })

  it("exports the longest autolock a bank keeps, which an endless autolockMinutes becomes", () => {
    expect(Front.ForeverMillis).to.be.above(100 * 365 * 24 * 60 * Front.MinuteMillis)
  })

  it("exports the values of a box's exposure", () => {
    expect(Front.boxExposureVals).to.deep.equal(['unexposed', 'locked', 'veiled', 'showing'])
    expectTypeOf<Front.Box['exposure']>().toEqualTypeOf<Front.BoxExposure>()
  })

  it("exports the sentinel bags box.whisper returns while the whisper is hidden", () => {
    for (const bag of [Front.ENCRYPTED, Front.LOCKED, Front.VEILED]) { expect(Front.isWhisperedBag(bag)).to.be.true }
    expect(Front.isWhisperedBag({ apiKey: 'sk-test-0000' })).to.be.false
  })

  it("exports the brand helpers and the VaultError brand", () => {
    const refusal = new Front.VaultError('vault_locked', 'Unlock the vault first.')
    expect(Front.brandOf(refusal, Front.IsVaultError)).to.be.true
    const Mine = Symbol.for('@example/mine')
    expect(Front.brandOf(Front.brand({}, Mine), Mine)).to.be.true
  })

  it("exports HostErrorSanitizer, whose refusalFor makes a VaultError that carries nothing of what was thrown", () => {
    const foreign = new Error('the passphrase was hunter2')
    const refusal = Front.HostErrorSanitizer.refusalFor(foreign, 'storage_unavailable', "The vault's storage failed: try again shortly.")
    expect(Front.isVaultError(refusal)).to.be.true
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(refusal.message).to.eq("The vault's storage failed: try again shortly.")
    expect(refusal.cause).to.be.undefined
    expect(JSON.stringify(refusal)).to.not.contain('hunter2')
  })
})
