import type { Draft } from 'safebyok-react-lean'

// The one place the row shows its value masked, so the way it is masked can change here alone.
/** The input of an env's value: masked as the stored mask until focused, when the draft shows the value itself. */
export function ValInput({ draft, mask, label }: Readonly<{ draft: Draft, mask: string, label: string }>) {
  const field = draft.whisperField('val')
  return <input {...field} aria-label={label} placeholder={(field.placeholder === undefined) ? undefined : (mask || field.placeholder)} />
}
