import { useMutation } from '@tanstack/react-query'
import { formTextOf } from '../lib/form-text'
import { type Session, signIn, signOut } from '../lib/session'

/** Who is signed in, with Sign out; or, while nobody is, the fake sign-in form. */
export function SessionBar({ session }: Readonly<{ session: Session | null }>) {
  // The demo's sign-in answers at once, where a real one would await its server.
  const signingIn = useMutation({ mutationFn: (username: string) => { signIn(username); return Promise.resolve() } })
  if (session !== null) {
    return (
      <p className="row">
        Signed in as <strong>{session.username}</strong>
        <button type="button" onClick={signOut}>Sign out</button>
      </p>
    )
  }
  return (
    <form className="row" action={(form) => { signingIn.mutate(formTextOf(form, 'username')) }}>
      <input name="username" aria-label="Username" placeholder="Username" autoComplete="username" required />
      <button type="submit">Sign in</button>
      {(signingIn.error !== null) && <span role="alert" className="gripe">{signingIn.error.message}</span>}
    </form>
  )
}
