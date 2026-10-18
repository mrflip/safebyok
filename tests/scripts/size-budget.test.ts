import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as SizeBudget from '../../scripts/size-budget'
import * as TH from '../test-helpers'

const Script = path.resolve(import.meta.dirname, '../../scripts/size-budget.ts')

const BudgetCases = [
  // regular usage:
  [2300,   3500,   'a small bundle gets half again, rounded up, as its first example shows'],
  [22_150,  26_000,  'a bundle of 5 kB or more gets 3 kB, rounded up, as its second example shows'],
  [400,     1400,   'a tiny bundle gets at least 1 kB of room, as its third example shows'],
  // edge cases:
  [5000,   8000,   'a bundle of exactly 5 kB gets the 3 kB'],
  [4999,   7500,   'a bundle just under 5 kB gets half again'],
  [2000,   3000,   'half of 2 kB is the 1 kB floor, no more'],
  [213_738, 220_000, 'a large bundle rounds to two significant figures, not to the kB'],
] as const

describe("budgetFor", () => {
  for (const [measured, expected, blurb] of BudgetCases) {
    it(blurb, () => { expect(SizeBudget.budgetFor(measured)).to.eq(expected) })
  }
})

const RoundCases = [
  // regular usage:
  [2431,   2500,   'rounds a ragged budget up to a round one, as its first example shows'],
  [146_000, 150_000, 'rounds up at any scale, as its second example shows'],
  [3500,   3500,   'leaves a round number as it is, as its third example shows'],
  // edge cases:
  [3501,   3600,   'never rounds down, even by a byte'],
  [99,      99,      'a number of two figures is already round'],
  [8,       8,       'a number of one figure is too'],
] as const

describe("roundUp", () => {
  for (const [bytes, expected, blurb] of RoundCases) {
    it(blurb, () => { expect(SizeBudget.roundUp(bytes)).to.eq(expected) })
  }
})

describe("formatKb and parseKb", () => {
  it("writes a fraction of a kB with its decimal, as formatKb's first example shows", () => {
    expect(SizeBudget.formatKb(3500)).to.eq('3.5 kB')
  })
  it("writes a whole number of kB bare, as formatKb's second example shows", () => {
    expect(SizeBudget.formatKb(220_000)).to.eq('220 kB')
  })
  it("reads a budget back in bytes, as parseKb's first example shows", () => {
    expect(SizeBudget.parseKb('3.5 kB')).to.eq(3500)
  })
  it("reads a budget written without its space, as parseKb's second example shows", () => {
    expect(SizeBudget.parseKb('38kB')).to.eq(38_000)
  })
  it("refuses a unit .size-limit.json does not use, as parseKb's third example shows", () => {
    expect(() => SizeBudget.parseKb('3.5 KiB')).to.throw('is not a budget in kB')
  })
  it("reads back each budget it writes", () => {
    for (const bytes of [1400, 8200, 26_000, 150_000]) {
      expect(SizeBudget.parseKb(SizeBudget.formatKb(bytes))).to.eq(bytes)
    }
  })
})

const Entries = [
  { name: 'everything', limit: '38 kB' },
  { name: 'mask',       limit: '8.8 kB' },
]

describe("budgetRows", () => {
  it("gives each entry its measure, its budget now and the rule's, in the file's order", () => {
    const rows = SizeBudget.budgetRows(Entries, new Map([['mask', 5742], ['everything', 34_742]]))
    expect(rows).to.deep.equal([
      { entryname: 'everything', measured: 34_742, added: 0, now: 38_000, rule: 38_000 },
      { entryname: 'mask',       measured: 5742,  added: 0, now: 8800,  rule: 8800 },
    ])
  })
  it("adds a sprint's expected growth to the measure before the rule", () => {
    const rows = SizeBudget.budgetRows(Entries, new Map([['mask', 5742], ['everything', 34_742]]), new Map([['everything', 4000]]))
    expect(rows[0]).to.deep.equal({ entryname: 'everything', measured: 34_742, added: 4000, now: 38_000, rule: 42_000 })
  })
  it("refuses growth for an entry the file does not have", () => {
    expect(() => SizeBudget.budgetRows(Entries, new Map([['mask', 5742], ['everything', 34_742]]), new Map([['evrything', 1000]])))
      .to.throw('no entry for')
  })
  it("refuses an entry size-limit did not measure", () => {
    expect(() => SizeBudget.budgetRows(Entries, new Map([['mask', 5742]]))).to.throw('no measure for "everything"')
  })
})

describe("withBudgets", () => {
  it("changes the budget on the entry's own line, as its example shows", () => {
    expect(SizeBudget.withBudgets('{ "name": "mask", "limit": "8.8 kB" }', new Map([['mask', 9000]])))
      .to.eq('{ "name": "mask", "limit": "9 kB" }')
  })
  it("leaves every other line, and the layout, as they were", () => {
    const text = '[\n  { "name": "everything", "path": "dist/index.js", "limit": "38 kB" },\n  { "name": "mask", "import": "{ mask }", "limit": "8.8 kB" }\n]\n'
    expect(SizeBudget.withBudgets(text, new Map([['mask', 9000]])))
      .to.eq('[\n  { "name": "everything", "path": "dist/index.js", "limit": "38 kB" },\n  { "name": "mask", "import": "{ mask }", "limit": "9 kB" }\n]\n')
  })
  it("does not take one entry's name for the start of another's", () => {
    const text = '{ "name": "validators", "limit": "6.1 kB" }\n{ "name": "DefaultValidators", "limit": "5.2 kB" }'
    expect(SizeBudget.withBudgets(text, new Map([['validators', 7000]])))
      .to.eq('{ "name": "validators", "limit": "7 kB" }\n{ "name": "DefaultValidators", "limit": "5.2 kB" }')
  })
  it("refuses a file whose entries are not one to a line", () => {
    expect(() => SizeBudget.withBudgets('{ "name": "mask",\n  "limit": "8.8 kB" }', new Map([['mask', 9000]]))).to.throw('found 0 lines')
  })
})

describe("report", () => {
  it("aligns a line per entry and says which way each budget leans, as its example shows", () => {
    const rows = [
      { entryname: 'mask',          measured: 5740, added: 0,     now: 8800, rule: 8800 },
      { entryname: 'VaultProvider', measured: 4596, added: 0,     now: 6800, rule: 6900 },
      { entryname: 'everything',    measured: 30_000, added: 1000, now: 38_000, rule: 34_000 },
    ]
    expect(SizeBudget.report(rows).split('\n')).to.deep.equal([
      'entry          measure   add   now     rule',
      'mask           5.74 kB         8.8 kB  8.8 kB',
      'VaultProvider  4.596 kB        6.8 kB  6.9 kB  raise',
      'everything     30 kB     1 kB  38 kB   34 kB   lower',
    ])
  })
})

describe('scripts/size-budget.ts', () => {
  let config: string
  let measured: string
  const run = (...args: string[]) => spawnSync(process.execPath, [Script, '--config', config, '--measured', measured, ...args], { encoding: 'utf8' })
  beforeEach(() => {
    const scratch = TH.makeScratchDir('size-budget-test-')
    config = path.join(scratch, 'size-limit.json')
    measured = path.join(scratch, 'measured.json')
    writeFileSync(config, '[\n  { "name": "everything", "limit": "38 kB" },\n  { "name": "VaultProvider", "limit": "6.8 kB" },\n  { "name": "mask", "limit": "9.9 kB" }\n]\n')
    writeFileSync(measured, JSON.stringify([
      { name: 'everything', passed: true, size: 34_742 },
      { name: 'VaultProvider', passed: true, size: 4596 },
      { name: 'mask', passed: true, size: 5742 },
    ]))
  })

  it("reports and changes nothing unless told to", () => {
    const result = run()
    expect(result.status).to.eq(0)
    expect(result.stdout).to.match(/^VaultProvider +4\.596 kB +6\.8 kB +6\.9 kB +raise$/m)
    expect(readFileSync(config, 'utf8')).to.include('"limit": "6.8 kB"')
  })
  it("with --raise, raises a budget under the rule and leaves one over it", () => {
    expect(run('--raise').status).to.eq(0)
    const text = readFileSync(config, 'utf8')
    expect(text).to.include('{ "name": "VaultProvider", "limit": "6.9 kB" }')
    expect(text).to.include('{ "name": "mask", "limit": "9.9 kB" }')
  })
  it("with --write, lowers a budget over the rule as well", () => {
    expect(run('--write').status).to.eq(0)
    expect(readFileSync(config, 'utf8')).to.include('{ "name": "mask", "limit": "8.8 kB" }')
  })
  it("with --add, sets the budget a sprint's growth needs", () => {
    expect(run('--raise', '--add', 'everything=4').status).to.eq(0)
    expect(readFileSync(config, 'utf8')).to.include('{ "name": "everything", "limit": "42 kB" }')
  })
  it("refuses --write and --raise together, and an --add it cannot read, changing nothing", () => {
    const before = readFileSync(config, 'utf8')
    expect(run('--write', '--raise').status).to.eq(2)
    expect(run('--add', 'everything').status).to.eq(2)
    expect(readFileSync(config, 'utf8')).to.eq(before)
  })
})
