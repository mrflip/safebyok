/** The core's own throwers an adapter reaches for: what each refusal carries, and that what was thrown stays in its cause. */

import { describe, expect, it } from 'vitest'
import { Errors, Phrases as BigPhrases } from 'safebyok-big/internals'
import { refusalOfThrown, sanitizeForeignError, storageCallRefused } from '../../src/refusals/throwers'
import * as Phrases from '../../src/phrases'

/** A driver's error whose fields look like secrets, which must stay in a refusal's cause and reach nothing else. */
function driverError(): Error { return Object.assign(new Error('connect db.internal password=hunter2'), { password: 'hunter2' }) }

describe("storageCallRefused(oplabel, thrown)", () => {
  it("refuses storage_issue, saying which call its storage refused", () => {
    const refusal = storageCallRefused('listThings', driverError())
    expect(refusal).to.be.instanceOf(Errors.VaultError).and.to.have.property('refusalkind', 'storage_issue')
    expect(refusal.message).to.eq(Phrases.storageCallRefused('listThings'))
  })

  it("keeps what was thrown in its cause, as sanitizeForeignError makes it, and nowhere else", () => {
    const thrown = driverError()
    const refusal = storageCallRefused('listThings', thrown)
    expect(refusal.cause).to.eq(thrown)
    expect(JSON.stringify([refusal.message, refusal.meta, Errors.rowsOfRefusal(refusal)])).not.to.include('hunter2')
  })

  it("wraps what is not an Error, as sanitizeForeignError does", () => {
    const thrown = { password: 'hunter2' }
    const refusal = storageCallRefused('listThings', thrown)
    expect(refusal.cause).to.deep.eq(sanitizeForeignError(thrown))
    expect((refusal.cause as Error).cause).to.eq(thrown)
    expect(JSON.stringify([refusal.message, refusal.meta])).not.to.include('hunter2')
  })
})

describe("refusalOfThrown(thrown)", () => {
  it("takes a refusal as it is", () => {
    const refusal = storageCallRefused('listThings', driverError())
    expect(refusalOfThrown(refusal)).to.eq(refusal)
  })

  it("makes anything else unexpected_error, with the generic message and what was thrown in its cause", () => {
    const thrown = driverError()
    const refusal = refusalOfThrown(thrown)
    expect(refusal).to.have.property('refusalkind', 'unexpected_error')
    expect(refusal.message).to.eq(BigPhrases.UnexpectedError)
    expect(refusal.cause).to.eq(thrown)
  })
})
