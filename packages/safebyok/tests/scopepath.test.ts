import { describe, expect, it } from 'vitest'
import * as Scopepath from '../src/scopepath'
import * as CX from '../src/shapes/scopes'
import type { VaultScope } from '../src/shapes/scopes'
import { memoryStore } from '../src/string-store'
import * as TH from './test-helpers'

const u1 = TH.scopeOf('u1')

describe("Scopepath, the scopepath of each row", () => {
  // Spelled out rather than computed: these are stored, and every other device looks for its rows under them.
  it("files a bank under its kind, applabel and user_id, joined on ^, as its example shows", () => {
    expect(Scopepath.bank({ applabel: 'acme', user_id: 'u1' })).to.eq('bank^acme^u1')
  })

  it("files the vault record under its kind and scope, joined on ^, as the first example shows", () => {
    expect(Scopepath.vault({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.eq('vault^acme^u1^main')
  })

  it("files a lease under its kind and scope, joined on ^, as its example shows", () => {
    expect(Scopepath.lease(u1)).to.eq('lease^acme^u1^main')
  })

  it("files a device record under its kind and scope, joined on ^, as its example shows", () => {
    expect(Scopepath.device(u1)).to.eq('device^acme^u1^main')
  })

  it("files a box under its kind, scope and boxlabel, joined on ^, as its example shows", () => {
    expect(Scopepath.box({ ...u1, boxlabel: 'openai' })).to.eq('box^acme^u1^main^openai')
  })

  it("takes the scope out of any record carrying it, its other fields left out", () => {
    const record = { ...TH.vaultRecordOf('u1'), boxlabel: 'openai' }
    expect(Scopepath.vault(record)).to.eq('vault^acme^u1^main')
    expect(Scopepath.lease(record)).to.eq('lease^acme^u1^main')
    expect(Scopepath.bank(record)).to.eq('bank^acme^u1')
    expect(Scopepath.box(record)).to.eq('box^acme^u1^main^openai')
  })

  it("gives every kind a scopepath of its own for one scope", () => {
    const made = [Scopepath.bank(u1), Scopepath.vault(u1), Scopepath.lease(u1), Scopepath.device(u1), Scopepath.box({ ...u1, boxlabel: 'main' })]
    expect(new Set(made).size).to.eq(made.length)
  })

  it("says the character it joins on", () => {
    expect(Scopepath.Delimiter).to.eq('^')
  })
})

describe("Scopepath, refusing a scope whose names fail their checks", () => {
  it("refuses a user_id holding ^ as bad_scope, naming the field and quoting none of it, as the vault's second example shows", () => {
    const refusal = TH.expectSyncRefusal(() => Scopepath.vault({ applabel: 'acme', user_id: 'u1^x', vaultlabel: 'main' }), 'bad_scope')
    expect(refusal.message).to.match(/^user_id: A user_id is ASCII letters/)
    expect(TH.thrownText(refusal)).to.not.include('u1^x')
  })

  it("refuses as TH.expectSyncRefusal's example shows", () => {
    TH.expectSyncRefusal(() => Scopepath.box({ ...u1, user_id: 'a^b', boxlabel: 'x' }), 'bad_scope')
  })

  it("refuses in every maker, and in the prefix of a vault's boxes", () => {
    const scope = { ...u1, vaultlabel: 'Main' }
    const makers = [Scopepath.vault, Scopepath.lease, Scopepath.device, Scopepath.withinVaultScopepathPrefix, Scopepath.withinVaultScopepathPred]
    for (const make of makers) {
      expect(TH.expectSyncRefusal(() => make(scope), 'bad_scope').meta?.fieldnames).to.deep.equal(['vaultlabel'])
    }
    TH.expectSyncRefusal(() => Scopepath.bank({ applabel: 'acme', user_id: '' }), 'bad_scope')
  })

  for (const fieldname of CX.BoxScopepathFieldnameVals) {
    it(`refuses a ${fieldname} holding the delimiter, quoting none of it`, () => {
      const refusal = TH.expectSyncRefusal(() => Scopepath.box({ ...u1, boxlabel: 'openai', [fieldname]: 'sec^ret' }), 'bad_scope')
      expect(refusal.meta?.fieldnames).to.deep.equal([fieldname])
      expect(TH.thrownText(refusal)).to.not.include('sec^ret')
    })
  }
})

describe("Scopepath's inverses", () => {
  it("read a bank's scope back from its scopepath, as bankScope's example shows", () => {
    expect(Scopepath.bankScope('bank^acme^u1')).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
  })

  it("read a vault's scope back from its scopepath, as vaultScope's first example shows", () => {
    expect(Scopepath.vaultScope('vault^acme^u1^main')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
  })

  it("refuse another kind's scopepath as bad_scope, as vaultScope's second example shows", () => {
    TH.expectSyncRefusal(() => Scopepath.vaultScope('lease^acme^u1^main'), 'bad_scope')
  })

  it("refuse a scopepath with one name too many as bad_scope, as vaultScope's third example shows", () => {
    TH.expectSyncRefusal(() => Scopepath.vaultScope('vault^acme^u1^main^extra'), 'bad_scope')
  })

  it("read a box's scope back from its scopepath, as boxscope's example shows", () => {
    expect(Scopepath.boxscope('box^acme^u1^main^openai').boxlabel).to.eq('openai')
  })

  it("undo each maker, for a user_id of every character it may hold", () => {
    const scope = { applabel: 'acme', user_id: 'auth0|a.b~c:d@e+f%20-_', vaultlabel: 'main_2' }
    expect(Scopepath.bankScope(Scopepath.bank(scope))).to.deep.equal({ applabel: scope.applabel, user_id: scope.user_id })
    expect(Scopepath.vaultScope(Scopepath.vault(scope))).to.deep.equal(scope)
    expect(Scopepath.boxscope(Scopepath.box({ ...scope, boxlabel: 'openai' }))).to.deep.equal({ ...scope, boxlabel: 'openai' })
  })

  it("refuse a box's scopepath whose boxlabel fails its check, quoting none of it", () => {
    const refusal = TH.expectSyncRefusal(() => Scopepath.boxscope('box^acme^u1^main^Secret Key'), 'bad_scope')
    expect(TH.thrownText(refusal)).to.not.include('Secret')
  })
})

describe("Scopepath's kind tests", () => {
  it("know a lease's scopepath, for any scope, as isLease's first example shows", () => {
    expect(Scopepath.isLease(Scopepath.lease(u1))).to.be.true
    expect(Scopepath.isLease(Scopepath.lease({ applabel: 'acme', user_id: 'auth0|x:y', vaultlabel: 'spare' }))).to.be.true
  })

  it("refuse an earlier version's lease, as isLease's second example shows, another kind's, and anything not text", () => {
    expect(Scopepath.isLease('unlock^acme^u1^main')).to.be.false
    expect(Scopepath.isLease('["unlock","acme","u1","main"]')).to.be.false
    expect(Scopepath.isLease('lease:acme:u1:main')).to.be.false
    expect(Scopepath.isLease('leased^acme^u1^main')).to.be.false
    expect(Scopepath.isLease(Scopepath.vault(u1))).to.be.false
    expect(Scopepath.isLease(['lease', 'acme', 'u1', 'main'])).to.be.false
  })

  it("refuse a lease's scopepath under a name no scope check passes, which no maker files", () => {
    expect(Scopepath.isLease('lease^acme^u1^Main')).to.be.false
    expect(Scopepath.isLease('lease^acme^u1^main^extra')).to.be.false
    expect(Scopepath.isLease('lease^acme^^main')).to.be.false
  })

  it("know a device record's scopepath, as isDevice's first example shows", () => {
    expect(Scopepath.isDevice(Scopepath.device(u1))).to.be.true
  })

  it("refuse a lease's scopepath for a device record's, as isDevice's second example shows, and an earlier version's device mark", () => {
    expect(Scopepath.isDevice(Scopepath.lease(u1))).to.be.false
    expect(Scopepath.isDevice('mark^acme^u1^main')).to.be.false
    expect(Scopepath.isDevice('devices^acme^u1^main')).to.be.false
    expect(Scopepath.isDevice(['device', 'acme', 'u1', 'main'])).to.be.false
  })

  it("know a box's scopepath, as isBox's first example shows", () => {
    expect(Scopepath.isBox('box^acme^u1^main^openai')).to.be.true
    expect(Scopepath.isBox(Scopepath.box({ ...u1, boxlabel: 'anthropic' }))).to.be.true
  })

  it("refuse a row no box is filed under, as isBox's second example shows", () => {
    expect(Scopepath.isBox('box^acme^u1^main^Open AI')).to.be.false
    expect(Scopepath.isBox('box^acme^u1^main')).to.be.false
    expect(Scopepath.isBox('box^acme^u1^main^x^y')).to.be.false
    expect(Scopepath.isBox('["box","acme","u1","main","anthropic"]')).to.be.false
    expect(Scopepath.isBox(Scopepath.vault(u1))).to.be.false
    expect(Scopepath.isBox(42)).to.be.false
  })
})

describe("Scopepath.withinVaultScopepathPrefix and withinVaultScopepathPred", () => {
  it("begin every box's scopepath of a vault with its prefix, ending in the delimiter, as the prefix's example shows", () => {
    expect(Scopepath.withinVaultScopepathPrefix(u1)).to.eq('box^acme^u1^main^')
    expect(Scopepath.box({ ...u1, boxlabel: 'anthropic' }).startsWith(Scopepath.withinVaultScopepathPrefix(u1))).to.be.true
  })

  it("pick the rows under a vault's prefix out of a store, and nothing else, as the predicate's example shows", () => {
    const store = memoryStore()
    const others = [Scopepath.vault(u1), Scopepath.lease(u1), Scopepath.box({ ...TH.scopeOf('u2'), boxlabel: 'anthropic' }), Scopepath.box({ ...TH.scopeOf('u12'), boxlabel: 'anthropic' }), Scopepath.box({ ...TH.scopeOf('u1', 'main2'), boxlabel: 'anthropic' }), '["box","acme","u1","main","legacy"]']
    const boxes = [Scopepath.box({ ...u1, boxlabel: 'anthropic' }), Scopepath.box({ ...u1, boxlabel: 'openai' })]
    for (const scopepath of [...others, ...boxes]) { store.put(scopepath, '{}') }
    expect(store.scopepaths().filter(Scopepath.withinVaultScopepathPred(u1))).to.have.members(boxes)
  })

  it("pass a row under the vault's prefix that no box is filed under, which isBox rejects: a test of the prefix alone", () => {
    const isWithinVault = Scopepath.withinVaultScopepathPred(u1)
    expect(isWithinVault('box^acme^u1^main^Open AI')).to.be.true
    expect(Scopepath.isBox('box^acme^u1^main^Open AI')).to.be.false
  })

  it("pass over a key that is not text, as IndexedDB may hold", () => {
    const isWithinVault = Scopepath.withinVaultScopepathPred(u1)
    expect(isWithinVault(42)).to.be.false
    expect(isWithinVault(undefined)).to.be.false
    expect(isWithinVault(['box', 'acme', 'u1', 'main', 'anthropic'])).to.be.false
  })

  it("never take vault record, a lease or a device record for a box", () => {
    const isWithinVault = Scopepath.withinVaultScopepathPred(u1)
    expect(isWithinVault(Scopepath.vault(u1))).to.be.false
    expect(isWithinVault(Scopepath.lease(u1))).to.be.false
    expect(isWithinVault(Scopepath.device(u1))).to.be.false
  })
})

/** A scope from a tuple, for the tables below. */
const scopeFrom = ([applabel = '', user_id = '', vaultlabel = '']: readonly string[]): VaultScope => ({ applabel, user_id, vaultlabel })

/** True when every name of `address` (applabel, user_id, vaultlabel, boxlabel) passes its check, so a maker files it. */
const isSound = ([applabel, user_id, vaultlabel, boxlabel]: readonly string[]): boolean => CX.boxscope.safeParse({ applabel, user_id, vaultlabel, boxlabel }).success

/**
 * Pairs of addresses -- applabel, user_id, vaultlabel, boxlabel -- that a join on a separator
 * other than ^ would confuse. Each must get two different scopepaths, and neither's vault may list
 * the other's box.
 */
const NearTwins = [
  [["acme", "u1_x", "main", "box"],      ["acme", "u1", "x_main", "box"],      'an underscore slid from the user_id into the vaultlabel'],
  [["acme", "u1", "main_x", "box"],      ["acme", "u1", "main", "x_box"],      'an underscore slid from the vaultlabel into the boxlabel'],
  [["ac_me", "u1", "main", "box"],       ["ac", "me_u1", "main", "box"],       'an underscore slid from the applabel into the user_id'],
  [["acme", "u1:x", "main", "box"],      ["acme", "u1", "xmain", "box"],       'a colon and a letter moved across a boundary'],
  [["acme", "u1", "main", "box"],        ["acme", "u1.", "main", "box"],       'a trailing dot'],
  [["acme", "u1", "main", "box"],        ["acme", "u1%", "main", "box"],       'a trailing percent sign'],
] as const

describe("Scopepath, between near twins", () => {
  for (const [one, two, blurb] of NearTwins) {
    it(`never confuses ${blurb}`, () => {
      expect(isSound(one) && isSound(two)).to.be.true
      const [oneScope, twoScope] = [scopeFrom(one), scopeFrom(two)]
      const [oneBox, twoBox] = [Scopepath.box({ ...oneScope, boxlabel: one[3] }), Scopepath.box({ ...twoScope, boxlabel: two[3] })]
      expect(oneBox).to.not.eq(twoBox)
      expect(Scopepath.withinVaultScopepathPred(oneScope)(twoBox)).to.be.false
      expect(Scopepath.withinVaultScopepathPred(twoScope)(oneBox)).to.be.false
    })
  }
})

describe("Scopepath, over every sound split of one string", () => {
  // Every way to cut this string into applabel, user_id, vaultlabel and boxlabel that the name
  // checks admit: many addresses made of the same characters in the same order, which a join on
  // any of them would confuse.
  const awkward = 'ab_cd_ef_gh_ij_kl_mn'
  const cuts = Array.from({ length: awkward.length + 1 }, (_unused, ii) => ii)
  const addresses = cuts.flatMap((one) => cuts.flatMap((two) => cuts.flatMap((three) => (
    one <= two && two <= three ? [[awkward.slice(0, one), awkward.slice(one, two), awkward.slice(two, three), awkward.slice(three)]] : []
  )))).filter((address) => isSound(address))

  it("gives each a scopepath of its own", () => {
    const boxScopepaths = new Set(addresses.map((address) => Scopepath.box({ ...scopeFrom(address), boxlabel: address[3] ?? '' })))
    expect(addresses.length).to.be.above(50)
    expect(boxScopepaths.size).to.eq(addresses.length)
  })

  it("lists each vault's boxes alone", () => {
    const leaks = addresses.map((address) => scopeFrom(address)).flatMap((scope) => {
      const isWithinVault = Scopepath.withinVaultScopepathPred(scope)
      return addresses.filter((address) => {
        const owner = scopeFrom(address)
        const isOwn = owner.applabel === scope.applabel && owner.user_id === scope.user_id && owner.vaultlabel === scope.vaultlabel
        return ! isOwn && isWithinVault(Scopepath.box({ ...owner, boxlabel: address[3] ?? '' }))
      })
    })
    expect(leaks).to.have.lengthOf(0)
  })
})
