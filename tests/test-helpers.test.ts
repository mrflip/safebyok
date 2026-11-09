import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from './test-helpers'

describe("makeScratchDir", () => {
  const made: string[] = []

  it("makes a fresh, empty directory under the temp directory, named by its prefix", () => {
    const scratch = TH.makeScratchDir('test-helpers-')
    made.push(scratch)
    expect(path.dirname(scratch)).to.eq(tmpdir())
    expect(path.basename(scratch)).to.match(/^test-helpers-/)
    expect(readdirSync(scratch)).to.have.lengthOf(0)
    writeFileSync(path.join(scratch, 'left-behind.txt'), 'gone soon\n')
  })

  it("removes it, and what was left in it, once the test that made it returns", () => {
    expect(made).to.have.lengthOf(1)
    expect(existsSync(made[0] ?? '')).to.be.false
  })
})

describe("makeScratchDir, called in a beforeEach as its @example has it", () => {
  const made: string[] = []
  beforeEach(() => { made.push(TH.makeScratchDir('test-helpers-each-')) })

  it("gives each test a directory of its own", () => {
    expect(made).to.have.lengthOf(1)
    expect(existsSync(made[0] ?? '')).to.be.true
  })

  it("has removed the last test's by the time the next test runs", () => {
    expect(made).to.have.lengthOf(2)
    expect(existsSync(made[0] ?? '')).to.be.false
    expect(existsSync(made[1] ?? '')).to.be.true
  })
})
