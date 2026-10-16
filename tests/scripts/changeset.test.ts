import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Changeset from '../../scripts/changeset'
import * as TH from '../test-helpers'

const ThreadCases = [
  // regular usage:
  ["20261015-roadmap_fruit",       "20261015-roadmap_fruit", 'a thread branch is its own thread'],
  ["20261015-tamper_test_helper2", "20261015-tamper_test_helper2", 'a label may hold digits'],
  // not a thread:
  ["main",                         undefined,                'main is no thread'],
  ["",                             undefined,                'a detached HEAD, with no branch, is no thread'],
  ["changeset-release/main",       undefined,                'the Version PR\'s branch is no thread'],
  ["dependabot/npm_and_yarn/foo",  undefined,                'a bot\'s branch is no thread'],
  // edge cases:
  ["20261015-",                    undefined,                'a bare datestamp is no thread'],
  ["20261015-tamper-test-helper",  undefined,                'a label with hyphens is not a label'],
  ["2026101-roadmap_fruit",        undefined,                'a short datestamp is no datestamp'],
] as const

describe("threadOf", () => {
  for (const [branch, expected, blurb] of ThreadCases) {
    it(blurb, () => { expect(Changeset.threadOf(branch)).to.eq(expected) })
  }
})

const Thread = '20261015-roadmap_fruit'

const FilenameCases = [
  // regular usage:
  [[],                                                          `${Thread}.md`,   'the first changeset takes the thread\'s name'],
  [['README.md', 'config.json', 'wacky-deserts-start.md'],      `${Thread}.md`,   'other files take nothing from it'],
  [[`${Thread}.md`],                                            `${Thread}-2.md`, 'a second changeset gets a suffix'],
  // edge cases:
  [[`${Thread}.md`, `${Thread}-2.md`],                          `${Thread}-3.md`, 'the suffix counts on'],
  [[`${Thread}.md`, `${Thread}-3.md`],                          `${Thread}-2.md`, 'a gap is filled first'],
  [[`${Thread}-2.md`],                                          `${Thread}.md`,   'the plain name, free again, is taken first'],
] as const

describe("changesetFilename", () => {
  for (const [taken, expected, blurb] of FilenameCases) {
    it(blurb, () => { expect(Changeset.changesetFilename(Thread, new Set(taken))).to.eq(expected) })
  }
})

describe("renameNewChangesets", () => {
  let scratch: string
  beforeEach(() => {
    scratch = TH.makeScratchDir('changeset-rename-')
    writeFileSync(path.join(scratch, 'README.md'), '# Changesets\n')
    writeFileSync(path.join(scratch, 'config.json'), '{}\n')
  })

  it("renames the changeset the CLI wrote for the thread, and keeps its contents", () => {
    const before = Changeset.markdownFiles(scratch)
    writeFileSync(path.join(scratch, 'wacky-deserts-start.md'), '---\n"safebyok": patch\n---\n\nA fix.\n')
    expect(Changeset.renameNewChangesets(scratch, before, Thread)).to.deep.equal([{ from: 'wacky-deserts-start.md', to: `${Thread}.md` }])
    expect(readFileSync(path.join(scratch, `${Thread}.md`), 'utf8')).to.include('A fix.')
    expect(readdirSync(scratch)).to.have.members(['README.md', 'config.json', `${Thread}.md`])
  })

  it("gives a second changeset on the thread a suffix", () => {
    writeFileSync(path.join(scratch, `${Thread}.md`), '---\n---\n')
    const before = Changeset.markdownFiles(scratch)
    writeFileSync(path.join(scratch, 'brave-owls-sing.md'), '---\n---\n')
    expect(Changeset.renameNewChangesets(scratch, before, Thread)).to.deep.equal([{ from: 'brave-owls-sing.md', to: `${Thread}-2.md` }])
  })

  it("leaves alone the changesets that were there before", () => {
    writeFileSync(path.join(scratch, 'releases-bootstrap.md'), '---\n---\n')
    const before = Changeset.markdownFiles(scratch)
    expect(Changeset.renameNewChangesets(scratch, before, Thread)).to.deep.equal([])
    expect(readdirSync(scratch)).to.include('releases-bootstrap.md')
  })

  it("names several new changesets apart", () => {
    const before = Changeset.markdownFiles(scratch)
    writeFileSync(path.join(scratch, 'brave-owls-sing.md'), '---\n---\n')
    writeFileSync(path.join(scratch, 'wacky-deserts-start.md'), '---\n---\n')
    const renamed = Changeset.renameNewChangesets(scratch, before, Thread)
    expect(renamed.map(({ to }) => to)).to.deep.equal([`${Thread}.md`, `${Thread}-2.md`])
  })
})

const Public = ['safebyok', 'safebyok-react', 'safebyok-convex']

describe("changesetRequest", () => {
  it("reads the packages, the level and the sentence", () => {
    const argv = ['--package', 'safebyok', '--package', 'safebyok-react', '--bump', 'minor', '--message', `${' '.repeat(2)}What a host sees.${' '.repeat(2)}`]
    expect(Changeset.changesetRequest(argv, Public)).to.deep.equal({ packages: ['safebyok', 'safebyok-react'], bump: 'minor', message: 'What a host sees.' })
  })

  it("takes packages comma-separated, and the short flags", () => {
    expect(Changeset.changesetRequest(['-p', 'safebyok,safebyok-convex', '-b', 'patch', '-m', 'A fix.'], Public))
      .to.deep.equal({ packages: ['safebyok', 'safebyok-convex'], bump: 'patch', message: 'A fix.' })
  })

  it("names a package named twice once", () => {
    expect(Changeset.changesetRequest(['-p', 'safebyok', '-p', 'safebyok', '-b', 'patch', '-m', 'A fix.'], Public)?.packages).to.deep.equal(['safebyok'])
  })

  it("leaves the CLI to run when no flag of ours is given", () => {
    expect(Changeset.changesetRequest([], Public)).to.be.undefined
    expect(Changeset.changesetRequest(['--empty'], Public)).to.be.undefined
  })

  const RefusalCases = [
    // a request that is not whole:
    [['--bump', 'minor'],                                                     /go with --package/,           'a level with no package'],
    [['--message', 'A fix.'],                                                 /go with --package/,           'a sentence with no package'],
    [['--package', 'safebyok', '--message', 'A fix.'],                        /--bump is one of patch, minor, major/, 'no level'],
    [['--package', 'safebyok', '--bump', 'minor'],                            /--message is the sentence/,   'no sentence'],
    [['--package', 'safebyok', '--bump', 'minor', '--message', ' '.repeat(3)],        /may not be empty/,            'a sentence of only spaces'],
    // a request that is wrong:
    [['--package', 'safebyok', '--bump', 'huge', '--message', 'A fix.'],      /--bump is one of/,            'a level changesets does not have'],
    [['--package', 'safebyok-demo-react', '--bump', 'patch', '--message', 'A fix.'], /safebyok-demo-react is not a public package/, 'a package that is not public'],
    [['--package', '--bump', 'patch', '--message', 'A fix.'],                 /is not a public package/, 'a package flag with no package after it, which takes the next flag for one'],
  ] as const
  for (const [argv, expected, blurb] of RefusalCases) {
    it(`refuses ${blurb}`, () => { expect(() => Changeset.changesetRequest(argv, Public)).to.throw(expected) })
  }
})

describe("changesetText", () => {
  it("writes the file as the CLI would", () => {
    expect(Changeset.changesetText({ packages: ['safebyok', 'safebyok-react'], bump: 'minor', message: 'A thing.' }))
      .to.eq('---\n"safebyok": minor\n"safebyok-react": minor\n---\n\nA thing.\n')
  })
})

describe("writeChangeset", () => {
  let scratch: string
  beforeEach(() => {
    scratch = TH.makeScratchDir('changeset-write-')
    writeFileSync(path.join(scratch, 'README.md'), '# Changesets\n')
  })

  it("names the file for the thread, and a second for its suffix", () => {
    const request: Changeset.ChangesetRequest = { packages: ['safebyok'], bump: 'patch', message: 'A fix.' }
    expect(Changeset.writeChangeset(scratch, Thread, request)).to.eq(`${Thread}.md`)
    expect(Changeset.writeChangeset(scratch, Thread, request)).to.eq(`${Thread}-2.md`)
    expect(readFileSync(path.join(scratch, `${Thread}.md`), 'utf8')).to.eq('---\n"safebyok": patch\n---\n\nA fix.\n')
  })
})

// The script itself, with no terminal: it runs in a scratch copy of the repository's shape.
describe("pnpm changeset --package, with no terminal", () => {
  const Script = path.resolve(import.meta.dirname, '../../scripts/changeset.ts')
  const RepoRoot = path.resolve(import.meta.dirname, '../..')

  it("refuses a branch that is no thread's, and writes nothing", () => {
    const result = spawnSync(process.execPath, [Script, '--package', 'safebyok', '--bump', 'patch', '--message', 'A fix.'], { cwd: RepoRoot, encoding: 'utf8', env: { ...process.env, GIT_DIR: path.join(RepoRoot, '.git-nowhere') } })
    expect(result.status).to.eq(2)
    expect(result.stderr).to.include('is not a thread branch')
  })

  it("refuses a request that is not whole, with its reason", () => {
    const result = spawnSync(process.execPath, [Script, '--bump', 'patch'], { cwd: RepoRoot, encoding: 'utf8' })
    expect(result.status).to.eq(2)
    expect(result.stderr).to.include('go with --package')
  })
})
