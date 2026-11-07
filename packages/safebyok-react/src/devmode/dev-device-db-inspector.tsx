import { useCallback, useState } from 'react'
import type { DeviceDB } from 'safebyok'
import { leaseQuery, vaultScope } from 'safebyok/storage'
import type { LeaseQuery, VaultScope } from 'safebyok/storage'
import { LastCallLine, useLastCall, useListing } from './last-call'

/** What a DevDeviceDBInspector is handed: the deviceDB whose rows it shows. */
export type DevDeviceDBInspectorProps = { deviceDB: DeviceDB }

/** A table of the rows `deviceDB` keeps on this device as its verbs answer them, with a button to forget each. */
export const DevDeviceDBInspector = ({ deviceDB }: DevDeviceDBInspectorProps) => (
  <section className="dev-inspector dev-device-db-inspector" aria-label="DeviceDB inspector">
    <h3>DeviceDB rows</h3>
    {/* The bank rows the deviceDB keeps will sit beside its leases, as a table of their own. */}
    <LeaseRowsTable deviceDB={deviceDB} />
  </section>
)

// == [Leases]: LeaseRowsTable, LeaseRowLine, LeaseColumns, cellOf

/** The fields each lease row shows in a column of its own; any other a raw row holds goes in the last. */
const LeaseColumns = ['applabel', 'user_id', 'vaultlabel', 'vault_tok', 'proved_at'] as const

/** The lease rows `listLeases` answers, or with damaged rows those `listRawLeases` answers, each with its forget. */
const LeaseRowsTable = ({ deviceDB }: { deviceDB: DeviceDB }) => {
  const [isRaw, setIsRaw] = useState(false)
  const list = useCallback(() => (isRaw ? deviceDB.listRawLeases() : deviceDB.listLeases()), [deviceDB, isRaw])
  const { val: rows, trouble, relist } = useListing<readonly Record<string, unknown>[]>(list)
  const { lastCall, call } = useLastCall()

  /** Runs a button's verb, then lists the rows again. */
  const callThenRelist = async (verbname: string, work: () => Promise<string>) => {
    await call(verbname, work)
    relist()
  }
  const listname = isRaw ? 'listRawLeases' : 'listLeases'
  return (
    <>
      <div className="row">
        <button type="button" onClick={relist}>Refresh</button>
        <label>
          <input type="checkbox" checked={isRaw} onChange={(evt) => { setIsRaw(evt.target.checked) }} />
          {' Include damaged rows'}
        </label>
      </div>
      {trouble !== null && <p role="alert">{`${listname} refused: ${trouble}`}</p>}
      {rows === null
        ? <p className="quiet">Listing…</p>
        : (
          <table>
            <caption>{`Leases, as ${listname} answers them`}</caption>
            <thead>
              <tr>{LeaseColumns.map((fieldname) => <th key={fieldname}>{fieldname}</th>)}<th>other fields</th><th>verbs</th></tr>
            </thead>
            <tbody>
              {rows.map((row, ii) => (
                <LeaseRowLine
                  // A damaged row may lack the fields that would name it.
                  key={`${String(row['vaultlabel'])}/${String(row['vault_tok'])}/${String(ii)}`}
                  row={row}
                  onForget={(asked) => callThenRelist('forget', async () => { await deviceDB.forget(asked); return 'forgotten' })}
                  onDelRaw={isRaw ? (scope) => callThenRelist('delRawLease', async () => { await deviceDB.delRawLease(scope); return 'deleted' }) : null}
                />
              ))}
            </tbody>
          </table>
        )}
      <LastCallLine lastCall={lastCall} />
    </>
  )
}

/** What a lease row's line is handed: the row, and what its buttons call, null for a button it lacks. */
type LeaseRowLineProps = {
  row:      Record<string, unknown>
  onForget: (asked: LeaseQuery) => Promise<void>
  onDelRaw: ((scope: VaultScope) => Promise<void>) | null
}

/** A lease row's line: its fields, and a forget where it names a lease, a delRawLease where it names a vault. */
const LeaseRowLine = ({ row, onForget, onDelRaw }: LeaseRowLineProps) => {
  const asked = leaseQuery.safeParse(row)
  const scope = vaultScope.safeParse(row)
  const others = Object.keys(row).filter((fieldname) => ! (LeaseColumns as readonly string[]).includes(fieldname))
  return (
    <tr className="dev-lease-row" data-named={asked.success}>
      {LeaseColumns.map((fieldname) => <td key={fieldname}>{cellOf(fieldname, row[fieldname])}</td>)}
      <td>{others.map((fieldname) => `${fieldname}: ${cellOf(fieldname, row[fieldname])}`).join(', ')}</td>
      <td>
        {asked.success && <button type="button" onClick={() => { void onForget(asked.data) }}>forget</button>}
        {(onDelRaw !== null) && scope.success && <button type="button" onClick={() => { void onDelRaw(scope.data) }}>delRawLease</button>}
      </td>
    </tr>
  )
}

// A raw row holds the lease's key and the vault key wrapped by it: name what each such field
// holds, never its content.
/** What a cell shows of a row's field: a time, number, word or token as is, and of anything else only its kind. */
const cellOf = (fieldname: string, val: unknown): string => {
  if (val === undefined) { return '–' }
  if ((fieldname === 'proved_at') && (typeof val === 'number')) { return new Date(val).toISOString() }
  if ((typeof val === 'number') || (typeof val === 'boolean') || (val === null)) { return String(val) }
  if ((typeof val === 'string') && (LeaseColumns as readonly string[]).includes(fieldname)) { return val }
  if (typeof val === 'string') { return `<string of ${String(val.length)}>` }
  if (typeof val === 'object') { return `<${(Object.getPrototypeOf(val) as { constructor?: { name?: string } } | null)?.constructor?.name ?? 'object'}>` }
  return `<${typeof val}>`
}
// --
