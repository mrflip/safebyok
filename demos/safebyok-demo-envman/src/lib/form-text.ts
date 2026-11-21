/** The text typed into `form`'s field `fieldname`, trimmed: empty for a field left blank or missing. */
export function formTextOf(form: FormData, fieldname: string): string {
  const val = form.get(fieldname)
  return (typeof val === 'string') ? val.trim() : ''
}
