import { describe, expect, it } from 'vitest'
import { HostErrorSanitizer } from 'safebyok-big'
import { EX, Errors, Logger } from 'safebyok-big/internals'
import * as BigThrowers from 'safebyok-big/refusals/throwers'
import * as BigStorage from 'safebyok-big/storage'
import * as Browser from '../src/browser'
import * as Core from '../src/core'
import * as Front from '../src/index'
import * as Storage from '../src/storage'
import * as Utils from '../src/utils'

describe("the front door, safebyok", () => {
  it("exports every value safebyok/core exports, the same value", () => {
    for (const [exportname, val] of Object.entries(Core)) { expect(Front, exportname).to.have.property(exportname).that.eq(val) }
  })

  it("exports every value safebyok/storage exports, the same value", () => {
    for (const [exportname, val] of Object.entries(Storage)) { expect(Front, exportname).to.have.property(exportname).that.eq(val) }
  })

  it("exports every value safebyok/utils exports, the same value", () => {
    for (const [exportname, val] of Object.entries(Utils)) { expect(Front, exportname).to.have.property(exportname).that.eq(val) }
  })

  it("exports the VaultMinder, the VaultTSQ and the vault, which safebyok/core leaves out", () => {
    expect(Front.VaultMinder).to.be.a('function')
    expect(Front.VaultTSQ).to.be.a('function')
    expect(Front.Vault).to.be.a('function')
    expect(Core).to.not.have.property('VaultMinder')
    expect(Core).to.not.have.property('VaultTSQ')
    expect(Core).to.not.have.property('Vault')
  })

  it("exports none of the old minders", () => {
    for (const exportname of ['Minder', 'BankMinder', 'newerThingOf', 'MinderChecks', 'MinderEventFormat']) { expect(Front, exportname).to.not.have.property(exportname) }
  })

  it("re-exports safebyok-big's refusals, its sanitizer and logger, the very ones the core throws and logs with", () => {
    expect(Front.VaultError).to.eq(Errors.VaultError)
    expect(Front.isVaultError).to.eq(Errors.isVaultError)
    expect(Front.setDefaultLogger).to.eq(Logger.setDefaultLogger)
    expect(Front.HostErrorSanitizer.refusalFor).to.eq(HostErrorSanitizer.refusalFor)
  })

  // `Proving.buildLease` is public, so a host with a proving could build a lease outside any gating, and a host making a
  // gating could open one the bank's prompts did not. Leaving both classes off every entry point prevents that.
  it("exports no proving or gating class from any entry", () => {
    const entries = { Front, Core, Storage, Browser }
    for (const [entryname, entry] of Object.entries(entries)) {
      for (const exportname of ['Proving', 'PassphraseProving', 'PasskeyProving', 'NOVEL', 'Gating']) { expect(entry, `${entryname}.${exportname}`).to.not.have.property(exportname) }
    }
  })
})

describe("safebyok/storage", () => {
  it("re-exports safebyok-big's throwers, checkers and storage policies, the very ones an adapter's refusals are made with", () => {
    const exportnames = [
      'Checker', 'Checkers', 'VaultError', 'fetchFailed', 'identityRevoked', 'isVaultError', 'objCheck', 'sanitizeForeignError', 'storageFailed', 'storagePolicyVals', 'storageUnavailable',
      'storageRefusalOf', 'unexpectedError',
    ] as const
    for (const exportname of exportnames) { expect(Storage, exportname).to.have.property(exportname).that.eq(BigStorage[exportname]) }
    expect(Storage.storageIssue).to.eq(BigThrowers.storageIssue)
  })

  it("re-exports safebyok-big's values of an ask's flags, of each verb's acts and of a refusal's kind, the very ones its checks accept", () => {
    for (const exportname of ['badActVals', 'ifAbsentVals', 'refusedActVals', 'refusalkindVals'] as const) { expect(Storage, exportname).to.have.property(exportname).that.eq(BigStorage[exportname]) }
    for (const exportname of ['delActVals', 'gotActVals', 'ifPresentVals', 'putActVals', 'putIfAbsentVals'] as const) { expect(Storage, exportname).to.have.property(exportname).that.eq(EX[exportname]) }
  })

  it("re-exports safebyok-big's IndexedDB transaction and versioned database, the very ones an IndexedDB adapter is written with", () => {
    for (const exportname of ['dbprefixOf', 'inOneStep', 'rowAt', 'versionedShelfOf'] as const) { expect(Storage, exportname).to.have.property(exportname).that.eq(BigStorage[exportname]) }
  })
})
