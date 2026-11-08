import { useId, useRef, useState } from 'react'
import type { BoxPutOpts, BoxSnapshot, Whisper } from 'safebyok'
import { WhisperField } from '../components/whisper-field'
import { Messages } from '../helpers/messages'
import { useBankSnapshot, useBox, useBoxes, useBoxSnapshot, useBoxExposure, useVault, useVaultSnapshot, useWhisper } from '../hooks/hooks'
import { useRevealToggle } from '../hooks/reveal-toggle'
import type { DevBoxInspectorProps } from '../shapes'
import { LastCallLine, isLabel, jsonOf, useLastCall } from './last-call'

/** A vaultlabel and a boxlabel to pick, and a button for each verb the shared Box and its Vault offer. */
export const DevBoxInspector = ({ defaultVaultlabel = 'main', defaultBoxlabel = '' }: DevBoxInspectorProps) => {
  const [vaultlabel, setVaultlabel] = useState(defaultVaultlabel)
  const [boxlabel, setBoxlabel] = useState(defaultBoxlabel)
  const ownId = useId()
  const isPicked = isLabel(vaultlabel) && isLabel(boxlabel)
  return (
    <section className="dev-inspector dev-box-inspector" aria-label="Box inspector">
      <h3>Box</h3>
      <div className="row">
        <label>
          vaultlabel{' '}
          <input value={vaultlabel} list={`${ownId}-vaults`} spellCheck={false} onChange={(evt) => { setVaultlabel(evt.target.value) }} />
        </label>
        <VaultlabelOptions listId={`${ownId}-vaults`} />
        <label>
          boxlabel{' '}
          <input value={boxlabel} list={`${ownId}-boxes`} spellCheck={false} onChange={(evt) => { setBoxlabel(evt.target.value) }} />
        </label>
        {isLabel(vaultlabel) && <BoxlabelOptions listId={`${ownId}-boxes`} vaultlabel={vaultlabel} />}
      </div>
      {isPicked
        ? <BoxVerbs key={`${vaultlabel}/${boxlabel}`} vaultlabel={vaultlabel} boxlabel={boxlabel} />
        : <p className="quiet">Name a vault and a box: lowercase letters, digits and single underbars, from a letter to a letter or digit, 2 to 40 long.</p>}
    </section>
  )
}

// == [Pickers]: VaultlabelOptions, BoxlabelOptions

/** The vaultlabels the bank lists, as a datalist's options. */
const VaultlabelOptions = ({ listId }: { listId: string }) => {
  const vaults = useBankSnapshot()?.vaults ?? []
  return <datalist id={listId}>{vaults.map(({ vaultlabel }) => <option key={vaultlabel} value={vaultlabel} />)}</datalist>
}

/** The boxlabels the vault under `vaultlabel` lists, as a datalist's options. */
const BoxlabelOptions = ({ listId, vaultlabel }: { listId: string, vaultlabel: string }) => {
  const boxes = useBoxes(vaultlabel) ?? []
  return <datalist id={listId}>{boxes.map(({ boxlabel }) => <option key={boxlabel} value={boxlabel} />)}</datalist>
}
// --

// == [Verbs]: BoxVerbs, boxWordsOf, WhisperShown

/** The buttons for the box under `boxlabel` in the vault under `vaultlabel`, with what each last answered. */
const BoxVerbs = ({ vaultlabel, boxlabel }: { vaultlabel: string, boxlabel: string }) => {
  const { stage, vault } = useVault(vaultlabel)
  const vaultSnapshot = useVaultSnapshot(vaultlabel)
  const box = useBox(vaultlabel, boxlabel)
  const boxSnapshot = useBoxSnapshot(box)
  const whisper = useWhisper(box)
  const exposure = useBoxExposure(box)
  const isShowing = (exposure === 'showing')
  const { lastCall, call } = useLastCall()
  const [fieldname, setFieldname] = useState('apiKey')
  // Kept off React's state, so the text typed never sits in a render.
  const whisperText = useRef('')
  const [extracted, setExtracted] = useState<Whisper | null>(null)
  // An extracted whisper is dropped when the vault locks, by React's adjusting of state to a prop, in render.
  const isLocked = vaultSnapshot?.isLocked ?? true
  if ((extracted !== null) && isLocked) { setExtracted(null) }

  /** Call `putBox` with `whisper` under the boxlabel picked and `opts`, and answer the box's snapshot. */
  const putting = async (whisper: Whisper, opts: BoxPutOpts = {}) => {
    const put = await vault?.putBox({ boxlabel, whisper }, opts)
    return jsonOf(put?.snapshot)
  }
  /** Call `delBox` for the boxlabel picked, and answer the snapshot of the box deleted, or null for none. */
  const deleting = async () => {
    const gone = await vault?.delBox(boxlabel)
    return jsonOf(gone?.snapshot ?? null)
  }
  return (
    <div className="dev-box-verbs">
      <p className="dev-status" data-testid="dev-box-status">
        {`vault ${stage}, ${isLocked ? 'locked' : 'unlocked'}; box ${boxWordsOf(boxSnapshot)}; ${isShowing ? 'showing' : 'not showing'}`}
      </p>
      <div className="row">
        <button type="button" disabled={vault === null} onClick={() => { void call('ensureUnlocked', async () => { await vault?.ensureUnlocked(); return 'unlocked' }) }}>ensureUnlocked</button>
        <button type="button" disabled={vault === null} onClick={() => { void call('lock', () => { vault?.lock(); return 'locked' }) }}>lock</button>
        <button type="button" disabled={vault === null} onClick={() => { void call('putBox', () => putting({}, { ifPresent: 'get', ifAbsent: 'add' })) }}>putBox (empty)</button>
        <button type="button" disabled={vault === null} onClick={() => { void call('delBox', deleting) }}>delBox</button>
      </div>
      <div className="row">
        <button type="button" disabled={box === null} onClick={() => { void call('expose', async () => { await box?.expose(); return 'exposed' }) }}>expose</button>
        <button type="button" disabled={box === null} onClick={() => { void call('unexpose', () => { box?.unexpose(); return 'unexposed' }) }}>unexpose</button>
        <button type="button" disabled={box === null} onClick={() => { void call('veil', () => { box?.veil(); return 'veiled' }) }}>veil</button>
        <button type="button" disabled={box === null} onClick={() => { void call('unveil', () => { box?.unveil(); return 'unveiled' }) }}>unveil</button>
        <button
          type="button"
          disabled={box === null}
          onClick={() => {
            void call('extractWhisper', async () => {
              if (box !== null) { setExtracted(await box.extractWhisper()) }
              return 'extracted: Show it below'
            })
          }}
        >extractWhisper</button>
      </div>
      <div className="row">
        <label>
          fieldname{' '}
          <input value={fieldname} spellCheck={false} onChange={(evt) => { setFieldname(evt.target.value) }} />
        </label>
        <WhisperField aria-label="Whisper text" onChange={(text) => { whisperText.current = text }} />
        <button
          type="button"
          disabled={vault === null}
          onClick={() => { void call('putBox', () => putting({ [fieldname]: whisperText.current })) }}
        >putBox (typed)</button>
      </div>
      <WhisperShown caption="box.whisper" whisper={isShowing ? whisper : null} hiddenWord={exposure} />
      <WhisperShown caption="extracted" whisper={extracted} hiddenWord="none extracted" />
      <LastCallLine lastCall={lastCall} />
    </div>
  )
}

/** What the status line says of a box: its revision, whether exposed and veiled, or that none is listed. */
const boxWordsOf = (snapshot: BoxSnapshot | null): string => {
  if (snapshot === null) { return 'not listed' }
  const veiledWords = snapshot.isVeiled ? ', veiled' : ''
  return `revision ${String(snapshot.revision_seq)}, ${snapshot.isExposed ? 'exposed' : 'not exposed'}${veiledWords}`
}

/** A whisper, behind its own Show button, or the word for why there is none to show. */
const WhisperShown = ({ caption, whisper, hiddenWord = 'hidden' }: { caption: string, whisper: Whisper | null, hiddenWord?: string | undefined }) => {
  const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper, whisper !== null)
  const ownId = useId()
  return (
    <div className="dev-whisper">
      <code>{caption}</code>{' '}
      {(whisper === null)
        ? <span className="quiet">{hiddenWord}</span>
        : (
          <>
            {reveal.button(ownId)}
            <pre id={ownId}>{(reveal.fieldType === 'text') ? jsonOf(whisper) : '••••••••'}</pre>
          </>
        )}
    </div>
  )
}
// --
