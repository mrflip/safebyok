/** The words the parts show a user, in English, and `PartsPhrasesProvider`, which puts words of a host's own in their place. */

import { type ReactNode, createContext, useContext } from 'react'
import { mapValues } from 'es-toolkit'
import { Checkers } from 'safebyok'

// A sentence with a variable part would be one template function, so a translation could reorder it.

// == [Parts]: PartsPhrases, PartsPhrasesProviderProps, PartsPhrasesContext, PartsPhrasesProvider, usePartsPhrases

/** The words of the parts, in English. */
export const PartsPhrases = Object.freeze({
  showButton: 'Show',
  hideButton: 'Hide',
  capsLockOn: 'Caps Lock is on',
  /** What a `WhisperText` shows in place of a whisper that is not revealed. */
  masked:     '••••••••',
})

/** The words of the parts, one string for each of {@link PartsPhrases}' own. */
export type PartsPhrases = Readonly<Record<keyof typeof PartsPhrases, string>>

/** The props of a {@link PartsPhrasesProvider}. */
export type PartsPhrasesProviderProps = Readonly<{
  /** The words to use in place of the English ones, each left out keeping the word the provider above it gives. */
  phrases:  Partial<PartsPhrases>
  children: ReactNode
}>

/** The parts' words, for the kit's provider to give beside its own. */
export const PartsPhrasesContext = createContext<PartsPhrases>(PartsPhrases)

/** Puts words of your own in place of the parts' English ones, for every part inside it. A word left out keeps the one the provider above it gives.
 * The kit's `KitPhrasesProvider` gives the parts' words too: a host of the kit needs only that one.
 * @example
 *   <PartsPhrasesProvider phrases={{ showButton: 'Afficher', hideButton: 'Masquer' }}><KeyPanel /></PartsPhrasesProvider>
 */
export function PartsPhrasesProvider({ phrases, children }: PartsPhrasesProviderProps) {
  const outer = usePartsPhrases()
  return <PartsPhrasesContext value={{ ...outer, ...Checks.phrases.parse(phrases) }}>{children}</PartsPhrasesContext>
}

/** The words of the parts, as the nearest {@link PartsPhrasesProvider} gives them: the English ones, outside any. */
export function usePartsPhrases(): PartsPhrases {
  return useContext(PartsPhrasesContext)
}
// --

// == [Checks]: Checks

/** The checks of what a host hands the parts' words. */
const Checks = Checkers('bad_record', ({ obj, str }) => ({
  // Strict, so a misspelt word is refused, not left in English unnoticed.
  phrases: obj(mapValues(PartsPhrases, () => str.exactOptional())).strict(),
}))
// --
