import { type ReactNode, type SubmitEvent, type SyntheticEvent, useActionState, useId, useState } from 'react'
import { popField } from 'safebyok-react-lean'
import { SubmitButton, WhisperInput } from 'safebyok-react-lean/parts'
import { mask } from 'safebyok/utils'
import { z } from 'zod'
import { Dojo } from '../../lib/dojo'
import { formTextOf } from '../../lib/form-text'
import { KeyMinChars, KeyPrefix } from '../../lib/made-up-service'
import { messageOf } from '../../lib/messages'
import { Example, PracticeCard } from './PracticeCard'

/** The labelpath of the box the right way saves. */
const Labelpath = 'practice_validate'

// zod's messages here are our own, and a zod 4 issue carries no copy of the input, so no message repeats the key.
/** The form's fields, as zod checks them: a name for the key, and the key, of the dojo's shape. */
const KeyForm = z.object({
  keyname: z.string().trim().min(1, 'Give the key a name.').max(40, 'Keep the name to 40 characters.'),
  apiKey:  z.string().trim().startsWith(KeyPrefix, `A dojo key starts with ${KeyPrefix}.`).min(KeyMinChars, `A dojo key has ${String(KeyMinChars)} characters or more.`),
})

/** The form's fields, by name. */
type KeyFieldname = keyof z.infer<typeof KeyForm>

/** The first message zod gives for each field it refuses. */
type Messages = Readonly<Partial<Record<KeyFieldname, string | undefined>>>

/** The first message for each field of `fields` that {@link KeyForm} refuses: empty when it passes. */
function messagesOf(fields: Readonly<Record<string, unknown>>): Messages {
  const parsed = KeyForm.safeParse(fields)
  if (parsed.success) { return {} }
  const { fieldErrors } = z.flattenError(parsed.error)
  return { keyname: fieldErrors.keyname?.[0], apiKey: fieldErrors.apiKey?.[0] }
}

/** The messages for the fields of `formElement`, as it now stands. */
function messagesOfForm(formElement: HTMLFormElement): Messages { return messagesOf(Object.fromEntries(new FormData(formElement))) }

/** The form action that saves the box at {@link Labelpath}. */
const savePut = Dojo.putBoxAction(Labelpath, {
  whisperOf:        (form) => ({ apiKey: formTextOf(form, 'apiKey').trim() }),
  sidecarOf:        (whisper, form) => ({ keyname: formTextOf(form, 'keyname').trim(), mask: mask(String(whisper['apiKey'])) }),
  secretFieldnames: ['apiKey'],
})

/** Hold the submit until zod passes, and show each message by its field: the right way, and the check run inside the action. */
export function ValidateCard() {
  return (
    <PracticeCard
      title="Hold the submit until zod passes, and show each message by its field"
      why={<>
        <p>Run the check in <code>onSubmit</code>, reading the form, and call <code>preventDefault()</code> when it fails: React then never starts the form Action, never resets the form, and never holds its fields as the form&apos;s status. Only the messages go into state; the key stays in its field.</p>
        <p>Each message sits by its field, tied to it with <code>aria-describedby</code> and <code>aria-invalid</code>, and says what to fix without repeating what was typed.</p>
      </>}
    >
      <Example caption="check in onSubmit, before the form Action starts"><HeldForm /></Example>
      <Example isWrongWay caption="check inside the form Action"><CheckedInActionForm /></Example>
    </PracticeCard>
  )
}

/** The form that checks itself in `onSubmit`, holds a failing submit there, and saves through the library's form action once it passes. */
function HeldForm() {
  const [messages, setMessages] = useState<Messages>({})
  const [put, putAction] = useActionState(savePut, null)
  const isShowingMessages = Object.values(messages).some(Boolean)

  /** Check the form, and hold the submit, focusing the first field to mend, where zod refuses it. */
  function holdUnlessValid(event: SubmitEvent<HTMLFormElement>) {
    const found = messagesOfForm(event.currentTarget)
    setMessages(found)
    const firstBad = (Object.keys(found) as KeyFieldname[]).find((fieldname) => found[fieldname] !== undefined)
    if (firstBad === undefined) { return }
    event.preventDefault()
    const field = event.currentTarget.elements.namedItem(firstBad)
    if (field instanceof HTMLElement) { field.focus() }
  }
  /** Check the form again as it is mended, once a message shows. */
  function recheck(event: SyntheticEvent<HTMLFormElement>) {
    if (isShowingMessages) { setMessages(messagesOfForm(event.currentTarget)) }
  }

  return (
    <form aria-label="Checked in onSubmit" action={putAction} onSubmit={holdUnlessValid} onChange={recheck} onReset={(event) => { if (put?.err) { event.preventDefault() } }}>
      <Field label="Name" message={messages.keyname}>{(fieldProps) => <input {...fieldProps} name="keyname" autoComplete="off" />}</Field>
      <Field label="API key" message={messages.apiKey}>{(fieldProps) => <WhisperInput {...fieldProps} name="apiKey" />}</Field>
      <SubmitButton whilePending="Saving…">Save</SubmitButton>
      <p role="status">{put?.err ? messageOf(put.err) : (put?.box && 'Saved the key.')}</p>
    </form>
  )
}

/** The form that checks itself inside its form Action: React resets it after the action, so the messages sit by emptied fields. */
function CheckedInActionForm() {
  const [messages, checkAction] = useActionState((_prior: Messages, form: FormData) => {
    return messagesOf({ keyname: form.get('keyname'), apiKey: popField(form, 'apiKey') })
  }, {})
  return (
    <form aria-label="Checked inside the action" action={checkAction}>
      <Field label="Name" message={messages.keyname}>{(fieldProps) => <input {...fieldProps} name="keyname" autoComplete="off" />}</Field>
      <Field label="API key" message={messages.apiKey}>{(fieldProps) => <WhisperInput {...fieldProps} name="apiKey" />}</Field>
      <button type="submit">Save</button>
    </form>
  )
}

/** The props {@link Field} hands its input. */
type FieldProps = Readonly<{ 'id': string, 'aria-describedby': string, 'aria-invalid': true | undefined }>

/** A labelled input with its message beside it: the input is described by the message, and invalid while there is one. */
function Field({ label, message, children }: Readonly<{ label: string, message: string | undefined, children: (fieldProps: FieldProps) => ReactNode }>) {
  const fieldId = useId()
  const messageId = useId()
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {children({ 'id': fieldId, 'aria-describedby': messageId, 'aria-invalid': (message === undefined) ? undefined : true })}
      <span id={messageId} className="gripe">{message}</span>
    </div>
  )
}
