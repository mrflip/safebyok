import { useSyncExternalStore } from 'react'
import type { OutageVaultDB } from '../lib/outage-vault-db'

/** A checkbox that takes the demo's backend offline, to show how the page behaves when it cannot reach the vaultDB. */
export const OutageSwitch = ({ vaultDB }: { vaultDB: OutageVaultDB }) => {
  const isOnline = useSyncExternalStore(vaultDB.subscribe, vaultDB.getSnapshot)
  return (
    <label className="outage-switch">
      <input type="checkbox" checked={isOnline} onChange={(evt) => { vaultDB.setOnline(evt.target.checked) }} />
      {' '}Backend online
    </label>
  )
}
