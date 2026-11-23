import { type Query, type QueryClient, notifyManager, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { PersistedClient } from 'safebyok/storage'
import { SOK } from '../lib/dojo'
import type { StoredRow } from '../lib/fixture'
import { cacheRowsNow, vaultRowsNow } from '../lib/stores'

/** One row as the panel shows it: what it is filed under, and its stored fields. */
type Shown = Readonly<{ ckey: string, modelkind: string, val: unknown }>

/** The groups every panel shows, in order, even when empty. */
const Modelkinds = ['bank', 'gate', 'box'] as const

/** How often the panel reads the two stores again while it shows. */
const RereadMillis = 1000

/** The rows of the two stores, read through the dojo's own connections, and of the app's QueryClients, read live: grouped by modelkind, decrypting nothing. */
export function InspectTab({ isShown }: Readonly<{ isShown: boolean }>) {
  const [stored, setStored] = useState<Readonly<{ vault: Shown[], cache: Shown[] }> | null>(null)
  const { client } = SOK.useQueryOptions().dojo
  const tsqRows = useQueryRows(client)
  const mutationRows = useMutationRows(useQueryClient())

  useEffect(() => {
    if (! isShown) { return }
    /** Read both stores, and show what they hold. */
    async function reread() {
      const [vault, cache] = await Promise.all([vaultRowsNow(), cacheRowsNow()])
      setStored({ vault: vault.map((row) => shownOfThing(row)), cache: cache.flatMap((row) => shownOfSnapshot(row)) })
    }
    void reread()
    const timer = setInterval(() => { void reread() }, RereadMillis)
    return () => { clearInterval(timer) }
  }, [isShown])

  return (
    <section aria-labelledby="inspect-title" className="card">
      <h2 id="inspect-title">Inspect</h2>
      <Panel title="VaultDB: what the backend stores (IndexedDB, read directly)" rows={stored?.vault} />
      <Panel title="Device cache: the snapshots kept here between page loads, in place of a DeviceDB: the new core has none" rows={stored?.cache} />
      <Panel title={"TSQ: the device's QueryClient, which the hooks observe"} rows={tsqRows} />
      <h3>{"Mutations: the host's QueryClient"} ({mutationRows.length})</h3>
      <ul className="rows">{mutationRows.map((row) => <li key={row.ckey}><code>{row.ckey}</code> <code>{shownText(row.val)}</code></li>)}</ul>
    </section>
  )
}

/** One store's rows, grouped by modelkind, with a count in each heading. */
function Panel({ title, rows }: Readonly<{ title: string, rows: readonly Shown[] | undefined }>) {
  if (rows === undefined) { return <><h3>{title}</h3><p className="quiet">Reading…</p></> }
  const others = rows.filter((row) => ! (Modelkinds as readonly string[]).includes(row.modelkind))
  return (
    <>
      <h3>{title}</h3>
      {Modelkinds.map((modelkind) => <Group key={modelkind} title={titleOf(modelkind)} rows={rows.filter((row) => row.modelkind === modelkind)} />)}
      {(others.length > 0) && <Group title="Other" rows={others} />}
    </>
  )
}

/** One modelkind's rows, under a heading with their count. */
function Group({ title, rows }: Readonly<{ title: string, rows: readonly Shown[] }>) {
  return (
    <>
      <h4>-- {title} ({rows.length}) --</h4>
      <ul className="rows">{rows.map((row) => <li key={row.ckey}><code>{row.ckey}</code> <code>{shownText(row.val)}</code></li>)}</ul>
    </>
  )
}

// A query is added to the cache while a hook renders: batchCalls tells the panel after that render, as React Query's own hooks are told.
/** The queries of `client`, re-read at each change to its cache. */
function useQueryRows(client: QueryClient): Shown[] {
  const [rows, setRows] = useState(() => shownOfQueries(client.getQueryCache().getAll()))
  useEffect(() => client.getQueryCache().subscribe(notifyManager.batchCalls(() => { setRows(shownOfQueries(client.getQueryCache().getAll())) })), [client])
  return rows
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

/** A row of the vault database, filed at `[userid, banklabel, labelpath]`. */
function shownOfThing([ckey, val]: StoredRow): Shown {
  const labelpath = (ckey as [userid: string, banklabel: string, labelpath: string])[2]
  return { ckey: JSON.stringify(ckey), modelkind: labelpath.split('/', 1)[0] ?? '', val }
}

/** Each query of a snapshot the persist database keeps at its recordlabel. */
function shownOfSnapshot([recordlabel, persisted]: StoredRow): Shown[] {
  return (persisted as PersistedClient).clientState.queries.map((dehydrated) => ({
    ckey: `${recordlabel as string} ${JSON.stringify(dehydrated.queryKey)}`, modelkind: modelkindOfQueryKey(dehydrated.queryKey), val: dehydrated.state.data,
  }))
}

/** Each query of a QueryClient's cache. */
function shownOfQueries(queries: Query[]): Shown[] {
  return queries.map((cached) => ({ ckey: JSON.stringify(cached.queryKey), modelkind: modelkindOfQueryKey(cached.queryKey), val: cached.state.data }))
}

/** The modelkind of a minder's item, from its key `['sok', userid, banklabel, 'item', modelkind, …]`; `other` for any other key. */
function modelkindOfQueryKey(queryKey: readonly unknown[]): string {
  return (queryKey[3] === 'item') ? String(queryKey[4]) : 'other'
}

/** `modelkind`, capitalized, for a group's heading. */
function titleOf(modelkind: string): string { return `${modelkind.charAt(0).toUpperCase()}${modelkind.slice(1)}` }

/** The longest string shown whole; a longer one, as ciphertext is, shows its start and its length. */
const ShownChars = 24

/** `val` as JSON, each long string cut short. */
function shownText(val: unknown): string {
  if (val === undefined) { return '(no data)' }
  return JSON.stringify(val, (_ckey, inner: unknown) => (((typeof inner === 'string') && (inner.length > ShownChars)) ? `${inner.slice(0, 12)}…(${String(inner.length)})` : inner))
}
