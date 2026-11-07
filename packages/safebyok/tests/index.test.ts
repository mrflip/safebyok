/** The front door, `safebyok`: what a host imports from it. */

import { describe, expect, expectTypeOf, it } from 'vitest'
import * as Front from '../src/index'

describe("safebyok", () => {
  it("exports each type its exported signatures name", () => {
    expectTypeOf<Front.BankOpts['vaultDB']>().toEqualTypeOf<Front.VaultDBVerbs>()
    expectTypeOf<Front.VaultDB>().toExtend<Front.BankOpts['vaultDB']>()
    expectTypeOf<Front.BankOpts['deviceDB']>().toEqualTypeOf<Front.DeviceDB>()
    expectTypeOf<Front.BankOpts['keyDeriver']>().toEqualTypeOf<Front.KeyDeriver>()
    expectTypeOf<Front.BankOpts['strengthChecker']>().toEqualTypeOf<Front.StrengthChecker | undefined>()
    expectTypeOf<Front.BankOpts['logger']>().toEqualTypeOf<Front.VaultLogger | undefined>()
    expectTypeOf<Parameters<Front.RequestCleartext>[0]>().toEqualTypeOf<Front.AnyGating>()
    expectTypeOf<Parameters<Front.GuardedKeyDeriver['deriveKeyBytes']>[0]>().toEqualTypeOf<Front.PassphraseCleartext>()
    expectTypeOf<ReturnType<Front.Gating<'build_vault'>['checkStrength']>>().toEqualTypeOf<Promise<Front.PassphraseVerdict>>()
    expectTypeOf<Front.VaultError['refusalkind']>().toEqualTypeOf<Front.Refusalkind>()
    expectTypeOf<Front.VaultError['family']>().toEqualTypeOf<Front.RefusalFamily>()
  })

  it("exports the patterns and limits an input checks a label or a user_id by", () => {
    expect(Front.Patterns.label.test('my_vault')).to.be.true
    expect(Front.Patterns.label.test('my__vault')).to.be.false
    expect(Front.Patterns.user_id.test('user@example.com')).to.be.true
    expect(Front.Patterns.user_id.test('..')).to.be.false
    expect(Front.MaxLabelChars).to.eq(40)
    expect(Front.MaxUserIdChars).to.eq(100)
  })

  it("exports the device store a host hands Bank.make: the DeviceDB base to extend, and MemoryDeviceDB", () => {
    expect(new Front.MemoryDeviceDB()).toBeInstanceOf(Front.DeviceDB)
    expectTypeOf<Front.MemoryDeviceDB>().toExtend<Front.BankOpts['deviceDB']>()
  })
})
