import { describe, expect, it } from 'vitest'
import { VaultError } from 'safebyok'
import { parseDbName, type IdbVaultDBOpts } from '../src/idb-opts'

const DbNameCases = [
  // regular usage:
  [undefined,                 "safebyok",  'no options at all reads as the default'],
  [{},                        "safebyok",  'a bag without a dbName reads as the default'],
  [{ dbName: undefined },     "safebyok",  'an undefined dbName reads as the default'],
  [{ dbName: "acme" },        "acme",      'a plain name is kept'],
  [{ dbName: "my-app db" },   "my-app db", 'any non-empty text is a name IndexedDB takes'],
] as const

describe("parseDbName", () => {
  for (const [opts, expected, blurb] of DbNameCases) {
    it(blurb, () => { expect(parseDbName(opts, 'idbVaultDB')).to.eq(expected) })
  }

  it("refuses an empty or non-text dbName, naming the call, never the input", () => {
    for (const dbName of ['', 42, ['acme'], null]) {
      expect(() => parseDbName({ dbName } as unknown as IdbVaultDBOpts, 'inspectIdbVaultDB'))
        .to.throw(VaultError, /^In inspectIdbVaultDB's options: dbName: /).with.property('refusalkind', 'bad_option')
    }
  })

  it("takes the logger every VaultDB takes beside the dbName", () => {
    expect(parseDbName({ dbName: 'acme', logger: null }, 'idbVaultDB')).to.eq('acme')
  })

  it("refuses a field the options do not take, counting it, naming neither it nor its value", () => {
    const opts = { dbname: 'acme_misspelt' } as unknown as IdbVaultDBOpts
    expect(() => parseDbName(opts, 'idbVaultDB'))
      .to.throw(VaultError, /^In idbVaultDB's options: .*There is a field it does not take \(its name is not repeated\): it takes only dbName, logger\./)
      .that.satisfies((err: Error) => ! err.message.includes('dbname') && ! err.message.includes('acme_misspelt'))
  })

  it("never quotes what it refused", () => {
    expect(() => parseDbName({ dbName: 12_345_678 } as unknown as IdbVaultDBOpts, 'idbVaultDB')).to.throw(VaultError).that.satisfies((err: Error) => ! err.message.includes('12345678'))
  })
})
