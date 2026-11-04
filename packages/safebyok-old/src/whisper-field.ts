/** The attributes for a field a user types a whisper into, so the browser and its password managers leave it alone.
 * They set each major manager's flag to ignore it, `autoComplete: 'off'`, and no capitalizing,
 * correcting or spell-checking: enhanced spell-check may send what is typed to the browser's maker.
 * Name the field for `whisper`, never `key`, `password` or `token`, which managers look for. A
 * passphrase field wants the opposite: see `safebyok-react`'s passphrase dialog.
 *
 * They are spelled as React props with text values, so they also go onto a DOM element by
 * `setAttribute`. A browser's built-in manager may honor none: Chrome's still offers a saved
 * password for a `type="password"` field marked `off`.
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
