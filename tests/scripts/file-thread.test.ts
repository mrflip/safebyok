import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/file-thread')

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

const Branch = '20261017-deriver_shim'

describe('scripts/file-thread', () => {
  let scratch: string
  let main: string
  let root: string
  let git: (...args: string[]) => string
  let commit: (where: string, filename: string, body: string) => string
  let file: (prove: string) => ReturnType<typeof spawnSync>
  beforeEach(() => {
    scratch = realpathSync(TH.makeScratchDir('file-thread-test-'))
    main = path.join(scratch, 'byok')
    root = path.join(scratch, 'byok-deriver_shim')
    const origin = path.join(scratch, 'origin.git')
    const env = isolatedEnv(scratch)
    git = (...args: string[]) => (
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- naming an absolute git would make these tests machine-specific, and the script under test runs the installed git too
      execFileSync('git', ['-C', main, ...args], { encoding: 'utf8', env }).trim()
    )
    commit = (where: string, filename: string, body: string) => {
      writeFileSync(path.join(where, filename), body)
      git('-C', where, 'add', filename)
      git('-C', where, 'commit', '--quiet', '--message', `docs: ${filename}`)
      return git('-C', where, 'rev-parse', 'HEAD')
    }
    file = (prove: string) => spawnSync(Script, ['--prove', prove, root], { cwd: main, encoding: 'utf8', env })
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- as above
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch', 'main', origin], { env })
    mkdirSync(main)
    git('init', '--quiet', '--initial-branch', 'main')
    git('remote', 'add', 'origin', origin)
    commit(main, 'README.md', 'a start\n')
    git('push', '--quiet', 'origin', 'main')
    git('fetch', '--quiet', 'origin')
  })

  /** Cuts the thread's worktree from `base`, as scripts/cut-thread does, and commits and pushes its work */
  const cutAndBuild = (base: string) => {
    git('worktree', 'add', '--quiet', '--no-track', '-b', Branch, root, base)
    git('config', `branch.${Branch}.sprintbase`, git('rev-parse', base))
    commit(root, 'shim.ts', 'export {}\n')
    git('-C', root, 'push', '--quiet', 'origin', `${Branch}:${Branch}`)
  }

  /** Moves origin/main on by a commit, as another PR's merge does */
  const mainMoves = (filename = 'CHANGELOG.md', body = 'merged meanwhile\n') => {
    const tip = commit(main, filename, body)
    git('push', '--quiet', 'origin', 'main')
    return tip
  }

  it('rebases a thread cut from main onto where main has moved, proves it, pushes it, and removes the worktree', () => {
    cutAndBuild('origin/main')
    const moved = mainMoves()
    const result = file('true')
    expect(result.status, String(result.stderr)).to.eq(0)
    expect(result.stdout).to.include(`${Branch} filed: rebased onto origin/main`)
    expect(git('rev-parse', `origin/${Branch}~1`)).to.eq(moved)
    expect(git('rev-parse', `origin/${Branch}`)).to.eq(git('rev-parse', Branch))
    expect(existsSync(root)).to.eq(false)
    expect(git('config', `branch.${Branch}.sprintbase`)).to.eq(moved)
  })

  it('pushes a thread main has not moved past as it stands', () => {
    cutAndBuild('origin/main')
    const review = commit(root, 'review.ts', 'export {}\n')
    expect(file('true').status).to.eq(0)
    expect(git('rev-parse', `origin/${Branch}`)).to.eq(review)
  })

  it('leaves a stacked thread on the thread it stands on', () => {
    git('switch', '--quiet', '--create', 'vault_split')
    const below = commit(main, 'vault.ts', 'export {}\n')
    git('switch', '--quiet', 'main')
    cutAndBuild('vault_split')
    mainMoves()
    const result = file('true')
    expect(result.status, String(result.stderr)).to.eq(0)
    expect(result.stdout).to.include(`${Branch} filed: as cut`)
    expect(git('rev-parse', `origin/${Branch}~1`)).to.eq(below)
  })

  it('stops on a conflict with main, undoing the rebase and pushing nothing', () => {
    cutAndBuild('origin/main')
    commit(root, 'README.md', 'the thread\'s start\n')
    const tip = git('-C', root, 'rev-parse', 'HEAD')
    git('-C', root, 'push', '--quiet', 'origin', `${Branch}:${Branch}`)
    mainMoves('README.md', 'main\'s start\n')
    const result = file('true')
    expect(result.status).to.eq(3)
    expect(result.stderr).to.include('conflicts with origin/main')
    expect(git('-C', root, 'rev-parse', 'HEAD')).to.eq(tip)
    expect(git('-C', root, 'status', '--porcelain')).to.eq('')
    expect(git('rev-parse', `origin/${Branch}`)).to.eq(tip)
  })

  it('stops when the proof is red, printing its end and pushing nothing', () => {
    cutAndBuild('origin/main')
    const pushed = git('rev-parse', `origin/${Branch}`)
    commit(root, 'review.ts', 'export {}\n')
    const result = file('echo two tests failed; exit 1')
    expect(result.status).to.eq(4)
    expect(result.stderr).to.include('two tests failed')
    expect(git('rev-parse', `origin/${Branch}`)).to.eq(pushed)
    expect(existsSync(root)).to.eq(true)
  })

  it('refuses a worktree with uncommitted changes, or a branch that records no base', () => {
    cutAndBuild('origin/main')
    writeFileSync(path.join(root, 'shim.ts'), 'export const half = 1\n')
    expect(file('true').status).to.eq(1)
    git('-C', root, 'checkout', '--quiet', '--', 'shim.ts')
    git('config', '--unset', `branch.${Branch}.sprintbase`)
    const result = file('true')
    expect(result.status).to.eq(1)
    expect(result.stderr).to.include('records no base')
    expect(existsSync(root)).to.eq(true)
  })

  describe("when git worktree remove fails and leaves its directory behind", () => {
    let stubs: string
    /** Runs the script with a git that does its worktree removal, then, as Finder does, leaves `leftovers` behind and fails */
    const fileWithLeftovers = (leftovers: Record<string, string>, extraEnv: Record<string, string> = {}, prove = 'true') => {
      writeFileSync(path.join(stubs, 'leftovers.json'), JSON.stringify(leftovers))
      return spawnSync(Script, ['--prove', prove, root], {
        cwd: main, encoding: 'utf8',
        env: { ...isolatedEnv(scratch), PATH: `${stubs}${path.delimiter}${process.env['PATH'] ?? ''}`, FILE_THREAD_RETRY_PAUSE: '0', ...extraEnv },
      })
    }
    beforeEach(() => {
      stubs = path.join(scratch, 'stubs')
      mkdirSync(stubs)
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- as above: the stubs wrap whichever git and rm the machine has
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- as above
      const realRm = execFileSync('sh', ['-c', 'command -v rm'], { encoding: 'utf8' }).trim()
      writeFileSync(path.join(stubs, 'git'), [
        '#!/bin/sh',
        'case " $* " in',
        '  *" push "*) if [ -n "$STUB_NOPUSH" ]; then exit 0; fi ;;',
        '  *" worktree remove "*)',
        `    ${realGit} "$@" || exit $?`,
        `    node -e 'const [dir, file] = process.argv.slice(1); const fs = require("fs"), path = require("path"); const bag = JSON.parse(fs.readFileSync(file, "utf8")); for (const [name, body] of Object.entries(bag)) { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), body) }' "${root}" "${stubs}/leftovers.json"`,
        '    echo "error: failed to delete: Directory not empty" >&2',
        '    exit 255 ;;',
        'esac',
        `exec ${realGit} "$@"`,
      ].join('\n'))
      // the first rm of a directory fails, as the second never did in the field
      writeFileSync(path.join(stubs, 'rm'), [
        '#!/bin/sh',
        `case "$*" in *"${root}"*) if [ ! -e "${stubs}/rm-tried" ]; then touch "${stubs}/rm-tried"; exit 1; fi ;; esac`,
        `exec ${realRm} "$@"`,
      ].join('\n'))
      chmodSync(path.join(stubs, 'git'), 0o755)
      chmodSync(path.join(stubs, 'rm'), 0o755)
    })

    it("deletes the leftover directory, retrying, and prunes, when it holds only the tip, a .DS_Store and ignored files", () => {
      writeFileSync(path.join(main, '.gitignore'), 'node_modules\ndist\n')
      git('add', '.gitignore')
      git('commit', '--quiet', '--message', 'docs: ignore')
      git('push', '--quiet', 'origin', 'main')
      git('fetch', '--quiet', 'origin')
      cutAndBuild('origin/main')
      const result = fileWithLeftovers({ 'shim.ts': 'export {}\n', '.DS_Store': 'x', 'src/.DS_Store': 'x', 'node_modules/pkg/index.js': 'x', 'dist/out.js': 'x' })
      expect(result.status, result.stderr).to.eq(0)
      expect(result.stderr).to.include('Directory not empty')
      expect(result.stdout).to.include('its worktree removed, after its removal needed finishing by hand')
      expect(existsSync(root)).to.eq(false)
      expect(existsSync(path.join(stubs, 'rm-tried'))).to.eq(true)
      expect(git('worktree', 'list', '--porcelain')).not.to.include(root)
    })

    it("leaves the directory for a person when it holds a file the tip does not, naming it", () => {
      cutAndBuild('origin/main')
      const result = fileWithLeftovers({ 'shim.ts': 'export {}\n', 'notes/scratch.txt': 'mine' })
      expect(result.status).to.eq(1)
      expect(result.stderr).to.include('notes/scratch.txt')
      expect(result.stderr).to.include('left for a person to inspect')
      expect(existsSync(path.join(root, 'notes/scratch.txt'))).to.eq(true)
    })

    it("leaves the directory for a person when it cannot finish checking what is left, rather than reading that as nothing", () => {
      writeFileSync(path.join(stubs, 'comm'), ['#!/bin/sh', 'exit 2'].join('\n'))
      chmodSync(path.join(stubs, 'comm'), 0o755)
      cutAndBuild('origin/main')
      const result = fileWithLeftovers({ 'shim.ts': 'export {}\n', 'notes/scratch.txt': 'mine' })
      expect(result.status).to.eq(1)
      expect(result.stderr).to.include('could not check what is left')
      expect(existsSync(path.join(root, 'notes/scratch.txt'))).to.eq(true)
    })

    it("leaves the directory for a person when the worktree held uncommitted changes before the removal", () => {
      cutAndBuild('origin/main')
      const result = fileWithLeftovers({ 'shim.ts': 'export {}\n' }, {}, 'echo changed > shim.ts')
      expect(result.status).to.eq(1)
      expect(result.stderr).to.include('held uncommitted changes')
      expect(existsSync(root)).to.eq(true)
    })

    it("leaves the directory for a person when git refused the removal outright and still lists the worktree", () => {
      cutAndBuild('origin/main')
      git('worktree', 'lock', root)
      const result = fileWithLeftovers({})
      expect(result.status).to.eq(1)
      expect(result.stderr).to.include('still lists it as a worktree')
      expect(existsSync(path.join(root, 'shim.ts'))).to.eq(true)
    })

    it("leaves the directory for a person when origin's branch is not at the tip", () => {
      cutAndBuild('origin/main')
      commit(root, 'review.ts', 'export {}\n')
      const result = fileWithLeftovers({ 'shim.ts': 'export {}\n' }, { STUB_NOPUSH: '1' })
      expect(result.status).to.eq(1)
      expect(result.stderr).to.include('is not at')
      expect(existsSync(root)).to.eq(true)
    })
  })

  it('refuses the main checkout', () => {

    const result = spawnSync(Script, ['--prove', 'true', main], { cwd: main, encoding: 'utf8', env: isolatedEnv(scratch) })
    expect(result.status).to.eq(1)
    expect(result.stderr).to.include('is the main checkout')
  })
})
