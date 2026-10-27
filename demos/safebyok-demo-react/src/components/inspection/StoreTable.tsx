import { useEffect, useState } from 'react'
import type { StringStore } from 'safebyok'
import type { IdbRow } from 'safebyok/idb'

/**
 * Shared machinery for the two inspection panels, and nothing else uses it: deleting the
 * panels means deleting this whole src/components/inspection/ directory. The panels never talk
 * to the vault -- they watch the raw stores, so what they show is what is actually stored,
 * not what the library claims.
 */

export type StoreRow = { ckey: string, text: string, flavor: 'plain' | 'ciphered' | 'keyhandle' }

/** A window onto an IndexedDB shelf, as inspectIdbVaultDB and inspectIdbDeviceDB hand one out. */
export type IdbInspector = {
  rows(): Promise<IdbRow[]>
  subscribe(listener: () => void): () => void
  wipe(): Promise<void>
}

/** Encrypted fields announce themselves by VOCABULARY's suffixes: Wrapped keys, Ciphered whispers. */
const rowFlavor = (text: string): StoreRow['flavor'] => {
  if (text.includes('«CryptoKey')) { return 'keyhandle' }
  if (text.includes('_wrapped') || text.includes('_ciphered')) { return 'ciphered' }
  return 'plain'
}

const snapStoreRows = (store: StringStore): StoreRow[] => (
  store.scopepaths().toSorted((one, two) => one.localeCompare(two)).map((ckey) => {
    const text = store.read(ckey) ?? ''
    return { ckey, text, flavor: rowFlavor(text) }
  })
)

/** A CryptoKey as the handle it is, since it has no bytes to show. */
const showKeyHandle = (cryptoKey: CryptoKey): string => (
  cryptoKey.extractable ? '«CryptoKey handle»' : '«CryptoKey non-extractable handle»'
)

/**
 * A stored value as display text. JSON has no spelling for undefined, a function or a symbol
 * (JSON.stringify gives back undefined for them, whatever its declared type says), so those print
 * as String() has them.
 */
const showStoredVal = (val: unknown): string => {
  if (val === undefined || typeof val === 'function' || typeof val === 'symbol') { return String(val) }
  return JSON.stringify(val, (_ckey, nested: unknown) => (
    nested instanceof CryptoKey ? showKeyHandle(nested) : nested
  ))
}

/** A StringStore's rows, live: re-snapped on every store change. */
// eslint-disable-next-line react-refresh/only-export-components -- the panels' shared hooks live with their shared table; an edit here reloads the page, which the inspection panels can afford
export const useStoreRows = (store: StringStore): StoreRow[] => {
  const [rows, setRows] = useState<StoreRow[]>(() => snapStoreRows(store))
  useEffect(() => {
    const refresh = () => { setRows(snapStoreRows(store)) }
    refresh()
    return store.subscribe(refresh)
  }, [store])
  return rows
}

/** An IndexedDB shelf's rows, live: re-fetched on every change the inspector hears. */
// eslint-disable-next-line react-refresh/only-export-components -- see useStoreRows
export const useIdbRows = (inspector: IdbInspector): StoreRow[] => {
  const [rows, setRows] = useState<StoreRow[]>([])
  useEffect(() => {
    let gone = false
    const refresh = () => {
      void inspector.rows().then((fetched) => {
        if (gone) { return }
        setRows(fetched.map(({ scopepath, row }) => {
          const text = showStoredVal(row)
          return { ckey: scopepath, text, flavor: rowFlavor(text) }
        }))
      })
    }
    refresh()
    const unsubscribe = inspector.subscribe(refresh)
    return () => { gone = true; unsubscribe() }
  }, [inspector])
  return rows
}

const FlavorChip = ({ flavor }: { flavor: StoreRow['flavor'] }) => {
  if (flavor === 'ciphered') { return <span className="chip">🔐 ciphertext</span> }
  if (flavor === 'keyhandle') { return <span className="chip">🔑 non-extractable key</span> }
  return null
}

export const StoreTable = ({ rows }: { rows: StoreRow[] }) => {
  if (rows.length === 0) { return <p className="quiet">(empty)</p> }
  return (
    <table className="store-table">
      <thead><tr><th>ckey</th><th>stored value</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ckey}>
            <td><code>{row.ckey}</code><FlavorChip flavor={row.flavor} /></td>
            <td><code className="stored-text">{row.text}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A "wipe this store" button: each panel owns exactly its own store's reset. */
export const WipeStoreButton = ({ store, storeTitle }: { store: StringStore, storeTitle: string }) => {
  const wipe = () => {
    if (! globalThis.confirm(`Wipe every row of ${storeTitle}?`)) { return }
    for (const ckey of store.scopepaths()) { store.erase(ckey) }
  }
  return <button className="mini danger" onClick={wipe}>wipe</button>
}

/** The same, for an IndexedDB shelf. */
export const WipeIdbButton = ({ inspector, storeTitle }: { inspector: IdbInspector, storeTitle: string }) => {
  const wipe = () => {
    if (! globalThis.confirm(`Wipe every row of ${storeTitle}?`)) { return }
    void inspector.wipe()
  }
  return <button className="mini danger" onClick={wipe}>wipe</button>
}
