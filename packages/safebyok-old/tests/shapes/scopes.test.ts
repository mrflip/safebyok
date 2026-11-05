import { describe, expect, it } from 'vitest'
import * as CX from '../../src/shapes/scopes'
import * as TH from '../test-helpers'

const scope = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }

describe("CX.bankScope, CX.vaultScope and CX.boxscope", () => {
  it("hand back a frozen copy of the scope a record carries, its other fields left out, as the first example shows", () => {
    const vault = { ...scope, vault_tok: 'tok', format: 'safebyok-vault-v1', lock: () => null }
    const parsed = CX.vaultScope.parse(vault)
    expect(parsed).to.deep.equal(scope)
    expect(Object.isFrozen(parsed)).to.be.true
    expect(CX.bankScope.parse(vault)).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
    expect(CX.boxscope.parse({ ...vault, boxlabel: 'openai' })).to.deep.equal({ ...scope, boxlabel: 'openai' })
  })

  it("leave the scope handed in as it was, unfrozen, handing back a copy", () => {
    const handed = { ...scope }
    const parsed = CX.vaultScope.parse(handed)
    expect(parsed).to.not.eq(handed)
    expect(Object.isFrozen(handed)).to.be.false
  })

  it("read a scope's names through a getter, as a Vault object holds them", () => {
    class Holder {
      readonly #applabel = 'acme'
      readonly user_id = 'u1'
      readonly vaultlabel = 'main'
      get applabel(): string { return this.#applabel }
    }
    expect(CX.vaultScope.parse(new Holder())).to.deep.equal(scope)
  })

  it("refuse a bad boxlabel as 'bad_scope', naming the field, as the second example shows", () => {
    const err = TH.expectSyncRefusal(() => CX.boxscope.parse({ ...scope, boxlabel: 'OpenAI' }), 'bad_scope')
    expect(err.message).to.match(/^boxlabel: A label is lowercase words/)
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
  })

  it("refuse a name missing, or not text, as 'bad_scope', naming each", () => {
    const err = TH.expectSyncRefusal(() => CX.vaultScope.parse({ applabel: 'acme', user_id: 42 }), 'bad_scope')
    expect(err.meta?.fieldnames).to.deep.equal(['user_id', 'vaultlabel'])
    TH.expectSyncRefusal(() => CX.vaultScope.parse(null), 'bad_scope')
    TH.expectSyncRefusal(() => CX.bankScope.parse('acme'), 'bad_scope')
  })

  it("refuse a name holding the scopepath delimiter, in every place a name goes", () => {
    for (const fieldname of CX.boxScopepathFieldnameVals) {
      const err = TH.expectSyncRefusal(() => CX.boxscope.parse({ ...scope, boxlabel: 'openai', [fieldname]: 'a^b' }), 'bad_scope')
      expect(err.meta?.fieldnames).to.deep.equal([fieldname])
      expect(err.message).to.not.include('a^b')
    }
  })
})

describe("CX.bankScopepath, CX.vaultScopepath and CX.boxScopepath", () => {
  it("split a scopepath into its kind and names, as the third example shows", () => {
    expect(CX.vaultScopepath.parse('vault^acme^auth0|x^main')).to.deep.equal(['vault', 'acme', 'auth0|x', 'main'])
    expect(CX.bankScopepath.parse('bank^acme^u1')).to.deep.equal(['bank', 'acme', 'u1'])
    expect(CX.boxScopepath.parse('box^acme^u1^main^openai')).to.deep.equal(['box', 'acme', 'u1', 'main', 'openai'])
  })

  it("refuse another kind's scopepath as 'bad_scope', as the fourth example shows", () => {
    const err = TH.expectSyncRefusal(() => CX.vaultScopepath.parse('lease^acme^u1^main'), 'bad_scope')
    expect(err.meta?.fieldnames).to.deep.equal(['0'])
    TH.expectSyncRefusal(() => CX.boxScopepath.parse('vault^acme^u1^main^openai'), 'bad_scope')
  })

  it("refuse a scopepath with a name too few or too many, saying what a scopepath is", () => {
    expect(TH.expectSyncRefusal(() => CX.vaultScopepath.parse('vault^acme^u1'), 'bad_scope').message).to.include("A vault's scopepath is 'vault', an applabel, a user_id and a vaultlabel")
    expect(TH.expectSyncRefusal(() => CX.vaultScopepath.parse('vault^acme^u1^main^extra'), 'bad_scope').message).to.include("A vault's scopepath is")
    expect(TH.expectSyncRefusal(() => CX.bankScopepath.parse('bank^acme'), 'bad_scope').message).to.include("A bank's scopepath is")
    expect(TH.expectSyncRefusal(() => CX.boxScopepath.parse('box^acme^u1^main'), 'bad_scope').message).to.include("A box's scopepath is")
  })

  it("refuse a name in a scopepath that fails its check, quoting none of it", () => {
    const err = TH.expectSyncRefusal(() => CX.vaultScopepath.parse('vault^acme^u1^Secret_Main'), 'bad_scope')
    expect(err.message).to.match(/^3: A label is/)
    expect(err.message).to.not.include('Secret')
    TH.expectSyncRefusal(() => CX.vaultScopepath.parse(42), 'bad_scope')
  })
})

describe("the scopepath fieldnames", () => {
  it("list each scope's names in the order its scopepath joins them, each a field its scope validator checks", () => {
    expect(CX.bankScopepathFieldnameVals).to.deep.equal(['applabel', 'user_id'])
    expect(CX.vaultScopepathFieldnameVals).to.deep.equal(['applabel', 'user_id', 'vaultlabel'])
    expect(CX.boxScopepathFieldnameVals).to.deep.equal(['applabel', 'user_id', 'vaultlabel', 'boxlabel'])
    expect(Object.keys(CX.boxscope.unwrap().shape)).to.deep.equal([...CX.boxScopepathFieldnameVals])
  })
})
