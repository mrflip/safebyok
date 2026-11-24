import { useState } from 'react'
import { formTextOf } from '../lib/form-text'
import { type Session, signin, signOut } from '../lib/session'

/** Who is signed in, with Sign out; or, while nobody is, the fake sign-in form. */
export function SessionBar({ session }: Readonly<{ session: Session | null }>) {
  const [gripe, setGripe] = useState<string | null>(null)
  if (session !== null) {
    return (
      <p className="row">
        Signed in as <strong>{session.username}</strong>
        <button type="button" onClick={signOut}>Sign out</button>
      </p>
    )
  }
  /** Sign in as the username typed, or say why it will not do. */
  const action = (form: FormData): void => {
    try {
      signin(formTextOf(form, 'username'))
    } catch (err) {
      setGripe((err as Error).message)
    }
  }
  return (
    <form className="row" action={action}>
      <input name="username" aria-label="Username" placeholder="Username" autoComplete="username" required />
      <button type="submit">Sign in</button>
      {(gripe !== null) && <span role="alert" className="gripe">{gripe}</span>}
    </form>
  )
}
