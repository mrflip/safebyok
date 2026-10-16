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
        .to.throw(VaultError, /^browserOpts takes an optional dbName/).with.property('kind', 'bad_option')
    }
  })
})
