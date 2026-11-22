# Guide: headless, and shadcn

For a host with a design system of its own: its `Input`, its `Button`, its `Dialog`, its words. It
adds to the [plain-hooks guide](guide-react_query.md), and uses the
[Suspense guide](guide-suspense.md)'s Actions for its forms, all but the unlock form. A pencil sketch; *Not built yet* is at
the foot.

## Three ways to use the same behaviour

1. **Field hooks**: each part's behaviour as a hook that returns props to spread onto the host's own
   elements. No markup, no class name and no word is ours.
2. **Parts**: those hooks rendered as plain elements, for a host with no design system. Each takes
   `className`, passes every other attribute through, and marks its state in `data-` attributes
   (`data-revealed`, `data-pending`, `data-invalid`) for a stylesheet to select.
3. **Kit, copied in**: each kit form as a file in the host's repo, written over the field hooks and
   the host's own components. `npx shadcn@latest add <registry>/unlock-form` puts
   `components/safebyok/unlock-form.tsx` there, to edit freely. Its words are in that file, so
   translating it is the host's ordinary work.

What stays ours in all three: the secret's text is in an uncontrolled input or written into the
page, never in a prop, a state or a controlled `value`. A field hook's props see to that. Do not
add `value` or `onChange` state of your own to a secret's field.

## One API key

```tsx
// A passphrase field over shadcn's Input and Button: Show / Hide, the Caps Lock warning, the password manager's hints.
function PassphraseField({ name, label }: Readonly<{ name: string, label: string }>) {
  const field = usePassphraseField({ autoComplete: 'current-password' })
  return (
    <div className="grid gap-2">
      <Label htmlFor={field.inputProps.id}>{label}</Label>
      <div className="flex gap-2">
        <Input name={name} {...field.inputProps} />        {/* type, id, autoComplete, the handlers: never a value */}
        <Button type="button" variant="ghost" {...field.toggleProps}>{field.isRevealed ? <EyeOff /> : <Eye />}</Button>
      </div>
      {field.isCapsLockOn && <p className="text-sm text-muted-foreground">Caps Lock is on</p>}
    </div>
  )
}

// The unlock dialog over shadcn's Dialog: open while a call waits for unlocking, and closing it dismisses the wait.
// It submits from a handler, never as an Action: its caller may be a pending Action, and React batches transitions together.
function UnlockDialog() {
  const vault = useVault()
  const isUnlockWanted = useBank((b) => b.isUnlockWanted)
  const unlock = useMutation({ mutationFn: vault.unlock })   // a mutation's updates are ordinary ones, shown at once
  return (
    <Dialog open={isUnlockWanted} onOpenChange={(open) => { if (! open) { vault.dismissUnlock() } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Unlock your vault</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); unlock.mutate(new FormData(event.currentTarget)) }}>
          <PassphraseField name="passphrase" label="Passphrase" />
          {unlock.error && <p role="alert" className="text-sm text-destructive">{textOf(unlock.error)}</p>}
          <Button type="submit" disabled={unlock.isPending}>{unlock.isPending ? 'Unlocking…' : 'Unlock'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
//   textOf is the host's: a refusal has a `refusalkind` (`wrong_passphrase`, `weak_passphrase`, …) to pick its own words by.

// The saved key, masked, with a reveal: the hook writes the text into the element it is given, and removes it again.
const key = useWhisperText('openai', 'apiKey')
<code ref={key.textRef} className="font-mono" data-revealed={key.isRevealed} />
{! key.isRevealed && <code className="font-mono">{box.sidecar.mask}</code>}
<Button variant="outline" size="sm" {...key.toggleProps}>{key.isRevealed ? 'Hide' : 'Show'}</Button>
```

## Doppler-lite: many secrets, each with settings

```tsx
// A row in the host's own Table. The value's cell is a draft's field: masked, shown on focus, written by Save.
function SecretRow({ labelpath }: Readonly<{ labelpath: string }>) {
  const draft = useDraft(labelpath)
  const save = useMutation({ mutationFn: () => draft.put() })
  return (
    <TableRow data-behind={draft.isBehind}>
      <TableCell>{draft.sidecar.title}</TableCell>
      <TableCell><Input {...draft.whisperField('val')} aria-label={`Value of ${draft.sidecar.title}`} /></TableCell>
      <TableCell>
        <Button disabled={! draft.isDirty || save.isPending} onClick={() => { save.mutate() }}>Save</Button>
        <Button variant="ghost" disabled={! draft.isDirty} onClick={draft.discard}>Undo</Button>
      </TableCell>
    </TableRow>
  )
}
//   Or make the row a <form action> whose Action calls draft.put(): a refused Save there loses what was typed, and writes nothing.

// A new secret's value, in a form of the host's own: the same props as a passphrase's, without the password manager.
const field = useWhisperField()
<Input name="val" {...field.inputProps} /><Button type="button" {...field.toggleProps}>Show</Button>
```

## A password manager that never leaves the device

```tsx
// Create the vault: the kit's form, copied in and restyled. The hook has the verdicts; the markup and the words are the host's.
const newPassphrase = useNewPassphrase()
<PassphraseField name="passphrase" label="New passphrase" {...newPassphrase.field} />
<Progress value={newPassphrase.verdict?.score} />        {/* the checker's score, for a meter of the host's own */}
<p className="text-sm">{newPassphrase.verdict?.reason}</p>
<PassphraseField name="confirmation" label="Confirm passphrase" {...newPassphrase.confirmField} />
<Button type="submit" disabled={! newPassphrase.isReady}>Create vault</Button>

// Copy, from a command palette or a context menu: any element may start it, since it is a call and not a component.
<CommandItem onSelect={() => { void copyPassword(vault, labelpath) }}>Copy password</CommandItem>

// The kit as shipped, where its looks will do: the words are overridable in one place.
<KitPhrasesProvider phrases={{ unlockButton: 'Déverrouiller', passphraseField: 'Phrase secrète' }}><UnlockForm /></KitPhrasesProvider>
```

## Not built yet

* The field hooks: `usePassphraseField`, `useWhisperField`, `useWhisperText`, `useWhisperMask`. Today
  each behaviour is inside its part, with fixed markup, a `Show` button of ours and a class name
  (`whisper-input`). `useRevealToggle` exists, private to the parts.
* `className` and `data-` state attributes on the parts.
* The kit as copy-in source, and a registry to serve it.
* `KitPhrasesProvider`: today `KitPhrases` is a frozen object of English.
* `useNewPassphrase().verdict`: today it gives `verdictText` and `matchText`, already worded.
* `actionOf` and gate verbs that take the form, as the [Suspense guide](guide-suspense.md) lists.
