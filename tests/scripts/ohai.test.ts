import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { hookBlurb, ohaiLine, shellKnows, singerBlurb } from '../../scripts/ohai.ts'

const Script = path.resolve(import.meta.dirname, '../../scripts/ohai')
const Began = Date.UTC(2026, 9, 28, 19)
const Session = 'df710b96-c586-41cc-b278-92eb1b1796c3'

// A git that reads no one's own config, a fixed author, no Claude Code of its own, and a clock.
const isolatedEnv = (home: string, now: number) => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME:                home,
    XDG_CONFIG_HOME:     home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME:     'Tess Ter',
    GIT_AUTHOR_EMAIL:    'tess@example.com',
    GIT_COMMITTER_NAME:  'Tess Ter',
    GIT_COMMITTER_EMAIL: 'tess@example.com',
    OHAI_NOW:            String(now),
  }
  delete env['CLAUDE_CODE_SESSION_ID']
  delete env['AI_AGENT']
  return env
}

describe('ohaiLine', () => {
  it('stamps the UTC time and the time since the singer began', () => {
    expect(ohaiLine(Began + 6_130_000, Began, 'thread-worker thread=3', 'proving')).to.equal('OHAI 2026-10-28T20:42:10Z +1:42:10 [thread-worker thread=3] proving')
  })
  it('stamps +-:--:-- where when the singer began is not known', () => {
    expect(ohaiLine(Began, null, 'hook session=df710b96', 'compacting (auto)')).to.equal('OHAI 2026-10-28T19:00:00Z +-:--:-- [hook session=df710b96] compacting (auto)')
  })
})

describe('singerBlurb', () => {
  it('names the role, then each field the singer has, in a fixed order', () => {
    expect(singerBlurb({ role: 'thread-worker', model: 'claude-opus-5-5', sprint: 'gripes', thread: '3', branch: '20261028-vault_record' }))
      .to.equal('thread-worker sprint=gripes thread=3 branch=20261028-vault_record model=claude-opus-5-5')
    expect(singerBlurb({ role: 'thread-reviewer' })).to.equal('thread-reviewer')
  })
})

describe('shellKnows', () => {
  it('names the session, the worktree and the Claude Code version, where the shell knows them', () => {
    expect(shellKnows({ CLAUDE_CODE_SESSION_ID: Session, AI_AGENT: 'claude-code_2-1-311_agent' }, '/workspace/byok-ohai'))
      .to.equal('session=df710b96 worktree=byok-ohai claude-code=2.1.311')
    expect(shellKnows({}, '/workspace/byok')).to.equal('worktree=byok')
  })
})

describe('hookBlurb', () => {
  it('names the session and its likely subagent, with the context it compacted at', () => {
    expect(hookBlurb({ session_id: Session, trigger: 'auto' }, { agentType: 'thread-worker', description: 'Thread 3', ctx: 171_800 }))
      .to.deep.equal(['hook session=df710b96 likely=thread-worker "Thread 3"', 'compacting (auto, at ~172k)'])
  })
  it('says so when no subagent was written lately', () => {
    expect(hookBlurb({ session_id: Session, trigger: 'manual' }, null)).to.deep.equal(['hook session=df710b96 main session or unknown', 'compacting (manual)'])
  })
})

describe('scripts/ohai', () => {
  let scratch: string
  let main: string
  let git: (...args: string[]) => string
  let ohai: (args: string[], opts?: { cwd?: string, after?: number, input?: string }) => string
  const logged = () => readFileSync(path.join(main, '.git/ohai.log'), 'utf8').trim().split('\n')
  beforeEach(() => {
    scratch = TH.makeScratchDir('ohai-test-')
    main = path.join(scratch, 'repo')
    git = (...args: string[]) => (
      execFileSync('git', ['-C', main, ...args], { encoding: 'utf8', env: isolatedEnv(scratch, Began) }).trim()
    )
    ohai = (args, { cwd = main, after = 0, input } = {}) => (
      execFileSync(Script, args, { cwd, encoding: 'utf8', env: isolatedEnv(scratch, Began + (after * 1000)), input })
    )
    mkdirSync(main)
    git('init', '--quiet', '--initial-branch', 'main')
    git('commit', '--quiet', '--allow-empty', '--message', 'docs: a start')
  })

  it('begins with who it is and what the shell knows of it, then sings with the time since', () => {
    expect(ohai(['--begin', '--role', 'thread-worker', '--sprint', 'gripes', '--thread', '3', '--model', 'claude-opus-5-5', 'building'])).to.equal(
      'OHAI 2026-10-28T19:00:00Z +0:00:00 [thread-worker sprint=gripes thread=3 branch=main model=claude-opus-5-5] building (worktree=repo)\n',
    )
    expect(ohai(['repairing', 'lint', 'errors'], { after: (60 * 60) + (42 * 60) + 10 })).to.equal(
      'OHAI 2026-10-28T20:42:10Z +1:42:10 [thread-worker sprint=gripes thread=3 branch=main model=claude-opus-5-5] repairing lint errors\n',
    )
  })

  it('keeps a singer per worktree, and logs every worktree to the one log they share', () => {
    const linked = path.join(scratch, 'linked')
    git('worktree', 'add', '--quiet', '-b', 'thread', linked)
    ohai(['--begin', '--role', 'thread-worker', '--thread', '1', 'building'])
    ohai(['--begin', '--role', 'thread-reviewer', '--thread', '2', '--branch', 'twenty', 'reviewing'], { cwd: linked, after: 60 })
    expect(ohai(['proving'], { after: 120 })).to.include('+0:02:00 [thread-worker thread=1 branch=main] proving')
    expect(ohai(['judging findings'], { cwd: linked, after: 180 })).to.include('+0:02:00 [thread-reviewer thread=2 branch=twenty] judging findings')
    expect(logged().map((line) => line.replace(/^OHAI \S+ \S+ /, '').replace(/ \(worktree=\w+\)$/, ''))).to.deep.equal([
      '[thread-worker thread=1 branch=main] building',
      '[thread-reviewer thread=2 branch=twenty] reviewing',
      '[thread-worker thread=1 branch=main] proving',
      '[thread-reviewer thread=2 branch=twenty] judging findings',
    ])
  })

  it('begins again on a second --begin, as a fresh agent in the same worktree does', () => {
    ohai(['--begin', '--role', 'thread-worker', 'building'])
    expect(ohai(['--begin', '--role', 'thread-worker', '--thread', '1', 'filing'], { after: 900 })).to.include('+0:00:00 [thread-worker thread=1 branch=main] filing')
  })

  it('sings without a --begin, timing from its first line', () => {
    ohai(['looking around'])
    expect(ohai(['still looking'], { after: 5 })).to.include('+0:00:05 [an agent that did not --begin] still looking')
  })

  it('logs a compaction from the hook input, guessing the subagent whose transcript was written last', () => {
    const projdir = path.join(scratch, 'project')
    const subagents = path.join(projdir, Session, 'subagents')
    mkdirSync(subagents, { recursive: true })
    writeFileSync(path.join(subagents, 'agent-a1.jsonl'), `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, cache_read_input_tokens: 160_000, cache_creation_input_tokens: 11_800 } } })}\n`)
    writeFileSync(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'thread-worker', description: 'Thread 3: vault_record' }))
    const input = JSON.stringify({ session_id: Session, transcript_path: path.join(projdir, `${Session}.jsonl`), trigger: 'auto' })
    ohai(['--hook'], { input, after: (Date.now() - Began) / 1000 })
    expect(logged().at(-1)).to.match(/^OHAI \S+ \+-:--:-- \[hook session=df710b96 likely=thread-worker "Thread 3: vault_record"\] compacting \(auto, at ~172k\)$/)
  })

  /** Leaves a subagent's transcript, last written just now, at a context of `ctx` tokens */
  const plantAgent = (agentId: string, description: string, ctx: number) => {
    const subagents = path.join(scratch, 'project', Session, 'subagents')
    mkdirSync(subagents, { recursive: true })
    writeFileSync(path.join(subagents, `agent-${agentId}.jsonl`), `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: ctx } } })}\n`)
    writeFileSync(path.join(subagents, `agent-${agentId}.meta.json`), JSON.stringify({ agentType: 'thread-worker', description }))
  }
  const hook = (trigger: string) => {
    const input = JSON.stringify({ session_id: Session, transcript_path: path.join(scratch, 'project', `${Session}.jsonl`), trigger })
    ohai(['--hook'], { input, after: (Date.now() - Began) / 1000 })
    return logged().at(-1)
  }

  it('takes the largest context, not a sibling written later that has just compacted', () => {
    plantAgent('a1', 'Restack', 166_000)
    plantAgent('a2', 'Thread 5b', 64_000)
    expect(hook('auto')).to.include('likely=thread-worker "Restack"] compacting (auto, at ~166k)')
  })

  it('names no subagent whose context is too small to be compacting', () => {
    plantAgent('a1', 'Thread 5b', 64_000)
    expect(hook('auto')).to.include('main session or unknown] compacting (auto)')
  })

  it('takes a compaction by hand as the main session\'s, whatever subagents are busy', () => {
    plantAgent('a1', 'Finish 5b', 166_000)
    expect(hook('manual')).to.include('main session or unknown] compacting (manual)')
  })

  it('exits 0 from the hook whatever it is given, so a compaction is never held up', () => {
    const ran = spawnSync(Script, ['--hook'], { cwd: main, encoding: 'utf8', env: isolatedEnv(scratch, Began), input: 'not json' })
    expect(ran.status).to.equal(0)
  })

  it('refuses, exiting 2, without anything to sing, a --begin with no role, or fields without --begin', () => {
    for (const args of [[], ['--begin', '--role', 'thread-worker'], ['--begin', 'building'], ['--sprint', 'gripes', 'building'], ['--colour', 'red', 'building']]) {
      const ran = spawnSync(Script, args, { cwd: main, encoding: 'utf8', env: isolatedEnv(scratch, Began) })
      expect(ran.status, args.join(' ')).to.equal(2)
      expect(ran.stderr).to.include('Usage: scripts/ohai')
      expect(ran.stdout).to.equal('')
    }
  })

  it('refuses, exiting 1, outside a git worktree', () => {
    const ran = spawnSync(Script, ['building'], { cwd: scratch, encoding: 'utf8', env: isolatedEnv(scratch, Began) })
    expect(ran.status).to.equal(1)
    expect(ran.stderr).to.include('not inside a git worktree')
  })
})
