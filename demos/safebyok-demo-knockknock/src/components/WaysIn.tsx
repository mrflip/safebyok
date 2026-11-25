import { passkeyHeaderOf } from 'safebyok-react'
import { AddPasskeyForm, ReplacePassphraseForm, RevokePasskeyForm, passkeysAvailable } from 'safebyok-react/kit'
import { Knock } from '../lib/sok'

/** The ways into the vault: replace the passphrase, and add a passkey or remove the one there is. */
export function WaysIn({ username }: Readonly<{ username: string | undefined }>) {
  // Undefined until the gate is fetched, when neither form shows.
  const passkeyHeader = Knock.useGate({ select: passkeyHeaderOf }).data
  return (
    <section aria-labelledby="ways-in-title" className="card">
      <h2 id="ways-in-title">Ways in</h2>
      <h3>Passphrase</h3>
      <ReplacePassphraseForm username={username} />
      <h3>Passkey</h3>
      {! passkeysAvailable() && <p className="quiet">This browser cannot use passkeys.</p>}
      {passkeysAvailable() && (passkeyHeader === null) && (
        <AddPasskeyForm username={username} passkeyOpts={{ rp: { name: 'Knock-Knock Machine' }, user: { name: username ?? 'knock', displayName: username ?? 'knock' } }} />
      )}
      {passkeysAvailable() && (passkeyHeader !== null) && (passkeyHeader !== undefined) && <RevokePasskeyForm username={username} />}
    </section>
  )
}
