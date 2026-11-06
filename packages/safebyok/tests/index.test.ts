/** The front door, `safebyok`: what a host imports from it. */

import { describe, expectTypeOf, it } from 'vitest'
import type * as Front from '../src/index'

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
    expectTypeOf<Front.VaultError['refusalkind']>().toEqualTypeOf<Front.RefusalKind>()
    expectTypeOf<Front.VaultError['family']>().toEqualTypeOf<Front.RefusalFamily>()
  })
})
