import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as FrontDoor from '../../scripts/front-door'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/front-door.ts')

const Manifest = JSON.stringify({
  name:    'fixture',
  type:    'module',
  exports: {
    '.':              { import: './dist/index.js', require: './dist/index.cjs' },
    './core':         { import: './dist/core.js', require: './dist/core.cjs' },
    './package.json': './package.json',
  },
})

// A built package whose front door re-exports its core, as tsdown writes it: one module per source file, each binding in one module.
const Shared = {
  'dist/shared.js':  'export const shared = { shared: true }\nexport function helper() { return 1 }\n',
  'dist/shared.cjs': 'exports.shared = { shared: true }\nexports.helper = function helper() { return 1 }\n',
  'dist/core.js':    'export { shared, helper } from \'./shared.js\'\n',
  'dist/core.cjs':   'const sh = require(\'./shared.cjs\')\nexports.shared = sh.shared\nexports.helper = sh.helper\n',
}
const Whole = {
  ...Shared,
  'dist/index.js':  'export * from \'./core.js\'\nexport const extra = 1\n',
  'dist/index.cjs': 'const core = require(\'./core.cjs\')\nexports.shared = core.shared\nexports.helper = core.helper\nexports.extra = 1\n',
}

/** Writes a built package of the files given, by path from its directory, beside its package.json */
function writePackage(files: Record<string, string>): string {
  const pkgdir = TH.makeScratchDir('front-door-')
  const withManifest = { 'package.json': Manifest, ...files }
  for (const [file, text] of Object.entries(withManifest)) {
    mkdirSync(path.dirname(path.join(pkgdir, file)), { recursive: true })
    writeFileSync(path.join(pkgdir, file), text)
  }
  return pkgdir
}

const Helper = (): number => 1
const Shortcases: [FrontDoor.ExportBag, FrontDoor.ExportBag, Pick<FrontDoor.Shortfall, 'exportname' | 'flavor'>[], string][] = [
  // regular usage:
  [{ helper: Helper, extra: 1 }, { helper: Helper }, [],                                             'a front door with every name, as the same value, is short nothing'],
  [{ extra: 1 },                 { helper: Helper }, [{ exportname: 'helper', flavor: 'missing' }],   'a name the front door lacks is missing'],
  [{ helper: () => 1 },          { helper: Helper }, [{ exportname: 'helper', flavor: 'different' }], 'a name the front door has as another value is different'],
  // edge cases:
  [{ helper: undefined },        { helper: Helper }, [{ exportname: 'helper', flavor: 'different' }], 'a name the front door has as undefined is there, and different'],
  [{},                           {},                 [],                                             'an entry with no exports is short nothing'],
]

describe("shortfallsOf", () => {
  for (const [frontDoor, entry, expected, blurb] of Shortcases) {
    it(blurb, () => { expect(FrontDoor.shortfallsOf(frontDoor, entry)).to.deep.equal(expected) })
  }
})

describe("frontDoorShortfalls", () => {
  it("is short nothing when the front door has every name of the entry, by import and by require", async () => {
    const pkgdir = writePackage(Whole)
    expect(await FrontDoor.frontDoorShortfalls(pkgdir, ['./core'])).to.deep.equal([])
  })

  it("reports a name the front door's ESM file dropped, under import alone", async () => {
    const pkgdir = writePackage({ ...Whole, 'dist/index.js': 'export { shared } from \'./core.js\'\n' })
    expect(await FrontDoor.frontDoorShortfalls(pkgdir, ['./core'])).to.deep.equal([{ subpath: './core', loadkind: 'import', exportname: 'helper', flavor: 'missing' }])
  })

  it("reports a name the front door's CJS file has as a value of its own, under require alone", async () => {
    const pkgdir = writePackage({ ...Whole, 'dist/index.cjs': 'const core = require(\'./core.cjs\')\nexports.shared = { shared: true }\nexports.helper = core.helper\n' })
    expect(await FrontDoor.frontDoorShortfalls(pkgdir, ['./core'])).to.deep.equal([{ subpath: './core', loadkind: 'require', exportname: 'shared', flavor: 'different' }])
  })

  it("refuses an entry the package's exports do not name", async () => {
    const pkgdir = writePackage(Whole)
    await expect(FrontDoor.frontDoorShortfalls(pkgdir, ['./storage'])).rejects.toThrow('front-door: ./storage has no `import` file in the package\'s exports')
  })
})

describe("describeShortfall", () => {
  it("names the entry, how it was loaded, and the name", () => {
    expect(FrontDoor.describeShortfall({ subpath: './core', loadkind: 'require', exportname: 'Lifeseq', flavor: 'missing' })).to.eq('./core (require): Lifeseq is not on the front door')
  })

  it("says when the front door's value is another", () => {
    expect(FrontDoor.describeShortfall({ subpath: './core', loadkind: 'import', exportname: 'Lifeseq', flavor: 'different' })).to.eq('./core (import): Lifeseq is a different value on the front door')
  })
})

/** Runs the script as the package's build does, in a process of its own */
function run(...args: string[]) {
  return spawnSync(process.execPath, [Script, ...args], { encoding: 'utf8' })
}

describe("front-door, run", () => {
  it("exits 1 and prints a line per name the front door lacks", () => {
    const pkgdir = writePackage({ ...Whole, 'dist/index.js': 'export { shared } from \'./core.js\'\n' })
    const result = run(pkgdir, './core')
    expect([result.status, result.stdout]).to.deep.equal([1, './core (import): helper is not on the front door\n'])
  })

  it("exits 0 and prints nothing when the front door has every name", () => {
    const result = run(writePackage(Whole), './core')
    expect([result.status, result.stdout]).to.deep.equal([0, ''])
  })

  it("exits 2 with its usage when given no entry to check", () => {
    const result = run(writePackage(Whole))
    expect([result.status, result.stderr]).to.deep.equal([2, 'Usage: node scripts/front-door.ts <pkgdir> <subpath> [<subpath> ...]\n'])
  })
})
