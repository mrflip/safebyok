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

  noPasskeyToAsk:     'This vault has no passkey to ask: unlock it with your passphrase, then add one.',
  noWebAuthn:         "This browser can't use passkeys. Your passphrase still works.",
  noPrf:              'That device or security key is not compatible with this vault. Try another, or use your passphrase.',
  passkeyAskFailed:   "Your browser couldn't ask for a passkey just now: try again, or use your passphrase.",
})

/** The words to show a user for `err`, a refusal: a condition they can mend in their own terms, anything else as "Something went wrong. Please try again later."
 * Never throws: any value in, a string out. A condition with no words of its own shows its message.
 * @example
 *   {put.isError && <p role="alert">{refusalTextOf(put.error)}</p>}
 */
export function refusalTextOf(err: unknown): string {
  if (! isVaultError(err) || (err.family !== 'condition')) { return KitPhrases.troubled }
  switch (err.refusalkind) {
  case 'wrong_passphrase': { return KitPhrases.wrongPassphrase }
  case 'weak_passphrase': {  return KitPhrases.weakPassphrase }
  case 'wrong_passkey': {    return KitPhrases.wrongPasskey }
  default: {                 return err.message }
  }
}
// --
