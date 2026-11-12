// All the text safebyok-react shows to a user is in this file. A sentence with a variable part is one template
// function, so a translation can reorder it. Messages meant for developers stay next to the code that uses them.

import type { Gatingkind } from 'safebyok'

/** The locale of the built-in dialogs' text. */
export const Locale = 'en'

/** The text of the built-in dialogs. */
export const Messages = {
  chooseTitle:       'Choose a vault passphrase',
  unlockTitle:       'Unlock your vault',
  chooseBlurb:       'This passphrase encrypts your secrets on your device. Nobody can recover it for you -- not even us.',
  unlockBlurb:       'Enter your vault passphrase:',
  passphraseField:   'vault passphrase',
  confirmField:      'confirm vault passphrase',
  passphrasesDiffer: "The new passphrase does not match its confirmation",
  passphrasesMatch:  'The passphrases match',
  capsLockOn:        'Caps Lock is on',
  passphraseUsername: (user_id: string, vaultlabel: string) => `${user_id} (${vaultlabel} vault)`,
  showPassphrase:    'Show',
  hidePassphrase:    'Hide',
  createButton:      'Create vault',
  creatingButton:    'Creating…',
  unlockButton:      'Unlock',
  unlockingButton:   'Unlocking…',
  cancelButton:      'Cancel',
  locksIn:           (relative: string) => `Locks on this device ${relative}.`,
  locksAgainIn:      (relative: string) => `Locks again on this device ${relative}.`,
  staysUnlocked:     'Stays unlocked on this device until you lock it.',

  changeTitle:        'Change your vault passphrase',
  changeBlurb:        'Enter the passphrase you use now, then choose a new one. The new one takes its place on every device. A forgotten passphrase cannot be recovered.',
  currentField:       'current passphrase',
  newField:           'new passphrase',
  confirmNewField:    'confirm new passphrase',
  changeButton:       'Change passphrase',
  changingButton:     'Changing…',
  addPasskeyTitle:    'Add a passkey',
  addPasskeyBlurb:    'Enter your vault passphrase. Your browser will then offer a passkey -- unlocking with fingerprint/face id/security key alone.',
  addPasskeyButton:   'Add passkey',
  addingPasskeyButton: 'Adding…',
  revokePasskeyTitle:  'Remove your passkey',
  revokePasskeyBlurb:  'Enter your vault passphrase to remove the passkey here and on every other device:',
  revokePasskeyButton: 'Remove passkey',
  removingButton:      'Removing…',
  delVaultTitle:      'Delete your vault',
  delVaultBlurb:      'Every secret in this vault will be deleted for good and cannot be recovered. Secrets on other devices will disappear as they reconnect.',
  delVaultButton:     'Delete vault',
  deletingButton:     'Deleting…',

  troubleTitle:      'Something went wrong',
  troubleWord:       (doing: string) => `This app ran into a problem of its own, not one you caused, and could not ${doing}. Your secrets are safe. Close this, reload the page, and try again.`,
  closeButton:       'Close',

  passkeyButton:     'Use a passkey',
  passkeyTrouble:    "Your passkey can't be used here just now. Unlock with your passphrase instead.",
  noPasskeyToAsk:    'This vault has no passkey to ask: unlock it with your passphrase, then add one.',
  noWebAuthn:        "This browser can't use passkeys. Your passphrase still works.",
  noPrf:             "That device or security key is not compatible with this vault. Try another, or use your passphrase.",
  passkeyAskFailed:  "Your browser couldn't ask for a passkey just now: try again, or use your passphrase.",

  showWhisper:       'Show',
  hideWhisper:       'Hide',

  vaultLocked:       'Vault locked',
  vaultUnlocked:     'Vault unlocked',
  lockButton:        'Lock',
} as const

/** A phrase for what each kind of gating does, to finish a sentence such as "Could not ...". */
export const Doing: Record<Gatingkind, string> = {
  build_bank:        'create your vault',
  unlock_bank:       'unlock your vault',
  replace_passphrase: 'change your passphrase',
  add_passkey:        'add the passkey',
  revoke_passkey:     'remove the passkey',
}
