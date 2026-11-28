import { useMutation } from '@tanstack/react-query'
import { useActionState } from 'react'
import type { Whisper } from 'safebyok'
import { mask } from 'safebyok-react'
import { SubmitButton, WhisperInput, WhisperMask, WhisperText } from 'safebyok-react/parts'
import { formTextOf } from '../lib/form-text'
import { KeyLabelpath, Knock } from '../lib/sok'

// Made once, at module scope, as useActionState wants: it empties the form before it writes.
const saveKeyAction = Knock.putBoxAction(KeyLabelpath, {
  whisperOf: (form): Whisper => {
    const apiKey = formTextOf(form, 'apiKey')
    if (apiKey === '') { throw new Error('Paste your Anthropic API key first.') }
    return { apiKey }
  },
  // The sidecar is stored readable, so its mask shows no character of the key's tail.
  sidecarOf: (whisper) => ({ mask: mask(String(whisper['apiKey']), { tail: 0 }) }),
})

/** The saved key: its mask, Show, and, while unlocked, the editor and Delete. */
export function KeyPanel() {
  const isLocked = Knock.useBank((snap) => snap.isLocked)
  const { data: box } = Knock.useBox(KeyLabelpath)
  return (
    <section aria-labelledby="key-title" className="card">
      <h2 id="key-title">Your Anthropic API key</h2>
      {(box === undefined) && <p className="quiet">Looking for your key…</p>}
      {(box === null) && <p className="quiet">No key saved yet.</p>}
      {(box !== null) && (box !== undefined) && (
        <p className="row">
          Saved key: <WhisperText labelpath={KeyLabelpath} field="apiKey" masked={<WhisperMask labelpath={KeyLabelpath} field="apiKey" tail={4} />} />
          {! isLocked && <DeleteKeyButton />}
        </p>
      )}
      {! isLocked && <KeyEditor isReplacing={(box !== null) && (box !== undefined)} />}
    </section>
  )
}

/** The form that saves a new key, or replaces the saved one. */
function KeyEditor({ isReplacing }: Readonly<{ isReplacing: boolean }>) {
  const [saved, saveAction] = useActionState(saveKeyAction, null)
  return (
    <form className="row" action={saveAction}>
      <WhisperInput name="apiKey" aria-label="Anthropic API key" placeholder="sk-ant-…" required />
      <SubmitButton whilePending="Saving…">{isReplacing ? 'Replace key' : 'Save key'}</SubmitButton>
      {(saved?.err !== undefined) && (saved.err !== null) && <span role="alert" className="gripe">{saved.err.message}</span>}
    </form>
  )
}

/** Delete the saved key. */
function DeleteKeyButton() {
  const del = useMutation({ mutationFn: () => Knock.delBoxOnce(KeyLabelpath) })
  return (
    <>
      <button type="button" disabled={del.isPending} onClick={() => { del.mutate() }}>Delete</button>
      {(del.error !== null) && <span role="alert" className="gripe">{del.error.message}</span>}
    </>
  )
}
