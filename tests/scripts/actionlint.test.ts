import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/actionlint.sh')
const Platforms = ['linux_amd64', 'linux_arm64', 'darwin_amd64', 'darwin_arm64']

describe('scripts/actionlint.sh', () => {
  it('refuses a cached tarball that is not the one recorded, and fetches nothing in its place', () => {
    // A copy of the script in a scratch checkout, whose cache already holds a tarball for every
    // platform the script knows: none is the release recorded, so the run must stop at the hash.
    const scratch = TH.makeScratchDir('actionlint-test-')
    const script = path.join(scratch, 'scripts/actionlint.sh')
    mkdirSync(path.dirname(script))
    copyFileSync(Script, script)
    const cache = path.join(scratch, 'node_modules/.cache/actionlint')
    mkdirSync(cache, { recursive: true })
    for (const platform of Platforms) {
      writeFileSync(path.join(cache, `actionlint_1.7.12_${platform}.tar.gz`), 'not the release\n')
    }
    const run = spawnSync(script, [], { cwd: scratch, encoding: 'utf8' })
    expect(run.status).to.equal(1)
    expect(run.stderr).to.match(/is not the tarball recorded in scripts\/actionlint\.sh .*refusing to run it/)
    expect(readdirSync(cache)).to.have.length(Platforms.length)
    for (const tarball of readdirSync(cache)) {
      expect(readFileSync(path.join(cache, tarball), 'utf8')).to.equal('not the release\n')
    }
  })
})
