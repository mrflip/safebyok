import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { Filer, isErrnoCode } from '../../scripts/filer.ts'

describe('Filer', () => {
  let scratch: string
  let filepath: string
  let filer: Filer
  beforeEach(() => {
    scratch = TH.makeScratchDir('filer-test-')
    filepath = path.join(scratch, 'notes.txt')
    filer = new Filer(filepath)
  })

  it('dumps a blob as the whole file, replacing what it held, and gets it back', () => {
    filer.dump('first')
    filer.dump('second')
    expect(filer.getText()).to.equal('second')
  })

  it('dumps and gets JSON', () => {
    filer.dumpJson({ began: 1, singer: { role: 'thread-worker' } })
    expect(filer.getJson()).to.deep.equal({ began: 1, singer: { role: 'thread-worker' } })
  })

  it('appends lines and JSON lines, creating the file on the first', () => {
    filer.appendLine('one')
    filer.appendJsonLine({ two: 2 })
    filer.appendLine('three')
    expect(readFileSync(filepath, 'utf8')).to.equal('one\n{"two":2}\nthree\n')
  })

  it('gets null for a file that is not there', () => {
    expect(filer.getText()).to.be.null
    expect(filer.getJson()).to.be.null
  })

  it('ensures the file: creates an absent one with the blob, and leaves one there as it is', () => {
    expect(filer.ensureText('made')).to.equal('made')
    expect(filer.ensureText('ignored')).to.equal('made')
    expect(readFileSync(filepath, 'utf8')).to.equal('made')
  })

  it('creates files readable and writable by their owner alone, unless given a mode', () => {
    filer.dump('private')
    expect(statSync(filepath).mode & 0o777).to.equal(0o600)
    const shared = new Filer(path.join(scratch, 'shared.log'), { mode: 0o644 })
    shared.appendLine('for all')
    expect(statSync(shared.filepath).mode & 0o777).to.equal(0o644)
  })

  it('leaves an existing file its own permissions', () => {
    writeFileSync(filepath, 'theirs')
    chmodSync(filepath, 0o640)
    filer.dump('ours')
    expect(statSync(filepath).mode & 0o777).to.equal(0o640)
  })

  it('throws what is not an absent file, such as a folder where the file should be', () => {
    const folder = new Filer(scratch)
    expect(() => folder.getText()).to.throw(/EISDIR/)
    expect(() => folder.ensureText('x')).to.throw(/EEXIST|EISDIR/)
  })
})

describe('isErrnoCode', () => {
  it('matches a filesystem error by its code, and nothing else', () => {
    const err = Object.assign(new Error('gone'), { code: 'ENOENT' })
    expect(isErrnoCode(err, 'ENOENT')).to.equal(true)
    expect(isErrnoCode(err, 'EEXIST')).to.equal(false)
    expect(isErrnoCode({ code: 'ENOENT' }, 'ENOENT')).to.equal(false)
  })
})
