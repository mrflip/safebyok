/**
 * Checks a built package's front door against its other entries: every runtime name that one of
 * the given entries exports must also be exported by the front door (`.`), as the very same value,
 * from `dist/` as a host loads it, by `import` and by `require` both. The entries' own tests read
 * `src/`, so they miss a name the bundler drops from `dist/`: two import paths for one binding,
 * met by an `export *`, drop it with a NAMESPACE_CONFLICT warning. packages/safebyok runs it after
 * its `build`, so `pnpm justify` and CI fail on a name dropped.
 *
 * Prints one line per name missing or different, and nothing when none is:
 *
 *   node scripts/front-door.ts <pkgdir> <subpath> [<subpath> ...]
 *   node scripts/front-door.ts packages/safebyok ./core ./storage
 *   ./core (require): Lifeseq is not on the front door
 *
 * Exits 0 when the front door has every name, 1 when it lacks one, and 2 on a usage error.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** How a host loads an entry, by the condition in `exports` that names its file */
export type Loadkind = 'import' | 'require'

/** One name of an entry that the front door lacks, or has as some other value */
export interface Shortfall {
  subpath:  string
  loadkind: Loadkind
  /** The export's name */
  exportname: string
  /** Missing from the front door, or there as a different value */
  flavor:   'missing' | 'different'
}

/** The runtime exports of a module, by name: its namespace object's own enumerable properties */
export type ExportBag = Readonly<Record<string, unknown>>

/**
 * Each name of the entry's exports that the front door's lack, or have as a different value.
 *
 * @param frontDoor - The front door's exports.
 * @param entry     - The other entry's exports.
 * @returns The names short, missing or different, in the entry's order; empty when there are none.
 *
 * @example shortfallsOf({ Lifeseq }, { Lifeseq, Labelpath })  // => [{ exportname: 'Labelpath', flavor: 'missing' }]
 */
export function shortfallsOf(frontDoor: ExportBag, entry: ExportBag): Pick<Shortfall, 'exportname' | 'flavor'>[] {
  const short = Object.keys(entry).filter((exportname) => frontDoor[exportname] !== entry[exportname] || ! Object.hasOwn(frontDoor, exportname))
  return short.map((exportname) => ({ exportname, flavor: Object.hasOwn(frontDoor, exportname) ? 'different' : 'missing' }))
}

/** The file a subpath of the package's `exports` loads under one condition */
function fileOf(pkgroot: string, manifest: { exports?: Record<string, unknown> }, subpath: string, loadkind: Loadkind): string {
  const target = manifest.exports?.[subpath]
  const file = (typeof target === 'object' && target !== null) ? (target as Record<string, unknown>)[loadkind] : undefined
  if (typeof file !== 'string') { throw new TypeError(`front-door: ${subpath} has no \`${loadkind}\` file in the package's exports`) }
  return path.join(pkgroot, file)
}

/**
 * Each name of the given entries that the built front door lacks, loading each entry as a host
 * does, by `import` and by `require`.
 *
 * @param pkgdir   - The package's directory, built.
 * @param subpaths - The entries to check, as `exports` names them (`./core`).
 * @returns The names short, entry by entry, `import` first; empty when the front door has them all.
 */
export async function frontDoorShortfalls(pkgdir: string, subpaths: readonly string[]): Promise<Shortfall[]> {
  const pkgroot = path.resolve(pkgdir)
  const manifest = JSON.parse(readFileSync(path.join(pkgroot, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> }
  const requireHere = createRequire(path.join(pkgroot, 'package.json'))
  const loaders: Record<Loadkind, (file: string) => Promise<ExportBag>> = {
    import:  async (file) => await import(pathToFileURL(file).href) as ExportBag,
    require: (file) => Promise.resolve(requireHere(file) as ExportBag),
  }
  const shortfalls: Shortfall[] = []
  for (const loadkind of ['import', 'require'] as const) {
    const load = loaders[loadkind]
    const frontDoor = await load(fileOf(pkgroot, manifest, '.', loadkind))
    for (const subpath of subpaths) {
      const entry = await load(fileOf(pkgroot, manifest, subpath, loadkind))
      shortfalls.push(...shortfallsOf(frontDoor, entry).map((short) => ({ subpath, loadkind, ...short })))
    }
  }
  return shortfalls
}

/**
 * One shortfall as a line for a person to read.
 *
 * @example describeShortfall({ subpath: './core', loadkind: 'require', exportname: 'Lifeseq', flavor: 'missing' })
 *   // => './core (require): Lifeseq is not on the front door'
 */
export function describeShortfall(short: Shortfall): string {
  const said = short.flavor === 'missing' ? 'is not on the front door' : 'is a different value on the front door'
  return `${short.subpath} (${short.loadkind}): ${short.exportname} ${said}`
}

async function main(argv: readonly string[]): Promise<number> {
  const [pkgdir, ...subpaths] = argv
  if (! pkgdir || subpaths.length === 0) {
    process.stderr.write('Usage: node scripts/front-door.ts <pkgdir> <subpath> [<subpath> ...]\n')
    return 2
  }
  const shortfalls = await frontDoorShortfalls(pkgdir, subpaths)
  for (const short of shortfalls) { process.stdout.write(`${describeShortfall(short)}\n`) }
  return shortfalls.length > 0 ? 1 : 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
