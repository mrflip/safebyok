/** The giver and bank a provider hands the parts and the kit beneath it, so a part finds its bank without a prop. */

import { createContext, useContext } from 'react'
import { VaultError } from 'safebyok'
import * as Phrases from './phrases-giver'
import type { BankGiver, ReactGiver } from './react-giver'

// == [The context]: Given, GiverContext, useGivenBank, useGivenGiver

/** What a giver's provider hands the parts and the kit beneath it: the giver, and its one bank. */
export type Given = Readonly<{
  giver: Pick<ReactGiver, 'useStrengthVerdict'>
  bank:  BankGiver
}>

// One context serves every giver, so a part needs no giver in hand to find one. Under two providers, the nearer wins.
/** The giver and bank of the nearest provider, or null outside every provider. */
export const GiverContext = createContext<Given | null>(null)

/** `bank`, or else the bank of the nearest provider. Refuses `bad_record` when there is neither. */
export function useGivenBank<BankT>(bank: BankT | undefined): BankT | BankGiver {
  const given = useContext(GiverContext)
  const found = bank ?? given?.bank
  if (found === undefined) { throw new VaultError('bad_record', Phrases.NoProvider) }
  return found
}

/** `giver`, or else the giver of the nearest provider. Refuses `bad_record` when there is neither. */
export function useGivenGiver<GiverT>(giver: GiverT | undefined): GiverT | Given['giver'] {
  const given = useContext(GiverContext)
  const found = giver ?? given?.giver
  if (found === undefined) { throw new VaultError('bad_record', Phrases.NoProvider) }
  return found
}
// --
