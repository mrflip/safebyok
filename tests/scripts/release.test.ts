import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Release from '../../scripts/release'
import * as TH from '../test-helpers'

const RepoRoot = path.resolve(import.meta.dirname, '../..')

describe("the workspace as it stands", () => {
  it("has a release check with nothing to say", async () => {
    const packages = await Release.listWorkspace(Release.processRunner(RepoRoot))
    const fixed = Release.readFixedGroups(path.join(RepoRoot, '.changeset', 'config.json'))
    expect(Release.releaseProblems(packages, RepoRoot, fixed)).to.deep.equal([])
  })

  it("releases the core, and no demo", async () => {
    const packages = await Release.listWorkspace(Release.processRunner(RepoRoot))
    const publicNames = Release.publicPackages(packages, RepoRoot).map((pkg) => pkg.name)
    expect(publicNames).to.include('safebyok')
    expect(publicNames.filter((pkgname) => pkgname.includes('demo'))).to.deep.equal([])
  })
})

// A workspace like ours before its first release with the Convex adapter: the core and the binding
// public, convex still private.
const pkgAt = (pkgname: string, dir: string, version: string, isPrivate = false): Release.WorkspacePackage => (
  { name: pkgname, version, path: path.join('/repo', dir), private: isPrivate }
)
const Root    = { name: 'safebyok-workspace', path: '/repo', private: true }
const Core    = pkgAt('safebyok',            'packages/safebyok',         '0.1.0')
const Binding = pkgAt('safebyok-react',      'packages/safebyok-react',   '0.1.0')
const Convex  = pkgAt('safebyok-convex',     'packages/safebyok-convex',  '0.0.0', true)
const Demo    = pkgAt('safebyok-demo-react', 'demos/safebyok-demo-react', '0.0.0', true)
const E2e     = pkgAt('safebyok-e2e',        'e2e',                       '0.0.0', true)
const Lockstep = [['safebyok', 'safebyok-react']]

const ProblemCases = [
  // regular usage:
  [[Root, Core, Binding, Convex, Demo],                          Lockstep,                                 /^$/,                              'a lockstep workspace has no problems'],
  [[Root, Core, Binding, { ...Convex, private: false }, Demo],   [['safebyok', 'safebyok-react', 'safebyok-convex']], /^$/,                  'a package newly public joins at the placeholder version'],
  // what the check is for:
  [[Root, Core, Binding, { ...Convex, private: false }, Demo],   Lockstep,                                 /safebyok-convex is public but not/, 'a package made public but left out of the fixed group is refused'],
  [[Root, Core, Binding, Convex, { ...Demo, private: false }],   Lockstep,                                 /under demos\/ but not private/,   'a demo made public is refused'],
  [[Root, Core, Binding, Convex, { ...E2e, private: false }],    Lockstep,                                 /under e2e\/ but not private/,     'the cross-harness tests made public are refused'],
  [[Root, Core, Binding, Convex, Demo],                          [['safebyok', 'safebyok-react', 'safebyok-convex']], /safebyok-convex is in .* not a public/, 'a private package in the fixed group is refused'],
  [[Root, Core, Binding, Convex, Demo],                          [['safebyok'], ['safebyok-react']],       /2 fixed groups/,                  'two fixed groups are refused: lockstep is one'],
  [[Root, Core, { ...Binding, version: '0.2.0' }, Convex, Demo], Lockstep,                                 /disagree on their version/,       'public packages at different versions are refused'],
  // edge cases:
  [[Root, Core, Binding, Convex, Demo],                          [],                                       /safebyok is public but not/,      'no fixed group at all is refused'],
] as const

describe("releaseProblems", () => {
  for (const [packages, fixed, expected, blurb] of ProblemCases) {
    it(blurb, () => { expect(Release.releaseProblems(packages, '/repo', fixed).join('\n')).to.match(expected) })
  }
})

describe("publicPackages", () => {
  it("leaves out private packages and everything under demos/ or e2e/", () => {
    const publicDemo = { ...Demo, private: false }
    const publicE2e = { ...E2e, private: false }
    const publicNames = Release.publicPackages([Root, Core, Binding, Convex, publicDemo, publicE2e], '/repo').map((pkg) => pkg.name)
    expect(publicNames).to.deep.equal(['safebyok', 'safebyok-react'])
  })
})

const DistTagCases = [
  ["0.3.0",         "latest", 'a release goes out under latest'],
  ["0.3.0-beta.1",  "next",   'a prerelease goes out under next'],
  ["1.0.0-rc.0",    "next",   'a release candidate is a prerelease too'],
] as const

describe("distTag", () => {
  for (const [version, expected, blurb] of DistTagCases) {
    it(blurb, () => { expect(Release.distTag(version)).to.eq(expected) })
  }
})

describe("gitTag", () => {
  it("names a package's release as changesets does in a monorepo", () => {
    expect(Release.gitTag({ name: 'safebyok', version: '0.1.0' })).to.eq('safebyok@0.1.0')
  })
})

const planned = (pkgname: string, type: string, newVersion: string): Release.PlannedRelease => ({ name: pkgname, type, newVersion })
const DemoUntouched = planned('safebyok-demo-react', 'none', '0.0.0')

const VersionPrNameCases = [
  // regular usage:
  [[planned('safebyok', 'minor', '0.2.0'), DemoUntouched, planned('safebyok-convex', 'minor', '0.2.0'), planned('safebyok-react', 'minor', '0.2.0')],
    { prTitle: 'Release 0.2.0: safebyok, safebyok-convex, safebyok-react', commitMessage: 'rel: release 0.2.0 of safebyok, safebyok-convex, safebyok-react' },
    'a lockstep release is named by its one version and the packages it releases'],
  [[planned('safebyok', 'patch', '0.3.0-beta.1')],
    { prTitle: 'Release 0.3.0-beta.1: safebyok', commitMessage: 'rel: release 0.3.0-beta.1 of safebyok' },
    'a prerelease is named by its prerelease version'],
  [[planned('safebyok', 'minor', '0.2.0')],
    { prTitle: 'Release 0.2.0: safebyok', commitMessage: 'rel: release 0.2.0 of safebyok' },
    'a release of one package names just it'],
  // edge cases:
  [[planned('safebyok', 'minor', '0.2.0'), planned('safebyok-react', 'patch', '0.1.1')],
    { prTitle: 'Release safebyok@0.2.0, safebyok-react@0.1.1', commitMessage: 'rel: release safebyok@0.2.0, safebyok-react@0.1.1' },
    'packages out of lockstep are each named with their own version'],
  [[DemoUntouched],
    { prTitle: 'Version the packages for release', commitMessage: 'rel: version the packages for release' },
    'a plan that releases nothing keeps the plain name'],
] as const

describe("versionPrNames", () => {
  for (const [releases, expected, blurb] of VersionPrNameCases) {
    it(blurb, () => { expect(Release.versionPrNames(releases)).to.deep.equal(expected) })
  }
})

describe("readReleasePlan", () => {
  let workdir: string
  beforeEach(() => { workdir = TH.makeScratchDir('release-plan-') })

  it("reads the releases from changeset status's plan", () => {
    const planPath = path.join(workdir, 'plan.json')
    writeFileSync(planPath, JSON.stringify({ changesets: [], releases: [{ ...planned('safebyok', 'minor', '0.2.0'), oldVersion: '0.1.0', changesets: ['20261015-thread'] }] }))
    expect(Release.readReleasePlan(planPath).map((release) => release.newVersion)).to.deep.equal(['0.2.0'])
  })

  it("refuses a file that is not a release plan", () => {
    const planPath = path.join(workdir, 'plan.json')
    writeFileSync(planPath, JSON.stringify({ version: 1, plan: [] }))
    expect(() => Release.readReleasePlan(planPath)).to.throw(/not a release plan/)
  })
})

const WorkspaceRangeCases = [
  [{ peerDependencies: { safebyok: "workspace:^" } },                 ["safebyok: workspace:^"], 'a workspace peer range is caught'],
  [{ dependencies: { safebyok: "workspace:*" }, devDependencies: {} }, ["safebyok: workspace:*"], 'a workspace dependency is caught'],
  [{ peerDependencies: { safebyok: "^0.1.0", react: "^19.0.0" } },     [],                        'real ranges pass'],
  [{ name: "safebyok" },                                               [],                        'a package with no dependencies passes'],
] as const

describe("workspaceRanges", () => {
  for (const [manifest, expected, blurb] of WorkspaceRangeCases) {
    it(blurb, () => { expect(Release.workspaceRanges(manifest)).to.deep.equal(expected) })
  }
})

const SourceConditionCases = [
  [{ exports: { ".": { "@safebyok/source": "./src/index.ts", import: "./dist/index.js" } } }, ['exports["."]: @safebyok/source'], 'a source condition is caught'],
  [{ exports: { ".": { import: "./dist/index.js" }, "./package.json": "./package.json" } },   [],                                  'dist-only exports pass'],
  [{ name: "safebyok" },                                                                     [],                                  'a package with no exports passes'],
] as const

describe("sourceConditions", () => {
  for (const [manifest, expected, blurb] of SourceConditionCases) {
    it(blurb, () => { expect(Release.sourceConditions(manifest)).to.deep.equal(expected) })
  }
})

describe("readPackDir", () => {
  let scratch = ''
  beforeEach(() => { scratch = TH.makeScratchDir('release-pack-') })

  it("lists each package to publish, dependencies first, its tarball made absolute", () => {
    const plan = [
      [{ kind: 'publish', name: 'safebyok', version: '0.1.0', tag: 'latest', tarball: { path: 'packages/safebyok-0.1.0.tgz' } }],
      [
        { kind: 'publish',  name: 'safebyok-react', version: '0.1.0', tag: 'latest', tarball: { path: 'packages/safebyok-react-0.1.0.tgz' } },
        { kind: 'tag-only', name: 'safebyok-convex', version: '0.1.0' },
      ],
    ]
    writeFileSync(path.join(scratch, 'publish-plan.json'), JSON.stringify({ version: 1, plan }))
    expect(Release.readPackDir(scratch)).to.deep.equal([
      { name: 'safebyok',       version: '0.1.0', tarball: path.join(scratch, 'packages/safebyok-0.1.0.tgz') },
      { name: 'safebyok-react', version: '0.1.0', tarball: path.join(scratch, 'packages/safebyok-react-0.1.0.tgz') },
    ])
  })

  it("refuses a plan of a version it does not know", () => {
    writeFileSync(path.join(scratch, 'publish-plan.json'), JSON.stringify({ version: 2, plan: [] }))
    expect(() => Release.readPackDir(scratch)).to.throw(/not a changesets publish plan/)
  })

  it("refuses a plan that was never packed", () => {
    const plan = [[{ kind: 'publish', name: 'safebyok', version: '0.1.0', tag: 'latest' }]]
    writeFileSync(path.join(scratch, 'publish-plan.json'), JSON.stringify({ version: 1, plan }))
    expect(() => Release.readPackDir(scratch)).to.throw(/no tarball for safebyok@0.1.0/)
  })
})

describe("packedManifest", () => {
  let scratch = ''
  beforeEach(() => { scratch = TH.makeScratchDir('release-packed-') })

  it("finds the real range pnpm packs in place of the binding's workspace:^ peer", async () => {
    const tarball = path.join(scratch, 'safebyok-react.tgz')
    const packed = await Release.processRunner(path.join(RepoRoot, 'packages', 'safebyok-react'))('pnpm', ['pack', '--out', tarball])
    expect(packed.exitCode, packed.stderr).to.eq(0)
    const manifest = await Release.packedManifest(Release.processRunner(scratch), tarball)
    expect(Release.workspaceRanges(manifest)).to.deep.equal([])
    expect((manifest['peerDependencies'] as Record<string, string>)['safebyok']).to.match(/^\^\d+\.\d+\.\d+/)
  }, 30_000)

  it("ships the dist-only exports: the workspace's source condition never leaves the repo", async () => {
    const tarball = path.join(scratch, 'safebyok-react.tgz')
    const packed = await Release.processRunner(path.join(RepoRoot, 'packages', 'safebyok-react'))('pnpm', ['pack', '--out', tarball])
    expect(packed.exitCode, packed.stderr).to.eq(0)
    const manifest = await Release.packedManifest(Release.processRunner(scratch), tarball)
    expect(JSON.stringify(manifest)).to.not.include('@safebyok/source')
    expect(manifest).to.not.have.property('publishConfig')
  }, 30_000)
})

// A runner standing in for npm, git, gh and tar: npm answers per package, origin holds the tags
// given (each naming a commit), GitHub holds a release for each tag in `releases`, HEAD is
// `HeadSha`, and every tarball's package.json is clean unless a manifest is given for it.
const HeadSha = 'headd00d0000000000000000000000000000000'
interface FakeT {
  run:   Release.Runner
  calls: string[][]
}

const ok = (stdout = ''): Release.RunResult => ({ exitCode: 0, stdout, stderr: '' })
const npmFailure = (code: string, summary: string, detail = ''): Release.RunResult => ({
  exitCode: 1,
  stdout:   JSON.stringify({ error: { code, summary, detail } }, null, 2),
  stderr:   'npm error a long log, its request headers included: Authorization: Bearer npm_FAKETOKEN',
})

const makeFake = (npmFor: Record<string, Release.RunResult>, opts: { tags?: Record<string, string>, releases?: string[], manifests?: Record<string, object> } = {}): FakeT => {
  const calls: string[][] = []
  const run: Release.Runner = (command, args) => {
    calls.push([command, ...args])
    if (command === 'tar') {
      const tarball = args[1] ?? ''
      return Promise.resolve(ok(JSON.stringify(opts.manifests?.[tarball] ?? { name: 'x', peerDependencies: { safebyok: '^0.1.0' } })))
    }
    if (command === 'gh') {
      const found = opts.releases?.includes(args[2] ?? '') ?? false
      return Promise.resolve(found ? ok('title: a release\n') : { exitCode: 1, stdout: '', stderr: 'release not found' })
    }
    if (command === 'git' && args[0] === 'rev-parse') { return Promise.resolve(ok(`${HeadSha}\n`)) }
    if (command === 'git') {
      const listing = Object.entries(opts.tags ?? {})
        .filter(([tag]) => args.includes(`refs/tags/${tag}`))
        .map(([tag, sha]) => `${sha}\trefs/tags/${tag}\n`)
      return Promise.resolve(ok(listing.join('')))
    }
    const pkgname = path.basename(args[2] ?? '', '.tgz').replace(/-\d.*$/, '')
    return Promise.resolve(npmFor[pkgname] ?? ok(JSON.stringify({ [pkgname]: { stageId: `stage-${pkgname}` } })))
  }
  return { run, calls }
}

const releaseOf = (pkgname: string, version = '0.1.0'): Release.Release => (
  { name: pkgname, version, tarball: `/pack/packages/${pkgname}-${version}.tgz` }
)

describe("stage", () => {
  let scratch = ''
  let tagfile = ''
  beforeEach(() => {
    scratch = TH.makeScratchDir('release-stage-')
    tagfile = path.join(scratch, 'changesets-output.ndjson')
  })

  const reported = () => {
    try {
      return readFileSync(tagfile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as object)
    } catch {
      return []
    }
  }

  it("stages each release npm has not seen, and reports its tag for the action to push", async () => {
    const fake = makeFake({})
    const outcomes = await Release.stage([releaseOf('safebyok'), releaseOf('safebyok-react')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => [outcome.kind, outcome.detail, outcome.tagged])).to.deep.equal([
      ['staged', 'stage id stage-safebyok',       'safebyok@0.1.0'],
      ['staged', 'stage id stage-safebyok-react', 'safebyok-react@0.1.0'],
    ])
    expect(reported()).to.deep.equal([
      { type: 'git-tag', tag: 'safebyok@0.1.0',       packageName: 'safebyok' },
      { type: 'git-tag', tag: 'safebyok-react@0.1.0', packageName: 'safebyok-react' },
    ])
    expect(fake.calls).to.deep.include(['npm', 'stage', 'publish', '/pack/packages/safebyok-0.1.0.tgz', '--access', 'public', '--tag', 'latest', '--json'])
  })

  it("does nothing more for a release already staged and tagged: a re-run is safe", async () => {
    const fake = makeFake(
      { 'safebyok': npmFailure('E403', 'You cannot publish over the previously published versions: 0.1.0.') },
      { tags: { 'safebyok@0.1.0': HeadSha }, releases: ['safebyok@0.1.0'] },
    )
    const outcomes = await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => [outcome.kind, outcome.tagged])).to.deep.equal([['already', undefined]])
    expect(reported()).to.deep.equal([])
  })

  it("reports the tag again when it landed but its GitHub release did not, so a re-run writes the release", async () => {
    const fake = makeFake(
      { 'safebyok': npmFailure('E403', 'You cannot publish over the previously published versions: 0.1.0.') },
      { tags: { 'safebyok@0.1.0': HeadSha } },
    )
    const outcomes = await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => [outcome.kind, outcome.tagged])).to.deep.equal([['already', 'safebyok@0.1.0']])
    expect(reported()).to.deep.equal([{ type: 'git-tag', tag: 'safebyok@0.1.0', packageName: 'safebyok' }])
    expect(fake.calls).to.deep.include(['gh', 'release', 'view', 'safebyok@0.1.0'])
  })

  it("asks GitHub about no release when the tag is not on origin yet: the tag is reported anyway", async () => {
    const fake = makeFake({})
    await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: false, tagfile })
    expect(fake.calls.map(([command]) => command)).not.to.include('gh')
  })

  it("fails a release whose GitHub release gh cannot look up, rather than guessing, and still attempts the next", async () => {
    const fake = makeFake({}, { tags: { 'safebyok@0.1.0': HeadSha } })
    const run: Release.Runner = (command, args) => (
      command === 'gh'
        ? Promise.resolve({ exitCode: 4, stdout: '', stderr: 'gh: To use GitHub CLI, set GH_TOKEN' })
        : fake.run(command, args)
    )
    const outcomes = await Release.stage([releaseOf('safebyok'), releaseOf('safebyok-react')], { run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => outcome.kind)).to.deep.equal(['failed', 'staged'])
    expect(outcomes[0]?.detail).to.match(/could not tell what is left to do: gh release view safebyok@0.1.0 failed \(exit 4\)/)
    expect(reported()).to.deep.equal([{ type: 'git-tag', tag: 'safebyok-react@0.1.0', packageName: 'safebyok-react' }])
  })

  it("leaves alone a version its tag says was released from another commit, without asking npm", async () => {
    const fake = makeFake({}, { tags: { 'safebyok@0.1.0': 'e1de0000000000000000000000000000000000' } })
    const outcomes = await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => [outcome.kind, outcome.detail, outcome.tagged])).to.deep.equal([
      ['already', 'released from e1de00000000, which its tag names', undefined],
    ])
    expect(fake.calls.map(([command]) => command)).not.to.include('npm')
    expect(reported()).to.deep.equal([])
  })

  it("reports the tag of a release staged by an earlier run that stopped before tagging", async () => {
    const fake = makeFake({ 'safebyok': npmFailure('E403', 'You cannot publish over the previously published versions: 0.1.0.') })
    const outcomes = await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => [outcome.kind, outcome.tagged])).to.deep.equal([['already', 'safebyok@0.1.0']])
  })

  it("attempts every release when one fails, and tags none that failed", async () => {
    const fake = makeFake({ 'safebyok': npmFailure('E403', 'Forbidden - this trusted publisher may not stage safebyok') })
    const outcomes = await Release.stage([releaseOf('safebyok'), releaseOf('safebyok-react')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => outcome.kind)).to.deep.equal(['failed', 'staged'])
    expect(outcomes[0]?.detail).to.eq('npm E403: Forbidden - this trusted publisher may not stage safebyok')
    expect(reported()).to.deep.equal([{ type: 'git-tag', tag: 'safebyok-react@0.1.0', packageName: 'safebyok-react' }])
  })

  it("fails a release whose tag git cannot look up, and still attempts the next", async () => {
    const fake = makeFake({})
    const run: Release.Runner = (command, args) => (
      command === 'git' && args.includes('refs/tags/safebyok@0.1.0')
        ? Promise.resolve({ exitCode: 128, stdout: '', stderr: 'fatal: unable to access the remote' })
        : fake.run(command, args)
    )
    const outcomes = await Release.stage([releaseOf('safebyok'), releaseOf('safebyok-react')], { run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => outcome.kind)).to.deep.equal(['failed', 'staged'])
    expect(outcomes[0]?.detail).to.match(/could not tell what is left to do: git ls-remote .* failed \(exit 128\): fatal: unable to access/)
    expect(fake.calls.filter(([command]) => command === 'npm')).to.have.lengthOf(1)
    expect(reported()).to.deep.equal([{ type: 'git-tag', tag: 'safebyok-react@0.1.0', packageName: 'safebyok-react' }])
  })

  it("quotes npm's error code and summary, and nothing else it printed", async () => {
    const fake = makeFake({ 'safebyok': npmFailure('E500', 'Internal error\nsecond line', 'detail naming npm_FAKETOKEN') })
    const outcomes = await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => outcome.detail)).to.deep.equal(['npm E500: Internal error'])
    expect(outcomes.map((outcome) => Release.describeOutcome(outcome, false)).join('\n')).not.to.include('FAKETOKEN')
  })

  it("never stages the placeholder version", async () => {
    const fake = makeFake({})
    const outcomes = await Release.stage([releaseOf('safebyok-react', '0.0.0')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => outcome.kind)).to.deep.equal(['placeholder'])
    expect(fake.calls.map(([command]) => command)).to.deep.equal(['git'])
  })

  it("refuses a tarball whose package.json still holds a workspace: range", async () => {
    const tarball = '/pack/packages/safebyok-react-0.1.0.tgz'
    const fake = makeFake({}, { manifests: { [tarball]: { peerDependencies: { safebyok: 'workspace:^' } } } })
    const outcomes = await Release.stage([releaseOf('safebyok-react')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => outcome.kind)).to.deep.equal(['failed'])
    expect(outcomes[0]?.detail).to.include('safebyok: workspace:^')
    expect(fake.calls.map(([command]) => command)).to.deep.equal(['git', 'git', 'tar'])
  })

  it("refuses a tarball whose package.json still points at the workspace's source", async () => {
    const tarball = '/pack/packages/safebyok-0.1.0.tgz'
    const exports = { '.': { '@safebyok/source': './src/index.ts', import: './dist/index.js' } }
    const fake = makeFake({}, { manifests: { [tarball]: { exports } } })
    const outcomes = await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: false, tagfile })
    expect(outcomes.map((outcome) => outcome.kind)).to.deep.equal(['failed'])
    expect(outcomes[0]?.detail).to.include('@safebyok/source')
    expect(fake.calls.map(([command]) => command)).to.deep.equal(['git', 'git', 'tar'])
  })

  it("stages a prerelease under next", async () => {
    const fake = makeFake({})
    await Release.stage([releaseOf('safebyok', '0.2.0-beta.0')], { run: fake.run, dryRun: false, tagfile })
    expect(fake.calls).to.deep.include(['npm', 'stage', 'publish', '/pack/packages/safebyok-0.2.0-beta.0.tgz', '--access', 'public', '--tag', 'next', '--json'])
  })

  it("passes --dry-run to npm, and reports no tag", async () => {
    const fake = makeFake({})
    const outcomes = await Release.stage([releaseOf('safebyok')], { run: fake.run, dryRun: true, tagfile })
    expect(fake.calls.find(([command]) => command === 'npm')?.at(-1)).to.eq('--dry-run')
    expect(outcomes[0]?.tagged).to.be.undefined
    expect(reported()).to.deep.equal([])
    expect(outcomes.map((outcome) => Release.describeOutcome(outcome, true))).to.deep.equal(['(dry run) safebyok@0.1.0: staged (stage id stage-safebyok)'])
  })

  it("reports nothing to stage as no outcomes, and asks nothing of anyone", async () => {
    const fake = makeFake({})
    expect(await Release.stage([], { run: fake.run, dryRun: false, tagfile })).to.deep.equal([])
    expect(fake.calls).to.deep.equal([])
  })
})

describe("describeOutcome", () => {
  it("says what happened to a release in one line", () => {
    const outcome: Release.StageOutcome = { release: releaseOf('safebyok'), kind: 'staged', detail: 'stage id 42', tagged: 'safebyok@0.1.0' }
    expect(Release.describeOutcome(outcome, false)).to.eq('safebyok@0.1.0: staged (stage id 42); tag safebyok@0.1.0 to push')
  })
})
