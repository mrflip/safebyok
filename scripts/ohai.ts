/**
 * Sings out where an agent stands, as one greppable line: who it is, how long since it began,
 * and what it has just turned to. A thread-worker starting thread 3 of sprint gripes runs
 *
 *   scripts/ohai --begin --role thread-worker --sprint gripes --thread 3 --model claude-opus-5-5 building
 *
 * and later `scripts/ohai repairing lint errors`, which prints
 *
 *   OHAI 2026-10-28T20:42:10Z +1:42:10 [thread-worker sprint=gripes thread=3 branch=20261028-vault_record model=claude-opus-5-5] repairing lint errors
 *
 * The time is UTC; the +H:MM:SS is the time since the agent's --begin. --begin keeps the
 * singer's fields and start in the worktree's own git directory, so each worktree has its singer
 * and a fresh agent in the same worktree begins again. The branch is the worktree's own unless
 * --branch names one (a reviewer stands on a detached HEAD). The --begin line also records what
 * the shell knows of the agent: the Claude Code session, the worktree and the Claude Code
 * version. Every line is appended as well to ohai.log in the git directory all the repository's
 * worktrees share, so a single `tail -f "$(git rev-parse --git-common-dir)/ohai.log"` watches
 * every agent at once.
 *
 * `scripts/ohai --hook` is the PreCompact hook in .claude/settings.json. Its input names only
 * the session, never the subagent compacting, so it logs the subagent whose transcript was
 * written last as its best guess, with that transcript's last context size. It always exits 0:
 * a hook that fails must not stand in a compaction's way.
 *
 * Usage: scripts/ohai [--begin --role <role> [--sprint <s>] [--thread <n>] [--model <m>]
 *        [--effort <e>] [--branch <b>]] <what...>  |  scripts/ohai --hook
 * Exits 0 when it has sung, 1 outside a git worktree, 2 on arguments it does not understand.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Filer, isErrnoCode } from './filer.ts'

/** The fields a singer is known by, in the order its lines show them */
export const SingerFieldnames = ['sprint', 'thread', 'branch', 'model', 'effort'] as const
export type Singer = { role: string } & Partial<Record<typeof SingerFieldnames[number], string | undefined>>
/** The PreCompact hook's guess at the subagent compacting */
export type CompactGuess = { agentType: string | undefined, description: string | undefined, ctx: number | undefined }

const Usage = 'Usage: scripts/ohai [--begin --role <role> [--sprint <s>] [--thread <n>] [--model <m>] [--effort <e>] [--branch <b>]] <what...>, eg scripts/ohai --begin --role thread-worker --sprint gripes --thread 3 --model claude-opus-5-5 building'
const Unbegun: Singer = { role: 'an agent that did not --begin' }
// A subagent transcript written this long before a compaction is taken to be the one compacting.
const HookGuessWindowMs = 120_000

const pad2 = (num: number) => String(num).padStart(2, '0')

/**
 * The line an agent sings.
 *
 * @param now - The time of singing, in epoch milliseconds.
 * @param began - When the singer began, in epoch milliseconds, or null where it is not known.
 * @param who - The bracketed name, as `singerBlurb` or `hookBlurb` makes it.
 * @param what - What the agent has turned to.
 *
 * @example ohaiLine(Date.UTC(2026, 9, 28, 20, 42, 10), Date.UTC(2026, 9, 28, 19), 'thread-worker thread=3', 'proving')
 *   // => 'OHAI 2026-10-28T20:42:10Z +1:42:10 [thread-worker thread=3] proving'
 */
export function ohaiLine(now: number, began: number | null, who: string, what: string): string {
  const when = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z')
  if (began === null) { return `OHAI ${when} +-:--:-- [${who}] ${what}` }
  const secs = Math.max(0, Math.floor((now - began) / 1000))
  return `OHAI ${when} +${String(Math.floor(secs / 3600))}:${pad2(Math.floor(secs / 60) % 60)}:${pad2(secs % 60)} [${who}] ${what}`
}

/**
 * A singer's bracketed name: its role, then each field it has, as `fieldname=value`.
 *
 * @example singerBlurb({ role: 'thread-worker', sprint: 'gripes', thread: '3' })  // => 'thread-worker sprint=gripes thread=3'
 */
export function singerBlurb(singer: Singer): string {
  const parts = [singer.role]
  for (const fieldname of SingerFieldnames) {
    const val = singer[fieldname]
    if (val) { parts.push(`${fieldname}=${val}`) }
  }
  return parts.join(' ')
}

/**
 * What the shell knows of the agent running it, for the --begin line: its Claude Code session
 * (the parent's, for a subagent), its worktree, and the Claude Code version.
 *
 * @param env - The process environment.
 * @param toplevel - The worktree's root.
 *
 * @example shellKnows({ CLAUDE_CODE_SESSION_ID: 'df710b96-c586-…', AI_AGENT: 'claude-code_2-1-311_agent' }, '/w/byok-ohai')
 *   // => 'session=df710b96 worktree=byok-ohai claude-code=2.1.311'
 */
export function shellKnows(env: NodeJS.ProcessEnv, toplevel: string): string {
  const session = env['CLAUDE_CODE_SESSION_ID']?.slice(0, 8)
  const version = /^claude-code_(\d+)-(\d+)-(\d+)/.exec(env['AI_AGENT'] ?? '')?.slice(1).join('.')
  return [session && `session=${session}`, `worktree=${path.basename(toplevel)}`, version && `claude-code=${version}`].filter(Boolean).join(' ')
}

/**
 * The PreCompact hook's line: which session is compacting, and its best guess at the subagent.
 *
 * @param input - The hook's input: `session_id`, `trigger`.
 * @param guess - The subagent whose transcript was written last, if one was written lately:
 *   its `agentType`, `description` and last context size in tokens.
 *
 * @example hookBlurb({ session_id: 'df710b96-c586-…', trigger: 'auto' }, { agentType: 'thread-worker', description: 'Thread 3', ctx: 171_800 })
 *   // => ['hook session=df710b96 likely=thread-worker "Thread 3"', 'compacting (auto, at ~172k)']
 */
export function hookBlurb(
  input: { session_id?: string, trigger?: string },
  guess: CompactGuess | null,
): [string, string] {
  const session = `hook session=${(input.session_id ?? '?').slice(0, 8)}`
  const trigger = input.trigger ?? '?'
  if (!guess) { return [`${session} main session or unknown`, `compacting (${trigger})`] }
  const described = guess.description ? ` "${guess.description}"` : ''
  const at = guess.ctx ? `, at ~${String(Math.round(guess.ctx / 1000))}k` : ''
  return [`${session} likely=${guess.agentType ?? '?'}${described}`, `compacting (${trigger}${at})`]
}

// == [Shell]: git, the singer's file, the log, the hook's transcripts

const gitPath = (...args: string[]) => (
  execFileSync('git', ['rev-parse', '--path-format=absolute', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
)
const currentBranch = () => (
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
)

const logFiler = () => new Filer(path.join(gitPath('--git-common-dir'), 'ohai.log'), { mode: 0o644 })

function sing(who: string, what: string, began: number | null, now: number) {
  const line = ohaiLine(now, began, who, what)
  logFiler().appendLine(line)
  process.stdout.write(`${line}\n`)
}

function subagentFilenames(dir: string): string[] | null {
  try {
    return readdirSync(dir).filter((filename) => filename.endsWith('.jsonl'))
  } catch (err) {
    if (isErrnoCode(err, 'ENOENT')) { return null }
    throw err
  }
}

function guessCompacting(transcriptPath: string, sessionId: string, now: number): CompactGuess | null {
  const dir = path.join(path.dirname(transcriptPath), sessionId, 'subagents')
  const newest = subagentFilenames(dir)
    ?.map((filename) => ({ filename, mtime: statSync(path.join(dir, filename)).mtimeMs }))
    .toSorted((aa, bb) => bb.mtime - aa.mtime)[0]
  if (!newest || now - newest.mtime > HookGuessWindowMs) { return null }
  const where = path.join(dir, newest.filename)
  const meta = (new Filer(where.replace(/\.jsonl$/, '.meta.json')).getJson() ?? {}) as { agentType?: string, description?: string }
  let ctx: number | undefined
  const latestFirst = (new Filer(where).getText() ?? '').trimEnd().split('\n').toReversed()
  for (const line of latestFirst) {
    const usage = (JSON.parse(line) as { message?: { usage?: Record<string, number> } }).message?.usage
    if (usage) { ctx = (usage['input_tokens'] ?? 0) + (usage['cache_read_input_tokens'] ?? 0) + (usage['cache_creation_input_tokens'] ?? 0); break }
  }
  return { agentType: meta.agentType, description: meta.description, ctx }
}

function runHook(now: number) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as { session_id?: string, transcript_path?: string, trigger?: string }
    const guess = input.transcript_path && input.session_id ? guessCompacting(input.transcript_path, input.session_id, now) : null
    const [who, what] = hookBlurb(input, guess)
    logFiler().appendLine(ohaiLine(now, null, who, what))
  } catch {
    // A hook that fails must not stand in a compaction's way.
  }
}

function runSing(argv: string[], env: NodeJS.ProcessEnv, now: number): number {
  let parsed
  try {
    parsed = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: { begin: { type: 'boolean' }, role: { type: 'string' }, sprint: { type: 'string' }, thread: { type: 'string' }, model: { type: 'string' }, effort: { type: 'string' }, branch: { type: 'string' } },
    })
  } catch {
    process.stderr.write(`${Usage}\n`); return 2
  }
  const { values, positionals } = parsed
  const what = positionals.join(' ').trim()
  const fieldsGiven = values.role !== undefined || SingerFieldnames.some((fieldname) => values[fieldname] !== undefined)
  if (!what || (values.begin && !values.role) || (fieldsGiven && !values.begin)) {
    process.stderr.write(`${Usage}\n`); return 2
  }
  let singerFiler: Filer
  try { singerFiler = new Filer(gitPath('--git-path', 'ohai-singer')) } catch {
    process.stderr.write('ohai: not inside a git worktree, so there is nowhere to keep the start time or the log.\n'); return 1
  }
  if (values.begin) {
    const singer: Singer = { role: values.role!, sprint: values.sprint, thread: values.thread, branch: values.branch ?? (currentBranch() || undefined), model: values.model, effort: values.effort }
    singerFiler.dumpJson({ began: now, singer })
    sing(singerBlurb(singer), `${what} (${shellKnows(env, gitPath('--show-toplevel'))})`, now, now)
    return 0
  }
  const { began, singer } = JSON.parse(singerFiler.ensureText(JSON.stringify({ began: now, singer: Unbegun }))) as { began: number, singer: Singer }
  sing(singerBlurb(singer), what, began, now)
  return 0
}

// --

if (import.meta.main) {
  // OHAI_NOW, in epoch milliseconds, stands in for the clock in the tests.
  const now = process.env['OHAI_NOW'] ? Number(process.env['OHAI_NOW']) : Date.now()
  const argv = process.argv.slice(2)
  if (argv[0] === '--hook') {
    runHook(now)
  } else {
    process.exitCode = runSing(argv, process.env, now)
  }
}
