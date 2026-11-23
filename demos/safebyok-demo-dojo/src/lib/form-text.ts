/** The text in `form`'s field `fieldname`, as typed: empty for a field left blank or missing, or a file's. */
export function formTextOf(form: FormData, fieldname: string): string {
  const val = form.get(fieldname)
  return (typeof val === 'string') ? val : ''
}
