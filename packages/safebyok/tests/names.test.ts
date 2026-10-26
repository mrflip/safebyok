import { describe, expect, it } from 'vitest'
import * as Names from '../src/names'
import * as TH from './test-helpers'

describe("Names.sameScope", () => {
  it("is true for a record naming the same app, user and vault, whatever else it holds", () => {
    expect(Names.sameScope(TH.vaultPropsOf('u1'), TH.scopeOf('u1'))).to.be.true
  })

  it("is false when any one of the three differs", () => {
    expect(Names.sameScope(TH.scopeOf('u2'), TH.scopeOf('u1'))).to.be.false
    expect(Names.sameScope(TH.scopeOf('u1', 'spare'), TH.scopeOf('u1'))).to.be.false
    expect(Names.sameScope({ ...TH.scopeOf('u1'), applabel: 'other' }, TH.scopeOf('u1'))).to.be.false
  })
})
