import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/git-survey.sh')

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
  /** Runs the script there against main, never fetching, with the pull requests given; returns what it printed */
  survey: (...args: string[]) => string
  /** Writes the pull requests the script reads, one `[number, state, head, sha, base]` each */
  setPrs: (prs: [number, string, string, string, string][]) => void
  tipOf: (ref: string) => string
  tags:  () => string[]
}

const makeRepo = (scratch: string): RepoT => {
  const where = path.join(scratch, 'repo')
  const prsFile = path.join(scratch, 'prs.tsv')
  const env = isolatedEnv(scratch)
  const git = (...args: string[]) => (
    execFileSync('git', ['-C', where, ...args], { encoding: 'utf8', env }).trim()
  )
  mkdirSync(where)
  git('init', '--quiet', '--initial-branch', 'main')
  writeFileSync(prsFile, '')
  const commit = (filename: string, body: string, subject: string) => {
    writeFileSync(path.join(where, filename), body)
    git('add', filename)
    git('commit', '--quiet', '--message', subject)
    return git('rev-parse', 'HEAD')
  }
  const survey = (...args: string[]) => execFileSync(
    Script, ['--no-fetch', '--against', 'main', '--prs-from', prsFile, ...args], { cwd: where, encoding: 'utf8', env },
  )
  const setPrs = (prs: [number, string, string, string, string][]) => {
    writeFileSync(prsFile, prs.map((pr) => `${pr.join('\t')}\n`).join(''))
  }
  const tipOf = (ref: string) => git('rev-parse', `${ref}^0`)
  const tags = () => git('tag').split('\n').filter(Boolean)
  return { where, git, commit, survey, setPrs, tipOf, tags }
}

const short = (sha: string) => sha.slice(0, 7)

/** The rows the script printed for branches and worktrees, by their second column */
const rowsOf = (said: string) => new Map(
  said.split('\n').filter((line) => line.includes('\t')).map((line) => {
    const [verdict = '', subject = '', ...rest] = line.split('\t')
    return [subject, { verdict, rest }] as const
  }),
)

/**
 * main, with a branch of each kind beside it, and the pull requests they were:
 * - `landed`, merged with a merge commit: its tip is its PR's head;
 * - `rebased`, whose PR merged a copy of its one commit under another hash;
 * - `drafted`, whose PR merged a reworked commit under the same subject;
 * - `extra`, merged, then given a commit nobody took;
 * - `opened`, with its PR still open;
 * - `abandoned`, its PR closed unmerged;
 * - `elsewhere`, its PR merged into another branch;
 * - `stray`, with no PR, though main took its one commit.
 */
const seedKinds = (repo: RepoT) => {
  const root = repo.commit('readme.md', 'hello\n', 'docs: a readme')
  const tipOn = (branch: string, filename: string, body: string, subject: string) => {
    repo.git('switch', '--quiet', '--create', branch, root)
    return repo.commit(filename, body, subject)
  }
  const landedTip = tipOn('landed', 'landed.md', 'landed\n', 'feat: landed')
  const rebasedTip = tipOn('rebased', 'rebased.md', 'rebased\n', 'feat: rebased')
  const draftedTip = tipOn('drafted', 'drafted.md', 'a first draft\n', 'feat: drafted')
  const openedTip = tipOn('opened', 'opened.md', 'opened\n', 'feat: still underway')
  const abandonedTip = tipOn('abandoned', 'abandoned.md', 'abandoned\n', 'feat: abandoned')
  const elsewhereTip = tipOn('elsewhere', 'elsewhere.md', 'elsewhere\n', 'feat: elsewhere')
  const strayTip = tipOn('stray', 'stray.md', 'stray\n', 'feat: stray')
  const extraHead = tipOn('extra', 'extra.md', 'extra\n', 'feat: extra')
  repo.commit('extra-more.md', 'more\n', 'feat: nobody took this')
  repo.git('switch', '--quiet', 'main')
  repo.git('merge', '--quiet', '--no-ff', '--message', 'Merge landed', 'landed')
  repo.git('cherry-pick', rebasedTip)
  const rebasedHead = repo.tipOf('main')
  const draftedHead = repo.commit('drafted.md', 'the version that landed\n', 'feat: drafted')
  repo.git('merge', '--quiet', '--no-ff', '--message', 'Merge extra', extraHead)
  repo.git('cherry-pick', strayTip)
  repo.setPrs([
    [1, 'MERGED', 'landed', landedTip, 'main'],
    [2, 'MERGED', 'rebased', rebasedHead, 'main'],
    [3, 'MERGED', 'drafted', draftedHead, 'main'],
    [4, 'MERGED', 'extra', extraHead, 'main'],
    [5, 'OPEN', 'opened', openedTip, 'main'],
    [6, 'CLOSED', 'abandoned', abandonedTip, 'main'],
    [7, 'MERGED', 'elsewhere', elsewhereTip, 'landed'],
  ])
  return { landedTip, rebasedTip, rebasedHead, draftedTip, draftedHead, extraHead }
}

/** A worktree of `branch`, its directory then removed from under git, as when a checkout cannot see the path another container made it at. */
const strand = (repo: RepoT, scratch: string, branch: string) => {
  const tree = path.join(scratch, `wt-${branch}`)
  repo.git('worktree', 'add', '--quiet', tree, branch)
  rmSync(tree, { recursive: true })
  return tree
}

describe('scripts/git-survey.sh', () => {
  let scratch: string
  let repo: RepoT
  beforeEach(() => {
    scratch = TH.makeScratchDir('git-survey-test-')
    repo = makeRepo(scratch)
  })

  it('reports each kind of branch, and without --apply changes nothing', () => {
    const { landedTip, rebasedTip, rebasedHead } = seedKinds(repo)
    const before = repo.git('for-each-ref')
    const rows = rowsOf(repo.survey('--idle', '0'))
    expect(rows.get('landed')).to.deep.equal({ verdict: 'close', rest: ['#1', `tag closed/landed at ${short(landedTip)}; on its merged head`] })
    expect(rows.get('rebased')).to.deep.equal({
      verdict: 'close',
      rest:    ['#2', `tag closed/rebased at ${short(rebasedTip)}, move the branch to ${short(rebasedHead)}; rewritten: 1 commit past its merged head, each matching one on main`],
    })
    expect(rows.get('drafted')?.verdict).to.equal('close')
    expect(rows.get('extra')?.verdict).to.equal('weird')
    expect(rows.get('extra')?.rest[1]).to.match(/^1 commit with no match on main, newest first: \w+ feat: nobody took this$/)
    expect(rows.get('opened')).to.deep.equal({ verdict: 'active', rest: ['#5', 'open'] })
    expect(rows.get('abandoned')).to.deep.equal({ verdict: 'weird', rest: ['-', 'no PR merged into main: #6 closed into main'] })
    expect(rows.get('elsewhere')).to.deep.equal({ verdict: 'weird', rest: ['-', 'no PR merged into main: #7 merged into landed'] })
    expect(rows.get('stray')).to.deep.equal({ verdict: 'stray', rest: ['-', 'no PR; every commit is on main, so scripts/git-attic would retire it'] })
    expect(rows.has('main')).to.equal(false)
    expect(repo.git('for-each-ref')).to.equal(before)
  })

  it('says how many it found, and that nothing was changed', () => {
    seedKinds(repo)
    const said = repo.survey('--idle', '0')
    expect(said).to.include('\n3 to close, 0 closed already, 1 active, 1 stray, 3 weird; 0 worktrees to remove, 0 kept.\n')
    expect(said).to.include('Nothing was changed: --apply sweeps them.')
  })

  it('counts a branch with no PR, moved within --idle minutes, as active', () => {
    seedKinds(repo)
    expect(rowsOf(repo.survey()).get('stray')).to.deep.equal({ verdict: 'active', rest: ['-', 'no PR yet'] })
  })

  it('counts many commits with no match on main and names the newest three, then goes on to the next branch', () => {
    seedKinds(repo)
    repo.git('switch', '--quiet', 'extra')
    for (const nth of ['2', '3', '4', '5', '6']) { repo.commit(`extra-${nth}.md`, 'more\n', `feat: nobody took this either, ${nth}`) }
    const rows = rowsOf(repo.survey('--idle', '0'))
    expect(rows.get('extra')?.rest[1]).to.match(
      /^6 commits with no match on main, newest first: \w+ feat: nobody took this either, 6;\w+ feat: nobody took this either, 5;\w+ feat: nobody took this either, 4$/,
    )
    expect(rows.get('landed')?.verdict).to.equal('close')
  })

  it('notes an open PR whose head is not the local tip', () => {
    seedKinds(repo)
    repo.git('switch', '--quiet', 'opened')
    repo.commit('opened-more.md', 'more\n', 'feat: not pushed yet')
    expect(rowsOf(repo.survey()).get('opened')?.rest[1]).to.match(/^open; the PR's head is \w{7}$/)
  })

  it('with --apply, tags each finished branch at its tip and points it at its merged head', () => {
    const { landedTip, rebasedTip, rebasedHead, draftedTip, draftedHead, extraHead } = seedKinds(repo)
    const said = repo.survey('--apply', '--idle', '0')
    expect(rowsOf(said).get('rebased')?.verdict).to.equal('closed')
    expect(repo.tags()).to.deep.equal(['closed/drafted', 'closed/landed', 'closed/rebased'])
    expect(repo.tipOf('closed/landed')).to.equal(landedTip)
    expect(repo.tipOf('closed/rebased')).to.equal(rebasedTip)
    expect(repo.tipOf('closed/drafted')).to.equal(draftedTip)
    expect(repo.tipOf('landed')).to.equal(landedTip)
    expect(repo.tipOf('rebased')).to.equal(rebasedHead)
    expect(repo.tipOf('drafted')).to.equal(draftedHead)
    expect(repo.tipOf('extra')).not.to.equal(extraHead)
    expect(said).to.include('\n3 closed, 0 closed already, 1 active, 1 stray, 3 weird; 0 worktrees removed, 0 kept.\n')
    expect(said).to.include("The tags are local: git push origin 'refs/tags/closed/*' publishes them.")
  })

  it('writes a tag message saying what the branch was and where it now points', () => {
    seedKinds(repo)
    repo.survey('--apply', '--idle', '0')
    const message = repo.git('tag', '--list', '--format=%(contents)', 'closed/rebased')
    expect(message).to.match(/^Branch rebased, closed \d{4}-\d\d-\d\d by scripts\/git-survey\.sh\.\n/)
    expect(message).to.include('\nPull request: #2, merged.\n')
    expect(message).to.match(/\nTip: \w+ \d{4}-\d\d-\d\d feat: rebased\n/)
    expect(message).to.match(/\nPointed at the PR's merged head: \w+ feat: rebased$/)
  })

  it('finds nothing more to do on a second run', () => {
    seedKinds(repo)
    repo.survey('--apply', '--idle', '0')
    const rows = rowsOf(repo.survey('--idle', '0'))
    expect(rows.get('rebased')).to.deep.equal({ verdict: 'done', rest: ['#2', 'closed already'] })
    expect(rows.get('landed')?.verdict).to.equal('done')
  })

  it('reuses a closed/ tag already at the tip, and still moves the branch', () => {
    const { rebasedTip, rebasedHead } = seedKinds(repo)
    repo.git('tag', '--annotate', '--message', 'closed elsewhere', 'closed/rebased', rebasedTip)
    const said = repo.survey('--apply', '--idle', '0')
    expect(rowsOf(said).get('rebased')?.rest[1]).to.match(/^closed\/rebased is already at \w{7}, move the branch to \w{7}; /)
    expect(repo.tipOf('rebased')).to.equal(rebasedHead)
    expect(repo.git('tag', '--list', '--format=%(contents)', 'closed/rebased')).to.equal('closed elsewhere')
  })

  it('never moves a closed/ tag that names another commit, unless --retag names its branch', () => {
    const { rebasedTip, rebasedHead } = seedKinds(repo)
    const root = repo.tipOf('main~5')
    repo.git('tag', 'closed/rebased', root)
    const rows = rowsOf(repo.survey('--apply', '--idle', '0'))
    expect(rows.get('rebased')?.verdict).to.equal('weird')
    expect(rows.get('rebased')?.rest[1]).to.match(/^closed\/rebased already names \w{7}, .*--retag rebased moves the tag$/)
    expect(repo.tipOf('closed/rebased')).to.equal(root)
    expect(repo.tipOf('rebased')).to.equal(rebasedTip)

    repo.survey('--apply', '--idle', '0', '--retag', 'rebased')
    expect(repo.tipOf('closed/rebased')).to.equal(rebasedTip)
    expect(repo.tipOf('rebased')).to.equal(rebasedHead)
  })

  it('counts a branch on its merged head with a closed/ tag elsewhere as closed already', () => {
    const { landedTip } = seedKinds(repo)
    repo.git('tag', 'closed/landed', 'main')
    expect(rowsOf(repo.survey('--idle', '0')).get('landed')?.verdict).to.equal('done')
    expect(repo.tipOf('closed/landed')).not.to.equal(landedTip)
  })

  it('removes the clean, idle worktree of a finished branch, then moves the branch', () => {
    const { rebasedHead } = seedKinds(repo)
    const tree = path.join(scratch, 'wt-rebased')
    repo.git('worktree', 'add', '--quiet', tree, 'rebased')
    const said = repo.survey('--apply', '--idle', '0')
    expect(said).to.match(/\nremoved\t[^\t]*wt-rebased\trebased\tits branch is finished; clean and idle\n/)
    expect(repo.git('worktree', 'list')).not.to.include('wt-rebased')
    expect(repo.tipOf('rebased')).to.equal(rebasedHead)
  })

  it('keeps a worktree holding work, and tags its branch without moving it', () => {
    const { rebasedTip } = seedKinds(repo)
    const tree = path.join(scratch, 'wt-rebased')
    repo.git('worktree', 'add', '--quiet', tree, 'rebased')
    writeFileSync(path.join(tree, 'notes.md'), 'half a thought\n')
    const said = repo.survey('--apply', '--idle', '0')
    expect(said).to.match(/\nkeep\t[^\t]*wt-rebased\trebased\tits branch is finished, but: 1 uncommitted or untracked path\n/)
    expect(rowsOf(said).get('rebased')?.verdict).to.equal('weird')
    expect(rowsOf(said).get('rebased')?.rest[1]).to.match(/holds it .*; tagged closed\/rebased, and is not moved$/)
    expect(repo.tipOf('closed/rebased')).to.equal(rebasedTip)
    expect(repo.tipOf('rebased')).to.equal(rebasedTip)
  })

  it('keeps a worktree with files touched within --idle minutes', () => {
    seedKinds(repo)
    repo.git('worktree', 'add', '--quiet', path.join(scratch, 'wt-rebased'), 'rebased')
    expect(repo.survey('--idle', '30')).to.match(/\nkeep\t[^\t]*wt-rebased\trebased\tits branch is finished, but: files touched in the last 30 minutes\n/)
  })

  it('keeps the worktree of a branch that is not finished', () => {
    seedKinds(repo)
    repo.git('worktree', 'add', '--quiet', path.join(scratch, 'wt-opened'), 'opened')
    expect(repo.survey('--apply', '--idle', '0')).to.match(/\nkeep\t[^\t]*wt-opened\topened\tits branch is active\n/)
  })

  describe('a worktree whose directory is missing', () => {
    it('is pruned when its branch is finished', () => {
      seedKinds(repo)
      strand(repo, scratch, 'landed')
      const said = repo.survey('--apply', '--idle', '0')
      expect(said).to.match(/\npruned\tRemoving worktrees\/wt-landed/)
      expect(repo.git('worktree', 'prune', '--dry-run', '--verbose')).to.equal('')
    })

    it('is left registered, and says why, when its branch has an open PR', () => {
      seedKinds(repo)
      strand(repo, scratch, 'opened')
      const said = repo.survey('--apply', '--idle', '0')
      expect(said).to.match(/\nkeep\t[^\t]*wt-opened\topened\tits directory is missing, but its branch has an open PR \(#5\): no worktree is pruned while it stands\n/)
      expect(said).to.match(/\nheld\tgit worktree prune\t-\tnot run: /)
      expect(repo.git('worktree', 'list')).to.include('wt-opened')
    })

    it('holds back every prune, a finished branch\'s entry too, while one branch holds work', () => {
      seedKinds(repo)
      strand(repo, scratch, 'opened')
      strand(repo, scratch, 'landed')
      repo.survey('--apply', '--idle', '0')
      expect(repo.git('worktree', 'list')).to.include('wt-landed')
    })

    it('is left registered when its branch has commits origin lacks', () => {
      seedKinds(repo)
      repo.git('switch', '--quiet', '--create', 'underway', 'main')
      repo.commit('underway.md', 'not pushed\n', 'feat: not pushed')
      repo.git('switch', '--quiet', 'main')
      strand(repo, scratch, 'underway')
      const said = repo.survey('--apply', '--idle', '0')
      expect(said).to.match(/\nkeep\t[^\t]*wt-underway\tunderway\tits directory is missing, but its branch has 1 commit not on origin: /)
      expect(repo.git('worktree', 'list')).to.include('wt-underway')
    })

    it('reports a dry run the same way, and prunes nothing', () => {
      seedKinds(repo)
      strand(repo, scratch, 'opened')
      expect(repo.survey('--idle', '0')).to.match(/\nheld\tgit worktree prune\t-\tnot run: /)
    })
  })

  it('prints its section of notes/housekeeping.md for --help, and no further', () => {
    const said = execFileSync(Script, ['--help'], { encoding: 'utf8' })
    expect(said).to.match(/^## Sweeping finished threads\n/)
    expect(said).to.include('scripts/git-survey.sh [--apply]')
    expect(said).not.to.include('## Retiring stray branches')
  })

  const RefusalCases: [string[], number, RegExp, string][] = [
    [['--bogus'],                        2, /no such option: --bogus\nUsage: /,         'an unknown option is refused with the usage'],
    [['--retag'],                        2, /--retag needs a value/,                  'an option missing its value is refused with the usage'],
    [['--idle', 'soon'],                 2, /--idle takes whole minutes, not soon/,   'an --idle that is not a whole number is refused'],
    [['--against', 'nowhere'],           1, /no such commit: nowhere/,                'a ref that names nothing fails'],
    [['--retag', 'nobody'],              1, /--retag names no local branch: nobody/,  'retagging a branch that is not there fails'],
    [['--prs-from', '/no/such/file'],    1, /cannot read --prs-from \/no\/such\/file/, 'an unreadable --prs-from fails'],
  ]
  for (const [args, status, complaint, blurb] of RefusalCases) {
    it(blurb, () => {
      repo.commit('readme.md', 'hello\n', 'docs: a readme')
      const ran = spawnSync(Script, ['--no-fetch', '--against', 'main', ...args], { cwd: repo.where, encoding: 'utf8', env: isolatedEnv(scratch) })
      expect(ran.status).to.equal(status)
      expect(ran.stderr).to.match(complaint)
      expect(ran.stdout).to.equal('')
    })
  }

  it('fails outside a git repository', () => {
    const ran = spawnSync(Script, ['--no-fetch'], { cwd: scratch, encoding: 'utf8', env: isolatedEnv(scratch) })
    expect(ran.status).to.equal(1)
    expect(ran.stderr).to.include('not inside a git repository')
  })
})
