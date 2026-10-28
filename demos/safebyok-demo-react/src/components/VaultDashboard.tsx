import { useState } from 'react'
import { isVaultError } from 'safebyok'
import { useBank, useListedVault, useVault, useVaultSnapshot } from 'safebyok-react'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { asksAgain } from '../lib/asks-again'
import { editableWhisper, parseWhisperText, showWhisper } from '../lib/whisper-text'
import { PsstModal } from './PsstModal'
import type { BoxDamaged, BoxSparse, Sidecar, Whisper, VaultSnapshot } from 'safebyok'

/**
 * Direct manipulation of the vault's boxes: add, view, edit, remove, use. The lines that
 * matter are the one-liners inside each handler -- `vault.putBox(...)`, `vault.getWhisper(...)`,
 * `vault.useWhisper(...)`, `vault.delBox(...)`: a locked vault asks for the passphrase through the
 * provider's dialog and goes on, and a dialog dismissed is refused 'vault_locked', which the
 * handlers pass over. Everything else is table furniture.
 */

type FormState = { editing: string | null, boxlabelText: string, whisperText: string, noteText: string }
const blankForm: FormState = { editing: null, boxlabelText: '', whisperText: '', noteText: '' }

/**
 * The note this demo keeps in a box's sidecar, as `{ note }`: the vault never looks inside
 * the sidecar, so the app reads its own shape back out of it, and finds no note in any other.
 */
const noteOf = (sidecar: Sidecar): string => {
  const { note } = sidecar
  return typeof note === 'string' ? note : ''
}

export const VaultDashboard = () => {
  const bank = useBank()
  const bankVault = useListedVault('main')
  const vault = useVault('main')
  const snapshot = useVaultSnapshot('main')
  const [form, setForm] = useState<FormState | null>(null)
  const [shown, setShown] = useState<Record<string, Whisper>>({})
  const [psst, setPsst] = useState<{ boxlabel: string, whisper: Whisper } | null>(null)
  const [gripe, setGripe] = useState<string | null>(null)

  // Why the bank has no vault to hand down -- storage unreachable, signed out of the backend -- is
  // shown here, in place, with a way to ask again. (Misuse would have gone to an error boundary.)
  // A vault refused stays so until the app asks the bank for it again: the buttons below ask.
  // Each call names the vault by its label alone: the bank is this user's.
  if (bank !== null && bankVault?.lifecycle === 'refused') {
    const refusal = bankVault.err
    const choice = { vaultlabel: bankVault.vaultlabel }
    const askAgain = () => { void bank.tryEnsureVault(choice) }
    // A damaged record will not mend on retry, so it gets no Retry button: only a way to delete it
    // and start over, which asks first, as it takes every box in the vault with it.
    if (refusal.refusalkind === 'damaged_vault') {
      const startOver = async () => {
        if (! globalThis.confirm("Remove this vault and start over? Every box in it is lost for good.")) { return }
        setGripe(null)
        const deleted = await bank.tryDelDamagedVault(choice)
        if (! deleted.ok) { setGripe(deleted.err.message); return }
        askAgain()
      }
      return (
        <>
          <p className="gripe">{"Your vault's stored record is damaged, so it can't be opened. "}{refusal.message} <button onClick={() => { void startOver() }}>Remove and start over</button></p>
          {gripe !== null && <p className="gripe">{gripe}</p>}
        </>
      )
    }
    // A browser that will not let the app keep anything here holds to that until the user changes
    // it, so it gets no Retry button either: only what to change.
    if (refusal.refusalkind === 'storage_blocked') {
      return <p className="gripe">{"This browser won't let the app keep your vault on this device. "}{refusal.message}</p>
    }
    // Storage serving an older copy than this device has seen holds until it serves the newer one
    // again, or the user, sure the restore was meant, has this device accept the older copy.
    if (refusal.refusalkind === 'vault_behind') {
      const accept = async () => {
        if (! globalThis.confirm("Accept the older copy of this vault that storage holds now? Only do this if it was restored from a backup on purpose.")) { return }
        setGripe(null)
        const cleared = await bank.tryClearCachedVault(choice)
        if (! cleared.ok) { setGripe(cleared.err.message); return }
        askAgain()
      }
      return (
        <>
          <p className="gripe">{refusal.message} <button onClick={askAgain}>Retry</button> <button onClick={() => { void accept() }}>Accept this copy</button></p>
          {gripe !== null && <p className="gripe">{gripe}</p>}
        </>
      )
    }
    // A vault deleted -- here, or on another device -- stays gone until the user asks for a new one.
    if (refusal.refusalkind === 'vault_gone' || refusal.refusalkind === 'vault_remade') {
      return <p className="quiet">{"This vault was deleted. "}<button onClick={askAgain}>Start a new vault</button></p>
    }
    return (
      <p className="gripe">
        {"Can't reach your vault. "}{refusal.message} <button onClick={askAgain}>Retry</button>
      </p>
    )
  }
  // No Vault object until its birth has read storage: until then, the vault is opening.
  if (vault === null || snapshot === null) { return <p className="quiet">Opening vault…</p> }

  // A read the user dismissed the passphrase dialog for is refused vault_locked, and a box gone
  // meanwhile absent_box: nothing to show.
  const view = async (boxlabel: string) => {
    const read = await vault.tryGetWhisper(boxlabel)
    if (! read.ok) { return }
    const whisper = read.val
    setShown((prev) => ({ ...prev, [boxlabel]: whisper }))
  }

  const hide = (boxlabel: string) => {
    setShown(({ [boxlabel]: _gone, ...rest }) => rest)
  }

  const edit = async (boxlabel: string, noteText: string) => {
    const read = await vault.tryGetWhisper(boxlabel)
    if (read.ok) { setForm({ editing: boxlabel, boxlabelText: boxlabel, whisperText: editableWhisper(read.val), noteText }) }
  }

  const delBox = async (boxlabel: string) => {
    if (! globalThis.confirm(`Remove the box '${boxlabel}'?`)) { return }
    try {
      await vault.delBox(boxlabel)
    } catch (err) {
      // A dismissed dialog removes nothing; gone already -- from another device, or with the vault
      // the user deleted, its Vault object gone with it -- is what was asked for.
      if (isVaultError(err, 'vault_locked') || isVaultError(err, 'vault_gone')) { return }
      if (! isVaultError(err, 'absent_box')) { throw err }
    }
    hide(boxlabel)
  }

  const applyWhisper = async (boxlabel: string) => {
    try {
      await vault.useWhisper(boxlabel, (whisper) => { setPsst({ boxlabel, whisper }) })
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { throw err }
    }
  }

  const save = async () => {
    if (form === null) { return }
    setGripe(null)
    try {
      // The cast hands validation to the vault: typing "null" in the box parses to a bare
      // null, and the store's refusal lands in the gripe below. A blank note leaves the
      // sidecar out, so the box keeps the one it has.
      const note = form.noteText.trim()
      await vault.putBox({ boxlabel: form.boxlabelText.trim(), sidecar: note === '' ? undefined : { note } }, parseWhisperText(form.whisperText)!)
      setForm(null)
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { setGripe(err instanceof Error ? err.message : 'Could not store that.') }
    }
  }

  // A damaged box can't be read, used or edited -- only removed, or stored over afresh while it
  // names its revision: one damaged beyond naming putBox() refuses. One a newer safebyok wrote is
  // the app's to update, not the user's to remove.
  const damagedRow = (box: BoxDamaged) => (
    <tr key={box.boxlabel} className="damaged">
      <td><code>{box.boxlabel}</code></td>
      <td colSpan={3} className="gripe">{box.damage === 'newer_format' ? "written by a newer version of this app: update the app to read it" : "damaged: its stored record can't be read"}</td>
      <td className="row">
        {box.damage === 'damaged' && box.revision_tok !== null && <button className="mini" onClick={() => { setForm({ editing: box.boxlabel, boxlabelText: box.boxlabel, whisperText: '', noteText: '' }) }}>replace</button>}
        {box.damage === 'damaged' && <button className="mini danger" onClick={() => { void delBox(box.boxlabel) }}>remove</button>}
      </td>
    </tr>
  )

  const soundRow = (box: BoxSparse) => {
    const viewed = shown[box.boxlabel]
    return (
      <tr key={box.boxlabel}>
        <td><code>{box.boxlabel}</code></td>
        <td className="whisper-cell">
          {viewed === undefined
            ? <><span className="quiet">••••••••</span> <button className="mini" onClick={() => { void view(box.boxlabel) }}>view</button></>
            : <><code>{showWhisper(viewed)}</code> <button className="mini" onClick={() => { hide(box.boxlabel) }}>hide</button></>}
        </td>
        <td className="quiet">{noteOf(box.sidecar)}</td>
        <td className="quiet">{new Date(box.written_at).toLocaleString()}</td>
        <td className="row">
          <button className="mini" onClick={() => { void applyWhisper(box.boxlabel) }}>use</button>
          <button className="mini" onClick={() => { void edit(box.boxlabel, noteOf(box.sidecar)) }}>edit</button>
          <button className="mini danger" onClick={() => { void delBox(box.boxlabel) }}>remove</button>
        </td>
      </tr>
    )
  }

  return (
    <section className="vault-dashboard">
      <div className="row spread">
        <h2>Vault dashboard <span className="quiet">vault “{snapshot.vaultlabel}”</span></h2>
        <LockChip snapshot={snapshot} onLock={() => { void vault.lock() }} />
      </div>

      <p className="quiet">
        This vault lives only in this browser: another browser, or another device, signed in as you
        sees none of it, and clearing this site&apos;s data removes it.
      </p>

      {snapshot.boxes.length === 0 && snapshot.damagedBoxes.length === 0 && <p className="quiet">No boxes yet. Whispers you add live encrypted in the database (watch the inspector below) and open only on your device.</p>}

      {(snapshot.boxes.length > 0 || snapshot.damagedBoxes.length > 0) && (
        <table>
          <thead>
            <tr><th>label</th><th>whisper</th><th>note</th><th>written</th><th></th></tr>
          </thead>
          <tbody>
            {[...snapshot.boxes, ...snapshot.damagedBoxes].toSorted(byBoxlabel).map((box) => ('damage' in box ? damagedRow(box) : soundRow(box)))}
          </tbody>
        </table>
      )}

      {form === null
        ? <button onClick={() => { setForm(blankForm) }}>Add a box</button>
        : (
          <div className="box-form">
            <h3>{form.editing === null ? 'New box' : `Edit ${form.editing}`}</h3>
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
              note <span className="quiet">(not encrypted: visible without the passphrase; left blank, the note is kept)</span>
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

/** The vault's lock, as its snapshot shows it: no gate yet, a gate and no lease on this device, or unlocked until `ask_passphrase_at`. */
const LockChip = ({ snapshot, onLock }: { snapshot: VaultSnapshot, onLock: () => void }) => {
  if (snapshot.gate === null) { return <span className="chip">no vault yet</span> }
  if (snapshot.ask_passphrase_at === null) { return <span className="chip locked">🔒 locked</span> }
  return (
    <span className="row">
      <span className="chip unlocked">🔓 unlocked{asksAgain(snapshot.ask_passphrase_at)}</span>
      <button className="mini" onClick={onLock}>lock now</button>
    </span>
  )
}

/** Boxes, sound and damaged alike, in boxlabel order, as the vault lists each kind: by code unit. */
const byBoxlabel = (one: { boxlabel: string }, two: { boxlabel: string }): number => {
  if (one.boxlabel === two.boxlabel) { return 0 }
  return one.boxlabel < two.boxlabel ? -1 : 1
}
