import { useState } from 'react'

/** A number that changes whenever `thing` does, to key a component with. */
export const useRoundFor = (thing: object): number => {
  const [served, setServed] = useState({ thing, round: 0 })
  if (served.thing === thing) { return served.round }
  // React's "adjusting state while rendering": it renders again at once, before committing this.
  const round = served.round + 1
  setServed({ thing, round })
  return round
}
