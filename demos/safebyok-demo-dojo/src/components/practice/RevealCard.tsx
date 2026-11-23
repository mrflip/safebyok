import { useState } from 'react'
import { PassphraseInput, WhisperInput } from 'safebyok-react-lean/parts'
import { Example, PracticeCard } from './PracticeCard'

/** Turn off a browser's typing helpers on a field that can be revealed: a hand-made Show button beside the library's parts, which do it already. */
export function RevealCard() {
  return (
    <PracticeCard
      title="Turn spell-check, auto-correct and auto-capitalize off on a field that can be revealed"
      why={<>
        <p>A field switched to <code>type=&quot;text&quot;</code> is no longer a password field to the browser: its spell-checker may read the text, and some send it to a server to check; a phone&apos;s keyboard may learn it, suggest it later, or capitalize and correct a key into something else.</p>
        <p>The library&apos;s <code>WhisperInput</code> and <code>PassphraseInput</code> already set <code>spellcheck=&quot;false&quot;</code>, <code>autocorrect=&quot;off&quot;</code> and <code>autocapitalize=&quot;none&quot;</code>, hidden or shown, and hide the field again while a form Action&apos;s submit is pending. In a form that submits from <code>onSubmit</code>, only <code>PassphraseInput</code> does, handed <code>isPending</code>. A field of your own with a Show button needs all three.</p>
      </>}
    >
      <Example isWrongWay caption="a hand-made Show button, and nothing else"><HandRevealField /></Example>
      <Example caption="the library's parts">
        <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" />
        <PassphraseInput name="passphrase" aria-label="Passphrase" placeholder="Passphrase" />
      </Example>
    </PracticeCard>
  )
}

/** The wrong way: an input whose Show button only switches its type. */
function HandRevealField() {
  const [isRevealed, setIsRevealed] = useState(false)
  return (
    <span className="row">
      <input name="apiKey" aria-label="Hand-made API key" placeholder="API key" type={isRevealed ? 'text' : 'password'} />
      <button type="button" aria-pressed={isRevealed} onClick={() => { setIsRevealed((prior) => ! prior) }}>{isRevealed ? 'Hide' : 'Show'}</button>
    </span>
  )
}
