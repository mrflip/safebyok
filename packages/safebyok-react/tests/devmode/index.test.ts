import { describe, expect, it } from 'vitest'
import * as Devmode from '../../src/devmode'
import * as Front from '../../src/index'

describe("the devmode entry", () => {
  it("exports the three panels, which the front door does not", () => {
    const panelnames = ['DevBoxInspector', 'DevDeviceDBInspector', 'DevVaultDBInspector']
    expect(Object.keys(Devmode).toSorted((one, other) => one.localeCompare(other))).to.deep.equal(panelnames)
    expect(Object.keys(Front).filter((exportname) => exportname.startsWith('Dev'))).to.deep.equal([])
  })
})
