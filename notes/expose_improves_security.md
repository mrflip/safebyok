# Why `box.expose` improves security

A reviewer's first instinct is that `box.expose()`, which holds an open whisper on the instance, is
a hole in an end-to-end encrypted vault. This note argues the opposite. A host that shows or uses a
secret has it in the clear whatever we offer, so the choice isn't whether a clear copy exists. The
choice is who holds it, for how long, and what puts it away.

| Audience | What they use | Where else it is in the clear | What ends it |
|---|---|---|---|
| A script | `box.expose`, `box.whisper` | nowhere new | `unexpose`, a sweep, the process exiting |
| A team wanting a raw DOM field | `box.field` | the element's `value` | the last field unbinding |
| A React form | `box.whisper`, `box.patchWhisper` | the `value` prop and attribute, React's props | the form calling `unexpose` |

`box.field` and `box.patchWhisper` are in #505, which is still open and whose names may change.

## The risk is time, not exposure

| Who | What holding the whisper on the box changes |
|---|---|
| A hostile script, vault unlocked | Nothing. It reads `input.value`, or calls `box.extractWhisper()` |
| A hostile script, vault locked | Little. `box.whisper` answers a bag and `#exposed` is private. It can wait for an unlock, or wrap `Box.prototype.put` |
| An accident: a log line, `JSON.stringify`, a spread | An improvement on a variable: none of them show it |
| Someone with dev tools or a heap dump, after a lock | A loss. The value is still in memory, and a lock doesn't remove it |

So exposure adds no reach to a script in the page. What it adds is time: the value stays in memory
for as long as nothing ends it. That is why each row of the first table has an answer for what ends
it.

### What "minimize the surface" would cost

Taken seriously, minimizing the surface means the whisper lives only in the DOM and in the sealed
record. Here is one field of that, to compare with the React form in the next section:

```tsx
function TokenField({ box }) {
  const input = useRef<HTMLInputElement>(null)
  const show = async () => {
    const whisper = await box.extractWhisper()
    input.current.value = whisper.Credentials.SessionToken    // and again for every other field
  }
  useEffect(() => box.subscribe(() => {
    if (box.lockState() === 'locked') { input.current.value = '' }   // an unsaved edit is gone
  }), [box])
  const save = async () => {
    const whisper = await box.extractWhisper()                // a put replaces: fetch what the form lacks
    await box.put({ whisper: merge(whisper, { Credentials: { SessionToken: input.current.value } }) })
  }
  return <input ref={input} type="password" autoComplete="off" spellCheck={false} />
}
```

**What it gives up:**

* **Unsaved edits at a lock.** Keeping them needs a copy, which is what this design set out to avoid.
* **Anything derived from the value.** Validating while typing, a dirty flag, or disabling Save while
  the field is empty each read `.value` into a variable.
* **Controlled components.** Anything that drives an input through its `value` prop is out, including
  most form libraries' default mode.
* **Hand styling, in part.** A ref-bound `<input>` takes `className` and CSS like any other, and we
  ship no styles in any version. The hand work falls on design-system controls that watch `value` for
  a floating label, a character count or a clear button. We haven't tried this against a particular
  library.

**What it buys.** These were run against React 19.1 in jsdom:

| | Controlled, `value={secret}` | Set through a ref |
|---|---|---|
| `input.outerHTML` | `<input type="password" value="sk-…">` | `<input type="password">` |
| React's props on the node | `value: "sk-…"` | no `value` |
| `input.value` | `sk-…` | `sk-…` |

The first two rows are worth having. Anything that captures `outerHTML` misses the ref-set value, and
so does CSS injection, which can select on an attribute but not on a property. The last row is the
floor: **while the text is in the field, any script in the page can read it.** The strict design also
still passes the value through a local on its way in and out, and JavaScript strings can't be wiped.

So the shift is small and the sacrifice is notable. `box.field` keeps the first two rows without most
of the list above: it holds the value through a lock so edits survive, and ends the exposure when the
last field unbinds. Anything derived from the value and controlled components stay out, because the
value never reaches React.

## The form, without `expose` and with it

Since the text in the field is in the clear anyway, the question becomes what code surrounds it.
Without `expose`, a host writes this:

```tsx
const MASK = '••••••••'
const maskDeep = (val) => (isPlainObject(val) ? mapValues(val, maskDeep) : MASK)

function useAwsForm(box: Box) {
  const lockState = useSyncExternalStore(box.subscribe, () => box.lockState())
  const isLocked  = (lockState === 'locked')
  const [real, setReal] = useState<AwsWhisper | null>(null)   // the secret, in React state

  useEffect(() => {
    if (isLocked || real) { return }
    let isLeaving = false
    box.extractWhisper().then(
      (whisper) => { if (! isLeaving) { setReal(whisper) } },
      reportUnlessLocked,                                     // a lock can land mid-extract
    )
    return () => { isLeaving = true }
  }, [box, isLocked, real])

  const view = (! real) ? {} : (isLocked ? maskDeep(real) : real)

  return {
    isEditable: (! isLocked) && (real !== null),
    region: view.Target?.Region ?? '',
    id:     view.Credentials?.AccessKeyId ?? '',
    token:  view.Credentials?.SessionToken ?? '',
    edit: (patch) => {
      if (isLocked || (! real)) { return }
      setReal({
        Target:      { ...real.Target,      ...patch.Target },
        Credentials: { ...real.Credentials, ...patch.Credentials },
      })
    },
    save: () => box.put({ whisper: real }),                   // real, never view: a mask is a valid whisper
  }
}
```

That is thirty-odd lines of secret handling in the host's code, crossing masking, reshaping and
nulling, and no review of ours ever sees them. The secret sits in React state and in the closure of
every render. `put({ whisper: view })` would store the mask over the real secret and succeed. With
`expose`, the same form is:

```tsx
function useAwsForm(box: Box) {
  const whisper = useSyncExternalStore(box.subscribe, () => box.whisper)
  useEffect(() => () => { box.unexpose() }, [box])            // leaving the form drops it
  return {
    isEditable: box.isShowing,                                // box is the Box, read live
    region: whisper.Target?.Region ?? '',
    id:     whisper.Credentials?.AccessKeyId ?? '',
    token:  whisper.Credentials?.SessionToken ?? '',
    edit:   (patch) => box.patchWhisper(patch),
    save:   () => box.putExposed(),
  }
}
```

The fields read blank when the whisper won't show, because a bag has no fields. The host never holds
the value in state, writes no lock branch, and has nothing to get wrong at save: `putExposed` takes
no whisper, and a bag refuses at `put`. What's left to get right is one line, the `unexpose`, and
without it the exposure lasts until a sweep. Call `box.expose()` from a button after mount, because
StrictMode's simulated unmount would otherwise unexpose it.

The input is still controlled here, so the first column of the table above applies. A form that
wants the second column uses `box.field` and gives up React state for that value.

## A script without `expose` stashes it

This part is a prediction about people, not a property of the code, but the path of least resistance
is plain. `box.extractWhisper()` awaits and unseals on every call, so a script calls it once:

```ts
const creds = await box.extractWhisper()    // module scope, for the life of the process
const client = makeClient(creds)

log.info({ config: { creds, region } })     // the ordinary accident
vault.lock()                                // creds doesn't move: a lock can't reach it
```

With `expose`, the short path is also the guarded one:

```ts
await box.expose()
await stripe.charge({ ...box.whisper, amount: 100 })

console.log(box)                            // the whisper isn't in it
JSON.stringify(box)                         // nor here: the sparse record
vault.lock()
box.whisper.apiKey                          // undefined
await vault.ensureUnlocked()                // back, edits included
box.unexpose()                              // gone
```

The floor is the same here as in a form. A script that can fetch the passphrase can unlock and call
`extractWhisper`, so hiding the value from that script was never available. The gain is against
accidents, and a lock that takes effect.

## What this does not do

* **A lock hides the whisper; it doesn't remove it from memory.** That is the contract, so that edits
  survive a lock. Only `unexpose`, a sweep, a delete or a vacate drop it. After a lock, someone with
  dev tools or a heap dump can still find it, and only a host that calls `unexpose` closes that.
* **A reference outlives everything.** `const w = box.whisper` keeps the secret past a lock and past
  `unexpose`. We can't empty it without walking the object, so the rule is to read `box.whisper` each
  time.
* **Dropping a value isn't wiping it.** JavaScript strings can't be zeroed. `unexpose` makes the value
  unreachable, and the collector decides when it leaves memory.
* **A copy can't be recalled.** Whatever the host copies out of `box.whisper`, or out of an input, is
  the host's to answer for.
