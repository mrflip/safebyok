import { useCallback } from 'react'
import type { VaultDB } from 'safebyok'
import { boxSparse, nextRevisionOf, revisionOf } from 'safebyok/storage'
import type { BankListed, BankScope, BoxesListed, BoxSparse, DamagedBox, DamagedVault, VaultRecord, VaultRow } from 'safebyok/storage'
import { useBank } from '../hooks'
import { LastCallLine, jsonOf, timeOf, useLastCall, useListing } from './last-call'

/** What a DevVaultDBInspector is handed: the vaultDB whose rows it shows. */
export type DevVaultDBInspectorProps = { vaultDB: VaultDB }

/** A table of the signed-in user's rows in `vaultDB` as its verbs answer them, with a raw button for each get and del it offers. */
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

/** The bank's vault rows, and the box rows of each live vault by its vaultlabel. */
type BankRows = { listed: BankListed, boxesOf: ReadonlyMap<string, BoxesListed> }

/** The rows `listVaults` answers for `scope`, and those `listBoxes` answers for each live vault among them. */
const listBankRows = async (vaultDB: VaultDB, scope: BankScope): Promise<BankRows> => {
  const { val: listed } = await vaultDB.listVaults(scope)
  const live = listed.vaults.filter((row): row is VaultRecord => row.am === 'a')
  const boxesListed = await Promise.all(live.map(async ({ vaultlabel, vault_tok }) => {
    const { val } = await vaultDB.listBoxes({ ...scope, vaultlabel, vault_tok })
    return [vaultlabel, val] as const
  }))
  return { listed, boxesOf: new Map(boxesListed) }
}

/** The rows of the bank at `scope`, listed again at each change the vaultDB's watch tells of. */
const BankRowsTable = ({ vaultDB, scope }: { vaultDB: VaultDB, scope: BankScope }) => {
  const list = useCallback(() => listBankRows(vaultDB, scope), [vaultDB, scope])
  const watch = useCallback((onChange: () => void) => vaultDB.watch(scope, onChange), [vaultDB, scope])
  const { val: rows, trouble, relist } = useListing(list, watch)
  const { lastCall, call } = useLastCall()

  /** Runs a button's verb, then lists the rows again. */
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
                  onGetVault={() => call('getVault', async () => jsonOf(await vaultDB.getVault({ ...scope, vaultlabel: vaultRow.vaultlabel }, { ifAbsent: 'nil' })))}
                  onGetBox={(boxRow) => call('getBox', async () => jsonOf(await vaultDB.getBox({ ...scope, vaultlabel: boxRow.vaultlabel, boxlabel: boxRow.boxlabel, vault_tok: boxRow.vault_tok }, { ifAbsent: 'nil' })))}
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

/** What a vault row's lines are handed: the row, its boxes as listed, and what each button calls. */
type VaultRowLinesProps = {
  vaultRow:   VaultRow | DamagedVault
  boxes:      BoxesListed | null
  onGetVault: () => Promise<void>
  onGetBox:   (boxRow: BoxSparse | DamagedBox) => Promise<void>
  onDelBox:   (boxRow: BoxSparse | DamagedBox) => Promise<void>
}

/** A vault row's line, then a line for each of its box rows, damaged ones last. */
const VaultRowLines = ({ vaultRow, boxes, onGetVault, onGetBox, onDelBox }: VaultRowLinesProps) => {
  const boxRows: readonly (BoxSparse | DamagedBox)[] = boxes === null ? [] : [...boxes.boxes, ...boxes.damaged_rows]
  return (
    <>
      <tr className="dev-vault-row" data-am={vaultRow.am}>
        <td>{vaultRow.vaultlabel}</td><td />
        <td>{vaultRow.am}</td><td>{vaultRow.revision_seq}</td><td>{timeOf(vaultRow.written_at)}</td>
        <td><button type="button" onClick={() => { void onGetVault() }}>getVault</button></td>
      </tr>
      {boxRows.map((boxRow) => (
        <tr key={boxRow.boxlabel} className="dev-box-row" data-am={boxRow.am}>
          <td /><td>{boxRow.boxlabel}</td>
          <td>{boxRow.am}</td><td>{boxRow.revision_seq}</td><td>{timeOf(boxRow.written_at)}</td>
          <td>
            <button type="button" onClick={() => { void onGetBox(boxRow) }}>getBox</button>
            <button type="button" onClick={() => { void onDelBox(boxRow) }}>delBox</button>
          </td>
        </tr>
      ))}
    </>
  )
}

/** `delBox` of `boxRow` at the revision listed: its live row, its tombstone, or its damaged row. */
const delBoxRow = (vaultDB: VaultDB, boxRow: BoxSparse | DamagedBox) => {
  const sparse = boxSparse.parse(boxRow)
  return vaultDB.delBox({ ...sparse, ...nextRevisionOf(sparse, Date.now()), am: 'x' }, { prior: revisionOf(sparse) })
}
// --
