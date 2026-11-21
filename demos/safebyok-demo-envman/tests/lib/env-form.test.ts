import { describe, expect, it } from 'vitest'
import { envFieldsOf } from '../../src/lib/env-form'

/** A form with the fields of the settings dialog, `over` replacing any of them. */
function formOf(over: Record<string, string> = {}): FormData {
  const form = new FormData()
  const fields = { title: 'KEY', description: '', rotation_days: '30', last_rotated_day: '2026-11-21', ...over }
  for (const [fieldname, val] of Object.entries(fields)) { form.set(fieldname, val) }
  return form
}

const AfternoonMs = Date.UTC(2026, 10, 21, 15, 0, 0)

describe("envFieldsOf", () => {
  it("keeps the time of day when the day typed is the day it already has", () => {
    expect(envFieldsOf(formOf(), AfternoonMs).last_rotated_at).to.eq(AfternoonMs)
  })

  it("reads a different day as midnight UTC of that day", () => {
    expect(envFieldsOf(formOf({ last_rotated_day: '2026-11-01' }), AfternoonMs).last_rotated_at).to.eq(Date.UTC(2026, 10, 1))
  })

  it("reads a blank day as the given time", () => {
    expect(envFieldsOf(formOf({ last_rotated_day: '' }), AfternoonMs).last_rotated_at).to.eq(AfternoonMs)
  })

  it("refuses a blank title and a period that is not a whole number of days", () => {
    expect(() => envFieldsOf(formOf({ title: ' ' }), AfternoonMs)).to.throw('Give it a title.')
    expect(() => envFieldsOf(formOf({ rotation_days: '0' }), AfternoonMs)).to.throw('whole number of days')
    expect(() => envFieldsOf(formOf({ rotation_days: '1.5' }), AfternoonMs)).to.throw('whole number of days')
  })
})
