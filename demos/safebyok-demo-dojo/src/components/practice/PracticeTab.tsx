import { DebounceCard } from './DebounceCard'
import { DoubleSubmitCard } from './DoubleSubmitCard'
import { NewPassphraseCard } from './NewPassphraseCard'
import { PasswordManagerCard } from './PasswordManagerCard'
import { PasteCard } from './PasteCard'
import { PostMethodCard } from './PostMethodCard'
import { RefusalCard } from './RefusalCard'
import { RevealCard } from './RevealCard'
import { TestKeyCard } from './TestKeyCard'
import { ValidateCard } from './ValidateCard'

/** The craft around a form with a secret in it: a card for each thing a careful form does, with a working example to copy, and the thing not to do beside it where there is one. */
export function PracticeTab({ userid }: Readonly<{ userid: string | null }>) {
  return (
    <section aria-labelledby="practice-title" className="card">
      <h2 id="practice-title">Practice: the craft around a secret&apos;s form</h2>
      <p className="quiet">
        Each card says what to do and why, with a working example. In none of the examples to do is a secret in React state, a query&apos;s data or a mutation&apos;s variables.
        The cards that save write boxes of their own (<code>practice_…</code>): sign in as Hero or Thierry, and unlock.
      </p>
      <ValidateCard />
      <DoubleSubmitCard />
      <DebounceCard />
      <PasswordManagerCard userid={userid} />
      <NewPassphraseCard />
      <RevealCard />
      <PasteCard />
      <RefusalCard userid={userid} />
      <TestKeyCard />
      <PostMethodCard />
    </section>
  )
}
