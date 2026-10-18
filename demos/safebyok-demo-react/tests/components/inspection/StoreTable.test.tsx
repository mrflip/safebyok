// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { memoryStore } from 'safebyok'
import type { IdbRow } from 'safebyok/idb'
import { StoreTable, WipeIdbButton, WipeStoreButton, useIdbRows, useStoreRows, type IdbInspector, type StoreRow } from '../../../src/components/inspection/StoreTable'

/** An IndexedDB inspector over rows held in memory: what `inspectIdb` hands out, minus the database. */
const fakeInspector = (rows: IdbRow[]) => {
  const listeners = new Set<() => void>()
  const wipe = vi.fn(() => Promise.resolve())
  const inspector: IdbInspector = {
    rows: () => Promise.resolve([...rows]),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    wipe,
  }
  const put = (row: IdbRow) => {
    rows.push(row)
    listeners.forEach((listener) => { listener() })
  }
  return { inspector, put, listeners, wipe }
}

describe("StoreTable", () => {
  it("says so when there are no rows", () => {
    render(<StoreTable rows={[]} />)
    expect(screen.getByText('(empty)')).to.not.be.null
  })

  it("shows each row's ckey and text, with a chip for ciphertext and for a key handle", () => {
    const rows: StoreRow[] = [
      { ckey: 'bundle:acme',  text: '{"vault_key_passphrase_wrapped":{}}', flavor: 'ciphered' },
      { ckey: 'lease:acme',   text: '«CryptoKey non-extractable handle»',  flavor: 'keyhandle' },
      { ckey: 'session:acme', text: '{"userlabel":"margo"}',               flavor: 'plain' },
    ]
    render(<StoreTable rows={rows} />)
    expect(screen.getAllByRole('row')).to.have.lengthOf(4)
    expect(screen.getByText('session:acme')).to.not.be.null
    expect(screen.getByText('{"userlabel":"margo"}')).to.not.be.null
    expect(screen.getAllByText('🔐 ciphertext')).to.have.lengthOf(1)
    expect(screen.getAllByText('🔑 non-extractable key')).to.have.lengthOf(1)
  })
})

describe("useStoreRows", () => {
  it("snaps a store's rows sorted by ckey, flavored by what they hold, and follows its writes", () => {
    const store = memoryStore()
    store.write('session:acme', '{"userlabel":"margo"}')
    store.write('account:acme', '{"whisper_ciphered":{}}')
    const { result } = renderHook(() => useStoreRows(store))
    expect(result.current).to.deep.equal([
      { ckey: 'account:acme', text: '{"whisper_ciphered":{}}', flavor: 'ciphered' },
      { ckey: 'session:acme', text: '{"userlabel":"margo"}',   flavor: 'plain' },
    ])
    act(() => { store.erase('account:acme') })
    expect(result.current.map((row) => row.ckey)).to.deep.equal(['session:acme'])
  })
})

describe("useIdbRows", () => {
  it("fetches a shelf's rows as display text, and again when the shelf rings", async () => {
    const shelf = fakeInspector([{ ckey: 'bundle:acme', row: { lockbox_key_wrapped: { ciphertext_b64: 'ct' } } }])
    const { result } = renderHook(() => useIdbRows(shelf.inspector))
    await waitFor(() => { expect(result.current).to.have.lengthOf(1) })
    expect(result.current[0]).to.deep.equal({ ckey: 'bundle:acme', text: '{"lockbox_key_wrapped":{"ciphertext_b64":"ct"}}', flavor: 'ciphered' })
    act(() => { shelf.put({ ckey: 'note:acme', row: 'plain text' }) })
    await waitFor(() => { expect(result.current).to.have.lengthOf(2) })
  })

  it("shows a CryptoKey as the handle it is, and what JSON cannot write as String() has it", async () => {
    const leaseKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'])
    const shelf = fakeInspector([
      { ckey: 'lease:acme', row: { lease_key: leaseKey } },
      { ckey: 'gone:acme',   row: undefined },
    ])
    const { result } = renderHook(() => useIdbRows(shelf.inspector))
    await waitFor(() => { expect(result.current).to.have.lengthOf(2) })
    expect(result.current).to.deep.equal([
      { ckey: 'lease:acme', text: '{"lease_key":"«CryptoKey non-extractable handle»"}', flavor: 'keyhandle' },
      { ckey: 'gone:acme',   text: 'undefined',                                                  flavor: 'plain' },
    ])
  })

  it("stops listening once unmounted", async () => {
    const shelf = fakeInspector([])
    const { unmount } = renderHook(() => useIdbRows(shelf.inspector))
    await waitFor(() => { expect(shelf.listeners.size).to.eq(1) })
    unmount()
    expect(shelf.listeners.size).to.eq(0)
  })
})

describe("the wipe buttons", () => {
  it("WipeStoreButton erases every row of its store, once the user confirms", () => {
    const store = memoryStore()
    store.write('session:acme', '{}')
    store.write('account:acme', '{}')
    const confirming = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    render(<WipeStoreButton store={store} storeTitle="the fake auth accounts" />)
    fireEvent.click(screen.getByRole('button', { name: 'wipe' }))
    expect(confirming).toHaveBeenCalledWith('Wipe every row of the fake auth accounts?')
    expect(store.ckeys()).to.have.lengthOf(0)
  })

  it("WipeStoreButton leaves the store be when the user thinks better of it", () => {
    const store = memoryStore()
    store.write('session:acme', '{}')
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    render(<WipeStoreButton store={store} storeTitle="this device's session" />)
    fireEvent.click(screen.getByRole('button', { name: 'wipe' }))
    expect(store.ckeys()).to.deep.equal(['session:acme'])
  })

  it("WipeIdbButton wipes its shelf only once the user confirms", () => {
    const shelf = fakeInspector([])
    const confirming = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    render(<WipeIdbButton inspector={shelf.inspector} storeTitle="the pretend backend" />)
    fireEvent.click(screen.getByRole('button', { name: 'wipe' }))
    expect(shelf.wipe).to.not.have.been.called
    confirming.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'wipe' }))
    expect(shelf.wipe).to.have.callCount(1)
  })
})
