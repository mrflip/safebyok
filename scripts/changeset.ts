/**
 * `pnpm changeset`: the changesets CLI, with the changeset it writes named for the thread. The
 * CLI names a new changeset with random words (`wacky-deserts-start.md`); this runs it as given,
 * then renames each changeset it wrote to the thread's branch name, `YYYYMMDD-<label>.md`, adding
 * `-2`, `-3`, ... when that name is taken. Off a thread branch (main, a detached HEAD, a bot's
 * branch) the random name stays, and it says so.
 *
 * The CLI asks its questions at a terminal and exits 13 without one. Given `--package`, this
 * writes the changeset itself and asks nothing, for an agent: each `--package` names a public
 * package (repeat it, or comma-separate), `--bump` is `patch`, `minor` or `major`, and
 * `--message` is the sentence for the CHANGELOG. It needs a thread branch to name the file for.
 *
 *   node scripts/changeset.ts [changeset arguments...]
 *   node scripts/changeset.ts --package safebyok --package safebyok-react --bump minor --message "What a host sees."
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Label } from './newb-label.ts'
import { processRunner, readFixedGroups, type Runner } from './release.ts'

/** One changeset renamed: its file name as the CLI wrote it, and as it is now */
export interface Renamed {
  from: string
  to:   string
}

/**
 * The thread a branch is, if it is one: `YYYYMMDD-<label>`, as PROCESS.md names a thread's branch.
 *
 * @param branch - A branch name, as `git branch --show-current` prints it.
 * @returns The branch name, or undefined when it is not a thread's.
 *
 * @example threadOf('20261015-roadmap_fruit')  // => '20261015-roadmap_fruit'
 * @example threadOf('main')                    // => undefined
 */
export function threadOf(branch: string): string | undefined {
  const label = /^20\d{6}-(.+)$/.exec(branch)?.[1] ?? ''
  return Label.re.test(label) ? branch : undefined
}

/**
 * The file name for a thread's changeset: `<thread>.md`, or the first of `<thread>-2.md`,
 * `<thread>-3.md`, ... not already taken.
 *
 * @param thread - The thread's branch name.
 * @param taken  - File names already in .changeset/.
 * @returns A file name not in `taken`.
 *
 * @example changesetFilename('20261015-roadmap_fruit', new Set(['20261015-roadmap_fruit.md']))  // => '20261015-roadmap_fruit-2.md'
 */
export function changesetFilename(thread: string, taken: ReadonlySet<string>): string {
  return firstFree(thread, taken, 1)
}

function firstFree(thread: string, taken: ReadonlySet<string>, suffix: number): string {
  const filename = suffix === 1 ? `${thread}.md` : `${thread}-${String(suffix)}.md`
  return taken.has(filename) ? firstFree(thread, taken, suffix + 1) : filename
}

/**
 * The Markdown files in a changeset directory: the changesets, and its README.
 *
 * @param changesetDir - The .changeset directory.
 * @returns Their file names.
 */
export function markdownFiles(changesetDir: string): Set<string> {
  return new Set(readdirSync(changesetDir).filter((filename) => filename.endsWith('.md')))
}

/**
 * The changesets written since `before` was listed, in order of file name.
 *
 * @param changesetDir - The .changeset directory.
 * @param before       - Its Markdown files before the CLI ran, from `markdownFiles`.
 * @returns Their file names.
 */
export function newChangesets(changesetDir: string, before: ReadonlySet<string>): string[] {
  return readdirSync(changesetDir)
    .filter((filename) => filename.endsWith('.md') && ! before.has(filename))
    .toSorted((left, right) => left.localeCompare(right))
}

/**
 * Renames each changeset written since `before` was listed to a name of the thread's.
 *
 * @param changesetDir - The .changeset directory.
 * @param before       - Its Markdown files before the CLI ran, from `markdownFiles`.
 * @param thread       - The thread's branch name.
 * @returns Each changeset renamed.
 */
export function renameNewChangesets(changesetDir: string, before: ReadonlySet<string>, thread: string): Renamed[] {
  const taken = new Set(before)
  return newChangesets(changesetDir, before).map((from) => {
    const to = changesetFilename(thread, taken)
    taken.add(to)
    renameSync(path.join(changesetDir, from), path.join(changesetDir, to))
    return { from, to }
  })
}

/** The levels a changeset may bump a package by */
export const BumpLevels = ['patch', 'minor', 'major'] as const

/** One of the levels a changeset may bump a package by */
export type BumpLevel = typeof BumpLevels[number]

/** A changeset asked for with flags rather than at a terminal */
export interface ChangesetRequest {
  packages: string[]
  bump:     BumpLevel
  message:  string
}

/**
 * The changeset the flags ask for: `--package` (repeated or comma-separated), `--bump` and
 * `--message`, each checked.
 *
 * @param argv        - The arguments after `pnpm changeset`.
 * @param publicNames - The public packages' names: the only ones a changeset may bump.
 * @returns The request; undefined when none of the three flags is given, so the CLI is to run.
 * @throws When some are given and the request is not whole or names something unknown, saying what to change.
 *
 * @example changesetRequest(['--package', 'safebyok', '--bump', 'minor', '--message', 'A thing.'], ['safebyok'])
 *   // => { packages: ['safebyok'], bump: 'minor', message: 'A thing.' }
 */
export function changesetRequest(argv: readonly string[], publicNames: readonly string[]): ChangesetRequest | undefined {
  const { values } = parseArgs({
    args:    [...argv],
    options: { 'package': { type: 'string', multiple: true, short: 'p' }, 'bump': { type: 'string', short: 'b' }, 'message': { type: 'string', short: 'm' } },
    strict:  false,
  })
  const { bump, message, package: packageArgs } = values
  const named = [packageArgs ?? []].flat().flatMap((arg) => (typeof arg === 'string' ? arg.split(',') : [])).map((pkgname) => pkgname.trim()).filter(Boolean)
  if (packageArgs === undefined && bump === undefined && message === undefined) { return undefined }
  if (named.length === 0) { throw new Error('changeset: --bump and --message go with --package: name the public packages the change touches.') }
  const unknown = named.filter((pkgname) => ! publicNames.includes(pkgname))
  if (unknown.length > 0) { throw new Error(`changeset: ${unknown.join(', ')} is not a public package (${publicNames.join(', ')}).`) }
  const level = BumpLevels.find((candidate) => candidate === bump)
  if (! level) { throw new Error(`changeset: --bump is one of ${BumpLevels.join(', ')}.`) }
  if (typeof message !== 'string' || ! message.trim()) { throw new Error('changeset: --message is the sentence or two the CHANGELOG will carry; it may not be empty.') }
  return { packages: [...new Set(named)], bump: level, message: message.trim() }
}

/**
 * A request as a changeset file, as the CLI writes one.
 *
 * @param request - From `changesetRequest`.
 * @returns The file's text.
 *
 * @example changesetText({ packages: ['safebyok'], bump: 'minor', message: 'A thing.' })  // => '---\n"safebyok": minor\n---\n\nA thing.\n'
 */
export function changesetText(request: ChangesetRequest): string {
  const frontmatter = request.packages.map((pkgname) => `"${pkgname}": ${request.bump}`).join('\n')
  return `---\n${frontmatter}\n---\n\n${request.message}\n`
}

/**
 * Writes a request to `.changeset/`, named for the thread.
 *
 * @param changesetDir - The .changeset directory.
 * @param thread       - The thread's branch name.
 * @param request      - From `changesetRequest`.
 * @returns The file name written.
 */
export function writeChangeset(changesetDir: string, thread: string, request: ChangesetRequest): string {
  const filename = changesetFilename(thread, markdownFiles(changesetDir))
  writeFileSync(path.join(changesetDir, filename), changesetText(request))
  return filename
}

async function currentBranch(run: Runner): Promise<string> {
  const result = await run('git', ['branch', '--show-current'])
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

async function main(argv: readonly string[]): Promise<number> {
  const rootDir = path.resolve(import.meta.dirname, '..')
  const changesetDir = path.join(rootDir, '.changeset')
  const publicNames = readFixedGroups(path.join(changesetDir, 'config.json')).flat()
  const requested = requestFrom(argv, publicNames)
  if (requested instanceof Error) {
    process.stderr.write(`${requested.message}\n`)
    return 2
  }
  if (requested) { return writeRequested(processRunner(rootDir), changesetDir, requested) }
  const before = markdownFiles(changesetDir)
  const result = spawnSync(path.join(rootDir, 'node_modules', '.bin', 'changeset'), argv, { cwd: rootDir, stdio: 'inherit' })
  const branch = await currentBranch(processRunner(rootDir))
  const thread = threadOf(branch)
  if (! thread) {
    const written = newChangesets(changesetDir, before)
    if (written.length > 0) {
      process.stderr.write(`changeset: ${branch || 'this HEAD'} is not a thread branch (YYYYMMDD-<label>), so ${written.join(', ')} keeps its name.\n`)
    }
    return result.status ?? 1
  }
  for (const { from, to } of renameNewChangesets(changesetDir, before, thread)) {
    process.stdout.write(`changeset: .changeset/${from} is renamed .changeset/${to}, for the thread.\n`)
  }
  return result.status ?? 1
}

function requestFrom(argv: readonly string[], publicNames: readonly string[]): ChangesetRequest | Error | undefined {
  try {
    return changesetRequest(argv, publicNames)
  } catch (err) {
    return err instanceof Error ? err : new Error('changeset: the flags are not understood.')
  }
}

async function writeRequested(run: Runner, changesetDir: string, request: ChangesetRequest): Promise<number> {
  const branch = await currentBranch(run)
  const thread = threadOf(branch)
  if (! thread) {
    process.stderr.write(`changeset: ${branch || 'this HEAD'} is not a thread branch (YYYYMMDD-<label>), and the file is named for the thread: switch to it, or run \`pnpm changeset\` at a terminal.\n`)
    return 2
  }
  process.stdout.write(`changeset: .changeset/${writeChangeset(changesetDir, thread, request)} is written, for the thread.\n`)
  return 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
