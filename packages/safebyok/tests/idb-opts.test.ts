import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import { parseDbName, type IdbOpts } from '../src/idb-opts'

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
    it(blurb, () => { expect(parseDbName(opts, 'idbDeviceDB')).to.eq(expected) })
  }

  it("refuses an empty or non-text dbName, naming the call, never the input", () => {
    for (const dbName of ['', 42, ['acme']]) {
      expect(() => parseDbName({ dbName } as unknown as IdbOpts, 'browserOpts'))
        .to.throw(VaultError, /^In browserOpts's options: dbName: /).with.property('refusalkind', 'bad_option')
    }
  })

  it("reads the name it is handed, as its first example shows", () => {
    expect(parseDbName({ dbName: 'acme' }, 'idbDeviceDB')).to.eq('acme')
  })

  it("refuses a field the options do not take, counting it, naming neither it nor its value, as its second example shows", () => {
    expect(() => parseDbName({ dbname: 'acme_misspelt' } as unknown as IdbOpts, 'browserOpts'))
      .to.throw(VaultError, /^In browserOpts's options: .*There is a field it does not take \(its name is not repeated\): it takes only dbName\./)
      .that.satisfies((err: Error) => ! err.message.includes('dbname') && ! err.message.includes('acme_misspelt'))
  })
})
