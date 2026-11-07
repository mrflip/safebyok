import { useCallback, useEffect, useState } from 'react'
import { MaxLabelChars, Patterns, isVaultError } from 'safebyok'

/** What a panel's last button answered: the verb it called, whether it refused, and what it said. */
export type LastCall = { verbname: string, isOk: boolean, said: string }

/** The panel's last call, and `call`, which runs a button's verb and keeps what it answered or refused. */
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

/** The line that shows what the panel's last button answered, or nothing before the first. */
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
/** What a panel shows of `err`: a refusal's kind and message, or only the name of anything else thrown. */
export const refusalTextOf = (err: unknown): string => {
  if (isVaultError(err)) { return `${err.refusalkind}: ${err.message}` }
  return (err instanceof Error) ? err.name : typeof err
}

/** True for `text` the core takes as a vaultlabel or a boxlabel. */
export const isLabel = (text: string): boolean => (text.length <= MaxLabelChars) && Patterns.label.test(text)

/** `answer` as indented JSON, for the panel to show whole. */
export const jsonOf = (answer: unknown): string => JSON.stringify(answer, null, 2)

/** What a panel's listing holds: the rows last listed, null before the first, and the refusal of the last attempt. */
export type Listing<ValT> = { val: ValT | null, trouble: string | null }

/** What `list` answers, listed again at each `relist` and at each change `watch` tells of. */
export const useListing = <ValT,>(list: () => Promise<ValT>, watch: ((onChange: () => void) => () => void) | null = null) => {
  const [listing, setListing] = useState<Listing<ValT>>({ val: null, trouble: null })
  const [relists, setRelists] = useState(0)
  useEffect(() => {
    // A listing that settles after a later one began, or after the effect ends, is dropped.
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
