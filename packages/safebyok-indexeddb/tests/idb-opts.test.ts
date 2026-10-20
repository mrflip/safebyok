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
        .to.throw(VaultError, /^inspectIdbVaultDB takes an optional dbName/).with.property('refusalkind', 'bad_option')
    }
  })

  it("never quotes what it refused", () => {
    expect(() => parseDbName({ dbName: 12_345_678 } as unknown as IdbVaultDBOpts, 'idbVaultDB')).to.throw(VaultError).that.satisfies((err: Error) => ! err.message.includes('12345678'))
  })
})
