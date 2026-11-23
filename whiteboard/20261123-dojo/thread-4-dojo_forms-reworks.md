# Thread 4: dojo_forms, reworks (2026-11-23)

For whoever reworks the Forms tab next; the build is in [thread-4-dojo_forms.md](thread-4-dojo_forms.md).

## First rework, after review (2026-11-23)

The review held every cell, and found the mutation handed the form shows its cache's subscribers the password once. The
Coach asked for the rows in order, each with a line saying why a host would choose it or naming the bad practice. Proved:
the dojo's lint, typecheck and tests (50, of which the Forms tab's 34); `pnpm justify` left to the orchestrator, by the
handoff.

* **Built**: `FormsTab`'s rows are now `{ standing, rowname, fieldFate, why }` (standing one of Recommended, Balanced,
  Hardened, Avoid), shown as `N. Standing, rowname: fieldFate. why`; the form's accessible name is `Standing, rowname`.
  Order: 1 Recommended, form Action (`ActionKeptRow`); 2 Balanced, plain HTML form (`SubmitRow`); 3 Balanced, with
  TanStack (`MutationReadRow`); 4 Balanced, with a form library (`HookFormBesideRow`, new); 5 Hardened, unpleasant
  (`ClearedAtOnceRow`, new); 6 Avoid, React's default (`ActionRow`); 7 Avoid, a mutation handed the form
  (`MutationFormRow`); 8 Avoid, a controlled input (`ControlledRow`); 9 Avoid, a form library holding the secret
  (`HookFormRow`). Rows 1-3 and 6-9 changed only in order, label, and one added cell.
  * A **Variables** cell in every row (`VariablesCell`), written by `variables-mirror.ts`: a plain listener on the host's
    mutation cache, started by `FormsTab` in an effect, writes `when pending: …` into the cell of the form being
    submitted when a mutation goes pending. Row 7 shows the password; row 3 shows `(none)`; the rest stay empty.
  * Tests: the Forms rows' 27 cases in the new order, plus row 7's Variables cell, row 3's, and the hardened row keeping
    the username on a refusal. dojo-findings' table in the new order and names, with rows 4 and 5's cells.
* **Decisions made**:
  * **The hardened row submits from `onSubmit`, not a form Action** (the handoff suggested one). Corrected at the second
    rework: the reason first given here, that React would build the password into the form's status (`useFormStatus`'
    `data`), holds only for an action that keeps the field. The last review found that a form Action that deletes the
    password from its `FormData` before it returns (its first await) keeps it out of React's form status, as rows 1 and 7
    do through `putBoxAction`; a second submit queued behind a pending one is the exception (dojo-findings). The reason
    that stands: React resets an action's form when the action ends, so keeping the username after a refusal would take
    row 1's `onReset` line as well, and the row would have to delete the field itself; `onSubmit` needs neither. It reads
    the form, empties the password's input, then sets pending, so a refusal keeps the username; a stored box resets the
    whole form.
  * **Row 4 reads the password through a ref** on its unregistered input, and empties it itself after `reset()`, though
    react-hook-form's `reset()` already calls `form.reset()` on a registered field's form: not a behaviour to lean on.
  * **The Variables cell finds its row by the submit in flight**: a capture listener on the window notes the form, a
    bubble listener forgets it, and a mutation started from a row's `onSubmit` or form Action goes pending between the
    two, synchronously (TanStack dispatches `pending` before its first await). Set aside: matching by mutation key (the
    key of `putBoxMutationOptions` names no labelpath, and row 3 has none); adding `meta` to the rows (changes code the
    handoff kept as is); a cell in rows 3 and 7 only (rows must have the same cells).
  * **"kept on error"**, not "restored", as the handoff said: the text never leaves the field.
  * **A fate for every row**, the Avoid rows too: 7 cleared at once, never kept; 8 and 9 cleared on save, kept on error.
* **Deviations**: every existing row file gained one line, `<VariablesCell />` (and its import), so rows keep the same
  cells; `styles.css` gained a 14rem column. `variables-mirror.ts` sits in `src/components/forms/`, not `src/lib/`
  beside `mirror.ts`, to stay inside the handoff's files.
* **For the Coach**: row 5's name is the Coach's word, "unpleasant"; a more telling one would be "cleared at once".
  Answered at the second rework: it stays, as the "How to choose" column, and the next columns say what it does.

## Second rework: choose your tradeoff (2026-11-23)

The Coach asked the tab to open with "First, choose your tradeoff", a table of each row's name, where the password is
while saving and after an error, and why; to recommend only rows where it is a good idea; and kept "unpleasant" as the
hardened row's name ("this is for the 'How to choose' column, and the next column clarifies"). The orchestrator added a
row. Proved: the dojo's lint, typecheck and tests (55, the Forms tab's 38); `pnpm justify` green after the catch-up, 7609 tests in 16 suites.

* **Built**:
  * `FormsTab`: the Coach's question first, then a table `Forms to choose from` (How to choose | While saving | After an
    error | Why), a line saying what field, attribute and state mean, the six rows to choose from; then a heading
    `What goes wrong: forms to avoid`, a line saying each shows a bad practice, a table `Forms to avoid` (Avoid | While
    saving | After an error | What goes wrong), and the four rows to avoid. `RowSpec` gained `whileSaving` and
    `afterError`; `Rows` split into `ChoiceRows` and `AvoidRows`; `RowsTable` and `RowForms` render a group. Each form is
    headed `N. Standing, rowname: fieldFate.`, its why now in the table alone. Rows to keep the field read "cleared on
    save, kept for edit or retry on error"; row 5 reads "cleared at once, typed again after an error".
  * Row 6, **Hardened, kinder** (`PutBackRow.tsx`, labelpath `form_put_back`): `onSubmit` reads the password's input
    into a local, empties the input, reads the form (so its `FormData` has no password), awaits `putBoxOnce` with the
    local, and on a refusal writes the local back into the input's `value`; a stored box resets the form. Cells, by
    running it: while saving nowhere; after save nowhere; after stale or fail the field, no attribute. The avoid rows are
    now 7 to 10.
  * Tests: row 6's three cases; one test that the two tables name every form in document order, and that the avoid
    heading falls between the last row to choose and the first to avoid. README's Forms paragraph and dojo-findings'
    table follow, the findings renumbered and given an item for row 6, marked as the orchestrator's addition.
* **Decisions made**:
  * **Two tables, not one**: the rows to avoid get a table of their own under their heading, so the table under the
    Coach's question lists only rows a host might choose ("recommend only ones where it's a good idea"), and each avoid
    row's bad practice still sits beside its cells. Set aside: one table of all ten (puts the avoid rows under "How to
    choose"); no table for the avoid rows (loses the side-by-side of where each one leaks).
  * **No "after save" column**: no row leaves the password in the field or attribute once stored. Row 9's state keeps
    it in the render before; the tab's note says "in the field or the attribute", and the findings say the rest.
  * **Row 6 reads the input into a local before the `FormData`**, not the `FormData` first as row 5 does, so the secret
    is in exactly the local and the save's arguments. The input is reached through a ref to the element, which holds no
    text.
  * **Row 6 sits after row 5**, so rows 1 to 5 keep their numbers.
* **Deviations**: the Coach's question reads "require the user to re-enter it on a problem" (his "require the user
  re-enter"), and its dash a comma, as the handoff gave it.
