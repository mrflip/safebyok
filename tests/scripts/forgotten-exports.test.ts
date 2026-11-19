import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as ForgottenExports from '../../scripts/forgotten-exports'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/forgotten-exports.ts')

const Tsconfig = JSON.stringify({
  compilerOptions: { strict: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', types: [], noEmit: true, skipLibCheck: true },
  include:         ['src', 'tests'],
})

/** Writes a package of the files given, by path from its directory, with a tsconfig.json beside them */
function writePackage(pkgdir: string, files: Record<string, string>): void {
  const withConfig = { 'tsconfig.json': Tsconfig, ...files }
  for (const [file, text] of Object.entries(withConfig)) {
    mkdirSync(path.dirname(path.join(pkgdir, file)), { recursive: true })
    writeFileSync(path.join(pkgdir, file), text)
  }
}

const Manifest = JSON.stringify({
  name:    'fixture',
  type:    'module',
  exports: {
    '.':              { '@safebyok/source': './src/index.ts' },
    './core':         { '@safebyok/source': './src/core.ts' },
    './testing':      { '@safebyok/source': './tests/helpers.ts' },
    './package.json': './package.json',
  },
})

// Each declaration a case below names, every one exported from its own file: an entry forgets it by not re-exporting it.
const Shapes = `
import type { Foreign } from 'dep'
export interface Remembered { remembered: true }
export interface Forgot { forgot: true }
export interface Deeper { deeper: true }
export interface Chained { deeper: Deeper }
export interface Hidden { hidden: true }
export interface Guarded { guarded: true }
export interface Ctor { ctor: true }
export interface InTypeof { viaTypeof: true }
export interface Asserted { asserted: true }
export interface Constrained { constrained: true }
export interface Shared { shared: true }
export interface Unnamed { unnamed: true }
export const settings: { inner: InTypeof } = { inner: { viaTypeof: true } }
export type Outer = { chained: Chained, foreign: Foreign }
export type Generic<T extends Constrained> = T
export class Holder {
  #hidden: Hidden = { hidden: true }
  private alsoHidden: Hidden = { hidden: true }
  protected guarded: Guarded = { guarded: true }
  constructor(ctor: Ctor) { void ctor; void this.#hidden; void this.alsoHidden }
}
export function forget(forgot: Forgot): Remembered { void forgot; return { remembered: true } }
export function ident<T>(val: T): T { const unnamed: Unnamed = { unnamed: true }; void unnamed; return val }
export const asserted = ((val: number) => val) as unknown as (opts: Asserted) => void
export type Settings = typeof settings
export function share(shared: Shared): void { void shared }
`

const Files = {
  'package.json':                   Manifest,
  'node_modules/dep/package.json':  JSON.stringify({ name: 'dep', types: './index.d.ts' }),
  'node_modules/dep/index.d.ts':    'export interface Foreign { foreign: true }\n',
  'src/shapes.ts':                  Shapes,
  'src/ns.ts':                      'export interface NsMember { member: true }\nexport function useNs(member: NsMember): void { void member }\n',
  'src/index.ts':                   `export { type Remembered, type Outer, type Generic, type Settings, type Shared, Holder, forget, ident, asserted, share } from './shapes'\nexport * as Ns from './ns'\n`,
  'src/core.ts':                    `export { share } from './shapes'\n`,
  'tests/helpers.ts':               `import type { Forgot, Remembered } from '../src/shapes'\nexport function help(remembered: Remembered, forgot: Forgot): void { void remembered; void forgot }\n`,
}

describe("forgottenExports", () => {
  let pkgdir: string
  let found: ForgottenExports.Forgotten[]
  // One program for every case: building it is the slow part.
  beforeAll(() => {
    pkgdir = mkdtempSync(path.join(tmpdir(), 'forgotten-exports-'))
    writePackage(pkgdir, Files)
    found = ForgottenExports.forgottenExports(pkgdir)
  })
  afterAll(() => { rmSync(pkgdir, { recursive: true, force: true }) })

  const namesOf = (entry: string) => found.filter((gone) => gone.entry === entry).map((gone) => gone.typename)
  const goneAt = (entry: string, typename: string) => found.find((gone) => gone.entry === entry && gone.typename === typename)

  const ForgottenCases = [
    // regular usage:
    ['Forgot',      ['forget'],  'a parameter\'s type is named by its function'],
    ['Chained',     ['Outer'],   'a type a type alias is made of is named by the alias'],
    ['Deeper',      ['Chained'], 'a forgotten type\'s own signature is walked in turn'],
    ['Guarded',     ['Holder'],  'a protected member is public to a subclass'],
    ['Ctor',        ['Holder'],  'a constructor\'s parameter counts'],
    ['Constrained', ['Generic'], 'a type parameter\'s constraint counts'],
    // values:
    ['InTypeof',    ['settings'], 'a value named by `typeof` is walked through its annotation'],
    ['Asserted',    ['asserted'], 'an unannotated value is walked through the type it is asserted to'],
  ] as const
  for (const [typename, namedBy, blurb] of ForgottenCases) {
    it(`reports ${typename}: ${blurb}`, () => {
      expect(goneAt('src/index.ts', typename)).to.deep.equal({ entry: 'src/index.ts', typename, file: 'src/shapes.ts', namedBy })
    })
  }

  const RememberedCases = [
    ['Remembered', 'a type the entry exports'],
    ['Hidden',     'a private member\'s type, by `#` or `private`'],
    ['Unnamed',    'a type named only inside a function\'s body'],
    ['settings',   'a value named by `typeof`, which a host reaches through the type that names it'],
    ['NsMember',   'a member of a namespace the entry exports, which a host reaches as `Ns.NsMember`'],
    ['Foreign',    'a type declared outside the package'],
    ['T',          'a type parameter'],
  ] as const
  for (const [typename, blurb] of RememberedCases) {
    it(`leaves out ${typename}: ${blurb}`, () => { expect(namesOf('src/index.ts')).not.to.include(typename) })
  }

  it("reports nothing else of the front door, in name order", () => {
    expect(namesOf('src/index.ts')).to.deep.equal(['Asserted', 'Chained', 'Constrained', 'Ctor', 'Deeper', 'Forgot', 'Guarded', 'InTypeof'])
  })

  it("lets another entry leave a name to the front door", () => {
    expect(namesOf('src/core.ts')).to.deep.equal([])
  })

  it("reports of a companion entry what the front door forgets as well", () => {
    expect(found.filter((gone) => gone.entry === 'tests/helpers.ts')).to.deep.equal([{ entry: 'tests/helpers.ts', typename: 'Forgot', file: 'src/shapes.ts', namedBy: ['help'] }])
  })
})

const EntriesCases = [
  // regular usage:
  [{ exports: { '.': { '@safebyok/source': './src/index.ts', import: './dist/index.js' } } }, [{ subpath: '.', source: 'src/index.ts' }], 'an entry is the source condition of its subpath'],
  [{ exports: { '.': { '@safebyok/source': './src/index.ts' }, './core': { '@safebyok/source': './src/core.ts' } } },
    [{ subpath: '.', source: 'src/index.ts' }, { subpath: './core', source: 'src/core.ts' }], 'every subpath, in the order listed'],
  // edge cases:
  [{ exports: { './package.json': './package.json' } }, [], 'a subpath with no source condition is no entry'],
  [{ exports: { '.': { import: './dist/index.js' } } },  [], 'nor is one whose conditions name no source'],
  [{},                                                   [], 'a package with no exports has no entries'],
] as const

describe("sourceEntries", () => {
  for (const [manifest, expected, blurb] of EntriesCases) {
    it(blurb, () => { expect(ForgottenExports.sourceEntries(manifest)).to.deep.equal(expected) })
  }
})

describe("describeForgotten", () => {
  it("names the entry, the type, its file and what names it", () => {
    const gone = { entry: 'src/storage.ts', typename: 'Watcher', file: 'src/storage/memory-vault-db.ts', namedBy: ['MemoryVaultDB', 'Other'] }
    expect(ForgottenExports.describeForgotten(gone)).to.eq('src/storage.ts forgets Watcher (src/storage/memory-vault-db.ts), named by MemoryVaultDB, Other')
  })
})

/** Runs the script as justify does, in a process of its own */
function run(...args: string[]) {
  return spawnSync(process.execPath, [Script, ...args], { encoding: 'utf8' })
}

describe("forgotten-exports, run", () => {
  it("exits 1 and prints a line per name when an entry forgets one", () => {
    const pkgdir = TH.makeScratchDir('forgotten-exports-run-')
    writePackage(pkgdir, { 'package.json': Manifest, 'src/index.ts': 'interface Forgot { forgot: true }\nexport function forget(forgot: Forgot): void { void forgot }\n', 'src/core.ts': 'export {}\n', 'tests/helpers.ts': 'export {}\n' })
    const result = run(pkgdir)
    expect([result.status, result.stdout]).to.deep.equal([1, 'src/index.ts forgets Forgot (src/index.ts), named by forget\n'])
  })

  it("exits 0 and prints nothing when no entry forgets a name", () => {
    const pkgdir = TH.makeScratchDir('forgotten-exports-run-')
    writePackage(pkgdir, { 'package.json': Manifest, 'src/index.ts': 'export interface Kept { kept: true }\nexport function keep(kept: Kept): void { void kept }\n', 'src/core.ts': 'export {}\n', 'tests/helpers.ts': 'export {}\n' })
    const result = run(pkgdir)
    expect([result.status, result.stdout]).to.deep.equal([0, ''])
  })

  it("exits 2 with its usage when given no package", () => {
    const result = run()
    expect([result.status, result.stderr]).to.deep.equal([2, 'Usage: node scripts/forgotten-exports.ts <pkgdir>\n'])
  })
})
