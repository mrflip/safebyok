/** The Coach's claims about the two Scenarios forms, one sentence's claim each, and what the dojo found of each today: tests/components/scenarios/ScenariosTab.test.tsx asserts each. */

/** What the dojo found of a claim: it works; it works, with something odd; or the library cannot do it today. */
export type Verdict = 'works' | 'odd' | 'cannot'

/** One claim of the Coach's, with the verdict and what was found. */
export type Claim = Readonly<{ claim: string, verdict: Verdict, found: string }>

/** The claims about the envman form. */
export const EnvmanClaims: readonly Claim[] = [
  { claim: 'I see the whisper field masked.', verdict: 'works',
    found: "An empty password input, its placeholder eight dots: the field holds nothing, so the mask says nothing of the password's length." },
  { claim: 'I click an eye and I see it.', verdict: 'odd',
    found: "The password shows in the field, read-only, and a second press masks it. But useDraft reveals the field on any focus, so a click on the field or a Tab into it shows it too: the eye is the host's button that focuses the field. After a lock, or a save that lands, with the field focused, the eye does nothing until the field loses focus. From the keyboard the eye only shows it: a Tab to the eye masks the field, so pressing the eye shows it again." },
  { claim: 'I double click the field and I am editing its cleartext like a text edit.', verdict: 'works',
    found: 'useDraft makes the field editable whenever it is revealed; the host keeps it read-only until a double click, with a boolean of its own.' },
  { claim: 'The quill edit button to its right does the same.', verdict: 'works',
    found: 'One press reveals the field and makes it editable. The quill, like the eye, keeps the focus where it is as it is pressed, or the press would blur, and mask, the field first.' },
  { claim: 'On blur it masks again.', verdict: 'odd',
    found: "It shows as dots again, but not the same dots: a password not typed into is emptied, back to the placeholder's eight; one typed into shows a dot for each character typed, since it stays in the input's value until a save lands, for put to read. A lock leaves it there too." },
  { claim: 'I can click Save while the field is masked.', verdict: 'works',
    found: "Save writes the password typed and the username. Save is disabled until something is typed, as useDraft's example has it." },
  { claim: 'I can click Save while the field is not masked.', verdict: 'odd',
    found: 'A mouse press on Save saves what was typed; the field masks as the press takes the focus, as it does whenever it loses focus. Enter in the field saves without masking it first, and once the save lands the field is still focused and editable but masked and empty: the eye does nothing until it loses focus, and what is typed next replaces the whole password.' },
  { claim: 'Save puts both the whisper and the sidecar.', verdict: 'works',
    found: 'One put, one revision, both fields; a field left alone keeps what was stored.' },
  { claim: 'It saves in the background: nothing goes away in the form.', verdict: 'cannot',
    found: 'While a save runs the form stays usable, and once it lands the username shows what was saved and the password shows masked. But useDraft starts again from the box stored when a save lands, so whatever was typed while it ran, into either field, goes away: the username goes back to what was saved, the password is emptied, and a password revealed meanwhile is masked and emptied under the focus.' },
  { claim: 'I can save on blur of the sidecar field.', verdict: 'odd',
    found: 'Leaving the username with an edit saves the box. Leaving it for the password reveals the password while the save runs, and the save landing masks and empties it, the focus still there, losing anything typed into it meanwhile.' },
  { claim: 'I can save on blur of the whisper field.', verdict: 'odd',
    found: 'Leaving the password with an edit saves the box, and leaving it unchanged saves nothing. A save begun while one runs cites the same revision, so whichever lands second refuses stale_write: where the first lands first, an edit made between the two is lost from the box and from the form; where the first is held past the second, every edit is stored, yet the log ends in the error.' },
]

/** The claims about the API key form. */
export const ApiKeyClaims: readonly Claim[] = [
  { claim: 'I enter the values.', verdict: 'works',
    found: 'A title, in the sidecar, and the key, in the whisper; both are plain uncontrolled inputs, so neither is in React state or a value attribute.' },
  { claim: 'The whisper field is password-style.', verdict: 'works',
    found: 'WhisperInput is a password input, with the attributes that keep password managers away.' },
  { claim: 'An eye reveals it.', verdict: 'odd',
    found: "WhisperInput's button shows it as text and hides it again, but it reads Show and Hide, not an eye: its words are fixed, and no prop changes them. While a save runs the button does nothing." },
  { claim: 'Once I hit Save it is only displayed as masked.', verdict: 'works',
    found: "While the save runs the key is masked, though still in the input's value; once stored, React empties the form, and the key shows only by WhisperMask: its last four characters while unlocked, the mask stored in the sidecar while locked. After a refusal the key stays in the field, masked, to try again." },
]
