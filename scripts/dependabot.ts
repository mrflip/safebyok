/**
 * Dependabot's pull requests that move a public package's runtime dependencies, and the changeset
 * they need (PROCESS.md, *Releases*). Two questions, answered for CI and for the workflow that
 * writes the changeset (.github/workflows/dependabot-changeset.yml):
 *
 * * `commits` -- is every commit on the branch Dependabot's? One human commit pushed to a
 *   Dependabot branch makes it a pull request like any other, so it is asked for a changeset
 *   whatever it moves. Exits 0 when all are Dependabot's, 1 (naming the others) when not.
 * * `changeset` -- writes the changeset for the runtime dependencies the branch moves, a patch for
 *   each package that moves any (the level before 1.0 for a dependency bump), to
 *   `.changeset/dependabot-<pr-number>.md` in the working tree, and prints its path. Writes
 *   nothing, and says why on stderr, when the branch holds a commit that is not Dependabot's or
 *   moves no runtime dependency.
 *
 *   node scripts/dependabot.ts commits <base-commit> [<head-commit>]
 *   node scripts/dependabot.ts changeset <base-commit> <head-commit> <pr-number>
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { listWorkspace, processRunner, publicPackages, type Runner, type WorkspacePackage } from './release.ts'
import { changedRuntimeDeps, type RuntimeDepChange } from './runtime-deps.ts'

/** The email GitHub gives the commits Dependabot makes: its user id, then its noreply address */
export const DependabotEmail = '49699333+dependabot[bot]@users.noreply.github.com'

/** A commit on the branch that is not Dependabot's */
export interface ForeignCommit {
  sha:     string
  author:  string
  subject: string
}

/**
 * The commits between two commits whose author is not Dependabot.
 *
 * @param run  - Runs `git`, in the repository.
 * @param base - The commit the branch starts from, not counted.
 * @param head - The commit the branch ends at.
 * @returns Each commit not authored by Dependabot, oldest first; none when every one is.
 */
export async function foreignCommits(run: Runner, base: string, head: string): Promise<ForeignCommit[]> {
  const result = await run('git', ['log', '--reverse', '--format=%h%x09%ae%x09%s', `${base}..${head}`])
  if (result.exitCode !== 0) { throw new Error(`dependabot: git could not list the commits from ${base} to ${head}: ${result.stderr.trim()}`) }
  return result.stdout.split('\n').filter(Boolean)
    .map((line) => {
      const [sha = '', author = '', ...subject] = line.split('\t')
      return { sha, author, subject: subject.join('\t') }
    })
    .filter((commit) => commit.author !== DependabotEmail)
}

/** What a name or range may hold to be written into a changeset: nothing that could end a code span or a line */
const Unwritable = /[^\w@./~^<>=|*:+ ,{}"-]/g

/** A name as npm spells a package: lowercase, digits and `-._~`, with an optional `@scope/` */
const PackageName = /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/

/**
 * The changeset for runtime dependencies moved: a patch bump of each package that moves any, and
 * one line each saying what moved. Names and ranges are Dependabot's, and arrive from the pull
 * request: what is not plain text is replaced with `?`, and ranges are set in code spans, so a changed manifest cannot write
 * anything but a line of release note.
 *
 * @param changes - From `changedRuntimeDeps`.
 * @returns The changeset file's text; none when `changes` is empty.
 *
 * @example changesetText([{ pkgname: 'safebyok', field: 'dependencies', depname: 'idb-keyval', ante: '^6.3.0', post: '^6.4.0' }])
 *   // => '---\n"safebyok": patch\n---\n\nDependabot moved a runtime dependency:\n\n* `idb-keyval` (safebyok dependencies): `^6.3.0` -> `^6.4.0`\n'
 */
export function changesetText(changes: readonly RuntimeDepChange[]): string | undefined {
  if (changes.length === 0) { return undefined }
  const pkgnames = [...new Set(changes.map((change) => change.pkgname))]
  const badName = pkgnames.find((pkgname) => ! PackageName.test(pkgname))
  if (badName !== undefined) { throw new Error('dependabot: a package name is not one npm would take; no changeset written.') }
  const frontmatter = pkgnames.map((pkgname) => `"${pkgname}": patch`).join('\n')
  const lines = changes.map((change) => {
    const ante = change.ante === undefined ? '(none)' : `\`${plain(change.ante)}\``
    const post = change.post === undefined ? '(none)' : `\`${plain(change.post)}\``
    return `* \`${plain(change.depname)}\` (${plain(change.pkgname)} ${change.field}): ${ante} -> ${post}`
  })
  const lead = changes.length === 1 ? 'Dependabot moved a runtime dependency:' : 'Dependabot moved runtime dependencies:'
  return `---\n${frontmatter}\n---\n\n${lead}\n\n${lines.join('\n')}\n`
}

function plain(str: string): string {
  return str.replaceAll(Unwritable, '?')
}

/**
 * Where the changeset for a pull request goes, relative to the repository's root.
 *
 * @param prNumber - The pull request's number.
 * @returns `.changeset/dependabot-<n>.md`.
 *
 * @example changesetPath(129)  // => '.changeset/dependabot-129.md'
 */
export function changesetPath(prNumber: number): string {
  if (! Number.isSafeInteger(prNumber) || prNumber < 1) { throw new TypeError('dependabot: a pull request number is a positive whole number.') }
  return `.changeset/dependabot-${String(prNumber)}.md`
}

/** What `dependabotChangeset` did */
export type ChangesetOutcome =
  | { kind: 'written', file: string }
  | { kind: 'foreign', commits: ForeignCommit[] }
  | { kind: 'unmoved' }

/**
 * Writes the changeset a Dependabot branch needs, unless it needs none or is not wholly Dependabot's.
 *
 * @param run      - Runs `git`, in the repository.
 * @param rootDir  - The repository's root, where `.changeset/` is.
 * @param packages - The public packages, as the workspace stands.
 * @param base     - The commit the branch starts from.
 * @param head     - The commit the branch ends at.
 * @param prNumber - The pull request's number, which names the file.
 * @returns What was done: the file written (as a path from `rootDir`); the commits that are not
 *   Dependabot's, which stop it; or that no runtime dependency moved.
 */
export async function dependabotChangeset(run: Runner, rootDir: string, packages: readonly WorkspacePackage[], base: string, head: string, prNumber: number): Promise<ChangesetOutcome> {
  const file = changesetPath(prNumber)
  const commits = await foreignCommits(run, base, head)
  if (commits.length > 0) { return { kind: 'foreign', commits } }
  const text = changesetText(await changedRuntimeDeps(run, rootDir, packages, base, head))
  if (text === undefined) { return { kind: 'unmoved' } }
  writeFileSync(path.join(rootDir, file), text)
  return { kind: 'written', file }
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, base, head = 'HEAD', prArg] = argv
  if (! base || (command !== 'commits' && command !== 'changeset')) {
    process.stderr.write('Usage: node scripts/dependabot.ts commits <base> [<head>] | changeset <base> <head> <pr-number>\n')
    return 2
  }
  const rootDir = path.resolve(import.meta.dirname, '..')
  const run = processRunner(rootDir)
  if (command === 'commits') {
    const foreign = await foreignCommits(run, base, head)
    for (const commit of foreign) { process.stdout.write(`${commit.sha} ${commit.subject} (${commit.author})\n`) }
    return foreign.length === 0 ? 0 : 1
  }
  const packages = publicPackages(await listWorkspace(run), rootDir)
  const outcome = await dependabotChangeset(run, rootDir, packages, base, head, Number(prArg))
  if (outcome.kind === 'written') {
    process.stdout.write(`${outcome.file}\n`)
  } else if (outcome.kind === 'foreign') {
    process.stderr.write('dependabot: the branch holds a commit that is not Dependabot\'s: no changeset written.\n')
  } else {
    process.stderr.write('dependabot: no public package\'s runtime dependencies moved: no changeset written.\n')
  }
  return 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
