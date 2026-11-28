import { type QueryClient, notifyManager, useQueryClient } from '@tanstack/react-query'
import type { MaskedView } from 'safebyok-react'
import { useEffect, useState } from 'react'
import { maskUuid } from 'safebyok/utils'
import { SOK } from '../lib/dojo'
import type { ShelvedRow, StoredRow } from '../lib/fixture'
import { cacheRowsNow, vaultRowsNow } from '../lib/stores'

/** One row as the panel shows it: what it is filed under, and its stored fields. */
type Shown = Readonly<{ ckey: string, modelkind: string, val: unknown }>

/** The groups every store's panel shows, in order, even when empty. */
const Modelkinds = ['gate', 'box'] as const

/** The groups of the device's panel: the modelkinds of its bank TSQ and vault TSQ, and its lease. */
const DeviceGroups = [...Modelkinds, 'lease'] as const

/** The one group of the mutations' panel. */
const MutationGroups = ['mutation'] as const

/** Fields the tables leave out: a Thing's scope, which comes before its `label`, and what a row's ckey or its group says already. */
const OmittedFieldnames: ReadonlySet<string> = new Set(['scope', 'userid', 'banklabel', 'labelpath', 'modelkind'])

/** How often the panel reads the vault database and the root shelf, and the device's two TSQs, again while it shows. */
const RereadMillis = 1000

/** The rows of the vault database and the root shelf, read through the dojo's own connections, of the device's bank TSQ and vault TSQ, read through the library's back door, and of the host's mutations, read live: a table for each, grouped by modelkind, decrypting nothing. */
export function InspectTab({ isShown }: Readonly<{ isShown: boolean }>) {
  const [stored, setStored] = useState<Readonly<{ vault: Shown[], cache: Shown[], tsq: Shown[] }> | null>(null)
  const mutationRows = useMutationRows(useQueryClient())

  useEffect(() => {
    if (! isShown) { return }
    /** Read the vault database and the root shelf, and show what they hold. */
    async function reread() {
      const vault = await vaultRowsNow()
      setStored({ vault: vault.map((row) => shownOfThing(row)), cache: cacheRowsNow().flatMap((row) => shownOfShelved(row)), tsq: shownOfMaskedView(SOK.maskedView()) })
    }
    void reread()
    const timer = setInterval(() => { void reread() }, RereadMillis)
    return () => { clearInterval(timer) }
  }, [isShown])

  return (
    <section aria-labelledby="inspect-title" className="card">
      <h2 id="inspect-title">Inspect</h2>
      <Panel title="VaultDB: what the backend stores (IndexedDB, read directly)" groups={Modelkinds} rows={stored?.vault} />
      <Panel title="Root shelf: each bank's roots kept here between page loads (localStorage, read directly)" groups={Modelkinds} rows={stored?.cache} />
      <Panel title={"TSQ: the device's bank TSQ (its gate and root box), its vault TSQ (its boxes and their listings), and its lease"} groups={DeviceGroups} rows={stored?.tsq}
        note="Read through the library's back door, maskedView, for experimenting: the bank TSQ and the vault TSQ each cut every ciphertext to its last 2 characters and its length before it leaves the library, and the lease shows its loggable, never its keys." />
      <Panel title={"Mutations: the host's QueryClient"} groups={MutationGroups} rows={mutationRows} />
    </section>
  )
}

/** One panel's rows as a table, a section for each of `groups` and one for the rest, each with its count, under `note` where given. */
function Panel({ title, groups, rows, note }: Readonly<{ title: string, groups: readonly string[], rows: readonly Shown[] | undefined, note?: string }>) {
  const noted = (note !== undefined) && <p className="quiet">{note}</p>
  if (rows === undefined) { return <><h3>{title}</h3>{noted}<p className="quiet">Reading…</p></> }
  const others = rows.filter((row) => ! groups.includes(row.modelkind))
  return (
    <>
      <h3>{title}</h3>
      {noted}
      <div className="scroller">
        <table className="inspect" aria-label={title}>
          {groups.map((modelkind) => <Group key={modelkind} title={titleOf(modelkind)} rows={rows.filter((row) => row.modelkind === modelkind)} />)}
          {(others.length > 0) && <Group title="Other" rows={others} />}
        </table>
      </div>
    </>
  )
}

/** One group's rows, under a row of header cells: the group's title and count, then the name of each field its rows have. */
function Group({ title, rows }: Readonly<{ title: string, rows: readonly Shown[] }>) {
  const fieldnames = fieldnamesOf(rows)
  return (
    <tbody>
      <tr>
        <th scope="col">-- {title} ({rows.length}) --</th>
        {fieldnames.map((fieldname) => <th key={fieldname} scope="col">{fieldname}</th>)}
      </tr>
      {rows.map((row) => <Row key={row.ckey} row={row} fieldnames={fieldnames} />)}
    </tbody>
  )
}

/** One row: its ckey, then a cell for each of `fieldnames`, or one cell across them all when its value has no fields. */
function Row({ row, fieldnames }: Readonly<{ row: Shown, fieldnames: readonly string[] }>) {
  const { ckey, val } = row
  return (
    <tr>
      <td><code>{ckey}</code></td>
      {isFielded(val)
        ? fieldnames.map((fieldname) => <td key={fieldname}><code>{Object.hasOwn(val, fieldname) ? cellTextOf(fieldname, val[fieldname]) : ''}</code></td>)
        : <td colSpan={Math.max(fieldnames.length, 1)}><code>{shownText(val)}</code></td>}
    </tr>
  )
}

/** The fields of `rows`' values, each once, in the order the values have them: all but {@link OmittedFieldnames}. */
function fieldnamesOf(rows: readonly Shown[]): string[] {
  const fieldnames = new Set<string>()
  for (const { val } of rows) {
    if (! isFielded(val)) { continue }
    for (const fieldname of Object.keys(val)) { if (! OmittedFieldnames.has(fieldname)) { fieldnames.add(fieldname) } }
  }
  return [...fieldnames]
}

/** True when `val` is an object with fields to show, not null or an array. */
function isFielded(val: unknown): val is Readonly<Record<string, unknown>> {
  return (typeof val === 'object') && (val !== null) && (! Array.isArray(val))
}

/** The mutations of `client`, re-read at each change to its cache. */
function useMutationRows(client: QueryClient): Shown[] {
  const [rows, setRows] = useState(() => shownOfMutations(client))
  useEffect(() => client.getMutationCache().subscribe(notifyManager.batchCalls(() => { setRows(shownOfMutations(client)) })), [client])
  return rows
}

// A form verb's variables are its gating, which prints as a marker and nothing of its cleartexts.
/** Each mutation of `client`'s cache: its key, its status, and its variables as text. */
function shownOfMutations(client: QueryClient): Shown[] {
  return client.getMutationCache().getAll().map((mutation) => ({
    ckey: `${String(mutation.mutationId)} ${JSON.stringify(mutation.options.mutationKey ?? [])}`, modelkind: 'mutation',
    val:  { status: mutation.state.status, variables: String(mutation.state.variables) },
  }))
}

/** A row of the vault database, filed at `[modelkind, userid, banklabel, labelpath]`. */
function shownOfThing([ckey, val]: StoredRow): Shown {
  const modelkind = (ckey as [modelkind: string, userid: string, banklabel: string, labelpath: string])[0]
  return { ckey: JSON.stringify(ckey), modelkind, val }
}

/** Each root the root shelf keeps at `ckey`: the value is its version, then the gate's and the root box's records, each beside when it was read. */
function shownOfShelved([ckey, shelved]: ShelvedRow): Shown[] {
  const [, ...roots] = JSON.parse(shelved) as [version: string, ...roots: { record: { labelpath: string, modelkind: string }, read_tc: string }[]]
  return roots.map((root) => ({ ckey: `${ckey} ${root.record.labelpath}`, modelkind: root.record.modelkind, val: root }))
}

// A bank TSQ row is a root's record, masked, which states its kind. A vault TSQ item is a box's; its listings are `other`.
/** Each row of the device's bank TSQ and vault TSQ, its ckey led by `bankTSQ` or `vaultTSQ`; then its lease. */
function shownOfMaskedView({ bankTSQ, vaultTSQ, lease }: MaskedView): Shown[] {
  const roots = bankTSQ.map(({ queryKey, val }) => ({ ckey: `bankTSQ ${JSON.stringify(queryKey)}`, modelkind: (val as { modelkind: string }).modelkind, val }))
  const items = vaultTSQ.map(({ queryKey, val }) => ({ ckey: `vaultTSQ ${JSON.stringify(queryKey)}`, modelkind: (queryKey[4] === 'item') ? 'box' : 'other', val }))
  return [...roots, ...items, { ckey: 'lease', modelkind: 'lease', val: lease }]
}

/** `modelkind`, capitalized, for a group's heading. */
function titleOf(modelkind: string): string { return `${modelkind.charAt(0).toUpperCase()}${modelkind.slice(1)}` }

/** The fields whose cells show a UUID cut short by `maskUuid`: tokens and a read time, too long whole for a column. */
const UuidFieldnames: ReadonlySet<string> = new Set(['revtok', 'banktok', 'read_tc'])

/** The text of the cell for `fieldname`: a text of {@link UuidFieldnames} cut short, anything else as {@link shownText} gives it. */
function cellTextOf(fieldname: string, inner: unknown): string {
  if ((typeof inner === 'string') && UuidFieldnames.has(fieldname)) { return maskUuid(inner) }
  return shownText(inner)
}

/** The longest string shown whole; a longer one, as ciphertext is, shows its start and its length. */
const ShownChars = 24

/** `val` as JSON, each long string cut short. */
function shownText(val: unknown): string {
  if (val === undefined) { return '(no data)' }
  return JSON.stringify(val, (_ckey, inner: unknown) => (((typeof inner === 'string') && (inner.length > ShownChars)) ? `${inner.slice(0, 12)}…(${String(inner.length)})` : inner))
}
