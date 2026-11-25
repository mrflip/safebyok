import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { PutBoxActionResult } from 'safebyok-react'
import { SubmitButton, WhisperInput } from 'safebyok-react/parts'
import { mask } from 'safebyok/utils'
import { Dojo, vaultDB } from '../../lib/dojo'
import { formTextOf } from '../../lib/form-text'
import { messageOf } from '../../lib/messages'
import { Example, PracticeCard } from './PracticeCard'

/** The library's form action saving the box at `labelpath`: a name in its sidecar, and the key in its whisper. */
function savePutOf(labelpath: string) {
  return Dojo.putBoxAction(labelpath, {
    whisperOf:        (form) => ({ apiKey: formTextOf(form, 'apiKey').trim() }),
    sidecarOf:        (whisper, form) => ({ keyname: formTextOf(form, 'keyname'), mask: mask(String(whisper['apiKey'])) }),
    secretFieldnames: ['apiKey'],
  })
}

/** The form actions of the two examples, each saving a box of its own. */
const saveRightWay = savePutOf('practice_double')
const saveWrongWay = savePutOf('practice_double_wrong')

/** Prevent a double submit by disabling the button while the save is pending: the right way, and a button left enabled. */
export function DoubleSubmitCard() {
  return (
    <PracticeCard
      title="Disable the submit while the save is pending"
      why={<>
        <p>The library&apos;s <code>SubmitButton</code> is disabled while its form&apos;s action runs, so a second press starts nothing.</p>
        <p>Beyond saving twice: <code>useActionState</code> queues a second submit behind the pending one, and React shows that queued form, key included, as the form&apos;s status until the first save ends. The library deletes the key from a form only when its action runs.</p>
      </>}
    >
      {/* The dojo's, not the example's: each press arms a six-second hold on the vaultDB's next write, so a save's pending can be seen. */}
      <div className="contents" onSubmitCapture={() => { vaultDB.holdNextWrite() }}>
        <Example caption="SubmitButton, disabled while pending"><SaveForm title="Disabled while pending" save={saveRightWay} isGuarded /></Example>
        <Example isWrongWay caption="a button left enabled"><SaveForm title="Left enabled" save={saveWrongWay} isGuarded={false} /></Example>
      </div>
    </PracticeCard>
  )
}

/** A form Action saving a key through `save`, with the library's disabling submit where `isGuarded`, or a plain one. */
function SaveForm({ title, save, isGuarded }: Readonly<{ title: string, save: ReturnType<typeof savePutOf>, isGuarded: boolean }>) {
  /** What the form keeps of its saves: the last one's result, and how many have ended. */
  type Saves = PutBoxActionResult & Readonly<{ endedCount: number }>
  const [saves, saveAction] = useActionState(async (prior: Saves | null, form: FormData): Promise<Saves> => {
    const saved = await save(prior, form)
    return { ...saved, endedCount: (prior?.endedCount ?? 0) + 1 }
  }, null)
  return (
    <form aria-label={title} action={saveAction}>
      <input name="keyname" aria-label="Name" placeholder="Name" autoComplete="off" />
      <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" />
      {isGuarded ? <SubmitButton whilePending="Saving…">Save</SubmitButton> : <button type="submit">Save</button>}
      <FormStatusFields />
      <p role="status" aria-label="Saves">Saves ended: {saves?.endedCount ?? 0}{saves?.err && `; the last: ${messageOf(saves.err)}`}</p>
    </form>
  )
}

/** The names of the fields React shows as the status of the form this is in. */
function FormStatusFields() {
  const { data } = useFormStatus()
  const fieldnames = (data === null) ? [] : [...data.keys()]
  return <p aria-label="Form status">React&apos;s form status holds: {(fieldnames.length > 0) ? fieldnames.join(', ') : 'nothing'}</p>
}
