import { useSyncExternalStore } from 'react'
import type { OutageVaultDB } from '../lib/outage-vault-db'

/** A checkbox that takes the demo's backend offline, to see how the page meets a vaultDB it cannot reach. */
export const OutageSwitch = ({ vaultDB }: { vaultDB: OutageVaultDB }) => {
  const isOnline = useSyncExternalStore(vaultDB.subscribe, vaultDB.getSnapshot)
  return (
    <label className="outage-switch">
      <input type="checkbox" checked={isOnline} onChange={(evt) => { vaultDB.setOnline(evt.target.checked) }} />
      {' '}Backend online
    </label>
  )
}
