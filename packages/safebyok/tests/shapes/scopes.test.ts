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
    for (const fieldname of ['applabel', 'user_id', 'vaultlabel', 'boxlabel']) {
      const err = TH.expectSyncRefusal(() => CX.boxscope.parse({ ...scope, boxlabel: 'openai', [fieldname]: 'a^b' }), 'bad_scope')
      expect(err.meta?.fieldnames).to.deep.equal([fieldname])
      expect(err.message).to.not.include('a^b')
    }
  })
})
