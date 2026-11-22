import { useActionState } from 'react'
import { sanitizeForeignError } from 'safebyok'
import { SubmitButton } from 'safebyok-react-lean/parts'
import { formTextOf } from '../lib/form-text'
import { type Session, signIn, signOut } from '../lib/session'

/** The sign-in form's next state: why the username will not do, or null, and the username to show again. */
type SignInResult = Readonly<{ err: Error | null, username: string }>

// React empties the form after its action: a refused username shows again, for the user to mend.
/** Sign in as the username typed, or say why it will not do. */
const signInAction = (_prior: SignInResult, form: FormData): SignInResult => {
  const username = formTextOf(form, 'username')
  try {
    signIn(username)
    return { err: null, username: '' }
  } catch (err) {
    return { err: sanitizeForeignError(err), username }
  }
}

/** Who is signed in, with Sign out; or, while nobody is, the fake sign-in form. */
export function SessionBar({ session }: Readonly<{ session: Session | null }>) {
  const [attempt, formAction] = useActionState(signInAction, { err: null, username: '' })
  if (session !== null) {
    return (
      <p className="row">
        Signed in as <strong>{session.username}</strong>
        <button type="button" onClick={signOut}>Sign out</button>
      </p>
    )
  }
  return (
    <form className="row" action={formAction}>
      <input name="username" defaultValue={attempt.username} aria-label="Username" placeholder="Username" autoComplete="username" required />
      <SubmitButton>Sign in</SubmitButton>
      {(attempt.err !== null) && <span role="alert" className="gripe">{attempt.err.message}</span>}
    </form>
  )
}
