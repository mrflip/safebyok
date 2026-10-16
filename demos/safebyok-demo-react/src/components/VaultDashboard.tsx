import { useState } from 'react'
import { useVault, useVaultSnapshot } from 'safebyok-react'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { asksAgain } from '../lib/asks-again'
import { editableWhisper, parseWhisperText, showWhisper } from '../lib/whisper-text'
import { PsstModal } from './PsstModal'
import type { PublicBag, Whisper } from 'safebyok'

/**
 * Direct manipulation of the vault's lockboxes: add, view, edit, delete, use. The lines that
 * matter are the one-liners inside each handler -- `vault.store(...)`, `vault.read(...)`,
 * `vault.use(...)`, `vault.erase(...)`, each wrapped in `withUnlockedVault()` so a locked vault
 * summons the passphrase dialog and retries. Everything else is table furniture.
 */

type FormState = { editing: string | null, boxlabelText: string, whisperText: string, noteText: string }
const blankForm: FormState = { editing: null, boxlabelText: '', whisperText: '', noteText: '' }

/**
 * The note this demo keeps in a lockbox's public bag, as `{ note }`: the vault never looks inside
 * the bag, so the app reads its own shape back out of it, and finds no note in any other.
 */
const noteOf = (bag: PublicBag): string => {
  if (typeof bag !== 'object' || bag === null || Array.isArray(bag)) { return '' }
  const { note } = bag
  return typeof note === 'string' ? note : ''
}

export const VaultDashboard = () => {
  const { vault, openError, retryOpen, eraseDamagedVault, withUnlockedVault } = useVault()
  const snapshot = useVaultSnapshot()
  const [form, setForm] = useState<FormState | null>(null)
  const [shown, setShown] = useState<Record<string, Whisper>>({})
  const [psst, setPsst] = useState<{ boxlabel: string, whisper: Whisper } | null>(null)
  const [gripe, setGripe] = useState<string | null>(null)

  // A condition that stopped the vault opening -- storage unreachable, signed out of the
  // backend -- is shown here, in place, with a way to try again. (Misuse would have gone to an
  // error boundary instead.)
  // A damaged record will not mend on retry, so it gets no Retry button: only a way to erase it
  // and start over, which asks first, as it takes every lockbox in the vault with it.
  if (openError?.kind === 'damaged_bundle') {
    const startOver = async () => {
      if (! globalThis.confirm("Erase this vault and start over? Every lockbox in it is lost for good.")) { return }
      setGripe(null)
      try {
        await eraseDamagedVault()
      } catch (err) {
        setGripe(err instanceof Error ? err.message : 'Could not erase the vault.')
      }
    }
    return (
      <>
        <p className="gripe">{"Your vault's stored record is damaged, so it can't be opened. "}{openError.message} <button onClick={() => { void startOver() }}>Erase and start over</button></p>
        {gripe !== null && <p className="gripe">{gripe}</p>}
      </>
    )
  }
  if (openError !== null) {
    return (
      <p className="gripe">
        {"Can't reach your vault. "}{openError.message} <button onClick={retryOpen}>Retry</button>
      </p>
    )
  }
  if (vault === null) { return <p className="quiet">Opening vault…</p> }

  // A whisper is never null (the vault refuses a bare one), so null from withUnlockedVault can
  // only mean the user dismissed the passphrase dialog: the read needs no wrapping.
  const view = async (boxlabel: string) => {
    const whisper = await withUnlockedVault(() => vault.read(boxlabel))
    if (whisper !== null) { setShown((prev) => ({ ...prev, [boxlabel]: whisper })) }
  }

  const hide = (boxlabel: string) => {
    setShown(({ [boxlabel]: _gone, ...rest }) => rest)
  }

  const edit = async (boxlabel: string, noteText: string) => {
    const whisper = await withUnlockedVault(() => vault.read(boxlabel))
    if (whisper !== null) { setForm({ editing: boxlabel, boxlabelText: boxlabel, whisperText: editableWhisper(whisper), noteText }) }
  }

  const erase = async (boxlabel: string) => {
    if (! globalThis.confirm(`Delete the lockbox '${boxlabel}'?`)) { return }
    await withUnlockedVault(() => vault.erase(boxlabel))
    hide(boxlabel)
  }

  const applyWhisper = (boxlabel: string) => withUnlockedVault(() => vault.use(boxlabel, (whisper) => { setPsst({ boxlabel, whisper }) }))

  const save = async () => {
    if (form === null) { return }
    setGripe(null)
    try {
      const saved = await withUnlockedVault(async () => {
        // The cast hands validation to the vault: typing "null" in the box parses to a bare
        // null, and the store's refusal lands in the gripe below. A blank note leaves the public
        // bag out, so the lockbox keeps the one it has.
        const note = form.noteText.trim()
        await vault.store(form.boxlabelText.trim(), parseWhisperText(form.whisperText)!, note === '' ? {} : { public: { note } })
        return true
      })
      if (saved !== null) { setForm(null) }
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not store that.')
    }
  }

  return (
    <section className="vault-dashboard">
      <div className="row spread">
        <h2>Vault dashboard <span className="quiet">vault “{snapshot.scope.vaultlabel}”</span></h2>
        <LockChip state={snapshot.state} askPassphraseAt={snapshot.askPassphraseAt} onLock={() => { void vault.lock() }} />
      </div>

      <p className="quiet">
        This vault lives only in this browser: another browser, or another device, signed in as you
        sees none of it, and clearing this site&apos;s data erases it.
      </p>

      {snapshot.boxes.length === 0 && <p className="quiet">No lockboxes yet. Whispers you add live encrypted in the database (watch the inspector below) and open only on your device.</p>}

      {snapshot.boxes.length > 0 && (
        <table>
          <thead>
            <tr><th>label</th><th>whisper</th><th>note</th><th>changed</th><th></th></tr>
          </thead>
          <tbody>
            {snapshot.boxes.map((box) => {
              // A damaged lockbox can't be read, used or edited -- only deleted, or stored over afresh.
              if (box.damaged) {
                return (
                  <tr key={box.boxlabel} className="damaged">
                    <td><code>{box.boxlabel}</code></td>
                    <td colSpan={3} className="gripe">{"damaged: its stored record can't be read"}</td>
                    <td className="row">
                      <button className="mini" onClick={() => { setForm({ editing: box.boxlabel, boxlabelText: box.boxlabel, whisperText: '', noteText: '' }) }}>replace</button>
                      <button className="mini danger" onClick={() => { void erase(box.boxlabel) }}>delete</button>
                    </td>
                  </tr>
                )
              }
              const viewed = shown[box.boxlabel]
              return (
                <tr key={box.boxlabel}>
                  <td><code>{box.boxlabel}</code></td>
                  <td className="whisper-cell">
                    {viewed === undefined
                      ? <><span className="quiet">••••••••</span> <button className="mini" onClick={() => { void view(box.boxlabel) }}>view</button></>
                      : <><code>{showWhisper(viewed)}</code> <button className="mini" onClick={() => { hide(box.boxlabel) }}>hide</button></>}
                  </td>
                  <td className="quiet">{noteOf(box.public)}</td>
                  <td className="quiet">{new Date(box.changed_at).toLocaleString()}</td>
                  <td className="row">
                    <button className="mini" onClick={() => { void applyWhisper(box.boxlabel) }}>use</button>
                    <button className="mini" onClick={() => { void edit(box.boxlabel, noteOf(box.public)) }}>edit</button>
                    <button className="mini danger" onClick={() => { void erase(box.boxlabel) }}>delete</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {form === null
        ? <button onClick={() => { setForm(blankForm) }}>Add a lockbox</button>
        : (
          <div className="lockbox-form">
            <h3>{form.editing === null ? 'New lockbox' : `Edit ${form.editing}`}</h3>
            <label>
              label
              <input
                placeholder="anthropic_api_key"
                value={form.boxlabelText}
                disabled={form.editing !== null}
                onChange={(evt) => { setForm({ ...form, boxlabelText: evt.target.value }) }}
              />
            </label>
            <label>
              whisper <span className="quiet">(valid JSON keeps its type; anything else is stored as a string)</span>
              <textarea
                name="whisper_text"
                {...WhisperFieldAttributes}
                placeholder="sk-ant-..."
                value={form.whisperText}
                onChange={(evt) => { setForm({ ...form, whisperText: evt.target.value }) }}
              />
            </label>
            <label>
              note <span className="quiet">(public: visible without the passphrase; left blank, the note stands)</span>
              <input
                placeholder="personal account"
                value={form.noteText}
                onChange={(evt) => { setForm({ ...form, noteText: evt.target.value }) }}
              />
            </label>
            {gripe !== null && <p className="gripe">{gripe}</p>}
            <div className="row">
              <button onClick={() => { void save() }}>Save</button>
              <button onClick={() => { setForm(null); setGripe(null) }}>Cancel</button>
            </div>
          </div>
        )}

      {psst !== null && <PsstModal boxlabel={psst.boxlabel} whisperShown={showWhisper(psst.whisper)} onClose={() => { setPsst(null) }} />}
    </section>
  )
}

const LockChip = ({ state, askPassphraseAt, onLock }: { state: string, askPassphraseAt: number | null, onLock: () => void }) => {
  if (state === 'unlocked') {
    return (
      <span className="row">
        <span className="chip unlocked">🔓 unlocked{asksAgain(askPassphraseAt)}</span>
        <button className="mini" onClick={onLock}>lock now</button>
      </span>
    )
  }
  if (state === 'locked') { return <span className="chip locked">🔒 locked</span> }
  if (state === 'absent') { return <span className="chip">no vault yet</span> }
  return <span className="chip">…</span>
}
