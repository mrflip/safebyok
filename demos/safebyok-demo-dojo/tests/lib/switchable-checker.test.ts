import { afterEach, describe, expect, it } from 'vitest'
import { ForcedWeakReason, forceWeak, switchableChecker } from '../../src/lib/switchable-checker'

/** The checker's verdict on `typed`, for the dojo's bank. */
async function verdictOn(typed: string) { return await switchableChecker(typed, { userid: 'nolo', banklabel: 'dojo' }) }

describe("the dojo's strength checker", () => {
  afterEach(() => { forceWeak(false) })

  it('judges four characters or more strong, and fewer weak', async () => {
    expect(await verdictOn('abcd')).to.deep.equal({ strong: true })
    expect(await verdictOn('abc')).to.include({ strong: false })
  })

  it('judges every passphrase weak while switched to weak', async () => {
    forceWeak(true)
    expect(await verdictOn('a long and lovely passphrase')).to.deep.equal({ strong: false, reason: ForcedWeakReason })
  })
})
