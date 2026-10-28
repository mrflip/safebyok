import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/clear-ds-store.sh')

// A git that reads no one's own config (no signing, no hooks, no default branch of theirs, no
// global excludes file), and names a fixed author.
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

/** Writes a file at `relpath` under `root`, making its folders */
const plant = (root: string, relpath: string, body = 'finder view settings\n') => {
  const where = path.join(root, relpath)
  mkdirSync(path.dirname(where), { recursive: true })
  writeFileSync(where, body)
  return where
}

describe('scripts/clear-ds-store.sh', () => {
  let scratch: string
  let main: string
  let git: (...args: string[]) => string
  let clear: (cwd?: string) => string
  beforeEach(() => {
    scratch = TH.makeScratchDir('clear-ds-store-test-')
    main = path.join(scratch, 'repo')
    const env = isolatedEnv(scratch)
    git = (...args: string[]) => (
      execFileSync('git', ['-C', main, ...args], { encoding: 'utf8', env }).trim()
    )
    clear = (cwd = main) => execFileSync(Script, [], { cwd, encoding: 'utf8', env })
    mkdirSync(main)
    git('init', '--quiet', '--initial-branch', 'main')
    plant(main, '.gitignore', '.DS_Store\nnode_modules/\n')
    plant(main, 'src/index.ts', 'export {}\n')
    git('add', '.')
    git('commit', '--quiet', '--message', 'docs: a start')
  })

  it('clears the ignored .DS_Store files of the worktree it is run in, at any depth', () => {
    const planted = [plant(main, '.DS_Store'), plant(main, 'src/deep/er/.DS_Store')]
    expect(clear()).to.equal(`Cleared 2 .DS_Store files from ${realpathSync(main)}.\n`)
    expect(planted.filter((where) => existsSync(where))).to.deep.equal([])
    expect(git('status', '--porcelain')).to.equal('')
  })

  it('clears from the top of the worktree when run in a folder inside it', () => {
    const planted = plant(main, '.DS_Store')
    expect(clear(path.join(main, 'src'))).to.equal(`Cleared 1 .DS_Store file from ${realpathSync(main)}.\n`)
    expect(existsSync(planted)).to.equal(false)
  })

  it('leaves alone every other worktree: the main checkout, a sibling, and one nested inside it', () => {
    const linked = path.join(scratch, 'linked')
    const sibling = path.join(scratch, 'sibling')
    git('worktree', 'add', '--quiet', '-b', 'thread', linked)
    git('worktree', 'add', '--quiet', '-b', 'other', sibling)
    const nested = path.join(linked, 'src/nested')
    git('worktree', 'add', '--quiet', '-b', 'inner', nested)
    const inLinked = plant(linked, 'src/.DS_Store')
    const elsewhere = [plant(main, '.DS_Store'), plant(sibling, '.DS_Store'), plant(nested, '.DS_Store')]
    expect(clear(linked)).to.equal(`Cleared 1 .DS_Store file from ${realpathSync(linked)}.\n`)
    expect(existsSync(inLinked)).to.equal(false)
    expect(elsewhere.filter((where) => existsSync(where))).to.deep.equal(elsewhere)
  })

  it('leaves alone a .DS_Store outside the workspace, even one a symlink inside it points to', () => {
    const outside = path.join(scratch, 'outside')
    const beyond = plant(outside, '.DS_Store')
    symlinkSync(outside, path.join(main, 'src/shortcut'))
    expect(clear()).to.equal(`Cleared 0 .DS_Store files from ${realpathSync(main)}.\n`)
    expect(existsSync(beyond)).to.equal(true)
  })

  it('leaves alone anything but an ignored regular file named exactly .DS_Store', () => {
    const lookalike = plant(main, 'src/.DS_Store.bak')
    const folder = path.join(main, 'src/.DS_Store')
    mkdirSync(folder)
    const linkToOne = path.join(main, 'linked.DS_Store')
    symlinkSync(plant(main, 'other/.DS_Store'), linkToOne)
    clear()
    expect(existsSync(lookalike)).to.equal(true)
    expect(existsSync(folder)).to.equal(true)
  })

  it('leaves alone a .DS_Store that git tracks, or does not ignore', () => {
    const tracked = plant(main, 'fixtures/.DS_Store')
    git('add', '--force', 'fixtures/.DS_Store')
    git('commit', '--quiet', '--message', 'tests: a fixture that is a .DS_Store')
    plant(main, 'kept/.gitignore', '!.DS_Store\n')
    const unignored = plant(main, 'kept/.DS_Store')
    expect(clear()).to.equal(`Cleared 0 .DS_Store files from ${realpathSync(main)}.\n`)
    expect(existsSync(tracked)).to.equal(true)
    expect(existsSync(unignored)).to.equal(true)
  })

  it('does not search .git or node_modules', () => {
    const inGit = plant(main, '.git/.DS_Store')
    const inModules = plant(main, 'node_modules/some-package/.DS_Store')
    clear()
    expect(existsSync(inGit)).to.equal(true)
    expect(existsSync(inModules)).to.equal(true)
  })

  it('refuses any argument, and deletes nothing', () => {
    const planted = plant(main, '.DS_Store')
    for (const args of [['--help'], ['/'], ['.']]) {
      const ran = spawnSync(Script, args, { cwd: main, encoding: 'utf8', env: isolatedEnv(scratch) })
      expect(ran.status).to.equal(2)
      expect(ran.stderr).to.include('takes no arguments')
      expect(ran.stdout).to.equal('')
    }
    expect(existsSync(planted)).to.equal(true)
  })

  it('fails outside a git repository, and deletes nothing', () => {
    const outside = plant(path.join(scratch, 'outside'), '.DS_Store')
    const ran = spawnSync(Script, [], { cwd: path.dirname(outside), encoding: 'utf8', env: isolatedEnv(scratch) })
    expect(ran.status).to.equal(1)
    expect(ran.stderr).to.include('not inside a git worktree')
    expect(existsSync(outside)).to.equal(true)
  })
})
