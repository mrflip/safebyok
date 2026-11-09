import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { ForeverMillis, MinuteMillis, type AnyGating, type Outcome, type Vault } from 'safebyok'
import { attemptRefusalFlavor } from '../helpers/attempt-refusals'
import { Doing, Locale, Messages } from '../helpers/messages'
import { useRevealToggle } from '../hooks/reveal-toggle'
import { useWhenShown } from '../hooks/when-shown'
import { Boundary, forBoundary } from '../provider/boundary'
import type { BoundarySource, DialogAnswer, Gripe, ModalFormProps } from '../shapes'

// == [Answer]: DialogAnswer, answerOf, useAnswerOnce, AnsweringOnce, DialogTrouble, cancelOnEscape

const answerOf = (gating: AnyGating, outcome: Outcome<Vault>): DialogAnswer => {
  if (! outcome.ok) { return 'dismissed' }
  return gating.gatingkind === 'del_vault' ? 'deleted' : 'unlocked'
}

const useAnswerOnce = (gating: AnyGating, onDone: (answer: DialogAnswer) => void) => {
  const onDoneRef = useRef(onDone)
  useLayoutEffect(() => { onDoneRef.current = onDone })
  const answered = useRef(false)
  const done = useCallback((answer: DialogAnswer) => {
    if (answered.current) { return }
    answered.current = true
    onDoneRef.current(answer)
  }, [])
  const { whenShown } = useWhenShown()
  useEffect(() => {
    let current = true
    // A sweep or a vacate concludes the gating with no attempt: the dialog closes on it.
    void gating.whenConcluded.then((outcome) => whenShown(() => { if (current) { done(answerOf(gating, outcome)) } }))
    return () => { current = false }
  }, [gating, done, whenShown])
  return done
}

export const AnsweringOnce = ({ gating, onDone, children }: {
  gating:   AnyGating
  onDone:   (answer: DialogAnswer) => void
  children: (done: (answer: DialogAnswer) => void) => ReactNode
}) => {
  const done = useAnswerOnce(gating, onDone)
  return (
    <Boundary fallback={<DialogTrouble doing={Doing[gating.gatingkind]} onDone={done} />}>
      {children(done)}
    </Boundary>
  )
}

const cancelOnEscape = (onDone: (answer: DialogAnswer) => void) => (evt: KeyboardEvent) => {
  if (evt.key !== 'Escape') { return }
  evt.stopPropagation()
  onDone('dismissed')
}

const DialogTrouble = ({ doing, onDone }: { doing: string, onDone: (answer: DialogAnswer) => void }) => {
  const titleId = useId()
  const wordId = useId()
  return (
    <div className="modal-scrim">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes a dialog from anywhere inside it, as the WAI-ARIA dialog pattern has it */}
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={wordId}
        onKeyDown={cancelOnEscape(onDone)}
      >
        <h3 id={titleId}>{Messages.troubleTitle}</h3>
        <p className="gripe" id={wordId}>{Messages.troubleWord(doing)}</p>
        <div className="row">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the field that held focus is gone; the WAI-ARIA dialog pattern moves focus to the dialog's one control */}
          <button type="button" autoFocus onClick={() => { onDone('dismissed') }}>{Messages.closeButton}</button>
        </div>
      </div>
    </div>
  )
}
// --

// == [Form]: Gripe, useAttempts, ModalForm, holdsFocus, unlockedFor

export const useAttempts = (source: BoundarySource, done: (answer: DialogAnswer) => void) => {
  const [gripe, setGripe] = useState<Gripe | null>(null)
  // The error rides in an object, so a thrown null or undefined still reads as a failure.
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  const { whenShown, isShown } = useWhenShown()
  const fail = useCallback((err: unknown) => { setFailure({ err }) }, [])
  if (failure !== null) { throw forBoundary(failure.err, source) }

  const meet = (err: unknown) => {
    const flavor = attemptRefusalFlavor(err)
    if (flavor === 'in_flight') { return }
    if (flavor === 'in_place') { setGripe({ text: (err as Error).message, fromPasskey: false }); return }
    if (flavor === 'close') { done('dismissed'); return }
    // Thrown from an event handler, it would miss every boundary.
    fail(err)
  }

  const attempt = async (tried: () => Promise<Outcome<Vault>>, answer: DialogAnswer) => {
    setGripe(null)
    const { ok, err } = await tried()
    await whenShown(() => {
      if (ok) { done(answer); return }
      meet(err)
    })
  }

  return { gripe, setGripe, meet, fail, attempt, whenShown, isShown }
}

export const ModalForm = ({ title, blurb, submitWord, gripe, gripeId, footnote, formRef, done, onSubmit, children }: ModalFormProps) => {
  const titleId = useId()
  const blurbId = useId()
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes a dialog from anywhere inside it, as the WAI-ARIA dialog pattern has it
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={blurbId} onKeyDown={cancelOnEscape(done)}>
      <form ref={formRef} className="modal" onSubmit={(evt) => { evt.preventDefault(); onSubmit() }}>
        <h3 id={titleId}>{title}</h3>
        <p className="quiet" id={blurbId}>{blurb}</p>
        {children}
        <div role="alert" id={gripeId}>{gripe !== null && <p className="gripe">{gripe.text}</p>}</div>
        {footnote !== undefined && <p className="quiet">{footnote}</p>}
        <div className="row">
          <button type="submit">{submitWord}</button>
          <button type="button" onClick={() => { done('dismissed') }}>{Messages.cancelButton}</button>
        </div>
      </form>
    </div>
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

// == [Passphrase field]: UsernameField, PassphraseField, useConfirmation, ConfirmField, useAdvice, checkerAdvice

export const UsernameField = ({ username }: { username: string }) => (
  // The inline display wins over a host's stylesheet, which can override [hidden].
  <input type="text" name="username" autoComplete="username" value={username} readOnly hidden style={{ display: 'none' }} />
)

export const PassphraseField = ({ ref, credential, fieldlabel, takesFocus, advice, invalidBy, onChange }: {
  ref:        Ref<HTMLInputElement>
  credential: 'new-password' | 'current-password'
  fieldlabel: string
  takesFocus: boolean
  advice?:    string | null | undefined
  invalidBy?: string | undefined
  onChange:   (typed: string) => void
}) => {
  const reveal = useRevealToggle(Messages.showPassphrase, Messages.hidePassphrase)
  const fieldId = useId()
  const adviceId = useId()
  const describedBy = [advice === undefined ? undefined : adviceId, invalidBy].filter((id) => id !== undefined).join(' ')
  return (
    <>
      <span className="passphrase-field">
        <input
          id={fieldId}
          ref={ref}
          type={reveal.fieldType}
          name={credential}
          autoComplete={credential}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- moving focus to the dialog's first field on open is the WAI-ARIA dialog pattern; the rule aims at page-load autofocus
          autoFocus={takesFocus}
          aria-label={fieldlabel}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          aria-invalid={invalidBy === undefined ? undefined : true}
          placeholder={fieldlabel}
          onChange={(evt) => { onChange(evt.target.value) }}
        />
        {reveal.button(fieldId)}
      </span>
      {/* Mounted with the field, so that each word put in it is announced, politely. */}
      {advice !== undefined && <p className="quiet" id={adviceId} role="status">{advice}</p>}
    </>
  )
}

const MismatchGripe: Gripe = { text: Messages.passphrasesDiffer, fromPasskey: false, mismatched: true }

export const useConfirmation = (setGripe: (gripe: Gripe) => void) => {
  const ref = useRef<HTMLInputElement>(null)
  const gripeId = useId()
  const differs = (chosen: string): boolean => {
    if ((ref.current?.value ?? '') === chosen) { return false }
    setGripe(MismatchGripe)
    return true
  }
  return { ref, gripeId, differs }
}

export const ConfirmField = ({ ref, gripeId, fieldlabel, gripe, onChange }: {
  ref:        Ref<HTMLInputElement>
  gripeId:    string
  fieldlabel: string
  gripe:      Gripe | null
  onChange:   (typed: string) => void
}) => (
  <PassphraseField
    ref={ref}
    credential="new-password"
    fieldlabel={fieldlabel}
    takesFocus={false}
    invalidBy={gripe?.mismatched === true ? gripeId : undefined}
    onChange={onChange}
  />
)

const checkerAdvice = async (gating: AnyGating, typed: string): Promise<string | null> => {
  const verdict = await gating.checkStrength(typed)
  return verdict.strong ? null : verdict.reason
}

export const useAdvice = (gating: AnyGating, creating: boolean, fail: (err: unknown) => void) => {
  const [said, setSaid] = useState<string | null>(null)
  const asked = useRef(0)
  const creatingNow = useRef(creating)
  const [saidWhile, setSaidWhile] = useState(creating)
  if (saidWhile !== creating) {
    setSaidWhile(creating)
    setSaid(null)
  }
  // A layout effect, so an answer or failure still on its way turns stale from the same commit as the change of mode.
  useLayoutEffect(() => { creatingNow.current = creating }, [creating])
  const { whenShown } = useWhenShown()
  const hear = async (typed: string) => {
    asked.current += 1
    if (typed === '') { setSaid(null); return }
    const askedNow = asked.current
    const latest = () => askedNow === asked.current && creating === creatingNow.current
    try {
      const answer = await checkerAdvice(gating, typed)
      await whenShown(() => { if (latest()) { setSaid(answer) } })
    } catch (err) {
      await whenShown(() => { if (latest()) { fail(err) } })
    }
  }
  return { said, hear }
}
// --
