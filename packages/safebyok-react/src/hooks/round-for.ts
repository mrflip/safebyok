import { useState } from 'react'

export const useRoundFor = (thing: object): number => {
  const [served, setServed] = useState({ thing, round: 0 })
  if (served.thing === thing) { return served.round }
  const round = served.round + 1
  setServed({ thing, round })
  return round
}
