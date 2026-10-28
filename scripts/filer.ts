/**
 * One file on disk, for the root's scripts: dump it, append a line to it, or get it back, each
 * in a single open with no check-then-act gap between looking and writing. A file it creates is
 * readable and writable by its owner alone, unless `mode` says otherwise.
 *
 *   const log = new Filer(path.join(gitdir, 'ohai.log'))
 *   log.appendLine('OHAI ...')
 */
import { closeSync, constants as FsConstants, openSync, readFileSync, writeFileSync } from 'node:fs'

const { O_APPEND, O_CREAT, O_EXCL, O_TRUNC, O_WRONLY } = FsConstants

/** Whether `err` is a failed filesystem call with the errno code `code` (`ENOENT`, `EEXIST`) */
export function isErrnoCode(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code
}

/** One file on disk, named by its path, with the means to dump, append to and get it */
export class Filer {
  readonly filepath: string
  readonly mode:     number

  /**
   * A Filer for `filepath`. Touches nothing on disk.
   *
   * @param mode - Permissions for a file this Filer creates; an existing file keeps its own.
   */
  constructor(filepath: string, { mode = 0o600 }: { mode?: number } = {}) {
    this.filepath = filepath
    this.mode = mode
  }

  /** Write `blob` as the file's whole text, creating it or replacing what it held */
  dump(blob: string): void {
    this.#writeVia(O_WRONLY | O_CREAT | O_TRUNC, blob)
  }

  /** Write `val` as the file's whole text, as JSON */
  dumpJson(val: unknown): void {
    this.dump(JSON.stringify(val))
  }

  /**
   * Append `line` and a newline to the file, creating it if it is absent. Appends from several
   * processes interleave whole lines: each lands at the end as one write.
   */
  appendLine(line: string): void {
    this.#writeVia(O_WRONLY | O_CREAT | O_APPEND, `${line}\n`)
  }

  /** Append `val` to the file as one line of JSON, as {@link Filer.appendLine} does */
  appendJsonLine(val: unknown): void {
    this.appendLine(JSON.stringify(val))
  }

  /** The file's text, or null when there is no file */
  getText(): string | null {
    try {
      return readFileSync(this.filepath, 'utf8')
    } catch (err) {
      if (isErrnoCode(err, 'ENOENT')) { return null }
      throw err
    }
  }

  /** The file's text parsed as JSON, or null when there is no file. Parsing is the caller's to trust. */
  getJson(): unknown {
    const blob = this.getText()
    return blob === null ? null : JSON.parse(blob) as unknown
  }

  /**
   * Has the file or makes it so with `blob`, and hands back its text. An existing file is left
   * as it is, whatever it holds; only an absent one is created, in a single exclusive open.
   */
  ensureText(blob: string): string {
    try {
      this.#writeVia(O_WRONLY | O_CREAT | O_EXCL, blob)
      return blob
    } catch (err) {
      if (!isErrnoCode(err, 'EEXIST')) { throw err }
    }
    return readFileSync(this.filepath, 'utf8')
  }

  #writeVia(flags: number, blob: string): void {
    const fd = openSync(this.filepath, flags, this.mode)
    try {
      writeFileSync(fd, blob)
    } finally {
      closeSync(fd)
    }
  }
}
