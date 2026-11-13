import { useCallback, useEffect, useState } from 'react'
import { MaxLabelChars, Patterns, isVaultError } from 'safebyok'
import type { LastCall, PanelListing } from '../shapes'

/** Track an inspector's most recent call: `call(verbname, work)` runs `work` and records what it returned, or how it refused. */
export const useLastCall = () => {
  const [lastCall, setLastCall] = useState<LastCall | null>(null)
  const call = useCallback(async (verbname: string, work: () => Promise<string> | string) => {
    try {
      setLastCall({ verbname, isOk: true, said: await work() })
    } catch (err) {
      setLastCall({ verbname, isOk: false, said: refusalTextOf(err) })
    }
  }, [])
  return { lastCall, call }
}

/** Show the last call's verb with its result or refusal. Renders nothing before the first call. */
export const LastCallLine = ({ lastCall }: { lastCall: LastCall | null }) => {
  if (lastCall === null) { return null }
  return (
    <div className="dev-last-call" role="status" data-ok={lastCall.isOk}>
      <code>{lastCall.verbname}</code>{lastCall.isOk ? ' answered:' : ' refused:'}
      <pre>{lastCall.said}</pre>
    </div>
  )
}

// Show the message only for a VaultError: the core keeps secret material out of those. Any other error
// could contain anything, so show only its name.
/** Text to show for a caught error: the kind and message of a VaultError, or only the name of any other error. */
export const refusalTextOf = (err: unknown): string => {
  if (isVaultError(err)) { return `${err.refusalkind}: ${err.message}` }
  return (err instanceof Error) ? err.name : typeof err
}

/** True when `text` is a valid label. */
export const isLabel = (text: string): boolean => (text.length <= MaxLabelChars) && Patterns.label.test(text)

/** Pretty-print a value as JSON. */
export const jsonOf = (answer: unknown): string => JSON.stringify(answer, null, 2)

// A damaged row's time can be any number. toISOString throws for a number outside a Date's range, and that would happen during render.
/** Format epoch milliseconds as an ISO time, or as the bare number when a Date cannot hold it. */
export const timeOf = (millis: number): string => {
  const when = new Date(millis)
  return Number.isNaN(when.getTime()) ? String(millis) : when.toISOString()
}

/** Load a listing with `list`, and load it again when `watch` reports a change or `relist()` is called.
 * A failed load keeps the last value and sets `trouble`.
 */
export const useListing = <ValT,>(list: () => Promise<ValT>, watch: ((onChange: () => void) => () => void) | null = null) => {
  const [listing, setListing] = useState<PanelListing<ValT>>({ val: null, trouble: null })
  const [relists, setRelists] = useState(0)
  useEffect(() => {
    let round = 0
    let isOver = false
    const listAgain = () => {
      round += 1
      const mine = round
      const isLatest = () => (! isOver) && (mine === round)
      void list()
        .then((val) => { if (isLatest()) { setListing({ val, trouble: null }) } })
        .catch((err: unknown) => { if (isLatest()) { setListing((prev) => ({ val: prev.val, trouble: refusalTextOf(err) })) } })
    }
    listAgain()
    const stop = watch?.(listAgain) ?? null
    return () => { isOver = true; stop?.() }
  }, [list, watch, relists])
  const relist = useCallback(() => { setRelists((prev) => prev + 1) }, [])
  return { ...listing, relist }
}
