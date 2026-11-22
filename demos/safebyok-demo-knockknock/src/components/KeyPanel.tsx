import { useMutation } from '@tanstack/react-query'
import { mask } from 'safebyok-react-lean'
import { SubmitButton, WhisperInput, WhisperMask, WhisperText } from 'safebyok-react-lean/parts'
import { useIsKeyStored } from '../hooks/useIsKeyStored'
import { formTextOf } from '../lib/form-text'
import { KeyLabelpath, Knock } from '../lib/sok'

/** The stored key: its mask, Show, and, while unlocked, the editor and Delete. */
export function KeyPanel() {
  const isLocked = Knock.useBank((bank) => bank.isLocked)
  const isKeyStored = useIsKeyStored()
  return (
    <section aria-labelledby="key-title" className="card">
      <h2 id="key-title">Your Anthropic API key</h2>
      {(isKeyStored === undefined) && <p className="quiet">Looking for your key…</p>}
      {(isKeyStored === false) && <p className="quiet">No key saved yet.</p>}
      {(isKeyStored === true) && (
        <p className="row">
          Saved key: <WhisperText labelpath={KeyLabelpath} field="apiKey" masked={<WhisperMask labelpath={KeyLabelpath} field="apiKey" tail={4} />} />
          {! isLocked && <DeleteKeyButton />}
        </p>
      )}
      {! isLocked && <KeyEditor isReplacing={isKeyStored === true} />}
    </section>
  )
}

/** The form that puts a new key, or replaces the stored one. */
function KeyEditor({ isReplacing }: Readonly<{ isReplacing: boolean }>) {
  const putKey = useMutation(Knock.putBoxMutationOptions(KeyLabelpath, {
    whisperOf: (form) => {
      const apiKey = formTextOf(form, 'apiKey')
      if (apiKey === '') { throw new Error('Paste your Anthropic API key first.') }
      return { apiKey }
    },
    // The sidecar is stored readable, so its mask shows no character of the key's tail.
    sidecarOf: (whisper) => ({ mask: mask(String(whisper['apiKey']), { tail: 0 }) }),
  }))
  return (
    <form className="row" action={(form) => { putKey.mutate(form) }}>
      <WhisperInput name="apiKey" aria-label="Anthropic API key" placeholder="sk-ant-…" required />
      <SubmitButton isPending={putKey.isPending} whilePending="Saving…">{isReplacing ? 'Replace key' : 'Save key'}</SubmitButton>
      {(putKey.error !== null) && <span role="alert" className="gripe">{putKey.error.message}</span>}
    </form>
  )
}

/** Delete the stored key. */
function DeleteKeyButton() {
  const del = useMutation({ mutationFn: () => Knock.delBoxOnce(KeyLabelpath) })
  return (
    <>
      <button type="button" disabled={del.isPending} onClick={() => { del.mutate() }}>Delete</button>
      {(del.error !== null) && <span role="alert" className="gripe">{del.error.message}</span>}
    </>
  )
}
