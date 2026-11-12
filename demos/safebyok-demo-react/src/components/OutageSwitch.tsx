import { useSyncExternalStore } from 'react'
import type { OutageBankDB } from '../lib/outage-bank-db'

/** A checkbox that takes the demo's backend offline, to show how the page behaves when it cannot reach the bankDB. */
export const OutageSwitch = ({ bankDB }: { bankDB: OutageBankDB }) => {
  const isOnline = useSyncExternalStore(bankDB.subscribe, bankDB.getSnapshot)
  return (
    <label className="outage-switch">
      <input type="checkbox" checked={isOnline} onChange={(evt) => { bankDB.setOnline(evt.target.checked) }} />
      {' '}Backend online
    </label>
  )
}
