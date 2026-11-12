import { useActionState, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { useFormStatus } from 'react-dom'
import { ForeverMillis, MinuteMillis, type AnyGating } from 'safebyok'
import { gripeOfRefusal } from '../helpers/attempt-refusals'
import { Doing, Locale, Messages } from '../helpers/messages'
import { useRevealToggle } from '../hooks/reveal-toggle'
import { Boundary, boundaryRefusalOf } from '../provider/boundary'
import type { BoundarySource, Gripe, ModalFormProps, PassphraseFieldname } from '../shapes'

// == [Dialog]: showWhileMounted, ModalDialog, DialogBoundary, DialogTrouble

// Show the dialog as a modal for as long as it is mounted. The browser focuses its first control, keeps Tab
// inside it, and makes the rest of the page inert.
const showWhileMounted = (dialog: HTMLDialogElement) => {
  dialog.showModal()
  return () => { dialog.close() }
}

const ModalDialog = ({ onCancel, role, labelledBy, describedBy, children }: {
  onCancel:    () => void
  role?:       'alertdialog' | undefined
  labelledBy:  string
  describedBy: string
  children:    ReactNode
}) => (
  // The browser would close the dialog on Escape by itself. Prevent that and call onCancel instead, so whoever mounted the dialog decides when it closes.
  <dialog
    ref={showWhileMounted}
    className="modal"
    role={role}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onCancel={(evt) => { evt.preventDefault(); onCancel() }}
  >
    {children}
  </dialog>
)

/** Wrap a dialog's form in an error boundary. If the form throws, show an error dialog instead; closing that dialog dismisses the gating. */
export const DialogBoundary = ({ gating, children }: { gating: AnyGating, children: ReactNode }) => (
  <Boundary fallback={<DialogTrouble gating={gating} />}>{children}</Boundary>
)

const DialogTrouble = ({ gating }: { gating: AnyGating }) => {
  const titleId = useId()
  const wordId = useId()
  return (
    <ModalDialog onCancel={() => { gating.dismiss() }} role="alertdialog" labelledBy={titleId} describedBy={wordId}>
      <h3 id={titleId}>{Messages.troubleTitle}</h3>
      <p className="gripe" id={wordId}>{Messages.troubleWord(Doing[gating.gatingkind])}</p>
      <div className="row">
        <button type="button" onClick={() => { gating.dismiss() }}>{Messages.closeButton}</button>
      </div>
    </ModalDialog>
  )
}
// --

// == [Form]: textOf, useAttemptAction, SubmitButton, ModalForm, containsFocus, unlockedFor

/** Return the text typed in the field named `fieldname`, or '' when there is none. */
export const textOf = (form: FormData, fieldname: PassphraseFieldname): string => {
  const typed = form.get(fieldname)
  return typeof typed === 'string' ? typed : ''
}

/** Return a form action that runs a gating attempt, with `isPending` and the gripe from the last attempt.
 * `tried` runs the attempt, and resolves null when there was nothing to try. `fieldFor` picks the field to focus for a refusal kind.
 */
export const useAttemptAction = (
  gating:   AnyGating,
  source:   BoundarySource,
  tried:    (form: FormData) => Promise<{ ok: boolean, err?: unknown } | null>,
  fieldFor: (refusalkind: string) => RefObject<HTMLInputElement | null>,
) => {
  const gripeId = useId()
  const [gripe, action, isPending] = useActionState(async (_last: Gripe | null, form: FormData): Promise<Gripe | null> => {
    const outcome = await tried(form)
    if (outcome === null || outcome.ok) { return null }
    const gripeNow = gripeOfRefusal(gating, outcome.err, source)
    // The submit button was disabled during the attempt and lost focus, so move focus to the field at fault.
    if (gripeNow !== null) { fieldFor(gripeNow.refusalkind).current?.focus() }
    return gripeNow
  }, null)
  return { gripe: isPending ? null : gripe, gripeId, action, isPending }
}

const SubmitButton = ({ word, pendingWord, isSubmittable }: { word: string, pendingWord: string, isSubmittable: boolean }) => {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending || (! isSubmittable)}>{pending ? pendingWord : word}</button>
}

/** The layout every dialog shares: title, blurb, the fields passed as children, the error line, and the submit and cancel buttons. */
export const ModalForm = ({ onCancel, title, blurb, submitWord, pendingWord, isSubmittable = true, gripeText, gripeId, footnote, formRef, action, onReset, children }: ModalFormProps) => {
  const titleId = useId()
  const blurbId = useId()
  return (
    <ModalDialog onCancel={onCancel} labelledBy={titleId} describedBy={blurbId}>
      <form ref={formRef} action={action} onReset={onReset}>
        <h3 id={titleId}>{title}</h3>
        <p className="quiet" id={blurbId}>{blurb}</p>
        {children}
        <div role="alert" id={gripeId}>{gripeText !== null && <p className="gripe">{gripeText}</p>}</div>
        {footnote !== undefined && <p className="quiet">{footnote}</p>}
        <div className="row">
          <SubmitButton word={submitWord} pendingWord={pendingWord} isSubmittable={isSubmittable} />
          <button type="button" onClick={onCancel}>{Messages.cancelButton}</button>
        </div>
      </form>
    </ModalDialog>
  )
}

/** True when the focused element is inside `container`, a shadow root included. */
export const containsFocus = (container: HTMLElement | null): boolean => {
  if (container === null) { return false }
  const root = container.getRootNode()
  // Ask the container's own root for the focused element. Inside a shadow root, the document's
  // activeElement is only the shadow host.
  const focused = root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null
  return container.contains(focused)
}

const MinutesPerHour = 60
const MinutesPerDay = 24 * MinutesPerHour

type Unit = 'day' | 'hour' | 'minute'

const leaseCount = (leaseMillis: number): { count: number, unit: Unit } => {
  const minutes = Math.max(1, Math.round(leaseMillis / MinuteMillis))
  if (minutes % MinutesPerDay === 0) { return { count: minutes / MinutesPerDay, unit: 'day' } }
  if (minutes % MinutesPerHour === 0) { return { count: minutes / MinutesPerHour, unit: 'hour' } }
  return { count: minutes, unit: 'minute' }
}

// Formatters are created on first use, so that any Intl polyfill the host imports has loaded by then.
const relativeTimes = new Map<string, Intl.RelativeTimeFormat>()

const relativeTimeIn = (locale: string): Intl.RelativeTimeFormat => {
  const made = relativeTimes.get(locale) ?? new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' })
  relativeTimes.set(locale, made)
  return made
}

/** The sentence that tells the user how long the vault stays unlocked. `creating` picks the wording for a new vault. */
export const unlockedFor = (leaseMillis: number, creating: boolean): string => {
  // Compare with a margin, not for equality: anything within a minute of ForeverMillis counts as forever.
  if (leaseMillis >= ForeverMillis - MinuteMillis) { return Messages.staysUnlocked }
  const { count, unit } = leaseCount(leaseMillis)
  const relative = relativeTimeIn(Locale).format(count, unit)
  return creating ? Messages.locksIn(relative) : Messages.locksAgainIn(relative)
}
// --

// == [Passphrase field]: UsernameField, PassphraseField, useChosenPassphrase, ChosenPassphraseFields

/** A hidden username field, so a password manager files the passphrase under the right account. */
export const UsernameField = ({ username }: { username: string }) => (
  // The inline `display: none` is needed because a host's stylesheet can override the [hidden] attribute.
  <input type="text" name="username" autoComplete="username" value={username} readOnly hidden style={{ display: 'none' }} />
)

/** A passphrase input with a show/hide button, a Caps Lock warning and an optional line of advice. */
export const PassphraseField = ({ ref, fieldname, fieldlabel, advice, invalidBy, onChange }: {
  ref:        Ref<HTMLInputElement>
  fieldname:  PassphraseFieldname
  fieldlabel: string
  advice?:    string | null | undefined
  invalidBy?: string | undefined
  onChange?:  ((typed: string) => void) | undefined
}) => {
  const { pending } = useFormStatus()
  // Hide the passphrase again at each submit, so that a password manager sees a password field.
  const reveal = useRevealToggle(Messages.showPassphrase, Messages.hidePassphrase, ! pending)
  const [isCapsOn, setIsCapsOn] = useState(false)
  const watchCaps = (evt: KeyboardEvent) => { setIsCapsOn(evt.getModifierState('CapsLock')) }
  const fieldId = useId()
  const adviceId = useId()
  const describedBy = [advice === undefined ? undefined : adviceId, invalidBy].filter((id) => id !== undefined).join(' ')
  const credential = fieldname === 'current-password' ? 'current-password' : 'new-password'
  return (
    <>
      <span className="passphrase-field">
        <input
          id={fieldId}
          ref={ref}
          type={reveal.fieldType}
          name={fieldname}
          autoComplete={credential}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          required
          aria-label={fieldlabel}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          aria-invalid={invalidBy === undefined ? undefined : true}
          placeholder={fieldlabel}
          onChange={(evt) => { onChange?.(evt.target.value) }}
          onKeyDown={watchCaps}
          onKeyUp={watchCaps}
          onBlur={() => { setIsCapsOn(false) }}
        />
        {reveal.button(fieldId)}
      </span>
      {/* Rendered whenever the field takes advice, even while the advice is empty, so a screen reader announces each new message politely. */}
      {advice !== undefined && <p className="quiet" id={adviceId} role="status">{advice}</p>}
      <div role="status">{isCapsOn && <p className="quiet">{Messages.capsLockOn}</p>}</div>
    </>
  )
}

/** Return the live state of a choose-a-passphrase form: strength advice, and whether the confirmation matches.
 * React state holds only these verdicts, never the passphrase text.
 */
export const useChosenPassphrase = (gating: AnyGating, source: BoundarySource) => {
  const chosenRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const [advice, setAdvice] = useState<string | null>(null)
  const [isStrong, setIsStrong] = useState(false)
  const [confirmation, setConfirmation] = useState<'untyped' | 'differs' | 'matches'>('untyped')
  // The error is wrapped in an object, so that a thrown null or undefined still counts as a failure.
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  const asked = useRef(0)
  if (failure !== null) { throw boundaryRefusalOf(failure.err, source) }

  const compare = () => {
    const confirming = confirmRef.current?.value ?? ''
    if (confirming === '') { setConfirmation('untyped'); return }
    setConfirmation(confirming === chosenRef.current?.value ? 'matches' : 'differs')
  }

  // The submit button stays disabled until the strength check has finished for the text currently in the field.
  const hearChosen = async (typed: string) => {
    compare()
    asked.current += 1
    const askedNow = asked.current
    setIsStrong(false)
    if (typed === '') { setAdvice(null); return }
    try {
      const verdict = await gating.judgeStrength(typed)
      if (askedNow !== asked.current) { return }
      setAdvice(verdict.strong ? null : verdict.reason)
      setIsStrong(verdict.strong)
    } catch (err) {
      if (askedNow === asked.current) { setFailure({ err }) }
    }
  }

  // React clears the fields after each attempt without calling onChange, so this state is reset by hand.
  const reset = () => {
    asked.current += 1
    setAdvice(null)
    setIsStrong(false)
    setConfirmation('untyped')
  }

  return { chosenRef, confirmRef, advice, confirmation, isSubmittable: isStrong && confirmation === 'matches', hearChosen, compare, reset }
}

/** The new-passphrase field and its confirmation, with a line saying whether the two match. */
export const ChosenPassphraseFields = ({ chosen, chosenRef, confirmRef, chosenLabel, confirmLabel, chosenInvalidBy }: {
  chosen:           Omit<ReturnType<typeof useChosenPassphrase>, 'chosenRef' | 'confirmRef'>
  chosenRef:        Ref<HTMLInputElement>
  confirmRef:       Ref<HTMLInputElement>
  chosenLabel:      string
  confirmLabel:     string
  chosenInvalidBy?: string | undefined
}) => {
  const matchId = useId()
  return (
    <>
      <PassphraseField
        ref={chosenRef}
        fieldname="new-password"
        fieldlabel={chosenLabel}
        advice={chosen.advice}
        invalidBy={chosenInvalidBy}
        onChange={(typed) => { void chosen.hearChosen(typed) }}
      />
      <PassphraseField
        ref={confirmRef}
        fieldname="confirm-password"
        fieldlabel={confirmLabel}
        invalidBy={chosen.confirmation === 'differs' ? matchId : undefined}
        onChange={chosen.compare}
      />
      <div role="status" id={matchId}>
        {chosen.confirmation !== 'untyped' && <p className="quiet">{chosen.confirmation === 'matches' ? Messages.passphrasesMatch : Messages.passphrasesDiffer}</p>}
      </div>
    </>
  )
}
// --
