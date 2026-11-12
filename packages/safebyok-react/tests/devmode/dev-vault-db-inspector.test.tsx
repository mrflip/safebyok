import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryVaultDB } from 'safebyok/storage'
import { BankProvider } from '../../src/provider/bank-provider'
import { DevVaultDBInspector } from '../../src/devmode'
import * as TH from '../test-helpers'

TH.sweepBankWorlds()

// The inspector reads a VaultDB, which no bank writes any more: its cases over a bank's rows went with that.
describe("DevVaultDBInspector", () => {
  it("says so when no user is signed in", () => {
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld(), { user_id: null })}><DevVaultDBInspector vaultDB={new MemoryVaultDB()} /></BankProvider>)
    expect(screen.getByText(/^No bank/)).to.exist
  })
})
