import { useCallback, useEffect, useState } from 'react'
import { MaxLabelChars, Patterns, isVaultError } from 'safebyok'
import type { LastCall, Listing } from '../shapes'

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

export const LastCallLine = ({ lastCall }: { lastCall: LastCall | null }) => {
  if (lastCall === null) { return null }
  return (
    <div className="dev-last-call" role="status" data-ok={lastCall.isOk}>
      <code>{lastCall.verbname}</code>{lastCall.isOk ? ' answered:' : ' refused:'}
      <pre>{lastCall.said}</pre>
    </div>
  )
}

// Only a VaultError's words are shown: the core keeps secret material out of them, and another
// error may carry anything.
export const refusalTextOf = (err: unknown): string => {
  if (isVaultError(err)) { return `${err.refusalkind}: ${err.message}` }
  return (err instanceof Error) ? err.name : typeof err
}

export const isLabel = (text: string): boolean => (text.length <= MaxLabelChars) && Patterns.label.test(text)

export const jsonOf = (answer: unknown): string => JSON.stringify(answer, null, 2)

// A damaged row's time can be any number, and toISOString throws, in render, on a number past a Date's range.
export const timeOf = (millis: number): string => {
  const when = new Date(millis)
  return Number.isNaN(when.getTime()) ? String(millis) : when.toISOString()
}

export const useListing = <ValT,>(list: () => Promise<ValT>, watch: ((onChange: () => void) => () => void) | null = null) => {
  const [listing, setListing] = useState<Listing<ValT>>({ val: null, trouble: null })
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
