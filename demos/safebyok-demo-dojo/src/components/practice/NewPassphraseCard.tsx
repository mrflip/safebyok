import { useNewPassphrase } from 'safebyok-react-lean/kit'
import { PassphraseInput } from 'safebyok-react-lean/parts'
import { SOK } from '../../lib/dojo'
import { Example, PracticeCard } from './PracticeCard'

/** Judge a new passphrase as it is typed, and compare its confirmation, keeping verdicts in state and neither text: the kit's `useNewPassphrase`. */
export function NewPassphraseCard() {
  const newPassphrase = useNewPassphrase(SOK)
  return (
    <PracticeCard
      title="Show a new passphrase's strength as it is typed, and compare its confirmation"
      why={<>
        <p>React keeps the verdicts, never the text: the strength meter&apos;s verdict and whether the two fields match are in state, and each field&apos;s text stays in its input, read through a ref on each change. Only the latest verdict lands, so a slow check of an earlier keystroke never overwrites a newer one. <code>useNewPassphrase</code> does both, over the giver&apos;s <code>useStrengthVerdict</code>; a single field uses that hook alone.</p>
        <p>Each line is a <code>role=&quot;status&quot;</code> that its field is described by. The library judges a passphrase as typed, spaces and all: it never trims one, so <code>&quot;a b &quot;</code> and <code>&quot;a b&quot;</code> are two passphrases, and one of only spaces is judged weak.</p>
      </>}
    >
      <Example caption="useNewPassphrase over two PassphraseInputs">
        <form aria-label="Choose a passphrase" method="post" onSubmit={(event) => { event.preventDefault() }} onReset={newPassphrase.forget}>
          <PassphraseInput {...newPassphrase.field} name="nextPassphrase" />
          <p role="status" id={newPassphrase.verdictId}>{newPassphrase.verdictText}</p>
          <PassphraseInput {...newPassphrase.confirmField} name="confirmation" />
          <p role="status" id={newPassphrase.matchId}>{newPassphrase.matchText}</p>
          <p aria-label="Ready">{newPassphrase.isReady ? 'Ready: a real form enables its submit now.' : 'Not ready: a real form keeps its submit disabled.'}</p>
          <button type="reset">Clear</button>
        </form>
      </Example>
    </PracticeCard>
  )
}
