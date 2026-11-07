/** The front door, `safebyok`: what a host imports from it. */

import { describe, expect, expectTypeOf, it } from 'vitest'
import * as Front from '../src/index'

describe("safebyok", () => {
  it("exports each type its exported signatures name", () => {
    expectTypeOf<Front.BankOpts['vaultDB']>().toEqualTypeOf<Front.VaultDB>()
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

  it("exports the device store a host hands Bank.make: the DeviceDB base to extend, and MemoryDeviceDB", () => {
    expect(new Front.MemoryDeviceDB()).toBeInstanceOf(Front.DeviceDB)
    expectTypeOf<Front.MemoryDeviceDB>().toExtend<Front.BankOpts['deviceDB']>()
  })

  it("exports what a React host's gating dialogs branch on: the correctable refusal kinds and the types of a gating's state", () => {
    expect(Front.correctablekindVals).toEqual(['wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'same_passphrase'])
    expectTypeOf<(typeof Front.correctablekindVals)[number]>().toExtend<Front.Refusalkind>()
    expectTypeOf<Front.Gating['gatingkind']>().toEqualTypeOf<Front.Gatingkind>()
    expectTypeOf<Front.Gating['passkeyHeader']>().toEqualTypeOf<Front.WayinHeader | null>()
    expectTypeOf<Front.PasskeyWayinHeader>().toExtend<Front.WayinHeader>()
    expectTypeOf<Front.PassphraseWayinHeader>().toExtend<Front.WayinHeader>()
    expectTypeOf<ReturnType<Front.Vault['lockState']>>().toEqualTypeOf<Front.LockState>()
    expectTypeOf<ReturnType<Front.Bank['lockState']>>().toEqualTypeOf<Front.LockState>()
    expectTypeOf<Front.BankSnapshot['stage']>().toEqualTypeOf<Front.BankStage>()
    expectTypeOf<Front.DamagedBox['damagekind']>().toEqualTypeOf<Front.Damagekind>()
    expectTypeOf<Front.DamagedBox>().toExtend<Front.BoxSparse>()
  })

  it("exports the byte counts and the minute a passkey call and an autolock setting need", () => {
    expect(Front.PasskeySaltBytes).toBe(32)
    expect(Front.PrfAnswerBytes).toBe(32)
    expect(Front.MinuteMillis).toBe(60_000)
    expectTypeOf<Front.PasskeyAnswer['prfBytes']>().toExtend<Uint8Array>()
  })

  it("exports HostErrorSanitizer, whose refusalFor makes a VaultError that carries nothing of what was thrown", () => {
    const foreign = new Error('the passphrase was hunter2')
    const refusal = Front.HostErrorSanitizer.refusalFor(foreign, 'storage_unavailable', "The vault's storage failed: try again shortly.")
    expect(Front.isVaultError(refusal)).toBe(true)
    expect(refusal.refusalkind).toBe('storage_unavailable')
    expect(refusal.message).toBe("The vault's storage failed: try again shortly.")
    expect(refusal.cause).toBeUndefined()
    expect(JSON.stringify(refusal)).not.toContain('hunter2')
  })
})
