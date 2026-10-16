/**
 * The two steps of a release that changesets leaves to us, run by .github/workflows/release.yml.
 * Changesets plans the release (which public packages have a version not yet on npm), packs each
 * with `pnpm pack` (which rewrites `workspace:` ranges into real ones), and its GitHub action
 * pushes the git tags and writes the GitHub releases. What it cannot do is stage: it publishes
 * with `pnpm publish`, and our npm trusted publisher allows only `npm stage publish`.
 *
 * `check` refuses a workspace whose release would go wrong: a package under demos/ or e2e/ that is
 * not private, a public package missing from the lockstep `fixed` group in .changeset/config.json
 * (or a name there that is not a public package), or public packages whose versions disagree.
 *
 * `stage` stages each tarball that `changeset pack` wrote into `<pack-dir>`, in dependency order,
 * and reports a git tag for each package now staged (to the file named by `CHANGESETS_OUTPUT`,
 * which the changesets action reads). It skips a version already staged or published, so a failed
 * run is mended by running it again, and a version whose tag names an earlier commit, so a later
 * push to main never restages it; it attempts every package before it exits non-zero for any that
 * failed. A package whose tag is on origin but whose GitHub release is not (the action pushed the
 * tag, then failed to write the release) has its tag reported again, so the action writes the
 * release; it tolerates the tag being there. `--dry-run` passes `--dry-run` to npm and reports no
 * tags.
 *
 * `names` names the Version PR and its commit for the release they make, from the release plan
 * `changeset status --output` wrote: `pr-title` and `commit-message`, to the file named by
 * `GITHUB_OUTPUT` (or to stdout without one), for the changesets action to use.
 *
 *   node scripts/release.ts check
 *   node scripts/release.ts stage <pack-dir> [--dry-run]
 *   node scripts/release.ts names <release-plan.json>
 */
import { execFile } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** One workspace package, as `pnpm ls --recursive --json` describes it */
export interface WorkspacePackage {
  name:     string
  version?: string
  path:     string
  private:  boolean
}

/** One package's release, from the publish plan `changeset pack` writes */
export interface Release {
  name:    string
  version: string
  /** The packed tarball, as an absolute path */
  tarball: string
}

/** What `stage` did with one release */
export type StageKind = 'staged' | 'already' | 'placeholder' | 'failed'

/** One release's outcome, and whether its git tag is still to be pushed */
export interface StageOutcome {
  release: Release
  kind:    StageKind
  /** What happened, in a few words: a stage id, or why it failed */
  detail:  string
  /** The git tag reported for the changesets action to push, if any */
  tagged?: string
}

/** A command's result: its exit code and what it printed */
export interface RunResult {
  exitCode: number
  stdout:   string
  stderr:   string
}

/** Runs a command without a shell; resolves with its exit code rather than throwing on failure */
export type Runner = (command: string, args: readonly string[]) => Promise<RunResult>

/** The version every package starts at: a placeholder, never released */
export const PlaceholderVersion = '0.0.0'

/**
 * A runner over child_process: no shell, output captured, never rejecting on a non-zero exit.
 *
 * @param cwd - Directory the commands run in.
 * @returns A Runner.
 */
export function processRunner(cwd: string): Runner {
  return (command, args) => new Promise((resolve) => {
    execFile(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ exitCode: exitCodeOf(err), stdout, stderr })
    })
  })
}

function exitCodeOf(err: { code?: unknown } | null): number {
  if (! err) { return 0 }
  return typeof err.code === 'number' ? err.code : 1
}

/**
 * Every package in the workspace, the root included, by asking pnpm.
 *
 * @param run - Runs `pnpm`.
 * @returns The packages, as pnpm lists them.
 */
export async function listWorkspace(run: Runner): Promise<WorkspacePackage[]> {
  const result = await run('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'])
  if (result.exitCode !== 0) { throw new Error(`pnpm ls failed (exit ${String(result.exitCode)}): ${result.stderr.trim()}`) }
  return JSON.parse(result.stdout) as WorkspacePackage[]
}

/**
 * The packages a release publishes: not private, and not under demos/ or e2e/.
 *
 * @param packages - The workspace's packages.
 * @param rootDir  - The workspace root.
 * @returns The public packages, in the order given.
 *
 * @example publicPackages(packages, '/repo').map((pkg) => pkg.name)  // => ['safebyok', 'safebyok-react']
 */
export function publicPackages(packages: readonly WorkspacePackage[], rootDir: string): WorkspacePackage[] {
  return packages.filter((pkg) => ! pkg.private && ! isNeverReleased(pkg, rootDir))
}

/** The top-level directories whose packages are never released: the demos, and the cross-harness tests. */
const NeverReleasedDirs = new Set(['demos', 'e2e'])

/** The top-level directory of the workspace that holds `pkg`. */
function homeDir(pkg: WorkspacePackage, rootDir: string): string {
  return path.relative(rootDir, pkg.path).split(path.sep)[0] ?? ''
}

function isNeverReleased(pkg: WorkspacePackage, rootDir: string): boolean {
  return NeverReleasedDirs.has(homeDir(pkg, rootDir))
}

/**
 * The `fixed` groups of a changesets config.
 *
 * @param configPath - Path to .changeset/config.json.
 * @returns Its `fixed` groups, or none.
 */
export function readFixedGroups(configPath: string): string[][] {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as { fixed?: string[][] }
  return config.fixed ?? []
}

/**
 * Everything that would make a release go wrong, each as a sentence saying what to do about it.
 * A release stages every public package in lockstep: one `fixed` group holding exactly the
 * public packages, by name, all at one version. A package still at the placeholder `0.0.0` has
 * never been released and joins the group's version at its next release, so it may differ.
 *
 * @param packages - The workspace's packages.
 * @param rootDir  - The workspace root.
 * @param fixed    - The `fixed` groups of .changeset/config.json.
 * @returns The problems found; none when the release would go as intended.
 *
 * @example releaseProblems(packages, '/repo', [['safebyok', 'safebyok-react']])  // => []
 */
export function releaseProblems(packages: readonly WorkspacePackage[], rootDir: string, fixed: readonly (readonly string[])[]): string[] {
  const publicNames = publicPackages(packages, rootDir).map((pkg) => pkg.name)
  const group = fixed.flat()
  const neverReleasedProblems = packages
    .filter((pkg) => isNeverReleased(pkg, rootDir) && ! pkg.private)
    .map((pkg) => `${pkg.name} is under ${homeDir(pkg, rootDir)}/ but not private: nothing there is ever released, so give it "private": true.`)
  const groupProblems = fixed.length > 1
    ? [`.changeset/config.json has ${String(fixed.length)} fixed groups: the public packages release in lockstep, as one group.`]
    : []
  const missing = publicNames
    .filter((pkgname) => ! group.includes(pkgname))
    .map((pkgname) => `${pkgname} is public but not in .changeset/config.json's fixed group: add it, so it releases in lockstep with the rest.`)
  const extra = group
    .filter((pkgname) => ! publicNames.includes(pkgname))
    .map((pkgname) => `${pkgname} is in .changeset/config.json's fixed group but is not a public workspace package: remove it, or make it public.`)
  return [...neverReleasedProblems, ...groupProblems, ...missing, ...extra, ...versionProblems(publicPackages(packages, rootDir))]
}

function versionProblems(pkgs: readonly WorkspacePackage[]): string[] {
  const released = pkgs.filter((pkg) => pkg.version !== PlaceholderVersion)
  const versions = new Set(released.map((pkg) => pkg.version))
  if (versions.size <= 1) { return [] }
  const listing = released.map((pkg) => `${pkg.name} ${pkg.version ?? '(none)'}`).join(', ')
  return [`The public packages disagree on their version (${listing}): they release in lockstep, so a changeset should bump them together.`]
}

/**
 * The npm dist-tag a version goes out under: a prerelease (`0.3.0-beta.1`) under `next`, so a
 * plain `npm install` never picks it up; everything else under `latest`.
 *
 * @param version - A semver version.
 * @returns `'next'` or `'latest'`.
 *
 * @example distTag('0.3.0-beta.1')  // => 'next'
 * @example distTag('0.3.0')         // => 'latest'
 */
export function distTag(version: string): 'next' | 'latest' {
  return version.includes('-') ? 'next' : 'latest'
}

/**
 * The git tag of one package's release, as changesets names it in a monorepo.
 *
 * @param release - The package's name and version.
 * @returns `<name>@<version>`.
 *
 * @example gitTag({ name: 'safebyok', version: '0.1.0' })  // => 'safebyok@0.1.0'
 */
export function gitTag(release: Pick<Release, 'name' | 'version'>): string {
  return `${release.name}@${release.version}`
}

/** One package's bump, from the release plan `changeset status --output` writes */
export interface PlannedRelease {
  name:       string
  /** `major`, `minor`, `patch`, or `none` for a package the plan leaves alone */
  type:       string
  newVersion: string
}

/** What the Version PR and its one commit are called */
export interface VersionPrNames {
  prTitle:       string
  commitMessage: string
}

/**
 * The Version PR's title and its commit's message, naming the release they make: its version and
 * the packages that go out at it, so the history says which commit released what. The public
 * packages release in lockstep, so one version names them all; should they ever disagree, each
 * is named with its own. A package the plan leaves alone is not named.
 *
 * @param releases - The plan's releases, in its order.
 * @returns The PR title and the commit message.
 *
 * @example versionPrNames([{ name: 'safebyok', type: 'minor', newVersion: '0.2.0' }]).prTitle  // => 'Release 0.2.0: safebyok'
 */
export function versionPrNames(releases: readonly PlannedRelease[]): VersionPrNames {
  const bumped = releases.filter((release) => release.type !== 'none')
  if (bumped.length === 0) {
    return { prTitle: 'Version the packages for release', commitMessage: 'rel: version the packages for release' }
  }
  const versions = [...new Set(bumped.map((release) => release.newVersion))]
  if (versions.length > 1) {
    const tags = bumped.map((release) => gitTag({ name: release.name, version: release.newVersion })).join(', ')
    return { prTitle: `Release ${tags}`, commitMessage: `rel: release ${tags}` }
  }
  const version = versions.join('')
  const pkgnames = bumped.map((release) => release.name).join(', ')
  return { prTitle: `Release ${version}: ${pkgnames}`, commitMessage: `rel: release ${version} of ${pkgnames}` }
}

/**
 * The releases in a release plan `changeset status --output` wrote.
 *
 * @param planPath - Path to the plan's JSON.
 * @returns Its releases, in its order.
 */
export function readReleasePlan(planPath: string): PlannedRelease[] {
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as { releases?: unknown }
  if (! Array.isArray(plan.releases)) {
    throw new TypeError(`${planPath} is not a release plan from changeset status --output: it has no releases`)
  }
  return plan.releases as PlannedRelease[]
}

/**
 * The releases in a directory `changeset pack` wrote, in the order they should be published (a
 * package before those that depend on it).
 *
 * @param packDir - The pack directory, holding publish-plan.json and the tarballs.
 * @returns Each release, its tarball as an absolute path.
 */
export function readPackDir(packDir: string): Release[] {
  const planfile = JSON.parse(readFileSync(path.join(packDir, 'publish-plan.json'), 'utf8')) as PlanFileT
  if (planfile.version !== 1 || ! Array.isArray(planfile.plan)) {
    throw new Error(`${packDir}/publish-plan.json is not a changesets publish plan this script knows (version 1)`)
  }
  return planfile.plan.flat()
    .filter((entry) => entry.kind === 'publish')
    .map((entry) => {
      if (! entry.tarball) { throw new Error(`The publish plan has no tarball for ${entry.name}@${entry.version}: was it written by changeset pack?`) }
      return { name: entry.name, version: entry.version, tarball: path.resolve(packDir, entry.tarball.path) }
    })
}

interface PlanFileT {
  version: number
  plan:    { kind: string, name: string, version: string, tarball?: { path: string } }[][]
}

/**
 * The dependency ranges in a packed package.json that still use the `workspace:` protocol: none,
 * when pnpm packed it. npm would publish them as written, and no consumer could install them.
 *
 * @param manifest - A package.json, as read from the tarball.
 * @returns `<dependency>: <range>` for each one left.
 *
 * @example workspaceRanges({ peerDependencies: { safebyok: 'workspace:^' } })  // => ['safebyok: workspace:^']
 */
export function workspaceRanges(manifest: Record<string, unknown>): string[] {
  return ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    .flatMap((field) => Object.entries((manifest[field] ?? {}) as Record<string, string>))
    .filter(([_dep, range]) => range.startsWith('workspace:'))
    .map(([dep, range]) => `${dep}: ${range}`)
}

/**
 * The entry points in a packed package.json that still carry the workspace's `@safebyok/source`
 * condition: none, when pnpm packed it, since pnpm ships `publishConfig.exports` in their place.
 * npm would publish them as written, pointing a consumer's tooling at a src/ the tarball lacks.
 *
 * @param manifest - A package.json, as read from the tarball.
 * @returns `exports["<entry>"]: @safebyok/source` for each one left.
 *
 * @example sourceConditions({ exports: { '.': { '@safebyok/source': './src/index.ts' } } })  // => ['exports["."]: @safebyok/source']
 */
export function sourceConditions(manifest: Record<string, unknown>): string[] {
  return Object.entries((manifest['exports'] ?? {}) as Record<string, unknown>)
    .filter(([_entry, target]) => typeof target === 'object' && target !== null && Object.hasOwn(target, '@safebyok/source'))
    .map(([entry]) => `exports["${entry}"]: @safebyok/source`)
}

/**
 * The package.json inside a packed tarball.
 *
 * @param run     - Runs `tar`.
 * @param tarball - Path to the .tgz.
 * @returns The manifest, parsed.
 */
export async function packedManifest(run: Runner, tarball: string): Promise<Record<string, unknown>> {
  const result = await run('tar', ['-xzOf', tarball, 'package/package.json'])
  if (result.exitCode !== 0) { throw new Error(`Could not read package/package.json from ${tarball}`) }
  return JSON.parse(result.stdout) as Record<string, unknown>
}

/** How `stage` runs: its commands, and whether it may change anything */
export interface StageOpts {
  run:     Runner
  dryRun:  boolean
  /** Where the git tags to push are reported, one JSON line each; none when unset */
  tagfile: string | undefined
}

/**
 * Stages each release on npm, in order, and reports its git tag for the changesets action.
 *
 * A release at the placeholder version, or whose tarball still holds a `workspace:` range, is
 * never staged. One whose tag already names another commit was released from that commit, and is
 * left alone without asking npm: a later push to main never restages it. One npm refuses as
 * already published (or already staged) counts as done. A release staged or done whose tag is not
 * yet on origin, or whose tag is there at this commit but has no GitHub release, has it reported,
 * for the changesets action to push and to write the release; a dry run reports none. Every
 * release is attempted, whatever happened to the one before.
 *
 * @param releases - From `readPackDir`, in order.
 * @param opts     - The runner, dry run, and tag file.
 * @returns One outcome per release, in order.
 */
export async function stage(releases: readonly Release[], opts: StageOpts): Promise<StageOutcome[]> {
  if (releases.length === 0) { return [] }
  const headOut = await runGit(opts.run, ['rev-parse', 'HEAD'])
  const head = headOut.trim()
  const outcomes: StageOutcome[] = []
  for (const release of releases) {
    try {
      outcomes.push(await stageOne(release, head, opts))
    } catch (err) {
      outcomes.push(unexpectedFailure(release, err))
    }
  }
  return outcomes
}

/** A release that stopped on a failure of ours (git, gh, tar) rather than on npm's answer: reported failed, and the next is still tried */
function unexpectedFailure(release: Release, err: unknown): StageOutcome {
  const reason = err instanceof Error ? firstLine(err.message) : 'something unexpected'
  return { release, kind: 'failed', detail: `could not tell what is left to do: ${reason}` }
}

async function stageOne(release: Release, head: string, opts: StageOpts): Promise<StageOutcome> {
  if (release.version === PlaceholderVersion) {
    return { release, kind: 'placeholder', detail: `${PlaceholderVersion} is the placeholder version, never released` }
  }
  const tag = gitTag(release)
  const taggedAt = await tagCommit(opts.run, tag)
  if (taggedAt && taggedAt !== head) {
    return { release, kind: 'already', detail: `released from ${taggedAt.slice(0, 12)}, which its tag names` }
  }
  const outcome = await stageTarball(release, opts)
  const done = outcome.kind === 'staged' || outcome.kind === 'already'
  if (! done || opts.dryRun) { return outcome }
  if (taggedAt && await releaseExists(opts.run, tag)) { return outcome }
  if (opts.tagfile) {
    appendFileSync(opts.tagfile, `${JSON.stringify({ type: 'git-tag', tag, packageName: release.name })}\n`)
  }
  return { ...outcome, tagged: tag }
}

async function stageTarball(release: Release, opts: StageOpts): Promise<StageOutcome> {
  const manifest = await packedManifest(opts.run, release.tarball)
  const leftover = [...workspaceRanges(manifest), ...sourceConditions(manifest)]
  if (leftover.length > 0) {
    return { release, kind: 'failed', detail: `its packed package.json still holds ${leftover.join(', ')}: pack it with pnpm` }
  }
  const args = ['stage', 'publish', release.tarball, '--access', 'public', '--tag', distTag(release.version), '--json']
  const result = await opts.run('npm', opts.dryRun ? [...args, '--dry-run'] : args)
  if (result.exitCode === 0) {
    const stageId = /"stageId":\s*"([^"]+)"/.exec(result.stdout)?.[1]
    return { release, kind: 'staged', detail: stageId ? `stage id ${stageId}` : `under ${distTag(release.version)}` }
  }
  const npmError = npmErrorOf(result)
  if (/previously published/i.test(npmError.summary)) {
    return { release, kind: 'already', detail: 'npm already holds this version, staged or published' }
  }
  return { release, kind: 'failed', detail: `npm ${npmError.code}: ${npmError.summary}` }
}

/** The commit a tag on origin names, peeled through an annotated tag; undefined when there is no such tag */
async function tagCommit(run: Runner, tag: string): Promise<string | undefined> {
  const listing = await runGit(run, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`])
  const refs = new Map(listing.split('\n').filter(Boolean).map((line) => {
    const [sha = '', ref = ''] = line.split('\t', 2)
    return [ref, sha] as const
  }))
  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`)
}

/** Whether GitHub holds a release of the tag; an answer other than "not found" is an error, not a no */
async function releaseExists(run: Runner, tag: string): Promise<boolean> {
  const result = await run('gh', ['release', 'view', tag])
  if (result.exitCode === 0) { return true }
  if (/release not found/i.test(result.stderr)) { return false }
  throw new Error(`gh release view ${tag} failed (exit ${String(result.exitCode)}): ${firstLine(result.stderr)}`)
}

async function runGit(run: Runner, args: readonly string[]): Promise<string> {
  const result = await run('git', args)
  if (result.exitCode !== 0) { throw new Error(`git ${args.join(' ')} failed (exit ${String(result.exitCode)}): ${firstLine(result.stderr)}`) }
  return result.stdout
}

/**
 * npm's error code and summary, from the JSON it prints under `--json`, and nothing else of what
 * it printed: that much says what went wrong without echoing a request or its headers.
 */
function npmErrorOf(result: RunResult): { code: string, summary: string } {
  const exitNote = `exit ${String(result.exitCode)}`
  const jsonText = result.stdout.slice(result.stdout.indexOf('{'), result.stdout.lastIndexOf('}') + 1)
  try {
    const parsed = JSON.parse(jsonText) as { error?: { code?: string, summary?: string } }
    return { code: parsed.error?.code ?? exitNote, summary: firstLine(parsed.error?.summary ?? '') }
  } catch {
    return { code: exitNote, summary: '(no error summary from npm)' }
  }
}

function firstLine(str: string): string {
  return (str.split('\n', 1)[0] ?? '').trim().slice(0, 300)
}

/**
 * One line saying what happened to a release.
 *
 * @param outcome - What `stage` did.
 * @param dryRun  - Whether it was a dry run.
 * @returns The line, without a newline.
 *
 * @example describeOutcome(outcome, false)  // => 'safebyok@0.1.0: staged (stage id 42); tag safebyok@0.1.0 to push'
 */
export function describeOutcome(outcome: StageOutcome, dryRun: boolean): string {
  const prefix = dryRun ? '(dry run) ' : ''
  const tagNote = outcome.tagged ? `; tag ${outcome.tagged} to push` : ''
  return `${prefix}${gitTag(outcome.release)}: ${outcome.kind} (${outcome.detail})${tagNote}`
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  const rootDir = path.resolve(import.meta.dirname, '..')
  const run = processRunner(rootDir)
  if (command === 'check') { return checkCommand(run, rootDir) }
  const pathArg = rest.find((arg) => ! arg.startsWith('--'))
  if (command === 'stage' && pathArg) { return stageCommand(run, pathArg, rest.includes('--dry-run')) }
  if (command === 'names' && pathArg) { return namesCommand(pathArg) }
  process.stderr.write('Usage: node scripts/release.ts check | stage <pack-dir> [--dry-run] | names <release-plan.json>\n')
  return 2
}

async function checkCommand(run: Runner, rootDir: string): Promise<number> {
  const problems = releaseProblems(await listWorkspace(run), rootDir, readFixedGroups(path.join(rootDir, '.changeset', 'config.json')))
  for (const problem of problems) { process.stderr.write(`release check: ${problem}\n`) }
  if (problems.length === 0) { process.stdout.write('release check: the public packages and the fixed group agree.\n') }
  return problems.length === 0 ? 0 : 1
}

async function stageCommand(run: Runner, packDir: string, dryRun: boolean): Promise<number> {
  const outcomes = await stage(readPackDir(path.resolve(packDir)), { run, dryRun, tagfile: process.env['CHANGESETS_OUTPUT'] })
  for (const outcome of outcomes) { process.stdout.write(`${describeOutcome(outcome, dryRun)}\n`) }
  if (outcomes.length === 0) { process.stdout.write('Nothing to stage.\n') }
  return outcomes.some((outcome) => outcome.kind === 'failed') ? 1 : 0
}

function namesCommand(planPath: string): number {
  const names = versionPrNames(readReleasePlan(path.resolve(planPath)))
  const lines = `pr-title=${names.prTitle}\ncommit-message=${names.commitMessage}\n`
  const outfile = process.env['GITHUB_OUTPUT']
  if (outfile) { appendFileSync(outfile, lines) }
  process.stdout.write(lines)
  return 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
