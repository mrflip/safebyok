import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/cut-thread')

// A git that reads no one's own config (no signing, no hooks, no default branch of theirs), and
// names a fixed author.
const isolatedEnv = (home: string) => ({
  ...process.env,
  HOME:                home,
  XDG_CONFIG_HOME:     home,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME:     'Tess Ter',
  GIT_AUTHOR_EMAIL:    'tess@example.com',
  GIT_COMMITTER_NAME:  'Tess Ter',
  GIT_COMMITTER_EMAIL: 'tess@example.com',
})

// eslint-disable-next-line sonarjs/no-os-command-from-path -- the script names its branch by the system's date, so the test asks the same one
const Today = execFileSync('date', ['+%Y%m%d'], { encoding: 'utf8' }).trim()

describe('scripts/cut-thread', () => {
  let scratch: string
  let main: string
  let git: (...args: string[]) => string
  let cut: (...args: string[]) => ReturnType<typeof spawnSync>
  beforeEach(() => {
    scratch = realpathSync(TH.makeScratchDir('cut-thread-test-'))
    main = path.join(scratch, 'byok')
    const origin = path.join(scratch, 'origin.git')
    const env = isolatedEnv(scratch)
    git = (...args: string[]) => (
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- naming an absolute git would make these tests machine-specific, and the script under test runs the installed git too
      execFileSync('git', ['-C', main, ...args], { encoding: 'utf8', env }).trim()
    )
    cut = (...args: string[]) => spawnSync(Script, ['--no-install', ...args], { cwd: main, encoding: 'utf8', env })
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- as above
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch', 'main', origin], { env })
    mkdirSync(main)
    git('init', '--quiet', '--initial-branch', 'main')
    git('remote', 'add', 'origin', origin)
    writeFileSync(path.join(main, 'README.md'), 'a start\n')
    git('add', '.')
    git('commit', '--quiet', '--message', 'docs: a start')
    git('push', '--quiet', 'origin', 'main')
  })

  it('cuts a worktree beside the main checkout, on a branch named for today, from origin/main', () => {
    const result = cut('deriver_shim')
    const root = path.join(scratch, 'byok-deriver_shim')
    expect(result.status).to.eq(0)
    expect(result.stdout).to.eq(`${root}\n`)
    expect(git('-C', root, 'branch', '--show-current')).to.eq(`${Today}-deriver_shim`)
    expect(git('-C', root, 'rev-parse', 'HEAD')).to.eq(git('rev-parse', 'origin/main'))
  })

  it('points its upstream at its own name on origin, never at the base it was cut from', () => {
    cut('deriver_shim')
    const branch = `${Today}-deriver_shim`
    expect(git('config', `branch.${branch}.remote`)).to.eq('origin')
    expect(git('config', `branch.${branch}.merge`)).to.eq(`refs/heads/${branch}`)
  })

  it('records the SHA it was cut from as the branch\'s sprintbase', () => {
    cut('deriver_shim')
    expect(git('config', `branch.${Today}-deriver_shim.sprintbase`)).to.eq(git('rev-parse', 'origin/main'))
  })

  it('cuts a stacked thread from the base it is given', () => {
    git('switch', '--quiet', '--create', 'vault_split')
    writeFileSync(path.join(main, 'vault.ts'), 'export {}\n')
    git('add', '.')
    git('commit', '--quiet', '--message', 'vault: split')
    const tip = git('rev-parse', 'HEAD')
    git('switch', '--quiet', 'main')
    expect(cut('deriver_shim', 'vault_split').status).to.eq(0)
    const root = path.join(scratch, 'byok-deriver_shim')
    expect(git('-C', root, 'rev-parse', 'HEAD')).to.eq(tip)
    expect(git('config', `branch.${Today}-deriver_shim.sprintbase`)).to.eq(tip)
  })

  it('refuses a label that is not one, a base that names no commit, and a worktree that exists', () => {
    expect(cut('Deriver-Shim').status).to.eq(2)
    expect(cut('deriver_shim', 'no_such_branch').status).to.eq(1)
    mkdirSync(path.join(scratch, 'byok-taken'))
    expect(cut('taken').status).to.eq(1)
    expect(existsSync(path.join(scratch, 'byok-Deriver-Shim'))).to.eq(false)
    expect(git('branch', '--list', `${Today}-*`)).to.eq('')
  })

  it('refuses no arguments, or too many', () => {
    expect(cut().status).to.eq(2)
    expect(cut('one', 'two', 'three').status).to.eq(2)
  })
})
