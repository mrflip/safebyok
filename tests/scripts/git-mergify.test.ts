import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/git-mergify')

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

interface PrRowT {
  number: number
  branch: string
  draft?:  boolean
  labels?: string
  title?:  string
}

interface WorldT {
  git:    (...args: string[]) => string
  /** Commits one file on the branch checked out, returns the commit's hash */
  commit: (filename: string, subject: string) => string
  /** Cuts a branch from a ref and checks it out */
  branch: (name: string, from: string) => void
  /** Pushes a branch to origin, and says which branches the stub gh lists as pull requests */
  open:   (rows: PrRowT[]) => void
  /** Runs the script with the stub gh first on PATH */
  run:    (...args: string[]) => { status: number | null, stdout: string, stderr: string }
  /** The pull request numbers the stub gh was asked to label, in order */
  labeled: () => string[]
}

// A clone of an origin, and a stub `gh` that lists the rows it is given and logs each label asked for.
const makeWorld = (scratch: string): WorldT => {
  const env = isolatedEnv(scratch)
  const origin = path.join(scratch, 'origin.git')
  const where = path.join(scratch, 'clone')
  const bin = path.join(scratch, 'bin')
  const rowsFile = path.join(scratch, 'rows.tsv')
  const logFile = path.join(scratch, 'labeled.log')
  const git = (...args: string[]) => execFileSync('git', ['-C', where, ...args], { encoding: 'utf8', env }).trim()
  mkdirSync(origin)
  execFileSync('git', ['-C', origin, 'init', '--quiet', '--bare', '--initial-branch', 'main'], { env })
  mkdirSync(where)
  git('init', '--quiet', '--initial-branch', 'main')
  git('remote', 'add', 'origin', origin)
  mkdirSync(bin)
  writeFileSync(path.join(bin, 'gh'), [
    '#!/usr/bin/env bash',
    'if [[ "$1 $2" == "pr list" ]]; then cat "$GH_STUB_ROWS"; exit 0; fi',
    'if [[ "$1 $2" == "pr edit" ]]; then echo "$3 $4 $5" >> "$GH_STUB_LOG"; exit 0; fi',
    'echo "stub gh: unexpected $*" >&2; exit 1',
  ].join('\n') + '\n')
  chmodSync(path.join(bin, 'gh'), 0o755)
  writeFileSync(rowsFile, '')
  writeFileSync(logFile, '')

  const commit = (filename: string, subject: string) => {
    writeFileSync(path.join(where, filename), `${subject}\n`)
    git('add', filename)
    git('commit', '--quiet', '--message', subject)
    return git('rev-parse', 'HEAD')
  }
  const branch = (branchlabel: string, from: string) => git('switch', '--quiet', '--create', branchlabel, from)
  const open = (rows: PrRowT[]) => {
    git('push', '--quiet', 'origin', '--all')
    const tsv = rows.map(({ number, branch: branchlabel, draft = false, labels = '', title = `title of ${String(number)}` }) => (
      [number, git('rev-parse', branchlabel), draft, `,${labels},`, title].join('\t')
    ))
    writeFileSync(rowsFile, tsv.join('\n') + '\n')
  }
  const run = (...args: string[]) => {
    const got = spawnSync(Script, args, {
      cwd: where, encoding: 'utf8',
      env: { ...env, PATH: [bin, process.env['PATH'] ?? ''].join(':'), GH_STUB_ROWS: rowsFile, GH_STUB_LOG: logFile, GIT_MERGIFY_PAUSE: '0' },
    })
    return { status: got.status, stdout: got.stdout, stderr: got.stderr }
  }
  const labeled = () => readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => line.split(' ', 1)[0] ?? '')
  return { git, commit, branch, open, run, labeled }
}

/** main, and a stack of three on it: `low` under `mid` under `top`. */
const seedStack = (world: WorldT) => {
  world.commit('readme.md', 'docs: a readme')
  world.branch('low', 'main')
  world.commit('low.md', 'api: low')
  world.branch('mid', 'low')
  world.commit('mid.md', 'api: mid one')
  world.commit('mid2.md', 'api: mid two')
  world.branch('top', 'mid')
  world.commit('top.md', 'api: top')
}

describe('scripts/git-mergify', () => {
  let scratch: string
  let world: WorldT
  beforeEach(() => {
    scratch = TH.makeScratchDir('git-mergify-test-')
    world = makeWorld(scratch)
  })

  it('names the stack bottom first whatever the pull requests\' numbers, and labels nothing without --apply', () => {
    seedStack(world)
    world.open([{ number: 9, branch: 'top' }, { number: 12, branch: 'low' }, { number: 3, branch: 'mid' }])
    const got = world.run()
    expect(got.status).to.equal(0)
    expect(got.stdout).to.match(/^Stack, bottom first:\n {2}#12 {2}title of 12\n {2}#3 {2}title of 3\n {2}#9 {2}title of 9\n/)
    expect(got.stdout).to.include('Nothing was labeled: --apply labels them queue, in that order.')
    expect(world.labeled()).to.deep.equal([])
  })

  it('with --apply, labels each pull request in the stack\'s order', () => {
    seedStack(world)
    world.open([{ number: 9, branch: 'top' }, { number: 12, branch: 'low' }, { number: 3, branch: 'mid' }])
    const got = world.run('--apply')
    expect(got.status).to.equal(0)
    expect(got.stdout).to.include('labeled #12\nlabeled #3\nlabeled #9\n')
    expect(world.labeled()).to.deep.equal(['12', '3', '9'])
  })

  it('refuses pull requests that are not one line, naming the pair, and labels none even with --apply', () => {
    seedStack(world)
    world.branch('beside', 'main')
    world.commit('beside.md', 'api: beside')
    world.open([{ number: 1, branch: 'low' }, { number: 2, branch: 'beside' }, { number: 3, branch: 'mid' }])
    const got = world.run('--apply')
    expect(got.status).to.equal(3)
    expect(got.stderr).to.match(/not one line: #\d+ is not under #\d+/)
    expect(got.stderr).to.include('Nothing was labeled.')
    expect(world.labeled()).to.deep.equal([])
  })

  it('refuses a stack whose lower branch was rebased after the one above was cut', () => {
    seedStack(world)
    world.git('switch', '--quiet', 'low')
    world.git('commit', '--quiet', '--amend', '--message', 'api: low, reworded')
    world.open([{ number: 1, branch: 'low' }, { number: 2, branch: 'mid' }])
    expect(world.run().status).to.equal(3)
  })

  it('leaves out a draft, a pull request already labeled queue, and one whose head main holds', () => {
    seedStack(world)
    world.branch('landed', 'main')
    world.commit('landed.md', 'api: landed')
    world.git('switch', '--quiet', 'main')
    world.git('merge', '--quiet', '--ff-only', 'landed')
    world.git('push', '--quiet', 'origin', 'main')
    world.open([
      { number: 1, branch: 'low', labels: 'queue' },
      { number: 2, branch: 'mid' },
      { number: 3, branch: 'top', draft: true },
      { number: 4, branch: 'landed' },
    ])
    const got = world.run()
    expect(got.status).to.equal(0)
    expect(got.stdout).to.include('Stack, bottom first:\n  #2  title of 2\n')
    expect(got.stdout).to.include('  #1 is already labeled queue\n')
    expect(got.stdout).to.include('  #3 is a draft\n')
    expect(got.stdout).to.include('  #4\'s head is already in main\n')
  })

  it('takes only the numbers it is given, and refuses one that is not open', () => {
    seedStack(world)
    world.open([{ number: 1, branch: 'low' }, { number: 2, branch: 'mid' }, { number: 3, branch: 'top' }])
    const got = world.run('--apply', '2', '1')
    expect(got.status).to.equal(0)
    expect(world.labeled()).to.deep.equal(['1', '2'])
    const missing = world.run('--apply', '77')
    expect(missing.status).to.equal(1)
    expect(missing.stderr).to.include('#77 is not an open pull request against main')
  })

  it('takes the numbers out of a pasted stack line, as one argument or many, in whatever order', () => {
    seedStack(world)
    world.open([{ number: 512, branch: 'top' }, { number: 518, branch: 'low' }, { number: 529, branch: 'mid' }])
    const line = 'Stacked as main -> #518 -> [#529](https://example.com/o/r/pull/529) -> #512 (this PR)'
    expect(world.run('--apply', line).status).to.equal(0)
    expect(world.labeled()).to.deep.equal(['518', '529', '512'])
    expect(world.run(...line.split(' ')).stdout).to.match(/^Stack, bottom first:\n {2}#518 /)
  })

  it('says so when there is nothing to queue', () => {
    seedStack(world)
    world.open([{ number: 1, branch: 'low', draft: true }])
    const got = world.run('--apply')
    expect(got.status).to.equal(0)
    expect(got.stdout).to.include('  #1 is a draft\n')
    expect(got.stdout).to.include('No pull request to queue.')
    expect(world.labeled()).to.deep.equal([])
  })

  it('refuses arguments it does not understand', () => {
    expect(world.run('--hurry').status).to.equal(2)
    expect(world.run('seven').status).to.equal(2)
    expect(world.run('Stacked', 'as', 'main').status).to.equal(2)
    expect(world.run('--base').status).to.equal(2)
  })
})
