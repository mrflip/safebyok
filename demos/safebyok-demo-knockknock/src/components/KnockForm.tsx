import { useMutation } from '@tanstack/react-query'
import { isVaultError } from 'safebyok'
import { SubmitButton } from 'safebyok-react-lean/parts'
import { gripeForJokeErr, tellKnockKnockJoke } from '../lib/anthropic'
import { useIsKeyStored } from '../hooks/useIsKeyStored'
import { formTextOf } from '../lib/form-text'
import { KeyLabelpath, Knock } from '../lib/sok'

/** Who's there? The user types it, and Claude finishes the joke with the stored key. On a locked vault, the unlock dialog asks first. */
export function KnockForm() {
  const isKeyStored = useIsKeyStored() === true
  // The key stays inside withWhisper's callback: the mutation's variable is only who's there.
  const knock = useMutation({
    mutationFn: (whosThere: string) => Knock.withWhisper(KeyLabelpath, ({ apiKey }) => tellKnockKnockJoke(String(apiKey), whosThere)),
  })
  return (
    <section aria-labelledby="knock-title" className="card">
      <h2 id="knock-title">Knock, knock!</h2>
      <form className="row" action={(form) => { knock.mutate(formTextOf(form, 'whosThere')) }}>
        <input name="whosThere" aria-label="Who's there?" placeholder="Who's there?" required disabled={! isKeyStored} />
        <SubmitButton isPending={knock.isPending} whilePending="Knocking…" disabled={! isKeyStored}>Knock</SubmitButton>
      </form>
      {! isKeyStored && <p className="quiet">Save your Anthropic API key below, then knock.</p>}
      {(knock.data !== undefined) && <output aria-label="Joke" className="joke">{knock.data}</output>}
      {(knock.error !== null) && ! isVaultError(knock.error, 'dismissed') && <p role="alert" className="gripe">{gripeOf(knock.error)}</p>}
    </section>
  )
}

/** What the page says when a knock fails: the vault's refusal as it puts it, or the joke's failure in words that say what to do. */
function gripeOf(err: Error): string {
  return isVaultError(err) ? err.message : gripeForJokeErr(err)
}
