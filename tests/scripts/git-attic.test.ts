import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/git-attic')

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

interface RepoT {
  where: string
  git:   (...args: string[]) => string
  /** Commits one file holding `body`, under the subject given; returns the commit's hash */
  commit: (filename: string, body: string, subject: string) => string
  /** Runs the script there, never asking GitHub; returns what it printed */
  attic: (...args: string[]) => string
  branches: () => string[]
  tags: () => string[]
}

const makeRepo = (scratch: string): RepoT => {
  const where = path.join(scratch, 'repo')
  const env = isolatedEnv(scratch)
  const git = (...args: string[]) => (
    execFileSync('git', ['-C', where, ...args], { encoding: 'utf8', env }).trim()
  )
  mkdirSync(where)
  git('init', '--quiet', '--initial-branch', 'main')
  const commit = (filename: string, body: string, subject: string) => {
    writeFileSync(path.join(where, filename), body)
    git('add', filename)
    git('commit', '--quiet', '--message', subject)
    return git('rev-parse', 'HEAD')
  }
  const attic = (...args: string[]) => execFileSync(Script, ['--no-prs', ...args], { cwd: where, encoding: 'utf8', env })
  const branches = () => git('for-each-ref', '--format=%(refname:short)', 'refs/heads/').split('\n').filter(Boolean)
  const tags = () => git('tag').split('\n').filter(Boolean)
  return { where, git, commit, attic, branches, tags }
}

/**
 * main, with a branch of each kind beside it:
 * - `landed`, merged into main with a merge commit: in history;
 * - `rebased`, whose one commit main took as the same change under another hash;
 * - `drafted`, whose commit main took reworked, under the same subject;
 * - `stray`, holding a commit main has nothing like.
 */
const seedKinds = (repo: RepoT) => {
  repo.commit('readme.md', 'hello\n', 'docs: a readme')
  const root = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '--quiet', '--create', 'landed')
  repo.commit('landed.md', 'landed\n', 'feat: landed')
  repo.git('switch', '--quiet', 'main')
  repo.git('merge', '--quiet', '--no-ff', '--message', 'Merge landed', 'landed')
  repo.git('switch', '--quiet', '--create', 'rebased', root)
  const rebasedTip = repo.commit('rebased.md', 'rebased\n', 'feat: rebased')
  repo.git('switch', '--quiet', '--create', 'drafted', root)
  const draftedTip = repo.commit('drafted.md', 'a first draft\n', 'feat: drafted')
  repo.git('switch', '--quiet', '--create', 'stray', root)
  const strayTip = repo.commit('stray.md', 'stray\n', 'feat: nobody took this')
  repo.git('switch', '--quiet', 'main')
  repo.git('cherry-pick', rebasedTip)
  repo.commit('drafted.md', 'the version that landed\n', 'feat: drafted')
  return { rebasedTip, draftedTip, strayTip }
}

describe('scripts/git-attic', () => {
  let scratch: string
  let repo: RepoT
  beforeEach(() => {
    scratch = TH.makeScratchDir('git-attic-test-')
    repo = makeRepo(scratch)
  })

  it('reports each kind of branch, and without --apply changes nothing', () => {
    seedKinds(repo)
    const said = repo.attic()
    expect(said).to.match(/would retire {2}drafted -> attic\/drafted\n/)
    expect(said).to.match(/would retire {2}rebased -> attic\/rebased\n/)
    expect(said).to.match(/unmerged {6}stray: 1 commit with no match\n {4}\w+ feat: nobody took this\n/)
    expect(said).not.to.include('landed')
    expect(said).to.include('2 branches in the history of HEAD, left alone; 2 to retire, 1 unmerged, 0 checked out.')
    expect(said).to.include('Nothing was changed: --apply retires them.')
    expect(repo.branches()).to.deep.equal(['drafted', 'landed', 'main', 'rebased', 'stray'])
    expect(repo.tags()).to.deep.equal([])
  })

  it('with --apply, retires each merged branch to a tag at its tip', () => {
    const { rebasedTip, draftedTip } = seedKinds(repo)
    const said = repo.attic('--apply')
    expect(said).to.include('retired  rebased -> attic/rebased')
    expect(said).to.include("The tags are local: git push origin 'refs/tags/attic/*' publishes them.")
    expect(repo.branches()).to.deep.equal(['landed', 'main', 'stray'])
    expect(repo.tags()).to.deep.equal(['attic/drafted', 'attic/rebased'])
    expect(repo.git('rev-list', '--max-count=1', 'attic/rebased')).to.equal(rebasedTip)
    expect(repo.git('rev-list', '--max-count=1', 'attic/drafted')).to.equal(draftedTip)
  })

  it('writes a tag message saying what the branch was, and how its commits matched', () => {
    seedKinds(repo)
    repo.attic('--apply')
    const rebased = repo.git('tag', '--list', '--format=%(contents)', 'attic/rebased')
    expect(rebased).to.match(/^Branch rebased, retired \d{4}-\d\d-\d\d by scripts\/git-attic\.\n/)
    expect(rebased).to.match(/\nTip: \w+ \d{4}-\d\d-\d\d feat: rebased\n/)
    expect(rebased).to.match(/\n1 commit off the history of HEAD \(\w+\): 1 the same change as one there, 0 under the subject of one there\.$/m)
    expect(rebased).not.to.include('Pull request')
    expect(rebased).not.to.include('Matched by subject')
    const drafted = repo.git('tag', '--list', '--format=%(contents)', 'attic/drafted')
    expect(drafted).to.include('0 the same change as one there, 1 under the subject of one there.')
    expect(drafted).to.match(/\nMatched by subject:\n {2}\w+ feat: drafted$/m)
  })

  it('retires an unmerged branch named with --retire, and says it was not merged', () => {
    const { strayTip } = seedKinds(repo)
    const said = repo.attic('--apply', '--retire', 'stray')
    expect(said).to.include('retired  stray -> attic/stray; not merged')
    expect(repo.branches()).to.deep.equal(['landed', 'main'])
    expect(repo.git('rev-list', '--max-count=1', 'attic/stray')).to.equal(strayTip)
    const message = repo.git('tag', '--list', '--format=%(contents)', 'attic/stray')
    expect(message).to.include('\nNot merged: let go by hand (--retire).\n')
    expect(message).to.match(/\nMatched nothing:\n {2}\w+ feat: nobody took this/)
  })

  it('only deletes the branch when its tag is already there, as fetched from a checkout that retired it first', () => {
    const { rebasedTip } = seedKinds(repo)
    repo.git('tag', '--annotate', '--message', 'retired elsewhere', 'attic/rebased', rebasedTip)
    const said = repo.attic('--apply')
    expect(said).to.include('retired  rebased -> attic/rebased, which already exists')
    expect(repo.branches()).not.to.include('rebased')
    expect(repo.git('tag', '--list', '--format=%(contents)', 'attic/rebased')).to.equal('retired elsewhere')
  })

  it('names the tag by its hash when attic/<branch> already holds another commit', () => {
    const { rebasedTip } = seedKinds(repo)
    repo.git('tag', 'attic/rebased', 'main')
    repo.attic('--apply')
    const hashed = `attic/rebased-${repo.git('rev-parse', '--short', rebasedTip)}`
    expect(repo.tags()).to.include(hashed)
    expect(repo.git('rev-list', '--max-count=1', hashed)).to.equal(rebasedTip)
  })

  it('leaves alone a merged branch that a worktree holds', () => {
    seedKinds(repo)
    repo.git('worktree', 'add', '--quiet', path.join(scratch, 'elsewhere'), 'rebased')
    const said = repo.attic('--apply')
    expect(said).to.include('checked out   rebased: left alone, as a worktree holds it')
    expect(repo.branches()).to.include('rebased')
    expect(repo.tags()).not.to.include('attic/rebased')
  })

  it('judges by --against, and never retires the branch it stands on', () => {
    seedKinds(repo)
    repo.git('switch', '--quiet', 'rebased')
    const said = repo.attic('--apply', '--against', 'main')
    expect(said).to.include('checked out   rebased: left alone, as a worktree holds it')
    expect(said).to.include('in the history of main')
    expect(repo.branches()).to.deep.equal(['landed', 'main', 'rebased', 'stray'])
  })

  it('reports nothing to retire in a repository of one branch', () => {
    repo.commit('readme.md', 'hello\n', 'docs: a readme')
    expect(repo.attic()).to.equal('\n1 branch in the history of HEAD, left alone; 0 to retire, 0 unmerged, 0 checked out.\n')
  })

  it('prints its section of notes/housekeeping.md for --help, and no further', () => {
    const said = execFileSync(Script, ['--help'], { encoding: 'utf8' })
    expect(said).to.match(/^## Retiring stray branches\n/)
    expect(said).to.include('scripts/git-attic [--apply]')
    expect(said).not.to.include('## Stale worktrees')
  })

  const RefusalCases: [string[], number, RegExp, string][] = [
    [['--bogus'],                     2, /no such option: --bogus\nUsage: /,           'an unknown option is refused with the usage'],
    [['--against'],                   2, /--against needs a ref/,                    'an option missing its value is refused with the usage'],
    [['--against', 'nowhere'],        1, /no such commit: nowhere/,                  'a ref that names nothing fails'],
    [['--retire', 'nobody'],          1, /--retire names no local branch: nobody/,   'retiring a branch that is not there fails'],
  ]
  for (const [args, status, complaint, blurb] of RefusalCases) {
    it(blurb, () => {
      repo.commit('readme.md', 'hello\n', 'docs: a readme')
      const ran = spawnSync(Script, args, { cwd: repo.where, encoding: 'utf8', env: isolatedEnv(scratch) })
      expect(ran.status).to.equal(status)
      expect(ran.stderr).to.match(complaint)
      expect(ran.stdout).to.equal('')
    })
  }

  it('fails outside a git repository', () => {
    const ran = spawnSync(Script, [], { cwd: scratch, encoding: 'utf8', env: isolatedEnv(scratch) })
    expect(ran.status).to.equal(1)
    expect(ran.stderr).to.include('not inside a git repository')
  })
})
