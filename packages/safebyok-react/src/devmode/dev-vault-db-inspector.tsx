import { useCallback } from 'react'
import type { VaultDB } from 'safebyok'
import { makeLifeTok, nextRevisionOf, shellBoxOf, shellVaultOf } from 'safebyok/storage'
import type { BankListed, BankScope, BoxesListed, BoxSparse, DamagedBox, DamagedVault, VaultRecord, VaultRow, VaultScope } from 'safebyok/storage'
import { useBank } from '../hooks/hooks'
import type { DevVaultDBInspectorProps, VaultRowLinesProps } from '../shapes'
import { LastCallLine, jsonOf, timeOf, useLastCall, useListing } from './last-call'

/** Render a table of the signed-in user's rows in `vaultDB`, as its list verbs return them, with a button for each raw get and del. */
export const DevVaultDBInspector = ({ vaultDB }: DevVaultDBInspectorProps) => {
  const scope = useBank()?.scope ?? null
  return (
    <section className="dev-inspector dev-vault-db-inspector" aria-label="VaultDB inspector">
      <h3>VaultDB rows</h3>
      {scope === null
        ? <p className="quiet">No bank: sign in to see its rows.</p>
        : <BankRowsTable vaultDB={vaultDB} scope={scope} />}
    </section>
  )
}

// == [Rows]: BankRows, listBankRows, BankRowsTable, VaultRowLines, delBoxRow

type BankRows = { listed: BankListed, boxesOf: ReadonlyMap<string, BoxesListed> }

const listBankRows = async (vaultDB: VaultDB, scope: BankScope): Promise<BankRows> => {
  const { val: listed } = await vaultDB.listVaults({ op: 'list', ...scope })
  const live = listed.vaults.filter((row): row is VaultRecord => row.am === 'a')
  const boxesListed = await Promise.all(live.map(async ({ vaultlabel, vault_tok }) => {
    const { val } = await vaultDB.listBoxes({ op: 'list', ...scope, vaultlabel, vault_tok })
    return [vaultlabel, val] as const
  }))
  return { listed, boxesOf: new Map(boxesListed) }
}

const BankRowsTable = ({ vaultDB, scope }: { vaultDB: VaultDB, scope: BankScope }) => {
  const list = useCallback(() => listBankRows(vaultDB, scope), [vaultDB, scope])
  const watch = useCallback((onChange: () => void) => vaultDB.watch(scope, onChange), [vaultDB, scope])
  const { val: rows, trouble, relist } = useListing(list, watch)
  const { lastCall, call } = useLastCall()

  const callThenRelist = async (verbname: string, work: () => Promise<string>) => {
    await call(verbname, work)
    relist()
  }
  const vaultRows: readonly (VaultRow | DamagedVault)[] = rows === null ? [] : [...rows.listed.vaults, ...rows.listed.damaged_rows]
  return (
    <>
      <div className="row">
        <button type="button" onClick={relist}>Refresh</button>
        <button type="button" onClick={() => { void callThenRelist('tidyGone', async () => jsonOf(await vaultDB.tidyGone(scope))) }}>tidyGone</button>
      </div>
      {trouble !== null && <p role="alert">{`listVaults or listBoxes refused: ${trouble}`}</p>}
      {rows === null
        ? <p className="quiet">Listing…</p>
        : (
          <table>
            <thead>
              <tr><th>vaultlabel</th><th>boxlabel</th><th>am</th><th>revision_seq</th><th>written_at</th><th>verbs</th></tr>
            </thead>
            <tbody>
              {vaultRows.map((vaultRow) => (
                <VaultRowLines
                  key={vaultRow.vaultlabel}
                  vaultRow={vaultRow}
                  boxes={rows.boxesOf.get(vaultRow.vaultlabel) ?? null}
                  onGetVault={() => call('getVault', async () => jsonOf(await getVaultRow(vaultDB, { ...scope, vaultlabel: vaultRow.vaultlabel })))}
                  onGetBox={(boxRow) => call('getBox', async () => jsonOf(await getBoxRow(vaultDB, boxRow)))}
                  onDelBox={(boxRow) => callThenRelist('delBox', async () => jsonOf(await delBoxRow(vaultDB, boxRow)))}
                />
              ))}
            </tbody>
          </table>
        )}
      <LastCallLine lastCall={lastCall} />
    </>
  )
}

// A damaged row carries only its scope, so it has no revision or time to show.
const RevisionCells = ({ row }: { row: VaultRow | BoxSparse | DamagedVault | DamagedBox }) => (
  (row.am === 'd') ? <><td /><td /></> : <><td>{row.revision_seq}</td><td>{timeOf(row.written_at)}</td></>
)

const VaultRowLines = ({ vaultRow, boxes, onGetVault, onGetBox, onDelBox }: VaultRowLinesProps) => {
  const boxRows: readonly (BoxSparse | DamagedBox)[] = boxes === null ? [] : [...boxes.boxes, ...boxes.damaged_rows]
  return (
    <>
      <tr className="dev-vault-row" data-am={vaultRow.am}>
        <td>{vaultRow.vaultlabel}</td><td />
        <td>{vaultRow.am}</td><RevisionCells row={vaultRow} />
        <td><button type="button" onClick={() => { void onGetVault() }}>getVault</button></td>
      </tr>
      {boxRows.map((boxRow) => (
        <tr key={boxRow.boxlabel} className="dev-box-row" data-am={boxRow.am}>
          <td /><td>{boxRow.boxlabel}</td>
          <td>{boxRow.am}</td><RevisionCells row={boxRow} />
          <td>
            <button type="button" onClick={() => { void onGetBox(boxRow) }}>getBox</button>
            {boxRow.am !== 'd' && <button type="button" onClick={() => { void onDelBox(boxRow) }}>delBox</button>}
          </td>
        </tr>
      ))}
    </>
  )
}

// The inspector holds no row of what it gets, so each get expects the shell for none.
const getVaultRow = (vaultDB: VaultDB, scope: VaultScope) => (
  vaultDB.getVault({ op: 'get', ...scope, ifAbsent: 'nil', expected: shellVaultOf(scope) })
)

const getBoxRow = (vaultDB: VaultDB, { applabel, user_id, vaultlabel, boxlabel, vault_tok }: BoxSparse | DamagedBox) => (
  vaultDB.getBox({ op: 'get', applabel, user_id, vaultlabel, boxlabel, vault_tok, ifAbsent: 'nil', expected: shellBoxOf({ applabel, user_id, vaultlabel, boxlabel }, vault_tok) })
)

// The listed row is the one the del expects, and its tombstone carries a new life token.
const delBoxRow = (vaultDB: VaultDB, boxRow: BoxSparse) => {
  const { applabel, user_id, vaultlabel, boxlabel, vault_tok } = boxRow
  const record = { ...boxRow, ...nextRevisionOf(boxRow, Date.now()), am: 'x' as const, box_tok: makeLifeTok() }
  return vaultDB.delBox({ op: 'del', applabel, user_id, vaultlabel, boxlabel, vault_tok, expected: boxRow, record })
}
// --
