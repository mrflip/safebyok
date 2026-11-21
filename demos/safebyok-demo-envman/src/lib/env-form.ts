/** The sidecar fields of envman's two forms, the add form and the settings dialog, read from what the user typed. */

import { DayMs, DefaultRotationDays, dayValueOf, epochMsOfDay } from './env-sidecar'
import { formTextOf } from './form-text'

/** The sidecar fields a form sets: all but the mask, which comes from the value. */
export type EnvFields = Readonly<{
  title:              string
  description:        string
  rotation_period_ms: number
  last_rotated_at:    number
}>

/** The sidecar fields typed into `form`. Throws when the title is blank, the period is not a whole number of days, or the date is not one.
 * A blank last-rotated day, or the day of `rotatedAt`, reads as `rotatedAt` itself, time of day kept.
 */
export function envFieldsOf(form: FormData, rotatedAt: number): EnvFields {
  const title = formTextOf(form, 'title')
  if (title === '') { throw new Error('Give it a title.') }
  const rotationDays = Number(formTextOf(form, 'rotation_days') || DefaultRotationDays)
  if ((! Number.isSafeInteger(rotationDays)) || (rotationDays < 1)) { throw new Error('The rotation period is a whole number of days, 1 or more.') }
  const rotatedDay = formTextOf(form, 'last_rotated_day')
  const last_rotated_at = ((rotatedDay === '') || (rotatedDay === dayValueOf(rotatedAt))) ? rotatedAt : epochMsOfDay(rotatedDay)
  if (last_rotated_at === undefined) { throw new Error('The last-rotated day is not a date.') }
  return { title, description: formTextOf(form, 'description'), rotation_period_ms: rotationDays * DayMs, last_rotated_at }
}
