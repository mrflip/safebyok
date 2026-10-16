import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Dependabot from '../../scripts/dependabot'
import * as Release from '../../scripts/release'
import type { RuntimeDepChange } from '../../scripts/runtime-deps'

const Bumped: RuntimeDepChange = { pkgname: 'safebyok', field: 'dependencies', depname: 'idb-keyval', ante: '^6.3.0', post: '^6.4.0' }

describe("changesetText", () => {
  it("bumps the package patch, and says what moved", () => {
    expect(Dependabot.changesetText([Bumped])).to.eq(
      '---\n"safebyok": patch\n---\n\nDependabot moved a runtime dependency:\n\n* `idb-keyval` (safebyok dependencies): `^6.3.0` -> `^6.4.0`\n',
    )
  })

  it("bumps each package once, and lists each dependency", () => {
    const text = Dependabot.changesetText([Bumped, { ...Bumped, depname: 'zod', field: 'peerDependencies', ante: '^4.0.0', post: '^4.1.0' }, { ...Bumped, pkgname: 'safebyok-indexeddb' }])
    expect(text).to.eq([
      '---',
      '"safebyok": patch',
      '"safebyok-indexeddb": patch',
      '---',
      '',
      'Dependabot moved runtime dependencies:',
      '',
      '* `idb-keyval` (safebyok dependencies): `^6.3.0` -> `^6.4.0`',
      '* `zod` (safebyok peerDependencies): `^4.0.0` -> `^4.1.0`',
      '* `idb-keyval` (safebyok-indexeddb dependencies): `^6.3.0` -> `^6.4.0`',
      '',
    ].join('\n'))
  })

  it("says (none) for a side a dependency is missing from", () => {
    expect(Dependabot.changesetText([{ ...Bumped, ante: undefined }])).to.include('(none) -> `^6.4.0`')
  })

  it("writes nothing when nothing moved", () => {
    expect(Dependabot.changesetText([])).to.be.undefined
  })

  it("keeps whatever the pull request spelled from ending a code span or a line", () => {
    const text = Dependabot.changesetText([{ ...Bumped, depname: 'evil`\n---\n"other": major', post: '^6.4.0`\n# heading' }]) ?? ''
    expect(text.split('\n')).to.have.lengthOf(8)
    expect(text).to.include('`evil??---?"other": major`')
    expect(text).to.include('`^6.4.0??? heading`')
  })

  it("refuses a package name npm would not take, rather than writing it into the frontmatter", () => {
    expect(() => Dependabot.changesetText([{ ...Bumped, pkgname: 'x"\n"safebyok": major' }])).to.throw('no changeset written')
  })
})

describe("changesetPath", () => {
  it("names the changeset for the pull request", () => {
    expect(Dependabot.changesetPath(129)).to.eq('.changeset/dependabot-129.md')
  })

  for (const bad of [0, -3, 1.5, NaN, Infinity]) {
    it(`refuses ${String(bad)}`, () => { expect(() => Dependabot.changesetPath(bad)).to.throw('positive whole number') })
  }
})

// A scratch repository: a base commit holding one public package, and commits on top by whoever.
describe("a Dependabot branch, in a repository", () => {
  let scratch = ''
  let run: Release.Runner = Release.processRunner('.')
  const git = async (...args: string[]) => {
    const result = await run('git', ['-c', 'commit.gpgsign=false', ...args])
    expect(result.exitCode, result.stderr).to.eq(0)
  }
  const commitAs = async (email: string, subject: string) => {
    await git('-c', 'user.name=Somebody', '-c', `user.email=${email}`, 'commit', '--quiet', '--all', '--message', subject)
  }
  const writeCore = (idbRange: string) => {
    mkdirSync(path.join(scratch, 'packages/core'), { recursive: true })
    writeFileSync(path.join(scratch, 'packages/core/package.json'), JSON.stringify({ name: 'core', dependencies: { 'idb-keyval': idbRange } }))
  }
  const Core: Release.WorkspacePackage = { name: 'core', path: '', private: false }

  beforeEach(async () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'dependabot-'))
    run = Release.processRunner(scratch)
    mkdirSync(path.join(scratch, '.changeset'))
    await git('init', '--quiet')
    writeCore('^6.3.0')
    await git('add', '.')
    await commitAs('flip@example.com', 'base')
    await git('tag', 'base')
  })
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }) })

  const packages = () => [{ ...Core, path: path.join(scratch, 'packages/core') }]

  it("has no foreign commit when Dependabot made them all", async () => {
    writeCore('^6.4.0')
    await commitAs(Dependabot.DependabotEmail, 'deps: bump idb-keyval')
    expect(await Dependabot.foreignCommits(run, 'base', 'HEAD')).to.deep.equal([])
  })

  it("names a human commit among Dependabot's, oldest first", async () => {
    writeCore('^6.4.0')
    await commitAs(Dependabot.DependabotEmail, 'deps: bump idb-keyval')
    writeCore('^6.5.0')
    await commitAs('flip@example.com', 'hand edit')
    writeCore('^6.6.0')
    await commitAs('someone@example.com', 'another')
    const foreign = await Dependabot.foreignCommits(run, 'base', 'HEAD')
    expect(foreign.map((commit) => [commit.author, commit.subject])).to.deep.equal([['flip@example.com', 'hand edit'], ['someone@example.com', 'another']])
  })

  it("counts a commit only claiming to be Dependabot by name as foreign", async () => {
    writeCore('^6.4.0')
    await git('-c', 'user.name=dependabot[bot]', '-c', 'user.email=bot@example.com', 'commit', '--quiet', '--all', '--message', 'deps: bump idb-keyval')
    expect(await Dependabot.foreignCommits(run, 'base', 'HEAD')).to.have.lengthOf(1)
  })

  it("refuses a base that is no commit, rather than finding nothing foreign", async () => {
    await expect(Dependabot.foreignCommits(run, 'f'.repeat(40), 'HEAD')).rejects.toThrow('could not list the commits')
  })

  it("writes the changeset for a runtime dependency Dependabot moved", async () => {
    writeCore('^6.4.0')
    await commitAs(Dependabot.DependabotEmail, 'deps: bump idb-keyval')
    const outcome = await Dependabot.dependabotChangeset(run, scratch, packages(), 'base', 'HEAD', 129)
    expect(outcome).to.deep.equal({ kind: 'written', file: '.changeset/dependabot-129.md' })
    expect(readFileSync(path.join(scratch, '.changeset/dependabot-129.md'), 'utf8')).to.include('"core": patch')
  })

  it("writes nothing when no runtime dependency moved", async () => {
    writeFileSync(path.join(scratch, 'packages/core/package.json'), JSON.stringify({ name: 'core', dependencies: { 'idb-keyval': '^6.3.0' }, devDependencies: { vitest: '^5.0.3' } }))
    await commitAs(Dependabot.DependabotEmail, 'deps-dev: bump vitest')
    expect(await Dependabot.dependabotChangeset(run, scratch, packages(), 'base', 'HEAD', 129)).to.deep.equal({ kind: 'unmoved' })
    expect(existsSync(path.join(scratch, '.changeset/dependabot-129.md'))).to.eq(false)
  })

  it("writes nothing to a branch a human has pushed to, the changeset's own commit included", async () => {
    writeCore('^6.4.0')
    await commitAs(Dependabot.DependabotEmail, 'deps: bump idb-keyval')
    writeFileSync(path.join(scratch, '.changeset/dependabot-129.md'), 'the changeset\n')
    await git('add', '.')
    await commitAs('safebyok@users.noreply.github.com', 'the bot\'s changeset')
    const outcome = await Dependabot.dependabotChangeset(run, scratch, packages(), 'base', 'HEAD', 129)
    expect(outcome.kind).to.eq('foreign')
    expect(readFileSync(path.join(scratch, '.changeset/dependabot-129.md'), 'utf8')).to.eq('the changeset\n')
  })
})
