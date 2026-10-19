/**
 * `pnpm size:budget`: each budget in `.size-limit.json` as PROCESS.md's rule sets it (*Size
 * budgets*), beside the budget it has now. The rule: start from the measure; add 3 kB to a bundle
 * of 5 kB or more, and half its size, at least 1 kB, to a smaller one; round up to two
 * significant figures (2_431 bytes is a 2.5 kB budget; 146_000 is 150 kB), so a stack of PRs
 * never fights over digits. size-limit's kB is 1000 bytes.
 *
 * It measures with `size-limit --json`, which reads what is built: run `pnpm size` (which builds)
 * or `pnpm justify` first, or hand it a measure saved earlier with `--measured`. `--add
 * <entry>=<kB>` adds the growth a sprint expects to an entry's measure before the rule is
 * applied, so its first thread can set every budget the sprint needs at once. Without `--write`
 * or `--raise` it changes nothing; `--write` sets every budget to the rule's, lowering as well
 * as raising, and `--raise` only raises.
 *
 *   node scripts/size-budget.ts [--measured <size-limit.json>] [--add <entry>=<kB>]... [--write | --raise]
 *
 * `--config <path>` reads and writes another file in place of the root's `.size-limit.json`.
 *
 * Exits 0 when done, 1 on a failure, 2 on arguments it does not understand.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

/** One entry's line in the report: its measure, the growth added, its budget now and the rule's */
export interface BudgetRow {
  entryname: string
  measured:  number
  added:     number
  now:       number
  rule:      number
}

/**
 * The budget PROCESS.md's rule gives a bundle of `measured` bytes: 3 kB of room at 5 kB or more,
 * half its size (at least 1 kB) below, then rounded up to two significant figures.
 *
 * @param measured - The bundle's size in bytes, with any expected growth already added.
 * @returns The budget in bytes.
 *
 * @example budgetFor(2_300)   // => 3_500
 * @example budgetFor(22_150)  // => 26_000
 * @example budgetFor(400)     // => 1_400
 */
export function budgetFor(measured: number): number {
  const room = measured >= 5000 ? 3000 : Math.max(1000, measured / 2)
  return roundUp(measured + room)
}

/**
 * `bytes` rounded up to two significant figures, never down.
 *
 * @param bytes - A positive size in bytes.
 * @returns The smallest number of two significant figures not below `bytes`.
 *
 * @example roundUp(2_431)    // => 2_500
 * @example roundUp(146_000)  // => 150_000
 * @example roundUp(3_500)    // => 3_500
 */
export function roundUp(bytes: number): number {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(bytes)) - 1)
  return Math.ceil(bytes / step) * step
}

/**
 * A budget as `.size-limit.json` writes it, in size-limit's kB of 1000 bytes.
 *
 * @example formatKb(3_500)    // => '3.5 kB'
 * @example formatKb(220_000)  // => '220 kB'
 */
export function formatKb(bytes: number): string {
  return `${String(bytes / 1000)} kB`
}

/**
 * A budget as `.size-limit.json` writes it, in bytes.
 *
 * @param limit - An entry's `limit`, such as `'3.5 kB'`.
 * @returns The budget in bytes.
 * @throws When the limit is not a number of kB, the only unit `.size-limit.json` uses.
 *
 * @example parseKb('3.5 kB')  // => 3_500
 * @example parseKb('38kB')    // => 38_000
 * @example parseKb('3.5 KiB') // throws
 */
export function parseKb(limit: string): number {
  const match = /^(\d+(?:\.\d+)?) ?kB$/.exec(limit.trim())
  if (! match) { throw new Error(`size-budget: "${limit}" is not a budget in kB.`) }
  return Math.round(Number(match[1]) * 1000)
}

/**
 * The report's rows: for each entry of `.size-limit.json`, its measure, the growth added to it,
 * and its budget now and by the rule.
 *
 * @param entries  - `.size-limit.json`, parsed.
 * @param measures - Each entry's size in bytes, by its name, as size-limit measured it.
 * @param additions - Expected growth in bytes, by entry name; an entry not named grows by 0.
 * @returns One row per entry, in the file's order.
 * @throws When an entry has no measure, or an addition names no entry.
 */
export function budgetRows(
  entries: readonly { name: string, limit: string }[],
  measures: ReadonlyMap<string, number>,
  additions: ReadonlyMap<string, number> = new Map(),
): BudgetRow[] {
  const entrynames = new Set(entries.map((entry) => entry.name))
  for (const entryname of additions.keys()) {
    if (! entrynames.has(entryname)) { throw new Error(`size-budget: --add names "${entryname}", which .size-limit.json has no entry for.`) }
  }
  return entries.map((entry) => {
    const measured = measures.get(entry.name)
    if (measured === undefined) { throw new Error(`size-budget: size-limit gave no measure for "${entry.name}".`) }
    const added = additions.get(entry.name) ?? 0
    return { entryname: entry.name, measured, added, now: parseKb(entry.limit), rule: budgetFor(measured + added) }
  })
}

/**
 * `.size-limit.json`'s text with the budgets given, each changed in place on its entry's line, so
 * the file keeps its one-entry-a-line layout.
 *
 * @param text    - The file as it stands.
 * @param budgets - The new budget in bytes, by entry name.
 * @returns The file's new text.
 * @throws When an entry's name and limit are not found together on exactly one line.
 *
 * @example withBudgets('{ "name": "mask", "limit": "8.8 kB" }', new Map([['mask', 9_000]]))  // => '{ "name": "mask", "limit": "9 kB" }'
 */
export function withBudgets(text: string, budgets: ReadonlyMap<string, number>): string {
  const lines = text.split('\n')
  for (const [entryname, bytes] of budgets) {
    const marker = `"name": ${JSON.stringify(entryname)},`
    const found = lines.map((line, ii) => (line.includes(marker) && line.includes('"limit"') ? ii : -1)).filter((ii) => ii >= 0)
    if (found.length !== 1) { throw new Error(`size-budget: found ${String(found.length)} lines for "${entryname}" in .size-limit.json, not one.`) }
    const at = found[0]!
    lines[at] = lines[at]!.replace(/"limit": "[^"]*"/, () => `"limit": "${formatKb(bytes)}"`)
  }
  return lines.join('\n')
}

/**
 * The report, a line per entry, its columns aligned.
 *
 * @example report([{ entryname: 'mask', measured: 5_740, added: 0, now: 8_800, rule: 8_800 }])
 */
export function report(rows: readonly BudgetRow[]): string {
  const table = [
    ['entry', 'measure', 'add', 'now', 'rule', ''],
    ...rows.map((row) => [
      row.entryname, formatKb(row.measured), row.added ? formatKb(row.added) : '', formatKb(row.now), formatKb(row.rule),
      lean(row),
    ]),
  ]
  const widths = table[0]!.map((_cell, col) => Math.max(...table.map((cells) => cells[col]!.length)))
  return table.map((cells) => cells.map((cell, col) => cell.padEnd(widths[col]!)).join('  ').trimEnd()).join('\n')
}

function lean(row: BudgetRow): string {
  if (row.rule > row.now) { return 'raise' }
  return row.rule < row.now ? 'lower' : ''
}

function additionsFrom(adds: readonly string[]): Map<string, number> {
  return new Map(adds.map((add) => {
    const match = /^([^=]+)=(\d+(?:\.\d+)?)$/.exec(add)
    if (! match) { throw new Error(`size-budget: --add takes <entry>=<kB>, as --add Vault=1.5, not "${add}".`) }
    return [match[1]!, Math.round(Number(match[2]) * 1000)]
  }))
}

function measuresFrom(json: string): Map<string, number> {
  const measured = JSON.parse(json) as { name: string, size: number }[]
  return new Map(measured.map((entry) => [entry.name, entry.size]))
}

function measureNow(rootDir: string): string {
  // size-limit exits 1 when a bundle is over its budget, and still prints every measure
  const result = spawnSync(path.join(rootDir, 'node_modules', '.bin', 'size-limit'), ['--json'], { cwd: rootDir, encoding: 'utf8' })
  if (! result.stdout.trimStart().startsWith('[')) {
    throw new Error(`size-budget: size-limit measured nothing (build first, with pnpm size):\n${result.stderr}${result.stdout}`)
  }
  return result.stdout
}

function main(argv: readonly string[]): number {
  const rootDir = path.resolve(import.meta.dirname, '..')
  let flags
  let additions
  try {
    flags = parseArgs({
      args:    [...argv],
      options: {
        config:   { type: 'string', default: path.join(rootDir, '.size-limit.json') },
        measured: { type: 'string' },
        add:      { type: 'string', multiple: true, default: [] },
        write:    { type: 'boolean', default: false },
        raise:    { type: 'boolean', default: false },
      },
    }).values
    if (flags.write && flags.raise) { throw new Error('size-budget: --write and --raise are two answers to one question; pass one.') }
    additions = additionsFrom(flags.add)
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\nUsage: node scripts/size-budget.ts [--config <path>] [--measured <size-limit.json>] [--add <entry>=<kB>]... [--write | --raise]\n`)
    return 2
  }
  try {
    const text = readFileSync(flags.config, 'utf8')
    const json = flags.measured ? readFileSync(flags.measured, 'utf8') : measureNow(rootDir)
    const rows = budgetRows(JSON.parse(text) as { name: string, limit: string }[], measuresFrom(json), additions)
    process.stdout.write(`${report(rows)}\n`)
    const changed = rows.filter((row) => (flags.raise ? row.rule > row.now : row.rule !== row.now))
    if ((flags.write || flags.raise) && changed.length > 0) {
      const budgets = new Map(changed.map((row) => [row.entryname, row.rule]))
      writeFileSync(flags.config, withBudgets(text, budgets))
      process.stdout.write(`size-budget: ${String(changed.length)} of .size-limit.json's budgets are set to the rule's.\n`)
    }
    return 0
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2))
}
