// The words the kit's forms show a user. A sentence with a variable part would be one template function, so a translation could reorder it.

import { isVaultError } from 'safebyok'

// == [Kit]: KitPhrases, refusalTextOf

/** The words of the kit's forms. */
export const KitPhrases = Object.freeze({
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

  wrongPassphrase:    'That is not the passphrase.',
  weakPassphrase:     'That passphrase is too easy to guess.',
  troubled:           'Something went wrong. Please try again later.',
})

/** The alert a form shows for `err`, its form verb's refusal: a condition the user can mend in their own words, anything else as trouble. */
export function refusalTextOf(err: unknown): string {
  if (! isVaultError(err) || (err.family !== 'condition')) { return KitPhrases.troubled }
  switch (err.refusalkind) {
  case 'wrong_passphrase': { return KitPhrases.wrongPassphrase }
  case 'weak_passphrase': {  return KitPhrases.weakPassphrase }
  default: {                 return err.message }
  }
}
// --
