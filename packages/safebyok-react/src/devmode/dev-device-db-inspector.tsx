import { useCallback, useState } from 'react'
import type { DeviceDB } from 'safebyok'
import { leaseQuery } from 'safebyok/storage'
import type { LeaseScopepath } from 'safebyok/storage'
import type { DevDeviceDBInspectorProps, LeaseRowLineProps, ListedLease } from '../shapes'
import { LastCallLine, timeOf, useLastCall, useListing } from './last-call'

/** A table of the rows `deviceDB` keeps on this device as its verbs answer them, with a button to forget each. */
export const DevDeviceDBInspector = ({ deviceDB }: DevDeviceDBInspectorProps) => (
  <section className="dev-inspector dev-device-db-inspector" aria-label="DeviceDB inspector">
    <h3>DeviceDB rows</h3>
    <LeaseRowsTable deviceDB={deviceDB} />
  </section>
)

// == [Leases]: LeaseRowsTable, LeaseRowLine, LeaseColumns, ListedLease, listedOfRaw, cellOf

const LeaseColumns = ['applabel', 'user_id', 'vaultlabel', 'vault_tok', 'proved_at'] as const

const listedOfRaw = ({ scopepath, row }: { scopepath: LeaseScopepath, row: unknown }): ListedLease => (
  { scopepath, row: ((typeof row === 'object') && (row !== null)) ? { ...row } : {} }
)

const LeaseRowsTable = ({ deviceDB }: { deviceDB: DeviceDB }) => {
  const [isRaw, setIsRaw] = useState(false)
  const list = useCallback(async (): Promise<readonly ListedLease[]> => {
    if (! isRaw) {
      const rows = await deviceDB.listLeases()
      return rows.map((row) => ({ row, scopepath: null }))
    }
    const raws = await deviceDB.listRawLeases()
    return raws.map((raw) => listedOfRaw(raw))
  }, [deviceDB, isRaw])
  const { val: rows, trouble, relist } = useListing<readonly ListedLease[]>(list)
  const { lastCall, call } = useLastCall()

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
              {rows.map(({ row, scopepath }, ii) => (
                <LeaseRowLine
                  // A damaged row may lack the fields that would name it.
                  key={`${String(row['vaultlabel'])}/${String(row['vault_tok'])}/${String(ii)}`}
                  row={row}
                  scopepath={scopepath}
                  onForget={(asked) => callThenRelist('forget', async () => { await deviceDB.forget(asked); return 'forgotten' })}
                  onForgetRaw={isRaw ? (filed) => callThenRelist('forgetRawLease', async () => { await deviceDB.forgetRawLease(filed); return 'deleted' }) : null}
                />
              ))}
            </tbody>
          </table>
        )}
      <LastCallLine lastCall={lastCall} />
    </>
  )
}

const LeaseRowLine = ({ row, scopepath, onForget, onForgetRaw }: LeaseRowLineProps) => {
  const asked = leaseQuery.safeParse(row)
  const others = Object.keys(row).filter((fieldname) => ! (LeaseColumns as readonly string[]).includes(fieldname))
  return (
    <tr className="dev-lease-row" data-named={asked.success}>
      {LeaseColumns.map((fieldname) => <td key={fieldname}>{cellOf(fieldname, row[fieldname])}</td>)}
      <td>{others.map((fieldname) => `${fieldname}: ${cellOf(fieldname, row[fieldname])}`).join(', ')}</td>
      <td>
        {asked.success && <button type="button" onClick={() => { void onForget(asked.data) }}>forget</button>}
        {(onForgetRaw !== null) && (scopepath !== null) && <button type="button" onClick={() => { void onForgetRaw(scopepath) }}>forgetRawLease</button>}
      </td>
    </tr>
  )
}

// A raw row holds the leaseKey and the vaultKeyLeaseWrapped: show each such field's kind, never its
// content.
const cellOf = (fieldname: string, val: unknown): string => {
  if (val === undefined) { return '–' }
  if ((fieldname === 'proved_at') && (typeof val === 'number')) { return timeOf(val) }
  if ((typeof val === 'number') || (typeof val === 'boolean') || (val === null)) { return String(val) }
  if ((typeof val === 'string') && (LeaseColumns as readonly string[]).includes(fieldname)) { return val }
  if (typeof val === 'string') { return `<string of ${String(val.length)}>` }
  if (typeof val === 'object') { return `<${(Object.getPrototypeOf(val) as { constructor?: { name?: string } } | null)?.constructor?.name ?? 'object'}>` }
  return `<${typeof val}>`
}
// --
