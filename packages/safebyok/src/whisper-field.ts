/**
 * The attributes for a field a user types or pastes a whisper into (an API key, say), so that the
 * browser and the password managers in it leave it alone: each major password manager's flag to
 * ignore the field, `autoComplete: 'off'` (the field is no credential: nothing is to be filled into
 * it, saved from it, or generated for it), and no capitalizing, correcting or spell-checking -- a
 * browser's enhanced spell-check may send what is typed to its maker's servers. Give the field a
 * name that says `whisper`, never `key`, `password` or `token`, which managers look for. A field
 * for the vault's passphrase wants the opposite: see `safebyok-react`'s passphrase dialog.
 *
 * Spelled as React spells props, every value text, so they spread onto a React input as they
 * are, and onto a DOM element by `setAttribute` (an HTML document lowercases the names). Each
 * manager honors only its own flag, and a browser's built-in manager may honor none: Chrome's still
 * offers a saved password for a `type="password"` field marked `off`.
 *
 * @example <input name="whisper_text" type="password" {...WhisperFieldAttributes} />
 * @example for (const [attrname, attrval] of Object.entries(WhisperFieldAttributes)) { field.setAttribute(attrname, attrval) }
 */
export const WhisperFieldAttributes = {
  // the major third-party password managers, each its own flag
  'data-1p-ignore':        'true',
  'data-lpignore':         'true',
  'data-bwignore':         'true',
  'data-dashlane-ignore':  'true',
  'data-rf-ignore':        'true',
  'data-keeper-ignore':    'true',
  'data-nordpass-ignore':  'true',
  'data-zoho-ignore':      'true',
  // the browser's own helpers
  'autoComplete':          'off',
  'autoCapitalize':        'none',
  'autoCorrect':           'off',
  'spellCheck':            'false',
} as const
