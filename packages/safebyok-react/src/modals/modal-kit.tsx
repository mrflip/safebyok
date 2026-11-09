import { useActionState, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { useFormStatus } from 'react-dom'
import { ForeverMillis, MinuteMillis, type AnyGating } from 'safebyok'
import { gripeOfRefusal } from '../helpers/attempt-refusals'
import { Doing, Locale, Messages } from '../helpers/messages'
import { useRevealToggle } from '../hooks/reveal-toggle'
import { Boundary, forBoundary } from '../provider/boundary'
import type { BoundarySource, Gripe, ModalFormProps, PassphraseFieldname } from '../shapes'

// == [Dialog]: showWhileMounted, GatingDialog, DialogBoundary, DialogTrouble

// The element is the modal for as long as it is mounted: the browser gives the focus to its first control, keeps Tab
// inside it, and leaves the page behind inert.
const showWhileMounted = (dialog: HTMLDialogElement) => {
  dialog.showModal()
  return () => { dialog.close() }
}

const GatingDialog = ({ gating, role, labelledBy, describedBy, children }: {
  gating:      AnyGating
  role?:       'alertdialog' | undefined
  labelledBy:  string
  describedBy: string
  children:    ReactNode
}) => (
  // The browser would close the dialog at Escape: the gating decides that, here as everywhere.
  <dialog
    ref={showWhileMounted}
    className="modal"
    role={role}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onCancel={(evt) => { evt.preventDefault(); gating.dismiss() }}
  >
    {children}
  </dialog>
)

/** What a dialog's form is rendered inside: anything thrown by it shows as trouble, and dismisses the gating when closed. */
export const DialogBoundary = ({ gating, children }: { gating: AnyGating, children: ReactNode }) => (
  <Boundary fallback={<DialogTrouble gating={gating} />}>{children}</Boundary>
)

const DialogTrouble = ({ gating }: { gating: AnyGating }) => {
  const titleId = useId()
  const wordId = useId()
  return (
    <GatingDialog gating={gating} role="alertdialog" labelledBy={titleId} describedBy={wordId}>
      <h3 id={titleId}>{Messages.troubleTitle}</h3>
      <p className="gripe" id={wordId}>{Messages.troubleWord(Doing[gating.gatingkind])}</p>
      <div className="row">
        <button type="button" onClick={() => { gating.dismiss() }}>{Messages.closeButton}</button>
      </div>
    </GatingDialog>
  )
}
// --

// == [Form]: textOf, useAttemptAction, SubmitButton, ModalForm, holdsFocus, unlockedFor

/** The text typed in the field named `fieldname`, or '' with none. */
export const textOf = (form: FormData, fieldname: PassphraseFieldname): string => {
  const typed = form.get(fieldname)
  return typeof typed === 'string' ? typed : ''
}

/** The form action for a gating's attempts, and the gripe to show of the last. `tried` answers null when there was nothing to try. */
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
    // The submit button, disabled while the attempt ran, has dropped the focus.
    if (gripeNow !== null) { fieldFor(gripeNow.refusalkind).current?.focus() }
    return gripeNow
  }, null)
  return { gripe: isPending ? null : gripe, gripeId, action }
}

const SubmitButton = ({ word, pendingWord, isSubmittable }: { word: string, pendingWord: string, isSubmittable: boolean }) => {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending || (! isSubmittable)}>{pending ? pendingWord : word}</button>
}

export const ModalForm = ({ gating, title, blurb, submitWord, pendingWord, isSubmittable = true, gripeText, gripeId, footnote, formRef, action, onReset, children }: ModalFormProps) => {
  const titleId = useId()
  const blurbId = useId()
  return (
    <GatingDialog gating={gating} labelledBy={titleId} describedBy={blurbId}>
      <form ref={formRef} action={action} onReset={onReset}>
        <h3 id={titleId}>{title}</h3>
        <p className="quiet" id={blurbId}>{blurb}</p>
        {children}
        <div role="alert" id={gripeId}>{gripeText !== null && <p className="gripe">{gripeText}</p>}</div>
        {footnote !== undefined && <p className="quiet">{footnote}</p>}
        <div className="row">
          <SubmitButton word={submitWord} pendingWord={pendingWord} isSubmittable={isSubmittable} />
          <button type="button" onClick={() => { gating.dismiss() }}>{Messages.cancelButton}</button>
        </div>
      </form>
    </GatingDialog>
  )
}

export const holdsFocus = (container: HTMLElement | null): boolean => {
  if (container === null) { return false }
  const root = container.getRootNode()
  // A document and a shadow root each know their own focused element; the document alone would
  // name only the shadow host.
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

// Each formatter is made at first use, after any polyfill the host imports has run.
const relativeTimes = new Map<string, Intl.RelativeTimeFormat>()

const relativeTimeIn = (locale: string): Intl.RelativeTimeFormat => {
  const made = relativeTimes.get(locale) ?? new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' })
  relativeTimes.set(locale, made)
  return made
}

export const unlockedFor = (leaseMillis: number, creating: boolean): string => {
  // Never compared to ForeverMillis for equality: the far future is anything within a minute of it.
  if (leaseMillis >= ForeverMillis - MinuteMillis) { return Messages.staysUnlocked }
  const { count, unit } = leaseCount(leaseMillis)
  const relative = relativeTimeIn(Locale).format(count, unit)
  return creating ? Messages.locksIn(relative) : Messages.locksAgainIn(relative)
}
// --

// == [Passphrase field]: UsernameField, PassphraseField, useChosenPassphrase, ChosenPassphraseFields

export const UsernameField = ({ username }: { username: string }) => (
  // The inline display wins over a host's stylesheet, which can override [hidden].
  <input type="text" name="username" autoComplete="username" value={username} readOnly hidden style={{ display: 'none' }} />
)

export const PassphraseField = ({ ref, fieldname, fieldlabel, advice, invalidBy, onChange }: {
  ref:        Ref<HTMLInputElement>
  fieldname:  PassphraseFieldname
  fieldlabel: string
  advice?:    string | null | undefined
  invalidBy?: string | undefined
  onChange?:  ((typed: string) => void) | undefined
}) => {
  const { pending } = useFormStatus()
  // Masked again at each submit, so that a password manager sees a password field.
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
      {/* Mounted with the field, so that each word put in it is announced, politely. */}
      {advice !== undefined && <p className="quiet" id={adviceId} role="status">{advice}</p>}
      <div role="status">{isCapsOn && <p className="quiet">{Messages.capsLockOn}</p>}</div>
    </>
  )
}

/** The live state of a form choosing a passphrase: its strength and its confirmation, as verdicts only, never the text. */
export const useChosenPassphrase = (gating: AnyGating, source: BoundarySource) => {
  const chosenRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const [advice, setAdvice] = useState<string | null>(null)
  const [isStrong, setIsStrong] = useState(false)
  const [confirmation, setConfirmation] = useState<'untyped' | 'differs' | 'matches'>('untyped')
  // The error rides in an object, so a thrown null or undefined still reads as a failure.
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  const asked = useRef(0)
  if (failure !== null) { throw forBoundary(failure.err, source) }

  const compare = () => {
    const confirming = confirmRef.current?.value ?? ''
    if (confirming === '') { setConfirmation('untyped'); return }
    setConfirmation(confirming === chosenRef.current?.value ? 'matches' : 'differs')
  }

  // The submit button stays disabled until the verdict is on the text now in the field.
  const hearChosen = async (typed: string) => {
    compare()
    asked.current += 1
    const askedNow = asked.current
    setIsStrong(false)
    if (typed === '') { setAdvice(null); return }
    try {
      const verdict = await gating.checkStrength(typed)
      if (askedNow !== asked.current) { return }
      setAdvice(verdict.strong ? null : verdict.reason)
      setIsStrong(verdict.strong)
    } catch (err) {
      if (askedNow === asked.current) { setFailure({ err }) }
    }
  }

  // React empties the fields after each attempt, and tells nobody's onChange.
  const forget = () => {
    asked.current += 1
    setAdvice(null)
    setIsStrong(false)
    setConfirmation('untyped')
  }

  return { chosenRef, confirmRef, advice, confirmation, isSubmittable: isStrong && confirmation === 'matches', hearChosen, compare, forget }
}

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
