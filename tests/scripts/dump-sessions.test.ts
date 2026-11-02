import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/dump-sessions.sh')
const DumpFilename = /^session-dump-\d{8}T\d{6}Z-\d{8}T\d{6}Z-\d{8}T\d{6}Z\.tar\.gz$/
const byName = (aa: string, bb: string) => aa.localeCompare(bb)
/** The <volume born> stamp in a dump's filename */
const volumeOf = (filename: string) => filename.split('-', 3)[2]!

/** Writes a file at `relpath` under `root`, making its folders */
const plant = (root: string, relpath: string) => {
  const where = path.join(root, relpath)
  mkdirSync(path.dirname(where), { recursive: true })
  writeFileSync(where, 'held\n')
}

describe('scripts/dump-sessions.sh', () => {
  let home: string
  let dumps: string
  let tmp: string
  let run: () => string
  /** The dumps written so far, oldest first */
  const dumpFilenames = () => readdirSync(dumps).toSorted(byName)
  /** What a dump holds, as paths under the scratch home and scratch folder */
  const heldBy = (filename: string) => (
    execFileSync('tar', ['--list', '--file', path.join(dumps, filename)], { encoding: 'utf8' })
      .trim().split('\n').map((held) => held.replace(/^.*?(?=\.claude\/|tmp-root\/)/, '')).toSorted(byName)
  )

  beforeEach(() => {
    const scratch = TH.makeScratchDir('dump-sessions-test-')
    home = path.join(scratch, 'home')
    dumps = path.join(scratch, 'host', '.session-dumps')
    tmp = path.join(scratch, 'tmp-root')
    mkdirSync(path.join(home, '.claude'), { recursive: true })
    mkdirSync(tmp)
    run = () => execFileSync(Script, [dumps, tmp], {
      encoding: 'utf8',
      env:      { ...process.env, HOME: home },
    })
  })

  it('takes the session records it names, and says what it wrote', () => {
    plant(home, '.claude/projects/-workspace-byok/abc.jsonl')
    plant(home, '.claude/projects/-workspace-byok/abc/subagents/agent-1.jsonl')
    plant(home, '.claude/file-history/abc/snapshot')
    plant(home, '.claude/sessions/1.json')
    plant(home, '.claude/settings.json')
    plant(tmp, '-workspace-byok/abc/scratchpad/plan.md')
    const said = run()
    const [filename] = dumpFilenames()
    expect(filename).toMatch(DumpFilename)
    expect(said).toContain(`${path.join(dumps, filename!)}: 6 files`)
    expect(heldBy(filename!)).toEqual([
      '.claude/file-history/abc/snapshot',
      '.claude/projects/-workspace-byok/abc.jsonl',
      '.claude/projects/-workspace-byok/abc/subagents/agent-1.jsonl',
      '.claude/sessions/1.json',
      '.claude/settings.json',
      'tmp-root/-workspace-byok/abc/scratchpad/plan.md',
    ])
  })

  it('leaves out credentials, and what can be had again', () => {
    plant(home, '.claude/projects/kept.jsonl')
    plant(home, '.claude/.credentials.json')
    plant(home, '.claude/sessions/1.abc123.key')
    plant(home, '.claude/shell-snapshots/snapshot.sh')
    plant(home, '.claude/backups/claude.json')
    plant(tmp, 'clone/.git/config')
    plant(tmp, 'clone/node_modules/dep/index.js')
    run()
    expect(heldBy(dumpFilenames()[0]!)).toEqual(['.claude/projects/kept.jsonl'])
  })

  it('writes the dump readable only by its owner, and stored paths are relative', () => {
    plant(home, '.claude/projects/kept.jsonl')
    run()
    const [filename] = dumpFilenames()
    expect(statSync(path.join(dumps, filename!)).mode & 0o077).toBe(0)
    const stored = execFileSync('tar', ['--list', '--file', path.join(dumps, filename!)], { encoding: 'utf8' })
    expect(stored.startsWith('/')).toBe(false)
  })

  it('takes nothing again while nothing has changed, and writes no second dump', () => {
    plant(home, '.claude/projects/kept.jsonl')
    run()
    expect(run()).toContain('no dump written')
    expect(dumpFilenames()).toHaveLength(1)
  })

  it('starts a later dump from where the last one ended, taking only what changed since', async () => {
    plant(home, '.claude/projects/old.jsonl')
    run()
    // The stamps are whole seconds: the next change must fall in a later one.
    await new Promise((resolve) => { setTimeout(resolve, 1100) })
    plant(home, '.claude/projects/new.jsonl')
    run()
    const [first, second] = dumpFilenames()
    expect(heldBy(second!)).toEqual(['.claude/projects/new.jsonl'])
    const endOfFirst = first!.replace('.tar.gz', '').split('-', 5)[4]
    const startOfSecond = second!.split('-', 4)[3]
    expect(startOfSecond).toBe(endOfFirst)
  })

  it('reads its range from the name of the newest dump of this volume', () => {
    plant(home, '.claude/projects/old.jsonl')
    run()
    const volume = volumeOf(dumpFilenames()[0]!)
    const later = path.join(dumps, `session-dump-${volume}-19700101T000000Z-20991231T000000Z.tar.gz`)
    writeFileSync(later, '')
    // After that dump's end, everything here counts as already taken.
    expect(run()).toContain('no dump written')
  })

  it('ignores the dumps of another volume: they say nothing of what this one holds', () => {
    plant(home, '.claude/projects/kept.jsonl')
    mkdirSync(dumps, { recursive: true })
    writeFileSync(path.join(dumps, 'session-dump-19990101T000000Z-19700101T000000Z-20991231T000000Z.tar.gz'), '')
    expect(run()).toContain(': 1 file,')
  })

  it('refuses arguments it does not understand', () => {
    const tooMany = spawnSync(Script, ['a', 'b', 'c'], { encoding: 'utf8' })
    expect(tooMany.status).toBe(2)
    expect(tooMany.stderr).toContain('Usage: scripts/dump-sessions.sh')
    const relative = spawnSync(Script, ['relative/dumps'], { encoding: 'utf8' })
    expect(relative.status).toBe(2)
    expect(relative.stderr).toContain('must be absolute paths')
  })

  it('fails plainly with no ~/.claude to dump', () => {
    const none = spawnSync(Script, [dumps, tmp], {
      encoding: 'utf8',
      env:      { ...process.env, HOME: path.join(home, 'nobody') },
    })
    expect(none.status).toBe(1)
    expect(none.stderr).toContain('to dump')
    expect(() => statSync(dumps)).toThrow()
  })
})
