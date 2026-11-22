/** The words the kit's forms show a user, in English, and `KitPhrasesProvider`, which puts words of a host's own in their place. */

import { type ReactNode, createContext, useContext } from 'react'
import { mapValues } from 'es-toolkit'
import { Checkers, isVaultError } from 'safebyok'
import { PartsPhrases, PartsPhrasesContext, usePartsPhrases } from '../parts/phrases-parts'

// A sentence with a variable part would be one template function, so a translation could reorder it.

// == [Kit]: KitPhrases, KitPhrasesProviderProps, KitPhrasesProvider, useKitPhrases, refusalTextOf, RefusalPhrases

/** The words of the kit's forms, in English, the parts' words among them. */
export const KitPhrases = Object.freeze({
  ...PartsPhrases,

  unlockTitle:        'Unlock your vault',
  unlockBlurb:        'Enter your vault passphrase.',
  passphraseField:    'Passphrase',
  unlockButton:       'Unlock',
  unlockingButton:    'Unlocking…',
  cancelButton:       'Cancel',

  createBlurb:        'Choose a passphrase. It encrypts your secrets on this device, and nobody can recover it for you, not even us.',
  newPassphraseField: 'New passphrase',
  confirmField:       'Confirm passphrase',
  strongEnough:       'Strong enough',
  passphrasesMatch:   'The passphrases match',
  passphrasesDiffer:  'The passphrases do not match',
  createButton:       'Create vault',
  creatingButton:     'Creating…',

  replaceBlurb:          'Enter your current passphrase, then choose a new one. Your passkey, if you have one, keeps working.',
  currentField:          'Current passphrase',
  replaceButton:         'Replace passphrase',
  replacingButton:       'Replacing…',

  addPasskeyBlurb:       'Enter your vault passphrase. Your browser will then offer a passkey, to unlock with your fingerprint, face or security key alone.',
  addPasskeyButton:      'Add passkey',
  addingPasskeyButton:   'Adding…',
  revokePasskeyBlurb:    'Enter your vault passphrase to remove the passkey here and on every other device.',
  revokePasskeyButton:   'Remove passkey',
  revokingPasskeyButton: 'Removing…',
  passkeyUnlockButton:   'Unlock with a passkey',
  askingPasskeyButton:   'Asking your passkey…',

  wrongPassphrase:    'That is not the passphrase.',
  weakPassphrase:     'That passphrase is too easy to guess.',
  wrongPasskey:       'That passkey does not unlock this vault.',
  troubled:           'Something went wrong. Please try again later.',
})

/** The words of the kit's forms, one string for each of {@link KitPhrases}' own. */
export type KitPhrases = Readonly<Record<keyof typeof KitPhrases, string>>

/** The props of a {@link KitPhrasesProvider}. */
export type KitPhrasesProviderProps = Readonly<{
  /** The words to use in place of the English ones, each left out keeping the word the provider above it gives. */
  phrases:  Partial<KitPhrases>
  children: ReactNode
}>

const KitPhrasesContext = createContext<KitPhrases>(KitPhrases)

/** Puts words of your own in place of the English ones, for every kit form and part inside it. A word left out keeps the one the provider above it gives.
 * A refusal the kit has no words for, such as a browser that cannot use passkeys, shows its message, in English.
 * @example
 *   <KitPhrasesProvider phrases={{ unlockButton: 'Déverrouiller', passphraseField: 'Phrase secrète' }}><UnlockForm /></KitPhrasesProvider>
 */
export function KitPhrasesProvider({ phrases, children }: KitPhrasesProviderProps) {
  // The parts' words come from the parts context too, so a `PartsPhrasesProvider` above keeps its words.
  const merged = { ...useKitPhrases(), ...usePartsPhrases(), ...Checks.phrases.parse(phrases) }
  return <KitPhrasesContext value={merged}><PartsPhrasesContext value={merged}>{children}</PartsPhrasesContext></KitPhrasesContext>
}

/** The words of the kit's forms, as the nearest {@link KitPhrasesProvider} gives them: the English ones, outside any. */
export function useKitPhrases(): KitPhrases {
  return useContext(KitPhrasesContext)
}

/** The words to show a user for `err`, a refusal: a condition they can mend in their own terms, anything else as "Something went wrong. Please try again later."
 * Never throws: any value in, a string out. A condition with no words of its own shows its message. Hand it `phrases`, such as `useKitPhrases()`, for words of your own.
 * @example
 *   {put.isError && <p role="alert">{refusalTextOf(put.error)}</p>}
 */
export function refusalTextOf(err: unknown, phrases: RefusalPhrases = KitPhrases): string {
  if (! isVaultError(err) || (err.family !== 'condition')) { return phrases.troubled }
  switch (err.refusalkind) {
  case 'wrong_passphrase': { return phrases.wrongPassphrase }
  case 'weak_passphrase': {  return phrases.weakPassphrase }
  case 'wrong_passkey': {    return phrases.wrongPasskey }
  default: {                 return err.message }
  }
}

/** The words {@link refusalTextOf} picks from. */
export type RefusalPhrases = Pick<KitPhrases, 'wrongPassphrase' | 'weakPassphrase' | 'wrongPasskey' | 'troubled'>
// --

// == [Ceremony]: CeremonyPhrases

/** The messages of the refusals a passkey ceremony throws, which `refusalTextOf` shows as they are. */
export const CeremonyPhrases = Object.freeze({
  noPasskeyToAsk:   'This vault has no passkey to ask: unlock it with your passphrase, then add one.',
  noWebAuthn:       "This browser can't use passkeys. Your passphrase still works.",
  noPrf:            'That device or security key is not compatible with this vault. Try another, or use your passphrase.',
  passkeyAskFailed: "Your browser couldn't ask for a passkey just now: try again, or use your passphrase.",
})
// --

// == [Checks]: Checks

/** The checks of what a host hands the kit's words. */
const Checks = Checkers('bad_record', ({ obj, str }) => ({
  // Strict, so a misspelt word is refused, not left in English unnoticed.
  phrases: obj(mapValues(KitPhrases, () => str.exactOptional())).strict(),
}))
// --
